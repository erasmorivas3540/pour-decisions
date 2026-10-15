import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test(
  'two live devices can start, pour, see scores, and continue to jinx selection',
  async () => {
    const processGame = spawn(process.execPath, ['server.js'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { ...process.env, PORT: '0', GAME_TIME_SCALE: '0.3' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const clients = [];
    try {
      let port;
      let logs = '';
      processGame.stdout.setEncoding('utf8');
      processGame.stdout.on('data', (s) => {
        logs += s;
        port ||= logs.match(/:(\d+)/)?.[1];
      });
      for (let k = 0; k < 500 && !port; k++) await sleep(20);
      assert.ok(port, 'server started');
      const base = `http://127.0.0.1:${port}`;
      const post = async (path, data) => {
        const response = await fetch(`${base}/api/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        return result;
      };
      const playerA = await post('create', { name: 'Alice' });
      const playerB = await post('join', { code: playerA.code, name: 'Bob' });
      const seats = [playerA, playerB];
      for (const seat of seats) {
        const controller = new AbortController();
        const client = { controller, seat, state: null, history: [] };
        clients.push(client);
        const response = await fetch(
          `${base}/api/stream?ticket=${encodeURIComponent((await post('stream-ticket', seat)).ticket)}`,
          { signal: controller.signal },
        );
        assert.equal(response.status, 200);
        (async () => {
          let buffer = '';
          const rd = response.body.getReader();
          try {
            for (;;) {
              const { done, value } = await rd.read();
              if (done) break;
              buffer += new TextDecoder().decode(value);
              let end;
              while ((end = buffer.indexOf('\n\n')) !== -1) {
                const frame = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                const data = frame.split('\n').find((line) => line.startsWith('data: '));
                if (data) {
                  client.state = JSON.parse(data.slice(6));
                  client.history.push(client.state);
                }
              }
            }
          } catch {}
        })();
      }
      const waitFor = async (fn, limit = 12000) => {
        const timeout = Date.now() + limit;
        while (Date.now() < timeout) {
          if (fn()) return;
          await sleep(20);
        }
        throw Error('Timed out: ' + clients.map((c) => c.state?.phase).join(','));
      };
      await waitFor(() =>
        clients.every((c) => c.state?.players.filter((p) => p.connected).length === 2),
      );
      await post('action', { ...playerA, type: 'start' });
      await waitFor(() => clients.every((c) => c.state?.phase === 'howto'));
      for (const seat of seats) await post('action', { ...seat, type: 'ready' });
      await waitFor(() => clients.every((c) => c.state?.phase === 'pour'));
      const pourer = clients.find((c) => c.state.me === c.state.turn.pourerId);
      const opponent = clients.find((c) => c !== pourer);
      assert.ok(pourer?.state?.turn?.jinx);
      assert.equal(pourer.state.turn.headToHead, true);
      assert.equal(opponent.state.turn.jinx, null);
      assert.equal(opponent.state.turn.options.length, 0);
      await assert.rejects(
        post('action', {
          ...opponent.seat,
          type: 'guess',
          value: { jinx: pourer.state.turn.jinx },
        }),
        /two-player game/,
      );
      if (pourer.state.turn.jinx === 'opposite') {
        await sleep(160);
        await post('action', { ...pourer.seat, type: 'stop' });
      } else {
        await post('action', { ...pourer.seat, type: 'pourDown' });
        await sleep(160);
        await post('action', { ...pourer.seat, type: 'pourUp' });
      }
      await waitFor(() => clients.every((c) => c.state?.phase === 'reveal'), 12000);
      assert.equal(
        opponent.state.turn.jinx,
        pourer.state.turn.jinx,
        'jinx revealed only after the pour',
      );
      assert.ok(
        pourer.state.players.find((p) => p.id === pourer.seat.id).score > 0,
        'safe pour awarded points',
      );
      assert.equal(pourer.state.turn.headToHead, true);
      await waitFor(() => clients.every((c) => c.state?.phase === 'jinx'), 12000);
      const next = opponent.state.turn;
      assert.equal(next.pourerId, opponent.seat.id);
      assert.equal(next.jinxerId, pourer.seat.id);
      assert.equal(pourer.state.turn.cards.length, 3, 'prior pourer can pick jinx');
      assert.equal(opponent.state.turn.cards.length, 0, 'next pourer cannot see draft');
      console.log(
        'Verified two-player SSE: start, secret jinx, safe pour, immediate reveal, alternating roles.',
      );
    } finally {
      for (const client of clients) client.controller.abort();
      processGame.kill('SIGTERM');
      await Promise.race([once(processGame, 'exit'), sleep(1800)]).catch(() => {});
    }
  },
  { timeout: 45000 },
);
