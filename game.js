import { randomBytes } from 'node:crypto';

export const JINXES = [
  {
    id: 'fog',
    name: 'Foggy Glasses',
    family: 'Vision',
    icon: '🌫️',
    mult: 1.5,
    desc: 'The cup looks blurry.',
  },
  {
    id: 'tunnel',
    name: 'Tunnel Vision',
    family: 'Vision',
    icon: '👁️',
    mult: 2,
    desc: 'See only a drifting strip.',
  },
  {
    id: 'lag',
    name: 'Lag Goggles',
    family: 'Vision',
    icon: '⏳',
    mult: 2,
    desc: 'The level lags one second behind.',
  },
  {
    id: 'lights',
    name: 'Lights Out',
    family: 'Vision',
    icon: '🌑',
    mult: 2,
    desc: 'The cup goes dark after 1.5s.',
  },
  {
    id: 'above',
    name: '5 Feet Above',
    family: 'Distance',
    icon: '🛰️',
    mult: 1.5,
    desc: 'The camera lifts high above the glass.',
  },
  {
    id: 'shaky',
    name: 'Shaky Hands',
    family: 'Hands',
    icon: '🫨',
    mult: 1.5,
    desc: 'Random extra splashes while pouring.',
  },
  {
    id: 'heavy',
    name: 'Heavy Arm',
    family: 'Hands',
    icon: '🏋️',
    mult: 1.5,
    desc: 'Controls react 0.6 seconds late.',
  },
  {
    id: 'opposite',
    name: 'Opposite Day',
    family: 'Hands',
    icon: '🔄',
    mult: 2,
    desc: 'Water pours unless you hold to pause.',
  },
  {
    id: 'butter',
    name: 'Butterfingers',
    family: 'Hands',
    icon: '🧈',
    mult: 1,
    desc: 'A surprise 8-unit splash might happen.',
  },
  {
    id: 'fire',
    name: 'Fire Hose',
    family: 'Bottle',
    icon: '🚒',
    mult: 1.5,
    desc: 'The bottle pours three times faster.',
  },
  {
    id: 'eye',
    name: 'Eyedropper',
    family: 'Bottle',
    icon: '💧',
    mult: 1,
    desc: 'A tiny trickle, with an eight-second limit.',
  },
  {
    id: 'ketchup',
    name: 'Ketchup Bottle',
    family: 'Bottle',
    icon: '🍅',
    mult: 1.5,
    desc: 'It stalls, then unleashes a huge glug.',
  },
  {
    id: 'soda',
    name: 'Soda Can',
    family: 'Bottle',
    icon: '🥤',
    mult: 1,
    desc: 'Foam makes the cup look 10 units fuller.',
  },
];
export const JINX_BY_ID = Object.fromEntries(JINXES.map((j) => [j.id, j]));
const AVATARS = ['🦊', '🐸', '🐻', '🐱', '🐼', '🐨', '🦄', '🐙', '🐧', '🐯', '🦖', '🐝'];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
// Measured pacing: the shared cup now fills four times more slowly than at launch.
export const POUR_RATE = 3;
export const POUR_MAX_MS = 12000;
export const EYEDROPPER_MAX_MS = 8000;
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const sample = (a, n) => shuffle(a).slice(0, n);
const secret = () => randomBytes(20).toString('hex');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
const connected = (p) => p.connections > 0;
const playable = (p) => !p.spectator && connected(p);
const multiplayerPhases = new Set(['howto', 'jinx', 'pour', 'guess', 'reveal', 'scoreboard']);
const badWords = /\b(fuck|shit|bitch|nigger|faggot|cunt)\b/i;
function round(n) {
  return Math.round(n * 10) / 10;
}

