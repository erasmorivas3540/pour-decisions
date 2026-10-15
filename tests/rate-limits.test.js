import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test(
  'eight players on one IP can play without shared 429 and a single spammer hits per-player 120/min',
  { timeout: 25000 },
  async () => {
    const processGame = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    let port;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    processGame.stdout.on('data', (d) => {
      logs += d.toString();
      port ||= logs.match(/:(\d+)/)?.[1];
    });
    try {
      for (let i = 0; i < 200 && !port; i++) await sleep(20);
      assert.ok(port, 'test server started');
      const base = `http://127.0.0.1:${port}`;
      const post = async (route, data) => {
        const res = await fetch(`${base}/api/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        return { status: res.status, data: await res.json() };
      };
      const host = await post('create', { name: 'Host' });
      assert.equal(host.status, 200);
      const players = [host.data];
      for (let i = 1; i < 8; i++) {
        const result = await post('join', { code: players[0].code, name: 'Player ' + i });
        assert.equal(result.status, 200);
        players.push(result.data);
      }
      // Stress the single shared IP with 224 successful authenticated requests,
      // without any individual player approaching the 120-request budget.
      for (let round = 0; round < 28; round++) {
        for (const player of players) {
          const response = await post('stream-ticket', player);
          assert.equal(response.status, 200, 'shared-IP room is not rate-limited');
          assert.match(response.data.ticket, /^[a-f0-9]{64}$/);
        }
      }
      assert.equal(
        (await post('action', { ...players[0], type: 'start' })).status,
        400,
        'host needs connected players to start',
      );
      // Seat connections are opened via SSE, matching the normal client behavior.
      const streams = [];
      try {
        for (const player of players) {
          const {
            data: { ticket },
          } = await post('stream-ticket', player);
          const controller = new AbortController();
          streams.push(controller);
          const res = await fetch(`${base}/api/stream?ticket=${ticket}`, {
            signal: controller.signal,
          });
          assert.equal(res.status, 200);
        }
        assert.equal((await post('action', { ...players[0], type: 'start' })).status, 200);
        for (const player of players.slice(1, 7)) {
          assert.equal((await post('action', { ...player, type: 'ready' })).status, 200);
        }
        // Host can press Ready repeatedly while the final player is still reading.
        const spammer = players[0];
        let blocked = false;
        for (let i = 0; i < 140; i++) {
          const result = await post('action', { ...spammer, type: 'ready' });
          if (result.status === 429) {
            blocked = true;
            assert.match(result.data.error, /wait/i);
            break;
          }
          assert.equal(result.status, 200);
        }
        assert.ok(blocked, 'a single player must be throttled');
        // A different player on the same IP retains their own request budget.
        assert.equal((await post('action', { ...players[7], type: 'ready' })).status, 200);
      } finally {
        streams.forEach((c) => c.abort());
      }
    } finally {
      processGame.kill('SIGTERM');
    }
  },
);
