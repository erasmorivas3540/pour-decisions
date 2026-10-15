import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test(
  'SSE tickets are valid once, expire, and never accept the old URL token',
  { timeout: 15000 },
  async () => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, PORT: '0', STREAM_TICKET_TTL_MS: '120' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let output = '';
    let port;
    child.stdout.on('data', (v) => {
      output += v.toString();
      port ||= output.match(/:(\d+)/)?.[1];
    });
    const controllers = [];
    try {
      for (let i = 0; i < 250 && !port; i++) await sleep(20);
      assert.ok(port, 'test server starts');
      const base = `http://127.0.0.1:${port}`;
      const post = async (route, data) => {
        const res = await fetch(`${base}/api/${route}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        return { res, data: await res.json() };
      };
      const player = (await post('create', { name: 'Ticket Tester' })).data;
      const getTicket = async () => {
        const { res, data } = await post('stream-ticket', player);
        assert.equal(res.status, 200);
        assert.equal(data.expiresInMs, 120);
        assert.match(data.ticket, /^[a-f0-9]{64}$/);
        return data.ticket;
      };
      const ticket = await getTicket();
      const controller = new AbortController();
      controllers.push(controller);
      const first = await fetch(`${base}/api/stream?ticket=${ticket}`, {
        signal: controller.signal,
      });
      assert.equal(first.status, 200);
      assert.match(first.headers.get('content-type'), /text\/event-stream/);
      const reused = await fetch(`${base}/api/stream?ticket=${ticket}`);
      assert.equal(reused.status, 401);
      const expiring = await getTicket();
      await sleep(180);
      assert.equal((await fetch(`${base}/api/stream?ticket=${expiring}`)).status, 401);
      assert.equal(
        (
          await fetch(
            `${base}/api/stream?code=${player.code}&id=${player.id}&token=${player.token}`,
          )
        ).status,
        401,
      );
      assert.equal((await fetch(`${base}/api/stream`)).status, 401);
      assert.equal((await post('stream-ticket', { ...player, token: 'invalid' })).res.status, 401);
      const replacement = await getTicket();
      const secondController = new AbortController();
      controllers.push(secondController);
      assert.equal(
        (
          await fetch(`${base}/api/stream?ticket=${replacement}`, {
            signal: secondController.signal,
          })
        ).status,
        200,
      );
    } finally {
      controllers.forEach((c) => c.abort());
      child.kill('SIGTERM');
    }
  },
);
