import { CITIES, City } from './cities';

// World units are metres. x is lateral (0 = road centre), z is distance along the track,
// y is height above the road.
export const ROAD_HALF = 3;
export const PLAYER_HALF = 0.35;
const GRAVITY = 32;
const JUMP_V = 11.5;
const SLIDE_TIME = 0.7;
const STAND_H = 1.8;
const SLIDE_H = 0.8;
const MAX_HEALTH = 3;
const LIFE_EVERY = 25;
const CHASE_GAP = 12;
const ENDLESS_CITY_LEN = 900;

export type EntityKind =
  | 'can'
  | 'cash'
  | 'crate'
  | 'awning'
  | 'taxi'
  | 'scooter'
  | 'donkey'
  | 'checkpoint'
  | 'tajine'
  | 'skate'
  | 'finish';

export type Entity = {
  id: number;
  kind: EntityKind;
  z: number;
  x: number;
  y: number; // base height (cans float, awnings hang)
  w: number; // half-width
  h: number; // height
  depth: number;
  vx: number;
  vz: number;
  done: boolean; // collected / triggered / already hit
};

export type GameMode = 'stage' | 'endless';
export type Phase = 'ready' | 'run' | 'chase' | 'clear' | 'over';

export type GameEvent = {
  type:
    | 'can'
    | 'cash'
    | 'hit'
    | 'life'
    | 'lifeLost'
    | 'checkpoint'
    | 'skate'
    | 'tajine'
    | 'chase'
    | 'clear'
    | 'over'
    | 'city';
  x?: number;
  z?: number;
};

export type GameState = {
  mode: GameMode;
  cityIndex: number;
  z: number;
  x: number;
  y: number;
  vy: number;
  slide: number;
  speed: number;
  health: number;
  lives: number;
  cans: number;
  cash: number; // 200 dirham notes picked up
  lifeCans: number;
  score: number;
  time: number;
  phase: Phase;
  invuln: number;
  tajine: number;
  skate: number;
  checkpointZ: number;
  entities: Entity[];
  genZ: number;
  nextCheckpoint: number;
  nextPowerup: number;
  seed: number;
  runPhase: number;
  shake: number;
  chaseGap: number;
  stun: number;
  events: GameEvent[];
  nextId: number;
};

export type Input = {
  steer: number; // metres of lateral movement requested this frame
  jump: boolean;
  slide: boolean;
};

export const city = (s: GameState): City =>
  s.mode === 'endless'
    ? CITIES[Math.floor(s.z / ENDLESS_CITY_LEN) % CITIES.length]
    : CITIES[s.cityIndex];

export const chaseStart = (s: GameState) => CITIES[s.cityIndex].length;
export const stageEnd = (s: GameState) => CITIES[s.cityIndex].length + CITIES[s.cityIndex].chaseLength;

export function progress(s: GameState) {
  if (s.mode === 'endless') return 0;
  return Math.min(1, s.z / stageEnd(s));
}

// Deterministic random so a stage is the same every run: the original was built
// around memorising layouts.
function rand(s: GameState) {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const range = (s: GameState, a: number, b: number) => a + rand(s) * (b - a);

export function createGame(mode: GameMode, cityIndex = 0): GameState {
  const c = CITIES[cityIndex];
  const s: GameState = {
    mode,
    cityIndex,
    z: 0,
    x: 0,
    y: 0,
    vy: 0,
    slide: 0,
    speed: 0,
    health: MAX_HEALTH,
    lives: 3,
    cans: 0,
    cash: 0,
    lifeCans: 0,
    score: 0,
    time: 0,
    phase: 'ready',
    invuln: 0,
    tajine: 0,
    skate: 0,
    checkpointZ: 0,
    entities: [],
    genZ: 35,
    nextCheckpoint: 300,
    nextPowerup: 220,
    seed: mode === 'endless' ? (Date.now() & 0xffff) : c.seed * 7919,
    runPhase: 0,
    shake: 0,
    chaseGap: CHASE_GAP,
    stun: 0,
    events: [],
    nextId: 1,
  };
  generate(s, 160);
  return s;
}

function add(s: GameState, e: Partial<Entity> & { kind: EntityKind; z: number }) {
  const base: Entity = {
    id: s.nextId++,
    x: 0,
    y: 0,
    w: 0.4,
    h: 0.6,
    depth: 0.8,
    vx: 0,
    vz: 0,
    done: false,
    ...e,
  };
  s.entities.push(base);
  return base;
}

function canLine(s: GameState, z: number, x0: number, x1: number, n: number, y = 0.5) {
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    // Now and then the last one is a 200 dirham note instead.
    const kind = i === n - 1 && n > 2 && rand(s) < 0.12 ? 'cash' : 'can';
    add(s, { kind, z: z + i * 2.4, x: x0 + (x1 - x0) * t, y, w: 0.45, h: 0.7, depth: 1.2 });
  }
}