export class GameEngine {
  constructor({ clock = () => Date.now(), scale = 1, random = Math.random } = {}) {
    this.clock = clock;
    this.scale = scale;
    this.random = random;
    this.rooms = new Map();
  }
  ms(n) {
    return n * this.scale;
  }
  makeCode() {
    for (let k = 0; k < 10000; k++) {
      const code = Array.from(
        { length: 4 },
        () => CODE_CHARS[Math.floor(this.random() * CODE_CHARS.length)],
      ).join('');
      if (!this.rooms.has(code)) return code;
    }
    throw error('Please try again.', 503);
  }
  name(raw, players) {
    let clean = String(raw ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 12);
    if (!clean || badWords.test(clean) || /[<>\x00-\x1f]/.test(clean))
      throw error('Please enter a friendly name (1–12 characters).');
    const names = new Set(players.map((p) => p.name.toLowerCase()));
    if (names.has(clean.toLowerCase())) {
      let i = 2;
      const base = clean.slice(0, 9);
      while (names.has(`${base} ${i}`.toLowerCase())) i++;
      clean = `${base} ${i}`;
    }
    return clean;
  }
  makePlayer(room, name, avatar, spectator = false) {
    const p = {
      id: secret(),
      token: secret(),
      name: this.name(name, room.players),
      avatar: AVATARS.includes(avatar) ? avatar : '🦊',
      score: 0,
      correct: 0,
      goodPours: 0,
      sabotages: 0,
      connectedAt: 0,
      disconnectedAt: 0,
      connections: 0,
      spectator,
      waitingSeat: false,
      ready: false,
      lastJinx: null,
    };
    room.players.push(p);
    if (!room.hostId && !spectator) room.hostId = p.id;
    room.lastActivity = this.clock();
    return { code: room.code, id: p.id, token: p.token, name: p.name };
  }
  create(name, avatar) {
    this.name(name, []);
    const code = this.makeCode();
    const room = {
      code,
      hostId: null,
      hostGoneAt: 0,
      turnOrder: [],
      settings: { spillLimit: 3 },
      phase: 'lobby',
      players: [],
      cup: 0,
      spills: 0,
      turn: null,
      turnIndex: -1,
      lastPourer: null,
      turnNumber: 0,
      deadline: 0,
      pauseStarted: 0,
      pauseDeadline: 0,
      lastActivity: this.clock(),
      lastState: 0,
      reveal: null,
      winner: null,
      duel: null,
    };
    this.rooms.set(code, room);
    return this.makePlayer(room, name, avatar);
  }
  room(code) {
    const room = this.rooms.get(String(code || '').toUpperCase());
    if (!room) throw error('Room not found or has expired.', 404);
    return room;
  }
  join(code, name, avatar, { spectate = false } = {}) {
    const room = this.room(code);
    const seats = room.players.filter((p) => !p.spectator).length;
    const allowSeat = room.phase === 'lobby' && seats < 8 && !spectate;
    if (!allowSeat && room.players.filter((p) => p.spectator).length >= 16)
      throw error('This room has too many spectators.');
    const session = this.makePlayer(room, name, avatar, !allowSeat);
    const p = room.players.at(-1);
    if (room.phase !== 'lobby' && !spectate && seats < 8) p.waitingSeat = true;
    if (room.phase !== 'lobby') p.joinTurn = room.turnNumber;
    return session;
  }
  auth(code, id, token) {
    const room = this.room(code);
    const player = room.players.find((p) => p.id === id && p.token === token);
    if (!player) throw error('Your seat was not found. Please join again.', 401);
    return { room, player };
  }
  connection(code, id, token, change) {
    const { room, player } = this.auth(code, id, token);
    player.connections = Math.max(0, player.connections + change);
    if (change > 0) {
      player.connectedAt = this.clock();
      player.disconnectedAt = 0;
    } else if (!connected(player)) {
      player.disconnectedAt = this.clock();
    }
    this.hostHandoff(room);
    if (change < 0 && room.phase === 'pour' && room.turn?.pourerId === id && !connected(player)) {
      this.releasePour(room, true);
    }
    this.checkPause(room);
    return room;
  }
  hostHandoff(room) {
    if (room.players.some((p) => p.id === room.hostId && connected(p))) {
      room.hostGoneAt = 0;
      return;
    }
    if (!room.hostGoneAt) {
      room.hostGoneAt = this.clock();
      return;
    }
    if (this.clock() - room.hostGoneAt < this.ms(2000)) return;
    const next = room.players.find((p) => playable(p)) || room.players.find((p) => connected(p));
    if (next) {
      room.hostId = next.id;
      room.hostGoneAt = 0;
    }
  }
  checkPause(room) {
    if (!multiplayerPhases.has(room.phase)) return;
    const count = room.players.filter(playable).length;
    const now = this.clock();
    if (count < 2 && !room.pauseStarted) {
      room.pauseStarted = now;
      room.pauseDeadline = now + this.ms(120000);
    } else if (count >= 2 && room.pauseStarted) {
      const delta = now - room.pauseStarted;
      room.deadline += delta;
      if (room.turn) {
        for (const prop of ['pourStartAt', 'pourEndAt', 'pouringSince', 'dripAt'])
          if (room.turn[prop]) room.turn[prop] += delta;
        room.turn.lastTick = now;
        for (const e of room.turn.events || []) e.at += delta;
      }
      room.pauseStarted = 0;
      room.pauseDeadline = 0;
    }
  }
  action(code, id, token, type, value) {
    const { room, player } = this.auth(code, id, token);
    const now = this.clock();
    room.lastActivity = now;
    if (type === 'settings') {
      if (room.phase !== 'lobby' || room.hostId !== id)
        throw error('Only the host can change lobby settings.');
      if (![3, 5, 7].includes(value?.spillLimit)) throw error('Choose 3, 5, or 7 spills.');
      room.settings.spillLimit = value.spillLimit;
    } else if (type === 'start') {
      if (room.phase !== 'lobby' || room.hostId !== id) throw error('Only the host can start.');
      if (room.players.filter(playable).length < 2)
        throw error('At least 2 connected players are needed.');
      room.phase = 'howto';
      room.deadline = 0; // Instructions have no timer. Every seated player must opt in.
      room.players.forEach((p) => (p.ready = false));
    } else if (type === 'ready') {
      if (room.phase !== 'howto') throw error('The game is no longer on instructions.');
      player.ready = true;
      if (room.players.filter(playable).every((p) => p.ready)) this.startRounds(room);
    } else if (type === 'pickJinx') {
      if (room.pauseStarted) throw error('Waiting for players to reconnect.');
      if (room.phase !== 'jinx' || room.turn?.jinxerId !== id)
        throw error('Not your jinx to choose.');
      if (!room.turn.offered.includes(value?.jinx))
        throw error('Choose one of your three jinx cards.');
      this.chooseJinx(room, value.jinx);
    } else if (type === 'pourDown' || type === 'pourUp' || type === 'stop') {
      if (room.pauseStarted) throw error('Game paused while players reconnect.');
      if (room.phase !== 'pour' || room.turn?.pourerId !== id)
        throw error('It is not your turn to pour.');
      if (type === 'pourDown') this.pressPour(room, true);
      if (type === 'pourUp') this.releasePour(room);
      if (type === 'stop') this.stopPour(room);
    } else if (type === 'guess') {
      if (room.pauseStarted) throw error('Game paused while players reconnect.');
      if (!['pour', 'guess'].includes(room.phase) || !room.turn || room.turn.headToHead)
        throw error('Guessing is closed in a two-player game.');
      if (id === room.turn.pourerId || id === room.turn.jinxerId)
        throw error('You already know the jinx!');
      if (player.spectator && room.turn.turnNumber <= player.joinTurn)
        throw error('You can guess starting next turn.');
      if (room.turn.guesses[id]) throw error('You already guessed.');
      if (!room.turn.options.includes(value?.jinx)) throw error('Choose one of the four options.');
      room.turn.guesses[id] = value.jinx;
    } else if (type === 'rematch') {
      if (room.phase !== 'gameover' || room.hostId !== id)
        throw error('Only the host can begin a rematch.');
      this.rematch(room);
    } else throw error('Unknown action.');
    return room;
  }
  startRounds(room) {
    room.turnOrder = shuffle(room.players.filter((p) => !p.spectator).map((p) => p.id));
    room.turnIndex = Math.floor(this.random() * room.turnOrder.length);
    room.lastPourer = null;
    room.turnNumber = 0;
    this.beginTurn(room, true);
  }
  // Advance the shared turn order while skipping disconnected players; prepare a fresh secret jinx.
  beginTurn(room, first = false) {
    const active = room.players.filter(playable);
    if (active.length < 2) {
      this.checkPause(room);
      return;
    }
    const indices = room.turnOrder
      .map((id, i) => (playable(room.players.find((p) => p.id === id)) ? i : -1))
      .filter((i) => i >= 0);
    if (first) {
      if (!indices.includes(room.turnIndex)) room.turnIndex = indices[0];
    } else {
      let next = indices.find((i) => i > room.turnIndex);
      room.turnIndex = next ?? indices[0];
    }
    const pourer = room.players.find((p) => p.id === room.turnOrder[room.turnIndex]);
    const jinxer = room.players.find((p) => p.id === room.lastPourer && connected(p));
    const pool = JINXES.filter((j) => j.id !== pourer.lastJinx);
    const offered = sample(pool, 3).map((j) => j.id);
    room.turnNumber++;
    room.turn = {
      turnNumber: room.turnNumber,
      pourerId: pourer.id,
      jinxerId: jinxer?.id || null,
      headToHead: active.length === 2,
      offered,
      options: [],
      jinx: null,
      guesses: {},
      startCup: room.cup,
      added: 0,
      started: false,
      held: false,
      effectiveHeld: false,
      releaseRequested: false,
      events: [],
      pourStartAt: 0,
      pourEndAt: 0,
      pouringSince: 0,
      lastTick: this.clock(),
      dripping: false,
      stopRequested: false,
      shakyAt: 0,
      butterAt: 0,
      butterHappened: false,
      ketchupDelay: 1000 + this.random() * 1000,
    };
    room.reveal = null;
    if (jinxer && jinxer.id !== pourer.id) {
      room.phase = 'jinx';
      room.deadline = this.clock() + this.ms(10000);
    } else this.chooseJinx(room, offered[Math.floor(this.random() * offered.length)]);
  }
  chooseJinx(room, id) {
    const t = room.turn;
    const now = this.clock();
    t.jinx = id;
    room.players.find((p) => p.id === t.pourerId).lastJinx = id;
    t.options = shuffle([
      id,
      ...sample(
        JINXES.filter((j) => j.id !== id).map((j) => j.id),
        3,
      ),
    ]);
    t.lastTick = now;
    t.levelHistory = [{ at: now, level: room.cup }];
    t.butterAt = (0.5 + this.random() * 2.5) * this.ms(1000);
    t.butterHappened = this.random() >= 0.25;
    room.phase = 'pour';
    room.deadline = now + this.ms(10000);
    if (id === 'opposite') {
      t.started = true;
      t.pourStartAt = now;
      t.pourEndAt = now + this.ms(POUR_MAX_MS);
      t.pouringSince = now;
    }
  }
  pressPour(room, down) {
    const t = room.turn;
    const now = this.clock();
    if (t.stopRequested || t.dripping) return;
    if (!t.started) {
      t.started = true;
      t.pourStartAt = now;
      t.pourEndAt = now + this.ms(t.jinx === 'eye' ? EYEDROPPER_MAX_MS : POUR_MAX_MS);
      t.pouringSince = now;
    }
    if (t.jinx === 'heavy') t.events.push({ at: now + this.ms(600), down });
    else t.effectiveHeld = down;
    t.held = down;
    t.releaseRequested = false;
  }
  releasePour(room, disconnected = false) {
    const t = room.turn;
    if (!t || room.phase !== 'pour' || t.dripping || t.stopRequested) return;
    if (!t.started) {
      if (!disconnected) return;
      this.autoMinimum(room);
      return;
    }
    if (t.jinx === 'opposite') {
      if (!disconnected) {
        t.held = false;
        t.effectiveHeld = false;
        return;
      }
      this.stopPour(room);
      return;
    }
    const now = this.clock();
    t.held = false;
    t.releaseRequested = true;
    if (t.jinx === 'heavy' && !disconnected) t.events.push({ at: now + this.ms(600), down: false });
    else {
      t.effectiveHeld = false;
      t.events = [];
      this.beginDrip(room);
    }
  }
  stopPour(room) {
    const t = room.turn;
    if (!t || room.phase !== 'pour') return;
    if (!t.started) {
      this.autoMinimum(room);
      return;
    }
    t.stopRequested = true;
    t.effectiveHeld = false;
    t.events = [];
    this.beginDrip(room);
  }
  beginDrip(room) {
    const t = room.turn;
    if (room.phase !== 'pour') return;
    t.effectiveHeld = false;
    t.events = [];
    if (t.added >= 6 - 0.0001) this.endPour(room);
    else {
      t.dripping = true;
      t.dripAt = this.clock();
    }
  }
  autoMinimum(room) {
    const t = room.turn;
    if (!t || room.phase !== 'pour') return;
    t.started = true;
    this.addWater(room, 6);
    if (room.phase === 'pour') this.endPour(room);
  }
  addWater(room, amount) {
    if (!Number.isFinite(amount) || amount <= 0 || room.phase !== 'pour') return;
    room.turn.added += amount;
    room.cup += amount;
    if (room.cup > 100 + 1e-7) this.endPour(room, true);
  }
  waterRate(t, now) {
    const elapsed = (now - t.pourStartAt) / this.scale;
    if (t.jinx === 'fire') return POUR_RATE * 3;
    if (t.jinx === 'eye') return POUR_RATE / 3;
    if (t.jinx === 'ketchup') {
      if (elapsed < t.ketchupDelay) return 0;
      if (elapsed < t.ketchupDelay + 500) return POUR_RATE * 4;
    }
    return POUR_RATE;
  }
  endPour(room, spill = room.cup > 100) {
    if (room.phase !== 'pour') return;
    const t = room.turn;
    t.dripping = false;
    t.effectiveHeld = false;
    t.events = [];
    t.spilled = spill;
    // In a two-player face-off, the rival picked the handicap and already knows it.
    // Skip the detective phase entirely; scores come from pouring and sabotaging.
    if (t.headToHead) {
      this.revealTurn(room);
      return;
    }
    room.phase = 'guess';
    room.deadline = this.clock() + this.ms(5000);
  }
  // Score the completed pour once, then make its previously secret jinx visible to everyone.
  revealTurn(room) {
    const t = room.turn;
    if (!t) return;
    const j = JINX_BY_ID[t.jinx];
    const pourer = room.players.find((p) => p.id === t.pourerId);
    const deltas = {};
    const add = (id, amt) => {
      if (!id) return;
      const p = room.players.find((x) => x.id === id);
      if (p) {
        p.score += amt;
        deltas[id] = (deltas[id] || 0) + amt;
      }
    };
    if (room.duel?.active) {
      room.duel.results.push({ id: pourer.id, spilled: t.spilled, added: round(t.added) });
    } else {
      if (t.spilled) {
        add(pourer.id, -15);
        room.spills++;
        if (t.jinxerId) {
          add(t.jinxerId, 5);
          const sab = room.players.find((p) => p.id === t.jinxerId);
          sab.sabotages++;
        }
      } else {
        add(pourer.id, Math.round(10 * j.mult));
        pourer.goodPours++;
      }
      for (const [id, g] of Object.entries(t.guesses)) {
        if (g === t.jinx) {
          add(id, 5);
          const p = room.players.find((p) => p.id === id);
          if (p) p.correct++;
        } else add(pourer.id, 2);
      }
      room.lastPourer = t.pourerId;
    }
    room.reveal = {
      jinx: t.jinx,
      spilled: t.spilled,
      level: round(room.cup),
      added: round(t.added),
      deltas,
      guesses: { ...t.guesses },
      pourerId: t.pourerId,
      jinxerId: t.jinxerId,
      duel: !!room.duel?.active,
    };
    room.phase = 'reveal';
    room.deadline = this.clock() + this.ms(4500);
  }
  sorted(room) {
    return [...room.players]
      .filter((p) => !p.spectator)
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.correct - a.correct ||
          room.players.indexOf(a) - room.players.indexOf(b),
      );
  }
  // Score and correct-guess ties are resolved by the equal-handicap sudden-death round.
  resolveEnd(room) {
    const ranked = this.sorted(room);
    if (!ranked.length) {
      room.phase = 'gameover';
      return;
    }
    const top = ranked.filter(
      (p) => p.score === ranked[0].score && p.correct === ranked[0].correct,
    );
    if (top.length === 1) {
      room.winner = top[0].id;
      room.duel = null;
      room.phase = 'gameover';
      room.deadline = 0;
      return;
    }
    this.startDuel(
      room,
      top.map((p) => p.id),
    );
  }
  startDuel(room, ids) {
    const jinx = sample(
      JINXES.filter((j) => ['fog', 'tunnel', 'lag', 'lights', 'above', 'soda'].includes(j.id)),
      1,
    )[0].id;
    room.duel = {
      active: true,
      ids,
      index: 0,
      results: [],
      jinx,
      round: (room.duel?.round || 0) + 1,
    };
    this.beginDuelPour(room);
  }
  beginDuelPour(room) {
    const d = room.duel;
    room.cup = 85;
    const id = d.ids[d.index];
    const now = this.clock();
    room.turnNumber++;
    room.turn = {
      turnNumber: room.turnNumber,
      pourerId: id,
      jinxerId: null,
      offered: [],
      options: [],
      jinx: d.jinx,
      guesses: {},
      startCup: 85,
      added: 0,
      started: false,
      held: false,
      effectiveHeld: false,
      releaseRequested: false,
      events: [],
      pourStartAt: 0,
      pourEndAt: 0,
      pouringSince: 0,
      lastTick: now,
      dripping: false,
      stopRequested: false,
      shakyAt: 0,
      butterAt: 0,
      butterHappened: true,
      ketchupDelay: 1500,
    };
    room.phase = 'pour';
    room.deadline = now + this.ms(10000);
  }
  endDuelStep(room) {
    const d = room.duel;
    if (d.index < d.ids.length - 1) {
      d.index++;
      this.beginDuelPour(room);
      return;
    }
    const best = [...d.results].sort(
      (a, b) => Number(a.spilled) - Number(b.spilled) || b.added - a.added,
    );
    const tied = best.filter((r) => r.spilled === best[0].spilled && r.added === best[0].added);
    if (tied.length === 1) {
      room.winner = best[0].id;
      d.active = false;
      room.phase = 'gameover';
      room.deadline = 0;
    } else
      this.startDuel(
        room,
        tied.map((r) => r.id),
      );
  }
  promoteWaiting(room) {
    let slots = 8 - room.players.filter((p) => !p.spectator).length;
    for (const p of room.players) {
      if (slots <= 0) break;
      if (p.waitingSeat && connected(p)) {
        p.spectator = false;
        p.waitingSeat = false;
        room.turnOrder.push(p.id);
        slots--;
      }
    }
  }
  afterReveal(room) {
    if (room.duel?.active) {
      this.endDuelStep(room);
      return;
    }
    if (room.reveal?.spilled) {
      room.cup = 0;
      room.phase = 'scoreboard';
      room.deadline = this.clock() + this.ms(5000);
      this.promoteWaiting(room);
    } else this.beginTurn(room);
  }
  afterScoreboard(room) {
    if (room.spills >= room.settings.spillLimit) this.resolveEnd(room);
    else this.beginTurn(room);
  }
  rematch(room) {
    room.phase = 'lobby';
    room.cup = 0;
    room.spills = 0;
    room.turn = null;
    room.turnIndex = -1;
    room.turnOrder = [];
    room.turnNumber = 0;
    room.lastPourer = null;
    room.reveal = null;
    room.winner = null;
    room.duel = null;
    room.deadline = 0;
    room.pauseStarted = 0;
    for (const p of room.players) {
      p.score = 0;
      p.correct = 0;
      p.goodPours = 0;
      p.sabotages = 0;
      p.ready = false;
      p.lastJinx = null;
    }
  }
  // Server-owned timer and water-physics loop: one pass over active rooms per 50ms tick.
  // Pauses freeze transitions; pending inputs and timeouts are resolved before broadcasting state.
  tick() {
    const now = this.clock();
    const changed = [];
    for (const room of this.rooms.values()) {
      if (room.hostGoneAt) this.hostHandoff(room);
      if (room.players.every((p) => !connected(p)) && now - room.lastActivity > 30 * 60000) {
        this.rooms.delete(room.code);
        continue;
      }
      if (room.pauseStarted) {
        if (now >= room.pauseDeadline) {
          room.pauseStarted = 0;
          room.winner = this.sorted(room)[0]?.id || null;
          room.phase = 'gameover';
          room.deadline = 0;
          changed.push(room.code);
        }
        continue;
      }
      if (room.phase === 'jinx' && now >= room.deadline) {
        this.chooseJinx(room, sample(room.turn.offered, 1)[0]);
        changed.push(room.code);
      } else if (room.phase === 'pour') {
        const t = room.turn;
        const dt = Math.max(0, Math.min(0.2, (now - t.lastTick) / this.scale / 1000));
        t.lastTick = now;
        // Bound the level snapshots used by Lag Goggles rather than retaining an entire game.
        t.levelHistory ??= [];
        t.levelHistory.push({ at: now, level: room.cup });
        if (t.levelHistory.length > 70) t.levelHistory.shift();
        if (!t.started && now >= room.deadline) {
          this.autoMinimum(room);
          changed.push(room.code);
          continue;
        }
        if (t.started) {
          // Apply queued delayed controls before calculating this tick's actual flow.
          if (t.events?.length) {
            const ready = t.events.filter((e) => now >= e.at);
            t.events = t.events.filter((e) => now < e.at);
            for (const e of ready) t.effectiveHeld = e.down;
          }
          const elapsed = (now - t.pourStartAt) / this.scale;
          const maxDur = t.jinx === 'eye' ? EYEDROPPER_MAX_MS : POUR_MAX_MS;
          if (!t.dripping && (elapsed >= maxDur || now >= t.pourEndAt)) {
            this.beginDrip(room);
            changed.push(room.code);
            continue;
          }
          const active = t.dripping || (t.jinx === 'opposite' ? !t.effectiveHeld : t.effectiveHeld);
          if (active) {
            let rate = t.dripping ? POUR_RATE : this.waterRate(t, now);
            // The final mandatory six units always drip at normal speed.
            if (t.dripping) rate = POUR_RATE;
            let added = rate * dt;
            if (t.dripping) added = Math.min(added, 6 - t.added);
            this.addWater(room, added);
            if (room.phase !== 'pour') {
              changed.push(room.code);
              continue;
            }
            if (!t.dripping && t.jinx === 'shaky') {
              const bucket = Math.floor(elapsed / 1000);
              if (bucket > t.shakyAt) {
                t.shakyAt = bucket;
                this.addWater(room, this.random() * 1.5);
              }
            }
            if (room.phase !== 'pour') {
              changed.push(room.code);
              continue;
            }
            if (
              !t.dripping &&
              t.jinx === 'butter' &&
              !t.butterHappened &&
              elapsed >= t.butterAt / this.scale
            ) {
              t.butterHappened = true;
              this.addWater(room, 8);
            }
            if (room.phase !== 'pour') {
              changed.push(room.code);
              continue;
            }
          }
          if (t.dripping && t.added >= 6 - 1e-6) this.endPour(room);
          else if (t.releaseRequested && !t.effectiveHeld && !t.events.length) this.beginDrip(room);
        }
        changed.push(room.code);
      } else if (room.phase === 'guess' && now >= room.deadline) {
        this.revealTurn(room);
        changed.push(room.code);
      } else if (room.phase === 'reveal' && now >= room.deadline) {
        this.afterReveal(room);
        changed.push(room.code);
      } else if (room.phase === 'scoreboard' && now >= room.deadline) {
        this.afterScoreboard(room);
        changed.push(room.code);
      }
    }
    return changed;
  }
  // Project one personalized snapshot: hide the real jinx and private options until reveal.
  // Do not leak accurate level readings to a player under a vision handicap.
  state(room, p) {
    const now = this.clock(),
      t = room.turn;
    const secretAccess = t && (p.id === t.pourerId || p.id === t.jinxerId);
    const exposedJinx =
      t &&
      (room.phase === 'reveal' ||
        room.phase === 'scoreboard' ||
        room.phase === 'gameover' ||
        secretAccess);
    const guessVisible =
      t &&
      !t.headToHead &&
      ['pour', 'guess'].includes(room.phase) &&
      p.id !== t.pourerId &&
      p.id !== t.jinxerId &&
      !(p.spectator && t.turnNumber <= p.joinTurn) &&
      !room.duel?.active;
    const result = {
      code: room.code,
      phase: room.phase,
      hostId: room.hostId,
      me: p.id,
      serverTime: now,
      deadline: room.deadline,
      remainingMs: Math.max(0, room.deadline - now),
      paused: !!room.pauseStarted,
      pauseRemaining: room.pauseStarted ? Math.max(0, room.pauseDeadline - now) : 0,
      settings: room.settings,
      spills: room.spills,
      level: round(room.cup),
      spillLimit: room.settings.spillLimit,
      turnNumber: room.turnNumber,
      players: room.players.map((x) => ({
        id: x.id,
        name: x.name,
        avatar: x.avatar,
        score: x.score,
        correct: x.correct,
        goodPours: x.goodPours,
        sabotages: x.sabotages,
        connected: connected(x),
        spectator: x.spectator,
        waitingSeat: x.waitingSeat,
        ready: x.ready,
      })),
      winner: room.winner,
      duel: room.duel
        ? {
            active: room.duel.active,
            round: room.duel.round,
            index: room.duel.index,
            total: room.duel.ids.length,
            results: room.duel.results,
          }
        : null,
      turn: t
        ? {
            turnNumber: t.turnNumber,
            pourerId: t.pourerId,
            jinxerId: t.jinxerId,
            headToHead: !!t.headToHead,
            jinx: exposedJinx ? t.jinx : null,
            cards:
              room.phase === 'jinx' && p.id === t.jinxerId
                ? t.offered.map((id) => JINX_BY_ID[id])
                : [],
            options: guessVisible ? t.options.map((id) => JINX_BY_ID[id]) : [],
            guessed: !!t.guesses[p.id],
            guessesCount: Object.keys(t.guesses).length,
            started: t.started,
            elapsedMs: t.started ? Math.max(0, (now - t.pourStartAt) / this.scale) : 0,
            pourRemainingMs: t.started ? Math.max(0, (t.pourEndAt - now) / this.scale) : 0,
            added: secretAccess || room.phase === 'reveal' ? round(t.added) : null,
            held: p.id === t.pourerId ? t.held : null,
            dripping: t.dripping,
            flowing:
              room.phase === 'pour' &&
              (t.dripping || (t.jinx === 'opposite' ? !t.effectiveHeld : t.effectiveHeld)),
            foam: t.jinx === 'soda' && ['pour', 'guess'].includes(room.phase),
            // Rendered level can be delayed on the pourer's screen without hiding the authoritative truth from everyone else.
            jinxDetail: exposedJinx ? JINX_BY_ID[t.jinx] : null,
          }
        : null,
      reveal:
        room.phase === 'reveal' || room.phase === 'scoreboard' || room.phase === 'gameover'
          ? room.reveal
          : null,
      ranking: this.sorted(room).map((x) => x.id),
    };
    // Prevent vision-jinx players from reading accurate levels through client state.
    if (
      room.phase === 'pour' &&
      p.id === t?.pourerId &&
      ['fog', 'tunnel', 'lag', 'lights'].includes(t.jinx)
    ) {
      if (t.jinx === 'lag') {
        const lagAt = now - this.ms(1000);
        result.level = round(
          (t.levelHistory || []).filter((x) => x.at <= lagAt).at(-1)?.level ?? t.startCup,
        );
      } else if (t.jinx === 'lights' && (now - t.pourStartAt) / this.scale > 1500)
        result.level = null;
    }
    return result;
  }
}
