import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';

const options = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const match = /^--([a-z-]+)=(\d+)$/.exec(arg);
    if (!match) throw new Error('Expected --rooms=N or --timeout-ms=N, received ' + arg);
    return [match[1], Number(match[2])];
  }),
);
const roomCount = options.rooms ?? 20;
const timeoutMs = options['timeout-ms'] ?? 180000;
assert.ok(Number.isInteger(roomCount) && roomCount >= 1 && roomCount <= 100, 'rooms must be 1–100');
assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 30000, 'timeout must be >= 30000 ms');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const stats = { actions: 0, errors: 0, sseMessages: 0, latencies: [], completed: 0 };
const machine = {
  operatingSystem: os.type() + ' ' + os.release(),
  architecture: os.arch(),
  processor: os.cpus()[0]?.model || 'unknown',
  logicalCpus: os.cpus().length,
  installedMemoryGiB: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
  node: process.version,
};
let base;
let peakServerRssMiB = 0;
let peakHarnessRssMiB = 0;
function sampleMemory(pid) {
  peakHarnessRssMiB = Math.max(peakHarnessRssMiB, process.memoryUsage().rss / 1024 ** 2);
  if (process.platform !== 'linux') return;
  try {
    const status = readFileSync('/proc/' + pid + '/status', 'utf8');
    const hwm = /^VmHWM:\s*(\d+)\s*kB/m.exec(status);
    if (hwm) peakServerRssMiB = Math.max(peakServerRssMiB, Number(hwm[1]) / 1024);
  } catch {
    // Optional /proc measurement: never substitute an invented number.
  }
}
function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1)].toFixed(2));
}
async function api(route, payload) {
  const response = await fetch(base + '/api/' + route, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(route + ' failed HTTP ' + response.status + ': ' + data.error);
  return data;
}
class Client {
  constructor(seat) {
    this.seat = seat;
    this.state = null;
    this.waiters = new Set();
    this.abort = new AbortController();
  }
  async connect() {
    const { ticket } = await api('stream-ticket', this.seat);
    const response = await fetch(base + '/api/stream?ticket=' + encodeURIComponent(ticket), {
      signal: this.abort.signal,
    });
    assert.equal(response.status, 200, 'ticketed SSE accepted');
    void this.read(response.body);
  }
  async read(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const data = frame.split('\n').find((line) => line.startsWith('data: '));
          if (!data) continue;
          const snapshot = JSON.parse(data.slice(6));
          this.state = snapshot;
          stats.sseMessages++;
          const receivedAt = performance.now();
          for (const waiter of [...this.waiters]) {
            if (waiter.predicate(snapshot)) {
              this.waiters.delete(waiter);
              clearTimeout(waiter.timer);
              waiter.resolve({ snapshot, receivedAt });
            }
          }
        }
      }
    } catch (error) {
      if (!this.abort.signal.aborted) { stats.errors++; console.error('SSE read interrupted:', error.message); }
    } finally {
      reader.releaseLock();
    }
  }
  expect(predicate, ms = 7000) {
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error('Matching SSE state did not arrive within ' + ms + 'ms'));
        }, ms),
      };
      this.waiters.add(waiter);
    });
    return {
      promise,
      cancel: () => {
        if (this.waiters.delete(waiter)) {
          clearTimeout(waiter.timer);
          waiter.resolve(null);
        }
      },
    };
  }
  close() {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    this.waiters.clear();
    this.abort.abort();
  }
}
async function waitUntil(fn, ms = 10000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (fn()) return;
    await sleep(30);
  }
  throw new Error('Timed out waiting for connected SSE clients');
}
async function action(client, type, value, matches) {
  const startedAt = performance.now();
  const expected = client.expect(matches);
  try {
    stats.actions++;
    await api('action', { ...client.seat, type, value: value || {} });
  } catch (error) {
    expected.cancel();
    throw error;
  }
  const matched = await expected.promise;
  assert.ok(matched, 'action must have a matching SSE broadcast');
  const latency = matched.receivedAt - startedAt;
  assert.ok(latency >= 0, 'monotonic POST-to-SSE timing');
  stats.latencies.push(latency);
}
async function runRoom(index) {
  const host = await api('create', { name: 'Host' + index });
  const guest = await api('join', { code: host.code, name: 'Guest' + index });
  const clients = [new Client(host), new Client(guest)];
  const byId = new Map(clients.map((c) => [c.seat.id, c]));
  try {
    await Promise.all(clients.map((c) => c.connect()));
    await waitUntil(() =>
      clients.every(
        (c) => c.state?.players?.filter((p) => p.connected && !p.spectator).length === 2,
      ),
    );
    for (let count = 1; count <= 2; count++) {
      await action(
        clients[0],
        'addBot',
        {},
        (s) => s.players.filter((p) => p.bot).length === count,
      );
    }
    await action(clients[0], 'start', {}, (s) => s.phase === 'howto');
    await action(clients[0], 'ready', {}, (s) => s.players.find((p) => p.id === host.id)?.ready);
    await action(clients[1], 'ready', {}, (s) => s.phase === 'pour');
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      const s = clients[0].state;
      if (!s) {
        await sleep(30);
        continue;
      }
      if (s.phase === 'gameover') {
        assert.equal(s.spills, 3, 'full game must have exactly three spills');
        assert.ok(s.winner, 'a winner is announced');
        stats.completed++;
        return;
      }
      const turn = s.turn;
      if (s.phase === 'jinx' && byId.has(turn?.jinxerId)) {
        const actor = byId.get(turn.jinxerId);
        const chosen = actor.state?.turn?.cards[0]?.id;
        if (chosen) {
          const number = turn.turnNumber;
          await action(
            actor,
            'pickJinx',
            { jinx: chosen },
            (v) => v.turn?.turnNumber === number && v.phase === 'pour',
          );
          continue;
        }
      }
      if (s.phase === 'pour' && byId.has(turn?.pourerId) && !turn.started) {
        const actor = byId.get(turn.pourerId);
        const number = turn.turnNumber;
        await action(actor, 'pourDown', {}, (v) => v.turn?.turnNumber === number && v.turn.started);
        continue;
      }
      if (s.phase === 'guess') {
        let didGuess = false;
        for (const actor of clients) {
          const own = actor.state;
          const t = own?.turn;
          if (
            !t ||
            t.turnNumber !== turn.turnNumber ||
            t.headToHead ||
            t.pourerId === actor.seat.id ||
            t.jinxerId === actor.seat.id ||
            t.guessed ||
            !t.options?.length
          )
            continue;
          const number = t.turnNumber;
          await action(
            actor,
            'guess',
            { jinx: t.options[0].id },
            (v) => v.turn?.turnNumber === number && v.turn.guessed,
          );
          didGuess = true;
        }
        if (didGuess) continue;
      }
      await sleep(30);
    }
    throw new Error(
      'Room ' +
        host.code +
        ' timed out at phase ' +
        clients[0].state?.phase +
        ' with ' +
        clients[0].state?.spills +
        ' spills',
    );
  } finally {
    for (const client of clients) client.close();
  }
}
const start = performance.now();
const server = spawn(process.execPath, ['server.js'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: { ...process.env, PORT: '0', GAME_TIME_SCALE: '0.05' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.setEncoding('utf8');
server.stdout.on('data', (chunk) => {
  logs += chunk;
});
server.stderr.setEncoding('utf8');
server.stderr.on('data', (chunk) => {
  console.error('server:', chunk.trim());
});
const memoryPoll = setInterval(() => sampleMemory(server.pid), 200);
try {
  await waitUntil(() => /0\.0\.0\.0:\d+/.test(logs), 12000);
  const port = Number(logs.match(/0\.0\.0\.0:(\d+)/)[1]);
  base = 'http://127.0.0.1:' + port;
  assert.equal((await fetch(base + '/health')).status, 200);
  const rooms = Array.from({ length: roomCount }, (_, i) => runRoom(i));
  const settled = await Promise.allSettled(rooms);
  for (const result of settled) {
    if (result.status === 'rejected') {
      stats.errors++;
      console.error('Room failed:', result.reason?.stack || result.reason);
    }
  }
} catch (error) {
  stats.errors++;
  console.error('Load test failed:', error.stack || error);
} finally {
  clearInterval(memoryPoll);
  sampleMemory(server.pid);
  server.kill('SIGTERM');
}
const result = {
  date: new Date().toISOString(),
  machine,
  command: 'npm run loadtest' + (process.argv.length > 2 ? ' -- ' + process.argv.slice(2).join(' ') : ''),
  roomsRequested: roomCount,
  roomsCompleted: stats.completed,
  humansPerRoom: 2,
  botsPerRoom: 2,
  actions: stats.actions,
  errors: stats.errors,
  sseMessages: stats.sseMessages,
  latencySamples: stats.latencies.length,
  latencyMs: {
    p50: percentile(stats.latencies, 50),
    p95: percentile(stats.latencies, 95),
    max: stats.latencies.length ? Number(Math.max(...stats.latencies).toFixed(2)) : null,
  },
  serverPeakRssMiB: peakServerRssMiB ? Number(peakServerRssMiB.toFixed(2)) : null,
  harnessPeakRssMiB: Number(peakHarnessRssMiB.toFixed(2)),
  elapsedSeconds: Number(((performance.now() - start) / 1000).toFixed(2)),
};
console.log('LOAD_TEST_RESULT ' + JSON.stringify(result));
if (stats.errors || stats.completed !== roomCount || stats.latencies.length !== stats.actions) {
  process.exitCode = 1;
}
