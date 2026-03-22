const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'ping-pong.html'))
);

// ─── Logging ────────────────────────────────────────────────────────────────
function log(...a) { console.log(new Date().toISOString(), ...a); }

// ─── Room state ─────────────────────────────────────────────────────────────
// rooms: Map<code, Room>
// Room = { host, guest, hostName, guestName, score:{h,g}, started, created, reconnectTokens }
const rooms = new Map();
let mmQueue = null;

function makeRoom(code, hostWs) {
  return {
    code,
    host: hostWs, guest: null,
    hostName: '', guestName: '',
    score: { h: 0, g: 0 },
    started: false,
    created: Date.now(),
    // reconnect tokens: token -> role, so a reconnecting client can resume
    reconnectTokens: {}
  };
}

function send(ws, obj) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch {}
}

function broadcast(room, obj) {
  send(room.host, obj);
  send(room.guest, obj);
}

function partner(ws, room) {
  return ws._role === 'host' ? room.guest : room.host;
}

// Generate a random reconnect token
function genToken() {
  return Math.random().toString(36).slice(2, 12);
}

// ─── Anti-double-connection: if same WS sends 'create' twice, ignore ────────
function leaveCurrentRoom(ws) {
  if (mmQueue && mmQueue.ws === ws) { mmQueue = null; }
  if (!ws._room) return;
  const room = rooms.get(ws._room);
  if (room) {
    if (ws._role === 'host') {
      // Notify guest, delete room
      send(room.guest, { t: 'partner_left' });
      rooms.delete(ws._room);
      log('Room deleted (host left):', ws._room);
    } else {
      // Guest left — keep room open for potential reconnect
      room.guest = null;
      send(room.host, { t: 'partner_left' });
      log('Guest left room:', ws._room);
    }
  }
  ws._room = null;
  ws._role = null;
  ws._token = null;
}

// ─── Launch sequence: server drives the countdown then fires 'go' ────────────
function launchMatch(room) {
  if (room.started) return;
  room.started = true;
  log('Launching match in room:', room.code);

  // Send names and config to both
  const info = {
    t: 'match_info',
    hostName: room.hostName,
    guestName: room.guestName
  };
  broadcast(room, info);

  // Countdown: 3, 2, 1, GO
  let n = 3;
  const tick = setInterval(() => {
    if (!rooms.has(room.code)) { clearInterval(tick); return; }
    if (n > 0) {
      broadcast(room, { t: 'countdown', n });
      n--;
    } else {
      clearInterval(tick);
      broadcast(room, { t: 'go' });
      log('GO sent for room:', room.code);
    }
  }, 1000);
}

