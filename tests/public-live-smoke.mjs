import assert from 'node:assert/strict';

const BASE = process.env.TEST_URL || 'https://pour-decisions-ozbh.onrender.com';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function response(path, options = {}) {
  return fetch(BASE + path, { ...options, signal: AbortSignal.timeout(30000) });
}
async function post(path, data) {
  const res = await response('/api/' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok) throw Error(path + ' HTTP ' + res.status + ': ' + body.error);
  return body;
}
async function waitUntil(check, why, timeout = 18000) {
  const stop = Date.now() + timeout;
  while (Date.now() < stop) {
    if (check()) return;
    await sleep(30);
  }
  throw Error('Timed out waiting for ' + why);
}
class Viewer {
  constructor(seat) {
    this.seat = seat;
    this.current = null;
    this.controller = new AbortController();
    this.received = 0;
  }
  async connect() {
    const { ticket } = await post('stream-ticket', this.seat);
    assert.match(ticket, /^[a-f0-9]{64}$/);
    const res = await fetch(BASE + '/api/stream?ticket=' + ticket, {
      signal: this.controller.signal,
    });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/event-stream/);
    const decoder = new TextDecoder();
    const reader = res.body.getReader();
    this.reader = reader;
    void (async () => {
      let pending = '';
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let ending;
          while ((ending = pending.indexOf('\n\n')) >= 0) {
            const event = pending.slice(0, ending);
            pending = pending.slice(ending + 2);
            const line = event.split('\n').find((l) => l.startsWith('data: '));
            if (line) {
              this.current = JSON.parse(line.slice(6));
              this.received++;
            }
          }
        }
      } catch (error) {
        if (!this.controller.signal.aborted) console.error('SSE reader:', error.message);
      }
    })();
  }
  close() {
    this.controller.abort();
    this.reader?.cancel().catch(() => {});
  }
}
const watchers = [];
try {
  const health = await response('/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const homepage = await response('/');
  assert.equal(homepage.status, 200);
  assert.match(await homepage.text(), /Pour Decisions/);
  const js = await response('/app.js');
  assert.equal(js.status, 200);
  const code = await js.text();
  for (const feature of ['data-add-bot', 'data-replay-open', 'stream-ticket'])
    assert.ok(code.includes(feature), 'deployed client includes ' + feature);
  const css = await response('/style.css');
  assert.equal(css.status, 200);
  assert.match(await css.text(), /overhead-water-sprites-16\.webp/);
  const sprite = await response('/assets/overhead-water-sprites-16.webp');
  assert.equal(sprite.status, 200);
  assert.match(sprite.headers.get('content-type'), /image\/webp/);
  console.log('LIVE: health, page, client features, and 16-frame sprite OK');

  const host = await post('create', { name: 'ReleaseHost' });
  const guest = await post('join', { code: host.code, name: 'ReleaseGuest' });
  const clients = [new Viewer(host), new Viewer(guest)];
  watchers.push(...clients);
  await Promise.all(clients.map((client) => client.connect()));
  await waitUntil(() => clients.every((v) => v.current?.players?.filter((p) => p.connected).length === 2),
    'two connected private SSE streams');
  assert.notEqual(host.token, guest.token);

  const { ticket } = await post('stream-ticket', host);
  const once = new AbortController();
  const check = await fetch(BASE + '/api/stream?ticket=' + ticket, { signal: once.signal });
  assert.equal(check.status, 200);
  once.abort();
  assert.equal((await response('/api/stream?ticket=' + ticket)).status, 401);
  assert.equal((await response('/api/stream?code=' + host.code + '&id=' + host.id + '&token=' + host.token)).status, 401);
  console.log('LIVE: single-use SSE tickets, no legacy credentials in URL OK');

  await post('action', { ...host, type: 'start' });
  await waitUntil(() => clients.every((v) => v.current?.phase === 'howto'), 'tutorial phase');
  await post('action', { ...host, type: 'ready' });
  await post('action', { ...guest, type: 'ready' });
  await waitUntil(() => clients.every((v) => v.current?.phase === 'pour'), 'two-player pour phase');
  const pourer = clients.find((v) => v.current.me === v.current.turn.pourerId);
  const watcher = clients.find((v) => v !== pourer);
  assert.ok(pourer.current.turn.jinx);
  assert.equal(watcher.current.turn.jinx, null);
  assert.equal(pourer.current.turn.headToHead, true);
  for (const v of clients) assert.equal('replay' in v.current, false);
  console.log('LIVE: two-player tutorial, roles and secret jinx filtering OK');

  if (pourer.current.turn.jinx === 'opposite') {
    await post('action', { ...pourer.seat, type: 'stop' });
  } else {
    await post('action', { ...pourer.seat, type: 'pourDown' });
    await waitUntil(() => clients.some((v) => v.current?.turn?.started), 'active pour');
    await post('action', { ...pourer.seat, type: 'pourUp' });
  }
  await waitUntil(() => clients.every((v) => v.current?.phase === 'reveal'),
    'first pour reveal', 25000);
  assert.equal(watcher.current.reveal.jinx, pourer.current.reveal.jinx);
  console.log('LIVE: first real pour finished and jinx revealed with synchronized SSE states OK');

  const botHost = await post('create', { name: 'BotSmokeHost' });
  const botViewer = new Viewer(botHost);
  watchers.push(botViewer);
  await botViewer.connect();
  await post('action', { ...botHost, type: 'addBot' });
  await post('action', { ...botHost, type: 'addBot' });
  await waitUntil(() => botViewer.current?.players?.filter((p) => p.bot).length === 2,
    'two engine bots on public site');
  assert.equal(botViewer.current.players.filter((p) => p.bot && p.connected).length, 2);
  await post('action', { ...botHost, type: 'start' });
  await post('action', { ...botHost, type: 'ready' });
  await waitUntil(() => ['jinx', 'pour'].includes(botViewer.current?.phase),
    'host + bots start with automatic bot readiness');
  console.log('LIVE: host-managed bot seats and readiness OK');
  console.log('PUBLIC_SMOKE_OK ' + JSON.stringify({
    url: BASE,
    clients: clients.length,
    firstRound: 'reveal',
    botSeats: 2,
    combinedSseMessages: watchers.reduce((n, c) => n + c.received, 0),
  }));
} finally {
  watchers.forEach((v) => v.close());
}
