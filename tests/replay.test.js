import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { GameEngine } from '../game.js';

function match() {
  let now = 100000;
  const engine = new GameEngine({ clock: () => now, random: () => 0.22 });
  const host = engine.create('Ada');
  const rival = engine.join(host.code, 'Ben');
  const third = engine.join(host.code, 'Cam');
  const seats = [host, rival, third];
  for (const s of seats) engine.connection(s.code, s.id, s.token, 1);
  const room = engine.room(host.code);
  const act = (seat, type, value = {}) =>
    engine.action(seat.code, seat.id, seat.token, type, value);
  const advance = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 50) {
      now += Math.min(50, ms - elapsed);
      engine.tick();
    }
  };
  act(host, 'start');
  seats.forEach((s) => act(s, 'ready'));
  assert.equal(room.phase, 'pour');
  return {
    engine,
    host,
    seats,
    room,
    act,
    advance,
    tick: () => {
      now += 50;
      engine.tick();
    },
    jump: (ms) => {
      now += ms;
      engine.tick();
    },
    stepTime: (ms) => {
      now += ms;
    },
  };
}

test('spill replay is invisible to every viewer until reveal, including past spills', () => {
  const s = match();
  const { room, engine } = s;
  const pourer = s.seats.find((x) => x.id === room.turn.pourerId);
  room.turn.jinx = 'fire';
  room.cup = 99;
  room.turn.startCup = 99;
  for (const p of s.seats)
    assert.equal(
      Object.hasOwn(
        engine.state(
          room,
          room.players.find((x) => x.id === p.id),
        ),
        'replay',
      ),
      false,
    );
  s.act(pourer, 'pourDown');
  s.advance(200);
  assert.equal(room.phase, 'guess', 'a spill from a nearly-full cup starts guessing');
  for (const p of room.players) {
    assert.equal(Object.hasOwn(engine.state(room, p), 'replay'), false);
    assert.equal(
      engine.state(room, p).turn.jinx,
      p.id === room.turn.pourerId || p.id === room.turn.jinxerId ? 'fire' : null,
    );
  }
  s.advance(5200);
  assert.equal(room.phase, 'reveal');
  for (const p of room.players) {
    const view = engine.state(room, p);
    assert.equal(view.replay.jinx, 'fire', 'jinx revealed with replay, never earlier');
    assert.ok(view.replay.events.some((event) => event.type === 'pourDown'));
    assert.ok(view.replay.events.some((event) => event.type === 'spill'));
    assert.ok(view.replay.samples.length >= 2);
    assert.equal(view.replay.samples.at(-1).level, view.replay.finalLevel);
    assert.equal(view.replay.finalLevel, Math.round(room.cup * 10) / 10);
    assert.equal(view.replay.samples.at(-1).pouring, false);
  }
  s.advance(4600);
  assert.equal(room.phase, 'scoreboard');
  s.advance(5200);
  assert.equal(room.phase, 'jinx');
  assert.ok(room.spillReplay, 'only the last spill remains stored internally');
  for (const p of room.players) {
    const view = engine.state(room, p);
    assert.equal(
      Object.hasOwn(view, 'replay'),
      false,
      'old replays never leak to the next jinx phase',
    );
  }
  room.phase = 'gameover';
  s.act(s.host, 'rematch');
  assert.equal(room.spillReplay, null, 'rematch clears the stored spill');
  assert.equal(room.phase, 'lobby');
  for (const p of room.players) assert.equal(Object.hasOwn(engine.state(room, p), 'replay'), false);
});

test('replay recording follows 20 Hz ticks, never exceeds 400 samples, and ends exactly at spill', () => {
  const s = match();
  const { room, engine } = s;
  const pourer = s.seats.find((x) => x.id === room.turn.pourerId);
  room.turn.jinx = 'eye';
  s.act(pourer, 'pourDown');
  const initial = room.turn.replaySamples.length;
  s.advance(250);
  assert.equal(room.turn.replaySamples.length, initial + 5, 'each 50 ms tick records one frame');
  assert.deepEqual(Object.keys(room.turn.replaySamples[0]), ['t', 'level', 'pouring']);
  assert.equal(room.turn.replaySamples[0].t, 0);
  for (let i = 0; i < 450; i++) {
    s.stepTime(50);
    engine.recordReplayFrame(room);
  }
  assert.equal(room.turn.replaySamples.length, 400, 'hard cap even with delayed ticks');
  engine.addWater(room, 101);
  assert.equal(room.phase, 'guess');
  assert.equal(room.turn.replaySamples.length, 400);
  assert.equal(room.turn.replaySamples.at(-1).level, Math.round(room.cup * 10) / 10);
  assert.equal(room.turn.replaySamples.at(-1).pouring, false);
});

test('Ketchup, Butterfingers and Shaky bursts are captured as discrete events', () => {
  for (const [jinx, property, value, event] of [
    ['ketchup', 'ketchupDelay', 0, 'ketchupGlug'],
    ['butter', 'butterAt', 0, 'butterSplash'],
    ['shaky', 'shakyAt', 0, 'shakyBurst'],
  ]) {
    const s = match();
    const { room } = s;
    room.turn.jinx = jinx;
    room.turn[property] = value;
    if (jinx === 'butter') room.turn.butterHappened = false;
    const pourer = s.seats.find((x) => x.id === room.turn.pourerId);
    s.act(pourer, 'pourDown');
    if (jinx === 'shaky') s.jump(1200);
    else s.tick();
    assert.ok(
      room.turn.replayEvents.some((x) => x.type === event),
      `${jinx} event recorded`,
    );
    s.act(pourer, 'pourUp');
    assert.ok(room.turn.replayEvents.some((x) => x.type === 'pourUp'));
  }
});

test('replay UI has a side-view player and exact final state with 1x/2x and reduced motion', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /data-replay-open>▶ Watch the spill/);
  assert.match(app, /data-replay-speed/);
  assert.match(app, /state\.reduceMotion \? view\.data\.finalLevel/);
  assert.match(app, /cupScene\(level, \{ camera: 'side' \}\)/);
  const a = app.indexOf('function replayFrameAt(');
  const b = app.indexOf('function replayElapsed(', a);
  assert.ok(a >= 0 && b > a);
  const context = { Math };
  vm.createContext(context);
  vm.runInContext(app.slice(a, b) + '\nthis.at=replayFrameAt;', context);
  const replay = {
    samples: [
      { t: 0, level: 80, pouring: true },
      { t: 50, level: 83, pouring: true },
      { t: 100, level: 102.3, pouring: false },
    ],
    finalLevel: 102.3,
  };
  assert.equal(context.at(replay, 25).level, 81.5);
  assert.equal(context.at(replay, 100).level, 102.3);
  assert.equal(context.at(replay, 999).pouring, false);
});