// ─── WebSocket handler ───────────────────────────────────────────────────────
wss.on('connection', ws => {
  ws._room  = null;
  ws._role  = null;
  ws._token = null;
  ws.binaryType = 'nodebuffer'; // ensure text frames
  log('Connected, total:', wss.clients.size);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const t = msg.t;

    // ── Leave (client switching tabs / actions) ───────────────────────────────
    if (t === 'leave') { leaveCurrentRoom(ws); return; }

    // ── Create room ───────────────────────────────────────────────────────────
    if (t === 'create') {
      // Anti-double: if already host of this same code, ignore
      if (ws._room === msg.code && ws._role === 'host') return;
      leaveCurrentRoom(ws);
      const code = msg.code;
      if (!code) { send(ws, { t: 'error', msg: 'Código vacío' }); return; }
      if (rooms.has(code)) { send(ws, { t: 'error', msg: 'Código en uso — intenta de nuevo' }); return; }
      const room = makeRoom(code, ws);
      const token = genToken();
      room.reconnectTokens[token] = 'host';
      ws._token = token;
      rooms.set(code, room);
      ws._room = code; ws._role = 'host';
      log('Room created:', code);
      send(ws, { t: 'created', code, token });
      return;
    }

    // ── Join room ─────────────────────────────────────────────────────────────
    if (t === 'join') {
      const code = msg.code;
      const room = rooms.get(code);
      if (!room)  { send(ws, { t: 'error', msg: 'Sala no encontrada' }); return; }

      // Reconnect: if client has a token for this room
      if (msg.token && room.reconnectTokens[msg.token]) {
        const role = room.reconnectTokens[msg.token];
        leaveCurrentRoom(ws);
        ws._room = code; ws._role = role; ws._token = msg.token;
        if (role === 'host') room.host = ws; else room.guest = ws;
        send(ws, { t: 'reconnected', role, code });
        send(partner(ws, room), { t: 'partner_reconnected' });
        log('Reconnected as', role, 'in', code);
        return;
      }

      if (room.guest)  { send(ws, { t: 'error', msg: 'Sala llena' }); return; }
      if (!room.host || room.host.readyState !== 1) {
        send(ws, { t: 'error', msg: 'El anfitrión ya no está' }); return;
      }

      leaveCurrentRoom(ws);
      const token = genToken();
      room.reconnectTokens[token] = 'guest';
      room.guest = ws;
      ws._room = code; ws._role = 'guest'; ws._token = token;
      room.guestName = msg.name || 'PONG';
      log('Guest joined room:', code);

      send(room.host,  { t: 'peer_joined', token: room.reconnectTokens[Object.keys(room.reconnectTokens).find(k => room.reconnectTokens[k]==='host')] });
      send(room.guest, { t: 'peer_joined', token });

      // Server drives the name exchange and countdown
      send(room.host,  { t: 'set_names', guestName: room.guestName });
      setTimeout(() => launchMatch(room), 500);
      return;
    }

    // ── Matchmaking ───────────────────────────────────────────────────────────
    if (t === 'mm_search') {
      if (mmQueue && mmQueue.ws.readyState === 1 && mmQueue.ws !== ws) {
        const other = mmQueue; mmQueue = null;
        const code = 'MM' + Math.random().toString(36).slice(2,8).toUpperCase().replace(/[^A-Z]/g,'X');
        const room = makeRoom(code, other.ws);
        room.guest = ws;
        room.hostName  = other.name || 'PING';
        room.guestName = msg.name  || 'PONG';
        const tokH = genToken(), tokG = genToken();
        room.reconnectTokens[tokH] = 'host';
        room.reconnectTokens[tokG] = 'guest';
        other.ws._room = code; other.ws._role = 'host'; other.ws._token = tokH;
        ws._room = code;       ws._role = 'guest';      ws._token = tokG;
        rooms.set(code, room);
        log('MM matched:', code);
        send(other.ws, { t: 'mm_matched', role: 'host',  code, token: tokH });
        send(ws,       { t: 'mm_matched', role: 'guest', code, token: tokG });
        send(other.ws, { t: 'set_names', guestName: room.guestName });
        setTimeout(() => launchMatch(room), 500);
      } else {
        leaveCurrentRoom(ws);
        mmQueue = { ws, name: msg.name || 'PING' };
        log('MM waiting');
        send(ws, { t: 'mm_waiting' });
      }
      return;
    }

    if (t === 'mm_cancel') {
      if (mmQueue && mmQueue.ws === ws) { mmQueue = null; log('MM cancelled'); }
      return;
    }

    // ── Name announcement from host ───────────────────────────────────────────
    if (t === 'host_name') {
      const room = ws._room ? rooms.get(ws._room) : null;
      if (room && ws._role === 'host') room.hostName = msg.name || 'PING';
      return;
    }

    // ── Score sync: server keeps authoritative score ──────────────────────────
    if (t === 'score') {
      const room = ws._room ? rooms.get(ws._room) : null;
      if (!room || ws._role !== 'host') return;
      room.score = { h: msg.h, g: msg.g };
      send(room.guest, { t: 'score', h: msg.h, g: msg.g });
      return;
    }

    // ── Relay everything else to partner ──────────────────────────────────────
    const room = ws._room ? rooms.get(ws._room) : null;
    if (!room) { log('Relay fail — no room:', msg.t, ws._role); return; }
    const p = partner(ws, room);
    if (p && p.readyState === 1) {
      try { p.send(raw); } catch (e) { log('Relay err:', e.message); }
    }
  });

  ws.on('close', () => {
    log('Disconnected, role:', ws._role, 'room:', ws._room);
    if (mmQueue && mmQueue.ws === ws) mmQueue = null;
    const room = ws._room ? rooms.get(ws._room) : null;
    if (!room) return;
    const p = partner(ws, room);
    if (p && p.readyState === 1) send(p, { t: 'partner_left' });
    // Keep room alive 30s for reconnection
    const code = ws._room;
    setTimeout(() => {
      const r = rooms.get(code);
      if (!r) return;
      const hDead = !r.host  || r.host.readyState  !== 1;
      const gDead = !r.guest || r.guest.readyState !== 1;
      if (hDead && gDead) { rooms.delete(code); log('Room expired:', code); }
    }, 30000);
  });

  ws.on('error', e => log('WS error:', e.message));
});

// ─── Cleanup stale rooms every 2 min ────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hDead = !room.host  || room.host.readyState  !== 1;
    const gDead = !room.guest || room.guest.readyState !== 1;
    if (now - room.created > 3600000 || (hDead && gDead)) {
      rooms.delete(code); log('Cleaned room:', code);
    }
  }
}, 120000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => log(`PING vs PONG server on port ${PORT}`));
