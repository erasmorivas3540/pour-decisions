import http from 'node:http';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameEngine } from './game.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const game = new GameEngine({ scale: Number(process.env.GAME_TIME_SCALE || 1) });
const listeners = new Map(); // code -> Set({response,id})
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'",
};
function json(res, status, body) {
  if (res.writableEnded) return;
  res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
function streamMessage(res, body) {
  if (!res.destroyed && !res.writableEnded)
    res.write(`event: state\ndata: ${JSON.stringify(body)}\n\n`);
}
function push(room) {
  const set = listeners.get(room.code);
  if (!set?.size) return;
  for (const listener of set) {
    const p = room.players.find((x) => x.id === listener.id);
    if (p) streamMessage(listener.res, game.state(room, p));
  }
}
async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 8192) throw Object.assign(new Error('Request too large.'), { status: 413 });
  }
  try {
    return data ? JSON.parse(data) : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON.'), { status: 400 });
  }
}
// A short-lived, single-use capability keeps long-lived seat credentials out of GET URLs.
const streamTickets = new Map();
const ticketLifetimeMs = Number(process.env.STREAM_TICKET_TTL_MS || 30000);
function issueStreamTicket(room, player) {
  const ticket = randomBytes(32).toString('hex');
  streamTickets.set(ticket, {
    code: room.code,
    id: player.id,
    token: player.token,
    expiresAt: Date.now() + ticketLifetimeMs,
  });
  return ticket;
}
function consumeStreamTicket(ticket) {
  const entry = ticket && streamTickets.get(ticket);
  if (ticket) streamTickets.delete(ticket); // Consumption precedes authorization or expiry checks.
  if (!entry || entry.expiresAt <= Date.now()) {
    throw Object.assign(new Error('Invalid or expired stream ticket.'), { status: 401 });
  }
  return entry;
}
const rateLimit = new Map();
function limited(req) {
  const ip = req.socket.remoteAddress || '';
  const now = Date.now();
  let a = rateLimit.get(ip) || { at: now, n: 0 };
  if (now - a.at > 60000) a = { at: now, n: 0 };
  a.n++;
  rateLimit.set(ip, a);
  if (a.n > 200) throw Object.assign(new Error('Please wait a moment.'), { status: 429 });
}
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health')
      return json(res, 200, { ok: true, service: 'pour-decisions' });
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      if (url.searchParams.has('token') || url.searchParams.has('code') || url.searchParams.has('id')) {
        return json(res, 401, { error: 'Use a stream ticket instead.' });
      }
      const { code, id, token } = consumeStreamTicket(url.searchParams.get('ticket'));
      const { room } = game.auth(code, id, token);
      res.writeHead(200, {
        ...headers,
        'Content-Type': 'text/event-stream; charset=utf-8',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      const listener = { res, id };
      if (!listeners.has(code)) listeners.set(code, new Set());
      listeners.get(code).add(listener);
      game.connection(code, id, token, 1);
      push(room);
      let closed = false;
      req.on('close', () => {
        if (closed) return;
        closed = true;
        listeners.get(code)?.delete(listener);
        try {
          game.connection(code, id, token, -1);
          push(room);
        } catch {}
      });
      return;
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      limited(req);
      const b = await body(req);
      if (url.pathname === '/api/create') {
        const s = game.create(b.name, b.avatar);
        return json(res, 200, s);
      }
      if (url.pathname === '/api/join') {
        const s = game.join(b.code, b.name, b.avatar, { spectate: !!b.spectate });
        return json(res, 200, s);
      }
      if (url.pathname === '/api/reconnect') {
        const { room, player } = game.auth(b.code, b.id, b.token);
        return json(res, 200, {
          code: room.code,
          id: player.id,
          token: player.token,
          name: player.name,
        });
      }
      if (url.pathname === '/api/stream-ticket') {
        const { room, player } = game.auth(b.code, b.id, b.token);
        return json(res, 200, { ticket: issueStreamTicket(room, player), expiresInMs: ticketLifetimeMs });
      }
      if (url.pathname === '/api/action') {
        const room = game.action(b.code, b.id, b.token, b.type, b.value || {});
        push(room);
        return json(res, 200, { ok: true });
      }
    }
    if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!/^\/[a-zA-Z0-9_.\/-]+$/.test(file) || file.includes('..'))
      return json(res, 400, { error: 'Bad path.' });
    const full = path.resolve(PUBLIC, '.' + file);
    if (!full.startsWith(PUBLIC + path.sep)) return json(res, 403, { error: 'Forbidden.' });
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      return json(res, 404, { error: 'Not found.' });
    }
    if (!stat.isFile()) return json(res, 404, { error: 'Not found.' });
    res.writeHead(200, {
      ...headers,
      'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
    });
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    json(res, e.status || 500, { error: e.status ? e.message : 'Internal server error.' });
    if (!e.status) console.error(e);
  }
});
setInterval(() => {
  const dirty = new Set(game.tick());
  for (const code of dirty) {
    const room = game.rooms.get(code);
    if (room) push(room);
  }
}, 50).unref();
setInterval(() => {
  for (const [code, list] of listeners) {
    if (list.size) {
      const room = game.rooms.get(code);
      if (room) push(room);
      else {
        for (const item of list) item.res.end();
        listeners.delete(code);
      }
    }
  }
  const now = Date.now();
  for (const [ticket, session] of streamTickets) if (session.expiresAt <= now) streamTickets.delete(ticket);
  for (const [ip, v] of rateLimit) if (now - v.at > 120000) rateLimit.delete(ip);
}, 250).unref();
server.listen(PORT, '0.0.0.0', () =>
  console.log(`Pour Decisions listening on http://0.0.0.0:${server.address().port}`),
);
export { server, game };