function canArc(s: GameState, z: number, x: number) {
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    add(s, { kind: 'can', z: z - 4.8 + i * 2.4, x, y: 0.5 + Math.sin(t * Math.PI) * 1.6, w: 0.45, h: 0.7, depth: 1.2 });
  }
}

const laneX = (s: GameState) => range(s, -2.3, 2.3);

// One obstacle pattern; returns how much track it used.
function pattern(s: GameState, z: number, inChase: boolean): number {
  const c = city(s);
  const r = rand(s);
  const hard = inChase ? 0.25 : 0;
  if (r < 0.16 - hard) {
    const x0 = laneX(s);
    canLine(s, z, x0, rand(s) < 0.5 ? x0 : laneX(s), 6);
    return 15;
  }
  if (r < 0.32) {
    add(s, { kind: 'crate', z, x: 0, w: ROAD_HALF, h: 0.9, depth: 0.9 });
    canArc(s, z, laneX(s));
    return 8;
  }
  if (r < 0.46) {
    add(s, { kind: 'awning', z, x: 0, y: 1.15, w: ROAD_HALF, h: 1.4, depth: 0.7 });
    canLine(s, z - 1.2, 0, 0, 2, 0.35);
    return 6;
  }
  if (r < 0.6) {
    const x = laneX(s);
    const moving = rand(s) < 0.5;
    add(s, { kind: 'taxi', z, x, w: 0.85, h: 1.4, depth: 3.8, vz: moving ? range(s, 4, 8) : 0 });
    const side = x > 0 ? -1.8 : 1.8;
    canLine(s, z - 3, x + side, x + side, 3);
    return 10;
  }
  if (r < 0.7) {
    const gap = range(s, -1.2, 1.2);
    add(s, { kind: 'taxi', z, x: gap - 2.05, w: 0.85, h: 1.4, depth: 3.8 });
    add(s, { kind: 'taxi', z: z + range(s, 0, 1.5), x: gap + 2.05, w: 0.85, h: 1.4, depth: 3.8 });
    canLine(s, z - 2, gap, gap, 3);
    return 10;
  }
  if (r < 0.8) {
    const dir = rand(s) < 0.5 ? -1 : 1;
    add(s, { kind: 'scooter', z: z + 6, x: -dir * 2.6, vx: dir * range(s, 2.5, 4) * (c.density + 0.6), w: 0.5, h: 1.2, depth: 1.4 });
    return 12;
  }
  if (r < 0.88) {
    const dir = rand(s) < 0.5 ? -1 : 1;
    add(s, { kind: 'donkey', z, x: -dir * 1.5, vx: dir * 1.1, w: 1.0, h: 1.3, depth: 2 });
    return 10;
  }
  // Combo: jump then slide.
  add(s, { kind: 'crate', z, x: 0, w: ROAD_HALF, h: 0.9, depth: 0.9 });
  add(s, { kind: 'awning', z: z + 11, x: 0, y: 1.15, w: ROAD_HALF, h: 1.4, depth: 0.7 });
  canLine(s, z + 4, 0, 0, 2, 0.5);
  return 16;
}

