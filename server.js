const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ping-pong.html')));

// ─── State ──────────────────────────────────────────────────────────────────
// rooms: Map<code, { host: ws, guest: ws|null, created: number }>
const rooms = new Map();
let mmQueue = null; // { ws } waiting for matchmaking partner

function send(ws, obj) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {}
}

function log(...args) { console.log(new Date().toISOString(), ...args); }

// Clean stale rooms every minute
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const hDead = !room.host  || room.host.readyState  !== 1;
    const gDead = !room.guest || room.guest.readyState !== 1;
    if (now - room.created > 1800000 || (hDead && gDead)) {
      rooms.delete(code);
      log('Cleaned room', code);
    }
  }
}, 60000);

// ─── WebSocket ───────────────────────────────────────────────────────────────
wss.on('connection', ws => {
  ws._room = null;
  ws._role = null;
  log('Client connected, total:', wss.clients.size);

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    // ── Create room ──────────────────────────────────────────────────────────
    if (msg.t === 'create') {
      const code = msg.code;
      if (!code) { send(ws, { t: 'error', msg: 'Código vacío' }); return; }
      if (rooms.has(code)) {
        // Code clash — tell client to try another
        send(ws, { t: 'error', msg: 'Código ya en uso' }); return;
      }
      rooms.set(code, { host: ws, guest: null, created: Date.now() });
      ws._room = code;
      ws._role = 'host';
      log('Room created:', code);
      send(ws, { t: 'created', code });
      return;
    }

    // ── Join room ────────────────────────────────────────────────────────────
    if (msg.t === 'join') {
      const code = msg.code;
      const room = rooms.get(code);
      log('Join attempt:', code, '— room exists:', !!room);
      if (!room)              { send(ws, { t: 'error', msg: 'Sala no encontrada' }); return; }
      if (room.guest)         { send(ws, { t: 'error', msg: 'Sala llena' }); return; }
      if (room.host.readyState !== 1) { send(ws, { t: 'error', msg: 'El anfitrión ya no está' }); return; }

      room.guest = ws;
      ws._room = code;
      ws._role = 'guest';
      log('Guest joined room:', code);

      send(room.host,  { t: 'peer_joined' });
      send(room.guest, { t: 'peer_joined' });
      return;
    }

    // ── Matchmaking ──────────────────────────────────────────────────────────
    if (msg.t === 'mm_search') {
      if (mmQueue && mmQueue.ws.readyState === 1 && mmQueue.ws !== ws) {
        const other = mmQueue;
        mmQueue = null;
        const code = 'MM' + Math.random().toString(36).slice(2, 8).toUpperCase();
        rooms.set(code, { host: other.ws, guest: ws, created: Date.now() });
        other.ws._room = code; other.ws._role = 'host';
        ws._room = code;       ws._role = 'guest';
        log('MM matched:', code);
        send(other.ws, { t: 'mm_matched', role: 'host', code });
        send(ws,       { t: 'mm_matched', role: 'guest', code });
      } else {
        mmQueue = { ws };
        log('MM queue: waiting');
        send(ws, { t: 'mm_waiting' });
      }
      return;
    }

    if (msg.t === 'mm_cancel') {
      if (mmQueue && mmQueue.ws === ws) { mmQueue = null; log('MM cancelled'); }
      return;
    }

    // ── Leave current room (client switching action) ──────────────────────────
    if (msg.t === 'leave') {
      if (mmQueue && mmQueue.ws === ws) { mmQueue = null; }
      if (ws._room) {
        const room = rooms.get(ws._room);
        if (room) {
          if (ws._role === 'host') { rooms.delete(ws._room); log('Host left room:', ws._room); }
          else { room.guest = null; log('Guest left room:', ws._room); }
        }
        ws._room = null; ws._role = null;
      }
      return;
    }

    // ── Relay everything else to partner ─────────────────────────────────────
    const room = ws._room ? rooms.get(ws._room) : null;
    if (!room) {
      log('Relay failed — no room for', ws._role, msg.t);
      return;
    }
    const partner = ws._role === 'host' ? room.guest : room.host;
    if (partner && partner.readyState === 1) {
      log('Relay', msg.t, ws._role, '->', ws._role === 'host' ? 'guest' : 'host');
      try { partner.send(raw); } catch (e) { log('Relay error', e.message); }
    } else {
      log('Relay skipped — partner not ready, msg:', msg.t);
    }
  });

  ws.on('close', () => {
    log('Client disconnected, role:', ws._role, 'room:', ws._room);
    if (mmQueue && mmQueue.ws === ws) { mmQueue = null; log('MM queue cleared'); }
    const room = ws._room ? rooms.get(ws._room) : null;
    if (!room) return;
    const partner = ws._role === 'host' ? room.guest : room.host;
    if (partner && partner.readyState === 1) send(partner, { t: 'partner_left' });
    if (ws._role === 'host') { rooms.delete(ws._room); log('Room deleted:', ws._room); }
  });

  ws.on('error', e => log('WS error:', e.message));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => log(`PING vs PONG server on port ${PORT}`));
