import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../game.js';

function roomFixture() {
  let time = 100000;
  let seed = 0xabc112ef;
  const random = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 4294967296;
  };
  const engine = new GameEngine({ clock: () => time, scale: 0.05, random });
  const host = engine.create('Host');
  engine.connection(host.code, host.id, host.token, 1);
  const room = engine.room(host.code);
  const action = (seat, type, value = {}) =>
    engine.action(host.code, seat.id, seat.token, type, value);
  const tick = () => {
    time += 2.5;
    engine.tick();
  };
  return { engine, host, room, action, tick };
}

test('only the lobby host can add or remove up to three clearly marked bot seats', () => {
  const s = roomFixture();
  const other = s.engine.join(s.host.code, 'Visitor');
  s.engine.connection(other.code, other.id, other.token, 1);
  assert.throws(() => s.action(other, 'addBot'), /Only the host/);
  for (let i = 0; i < 3; i++) s.action(s.host, 'addBot');
  assert.equal(s.room.players.filter((p) => p.bot).length, 3);
  assert.deepEqual(
    s.room.players.filter((p) => p.bot).map((p) => p.name),
    ['🤖 Bot Ava', '🤖 Bot Leo', '🤖 Bot Mia'],
  );
  assert.equal(
    s.room.players.filter((p) => p.bot).every((p) => p.connections === 1),
    true,
  );
  const visible = s.engine.state(s.room, s.room.players[0]);
  assert.equal(visible.players.filter((p) => p.bot && p.connected).length, 3);
  assert.throws(() => s.action(s.host, 'addBot'), /three bots/);
  assert.throws(() => s.action(s.host, 'removeBot', { id: other.id }), /Choose a bot/);
  assert.throws(
    () => s.action(other, 'removeBot', { id: s.room.players.at(-1).id }),
    /Only the host/,
  );
  const removed = s.room.players.at(-1);
  s.action(s.host, 'removeBot', { id: removed.id });
  assert.equal(
    s.room.players.some((p) => p.id === removed.id),
    false,
  );
  s.action(s.host, 'addBot');
  assert.equal(s.room.players.filter((p) => p.bot).length, 3);
  s.action(s.host, 'start');
  assert.equal(s.room.phase, 'howto');
  assert.equal(
    s.room.players.filter((p) => p.bot).every((p) => p.ready),
    true,
  );
  assert.throws(
    () => s.action(s.host, 'removeBot', { id: s.room.players.at(-1).id }),
    /Only the host/,
  );
  s.action(s.host, 'ready');
  assert.equal(s.room.phase, 'howto', 'human visitor still needs to press Ready');
  s.action(other, 'ready');
  assert.equal(s.room.phase, 'pour');
});

test('bots honor lobby seat count and never steal the human host role', () => {
  const s = roomFixture();
  for (let i = 0; i < 7; i++) {
    const seat = s.engine.join(s.host.code, 'Human ' + i);
    s.engine.connection(seat.code, seat.id, seat.token, 1);
  }
  assert.equal(s.room.players.filter((p) => !p.spectator).length, 8);
  assert.throws(() => s.action(s.host, 'addBot'), /eight player seats/);
});

test('one human and two bots finish a complete three-spill match without wrong-turn bot actions', () => {
  const s = roomFixture();
  s.action(s.host, 'addBot');
  s.action(s.host, 'addBot');
  const bots = s.room.players.filter((p) => p.bot);
  const actions = [];
  const original = s.engine.action.bind(s.engine);
  s.engine.action = (...args) => {
    const id = args[1],
      type = args[3];
    if (bots.some((p) => p.id === id)) {
      assert.ok(['pickJinx', 'pourDown', 'pourUp', 'stop', 'guess'].includes(type));
      if (type === 'pickJinx') {
        assert.equal(s.room.phase, 'jinx');
        assert.equal(s.room.turn.jinxerId, id);
      } else if (['pourDown', 'pourUp', 'stop'].includes(type)) {
        assert.equal(s.room.phase, 'pour');
        assert.equal(s.room.turn.pourerId, id);
      } else {
        assert.equal(s.room.phase, 'guess');
        assert.notEqual(s.room.turn.pourerId, id);
        assert.notEqual(s.room.turn.jinxerId, id);
      }
      actions.push({ type, id });
    }
    return original(...args);
  };
  s.action(s.host, 'start');
  s.action(s.host, 'ready');
  assert.equal(s.room.phase, 'pour', 'bots never delay onboarding');
  let ticks = 0,
    maxSamples = 0;
  for (; ticks < 25000 && s.room.phase !== 'gameover'; ticks++) {
    const t = s.room.turn;
    if (s.room.phase === 'jinx' && t.jinxerId === s.host.id)
      s.action(s.host, 'pickJinx', { jinx: t.offered[0] });
    else if (s.room.phase === 'pour' && t.pourerId === s.host.id && !t.started)
      s.action(s.host, 'pourDown');
    else if (
      s.room.phase === 'guess' &&
      t.pourerId !== s.host.id &&
      t.jinxerId !== s.host.id &&
      !t.guesses[s.host.id]
    )
      s.action(s.host, 'guess', { jinx: t.options[0] });
    if (s.room.turn?.replaySamples)
      maxSamples = Math.max(maxSamples, s.room.turn.replaySamples.length);
    s.tick();
  }
  assert.equal(s.room.phase, 'gameover', 'bots and human complete the full match');
  assert.equal(s.room.spills, 3);
  assert.ok(
    actions.some((a) => a.type === 'pickJinx'),
    'bot acts as jinxer',
  );
  assert.ok(
    actions.some((a) => a.type === 'pourDown' || a.type === 'stop'),
    'bot acts as pourer',
  );
  assert.ok(
    actions.some((a) => a.type === 'guess'),
    'bot acts as guesser',
  );
  assert.ok(maxSamples <= 400, 'replay limits still apply to bots');
  assert.ok(s.room.winner, 'game yields a winner');
});

test('unattended bot rooms expire after all human clients disconnect', () => {
  const s = roomFixture();
  s.action(s.host, 'addBot');
  s.action(s.host, 'addBot');
  s.engine.connection(s.host.code, s.host.id, s.host.token, -1);
  assert.ok(s.engine.rooms.has(s.host.code), 'room survives a short disconnect');
  for (let i = 0; i < 36001; i++) s.tick(); // 36001 × 2.5 ms is below the 30-minute timeout.
  assert.ok(s.engine.rooms.has(s.host.code));
  // Clock access is injectable; advance past the production room inactivity limit.
  const oldTime = s.engine.clock;
  s.engine.clock = () => oldTime() + 30 * 60000 + 5000;
  s.engine.tick();
  assert.equal(
    s.engine.rooms.has(s.host.code),
    false,
    'engine-owned bots cannot keep an abandoned room alive',
  );
});