function generate(s: GameState, upTo: number) {
  const end = s.mode === 'stage' ? stageEnd(s) : Infinity;
  while (s.genZ < upTo && s.genZ < end - 25) {
    const z = s.genZ;
    const c = city(s);
    const inChase = s.mode === 'stage' && z > chaseStart(s);
    if (!inChase && z >= s.nextCheckpoint && (s.mode === 'endless' || z < chaseStart(s) - 40)) {
      add(s, { kind: 'checkpoint', z, w: ROAD_HALF, h: 3, depth: 1 });
      s.nextCheckpoint += 300;
      s.genZ += 12;
      continue;
    }
    if (z >= s.nextPowerup) {
      const good = rand(s) < 0.55;
      add(s, { kind: good ? 'skate' : 'tajine', z, x: laneX(s), y: 0.3, w: 0.5, h: 0.6, depth: 1.2 });
      s.nextPowerup += range(s, 200, 320);
      s.genZ += 10;
      continue;
    }
    const used = pattern(s, z, inChase);
    const density = s.mode === 'endless' ? Math.min(0.9, 0.4 + z / 6000) : c.density;
    const spacing = (inChase ? 9 : 24) - density * 10 + range(s, 0, 7);
    s.genZ += used + spacing;
  }
  if (s.mode === 'stage' && !s.entities.some((e) => e.kind === 'finish')) {
    if (upTo >= end - 30) add(s, { kind: 'finish', z: end, w: ROAD_HALF, h: 3.2, depth: 1 });
  }
}

const standHeight = (s: GameState) => (s.slide > 0 ? SLIDE_H : STAND_H);

function overlaps(s: GameState, e: Entity, z0: number, z1: number) {
  const front = e.z - e.depth / 2;
  const back = e.z + e.depth / 2;
  if (back < z0 - 0.3 || front > z1 + 0.3) return false;
  return Math.abs(e.x - s.x) < e.w + PLAYER_HALF;
}

function respawn(s: GameState) {
  const inChase = s.phase === 'chase';
  s.z = inChase ? chaseStart(s) : s.checkpointZ;
  if (inChase) s.chaseGap = CHASE_GAP;
  s.x = 0;
  s.y = 0;
  s.vy = 0;
  s.slide = 0;
  s.speed = 0;
  s.health = MAX_HEALTH;
  s.invuln = 2;
  s.tajine = 0;
  s.skate = 0;
  for (const e of s.entities) {
    if (e.z > s.z - 2 && e.kind !== 'can' && e.kind !== 'cash') e.done = false;
  }
}

function loseLife(s: GameState) {
  s.lives -= 1;
  s.shake = 0.6;
  if (s.lives <= 0) {
    s.phase = 'over';
    s.events.push({ type: 'over' });
    return;
  }
  s.events.push({ type: 'lifeLost' });
  respawn(s);
}

function hit(s: GameState, e: Entity) {
  e.done = true;
  if (s.invuln > 0) return;
  s.events.push({ type: 'hit', x: e.x, z: e.z });
  s.shake = 0.35;
  s.speed *= 0.35;
  s.stun = 0.35;
  s.invuln = 1.4;
  s.skate = 0;
  if (s.phase === 'chase') {
    s.chaseGap -= 5;
    if (s.chaseGap <= 0) loseLife(s);
    return;
  }
  s.health -= 1;
  if (s.health <= 0) loseLife(s);
}

export function start(s: GameState) {
  if (s.phase === 'ready') s.phase = 'run';
}

