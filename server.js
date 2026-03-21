const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Serve the game file statically
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ping-pong.html')));

// ─── Room management ───────────────────────────────────────────────────────
// rooms: Map<code, { host: WebSocket, guest: WebSocket|null, created: number }>
const rooms = new Map();

// matchmaking queue: { ws, name }
let mmQueue = null;

function send(ws, obj) {
  try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {}
}

function cleanRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove rooms older than 30 minutes or where both players are gone
    const hostDead  = !room.host  || room.host.readyState  !== 1;
    const guestDead = !room.guest || room.guest.readyState !== 1;
    if (now - room.created > 1800000 || (hostDead && guestDead)) {
      rooms.delete(code);
    }
  }
}
setInterval(cleanRooms, 60000);

// ─── WebSocket handler ─────────────────────────────────────────────────────
wss.on('connection', ws => {
  ws._room = null;
  ws._role = null;

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.t) {

      // ── Create room ──────────────────────────────────────────────────────
      case 'create': {
        const code = msg.code;
        if (!code || rooms.has(code)) {
          send(ws, { t: 'error', msg: 'Código ya en uso o inválido' });
          return;
        }
        rooms.set(code, { host: ws, guest: null, created: Date.now() });
        ws._room = code;
        ws._role = 'host';
        send(ws, { t: 'created', code });
        break;
      }

      // ── Join room ────────────────────────────────────────────────────────
      case 'join': {
        const code = msg.code;
        const room = rooms.get(code);
        if (!room) { send(ws, { t: 'error', msg: 'Sala no encontrada' }); return; }
        if (room.guest) { send(ws, { t: 'error', msg: 'Sala llena' }); return; }
        if (room.host.readyState !== 1) { send(ws, { t: 'error', msg: 'El anfitrión ya no está' }); return; }

        room.guest = ws;
        ws._room = code;
        ws._role = 'guest';

        // Notify both
        send(room.host,  { t: 'peer_joined' });
        send(room.guest, { t: 'peer_joined' });
        break;
      }

      // ── Matchmaking ──────────────────────────────────────────────────────
      case 'mm_search': {
        if (mmQueue && mmQueue.ws.readyState === 1 && mmQueue.ws !== ws) {
          // Pair them
          const other = mmQueue;
          mmQueue = null;

          const code = 'MM' + Math.random().toString(36).slice(2,8).toUpperCase();
          rooms.set(code, { host: other.ws, guest: ws, created: Date.now() });
          other.ws._room = code; other.ws._role = 'host';
          ws._room = code;       ws._role = 'guest';

          send(other.ws, { t: 'mm_matched', role: 'host', code });
          send(ws,       { t: 'mm_matched', role: 'guest', code });
        } else {
          // Enter queue
          mmQueue = { ws, name: msg.name || 'Jugador' };
          send(ws, { t: 'mm_waiting' });
        }
        break;
      }

      // ── Cancel matchmaking ───────────────────────────────────────────────
      case 'mm_cancel': {
        if (mmQueue && mmQueue.ws === ws) mmQueue = null;
        break;
      }

      // ── Relay: forward any other message to the partner ──────────────────
      default: {
        const room = ws._room ? rooms.get(ws._room) : null;
        if (!room) return;
        const partner = ws._role === 'host' ? room.guest : room.host;
        if (partner && partner.readyState === 1) {
          // Forward as-is (already stringified, re-send raw)
          try { partner.send(raw); } catch {}
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    // Remove from matchmaking queue
    if (mmQueue && mmQueue.ws === ws) mmQueue = null;

    // Notify partner in room
    const room = ws._room ? rooms.get(ws._room) : null;
    if (!room) return;
    const partner = ws._role === 'host' ? room.guest : room.host;
    if (partner && partner.readyState === 1) {
      send(partner, { t: 'partner_left' });
    }
    // Remove room if host left; guest leaving just leaves room open
    if (ws._role === 'host') rooms.delete(ws._room);
  });

  ws.on('error', () => {});
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`PING vs PONG server running on port ${PORT}`));