export function step(s: GameState, dtRaw: number, input: Input) {
  const dt = Math.min(dtRaw, 1 / 30);
  if (s.phase === 'ready' || s.phase === 'over' || s.phase === 'clear') {
    s.runPhase += dt * 2;
    return;
  }
  const c = city(s);
  s.time += dt;
  s.invuln = Math.max(0, s.invuln - dt);
  s.tajine = Math.max(0, s.tajine - dt);
  s.skate = Math.max(0, s.skate - dt);
  s.shake = Math.max(0, s.shake - dt);
  s.stun = Math.max(0, s.stun - dt);

  // Speed: ramps up through a stage, faster in the chase and on a skateboard.
  const endlessBoost = s.mode === 'endless' ? Math.min(10, s.z / 400) : 0;
  let target = c.baseSpeed + progress(s) * 2.5 + endlessBoost;
  if (s.phase === 'chase') target += 3;
  if (s.skate > 0) target += 5;
  const accel = s.stun > 0 ? 0 : 9;
  s.speed += Math.sign(target - s.speed) * Math.min(Math.abs(target - s.speed), accel * dt);

  // Free lateral steering, like the analog stick in the original. The tajine on
  // your head flips the controls (the trash can gag).
  const steer = s.tajine > 0 ? -input.steer : input.steer;
  s.x = Math.max(-ROAD_HALF + PLAYER_HALF, Math.min(ROAD_HALF - PLAYER_HALF, s.x + steer));

  const grounded = s.y <= 0.0001;
  if (input.jump && grounded) {
    s.vy = JUMP_V;
    s.slide = 0;
  }
  if (input.slide) {
    if (grounded) s.slide = SLIDE_TIME;
    else s.vy = Math.min(s.vy, -JUMP_V); // slam down, then slide on landing
  }
  if (!grounded || s.vy > 0) {
    s.vy -= GRAVITY * dt;
    s.y = Math.max(0, s.y + s.vy * dt);
    if (s.y === 0) {
      s.vy = 0;
      if (input.slide) s.slide = SLIDE_TIME;
    }
  }
  s.slide = Math.max(0, s.slide - dt);

  const z0 = s.z;
  s.z += s.speed * dt;
  s.runPhase += dt * (s.speed / 1.6);

  for (const e of s.entities) {
    if (e.vx) {
      e.x += e.vx * dt;
      if (Math.abs(e.x) > ROAD_HALF - e.w) {
        e.x = Math.sign(e.x) * (ROAD_HALF - e.w);
        e.vx = -e.vx;
      }
    }
    if (e.vz) e.z += e.vz * dt;
    if (e.done || !overlaps(s, e, z0, s.z)) continue;
    const top = e.y + e.h;
    const vertical = s.y < top && s.y + standHeight(s) > e.y;
    switch (e.kind) {
      case 'can':
        if (vertical || Math.abs(s.y - e.y) < 1.2) {
          e.done = true;
          s.cans += 1;
          s.lifeCans += 1;
          s.events.push({ type: 'can', x: e.x, z: e.z });
          if (s.lifeCans >= LIFE_EVERY) {
            s.lifeCans = 0;
            s.lives = Math.min(9, s.lives + 1);
            s.events.push({ type: 'life' });
          }
        }
        break;
      case 'cash':
        if (vertical || Math.abs(s.y - e.y) < 1.2) {
          e.done = true;
          s.cash += 1;
          s.events.push({ type: 'cash', x: e.x, z: e.z });
        }
        break;
      case 'checkpoint':
        e.done = true;
        s.checkpointZ = e.z;
        s.events.push({ type: 'checkpoint' });
        break;
      case 'skate':
        if (s.y < 1) {
          e.done = true;
          s.skate = 6;
          s.tajine = 0;
          s.events.push({ type: 'skate' });
        }
        break;
      case 'tajine':
        if (s.y < 1) {
          e.done = true;
          s.tajine = 5;
          s.skate = 0;
          s.events.push({ type: 'tajine' });
        }
        break;
      case 'finish':
        break;
      default:
        if (vertical) hit(s, e);
    }
    if ((s.phase as Phase) === 'over' || s.z < z0) return; // lost a life and respawned
  }

  if (s.mode === 'stage') {
    if (s.phase === 'run' && s.z >= chaseStart(s)) {
      s.phase = 'chase';
      s.chaseGap = CHASE_GAP;
      s.events.push({ type: 'chase' });
    }
    if (s.phase === 'chase') {
      s.chaseGap = Math.min(CHASE_GAP, s.chaseGap + dt * 0.8);
    }
    if (s.z >= stageEnd(s)) {
      s.phase = 'clear';
      s.score = scoreOf(s, true);
      s.events.push({ type: 'clear' });
      return;
    }
  } else {
    const before = Math.floor(z0 / ENDLESS_CITY_LEN);
    if (Math.floor(s.z / ENDLESS_CITY_LEN) !== before) s.events.push({ type: 'city' });
  }

  s.score = scoreOf(s, false);
  // Drop what is behind, generate what is ahead.
  // Keep everything since the respawn point so a restart replays the same layout.
  const keepFrom = Math.min(s.z, s.phase === 'chase' ? chaseStart(s) : s.checkpointZ) - 20;
  if (s.entities.length > 0 && s.entities[0].z < keepFrom) {
    s.entities = s.entities.filter((e) => e.z > keepFrom);
  }
  generate(s, s.z + 160);
}

export function scoreOf(s: GameState, cleared: boolean) {
  const base = Math.floor(s.z) + s.cans * 50 + s.cash * 500;
  return cleared ? base + s.lives * 1000 + s.health * 250 : base;
}

export function playerHeight(s: GameState) {
  return standHeight(s);
}
