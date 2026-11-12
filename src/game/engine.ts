import { CITIES, City } from './cities';

// World units are metres. x is lateral (0 = road centre), z is distance along the track,
// y is height above the road.
export const ROAD_HALF = 3;
export const PLAYER_HALF = 0.35;
// The jump: a quick launch, a short float at the top and a firm fall, about 0.6 s in the air and 1.55 m high,
// clear of 0.9 m crates for 0.42 s. It used to shoot 2.1 m up (higher than the hero is tall) and drop straight
// back with no pause at the top, which read as a twitch rather than a leap. It stays short on purpose: at
// skateboard speed a longer jump lands on the next crate.
const GRAVITY = 40;
const FALL_GRAVITY = 50;
const APEX_V = 2.5; // below this vertical speed the hero is near the top of the arc
const APEX_GRAVITY = 0.55; // and gravity eases off there, for a moment of hang time
export const JUMP_V = 11;
// Run cycle: metres covered per radian of runPhase. 1.15 gives about two strides a second at street speed, so
// the feet keep up with the ground instead of gliding.
const STRIDE = 1.15;
const JUMP_BUFFER = 0.15; // a jump pressed this long before landing still happens
const WAKE = 80; // oncoming cars set off when you are this close
const SLIDE_TIME = 0.7;
const STAND_H = 1.8;
const SLIDE_H = 0.8;
const MAX_HEALTH = 3;
const LIFE_EVERY = 25;
const CHASE_GAP = 12;
const ENDLESS_CITY_LEN = 900;
// Bottles picked up close together build a combo: every COMBO_STEP in a row raises the multiplier on bottle
// points, up to COMBO_MAX. Miss the window or take a hit and it drops back to x1.
const COMBO_WINDOW = 2.5;
const COMBO_STEP = 8;
const COMBO_MAX = 5;
const CAN_POINTS = 50;
// Brushing past traffic without touching it is worth a bonus.
const CLOSE_MARGIN = 0.5;
const CLOSE_POINTS = 100;
const DASH_TIME = 0.75;
const DASH_COOLDOWN = 2.5;
const MAGNET_TIME = 8;
const SHIELD_TIME = 12;
const MAGNET_REACH = 4.5;

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
  | 'magnet'
  | 'shield'
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
  vz: number; // m/s along the street; negative drives toward you
  homeZ?: number; // where a moving car starts, so a respawn puts it back
  wake?: number; // starts moving when the runner is this close
  done: boolean; // collected / triggered / already hit
  passed?: boolean; // already gone by the runner (for near misses)
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
    | 'city'
    | 'combo'
    | 'close'
    | 'dash'
    | 'magnet'
    | 'shield'
    | 'shieldBreak';
  n?: number; // combo multiplier
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
  jumpBuffer: number;
  slideQueued: boolean; // slide pressed in the air: slam down and slide on landing
  combo: number; // bottles in the current chain
  comboTimer: number; // seconds left to grab the next one
  bonus: number; // points from combo multipliers and near misses
  closeCalls: number;
  hits: number; // hits taken this run (for the three-star "no hits" goal)
  cansTotal: number; // bottles laid out in the stage so far (for the bottles star)
  maxCombo: number;
  usedSkate: boolean;
  powerups: number; // magnets and shields picked up
  dash: number; // seconds of dash left (swipe up while sliding)
  dashCool: number;
  magnet: number; // seconds of bottle magnet left
  shield: number; // seconds of shield left; it takes one hit
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
    jumpBuffer: 0,
    slideQueued: false,
    combo: 0,
    comboTimer: 0,
    bonus: 0,
    closeCalls: 0,
    hits: 0,
    cansTotal: 0,
    maxCombo: 1,
    usedSkate: false,
    powerups: 0,
    dash: 0,
    dashCool: 0,
    magnet: 0,
    shield: 0,
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
  if (e.kind === 'can') s.cansTotal += 1;
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

function oncoming(s: GameState, z: number, x: number, speed: number) {
  add(s, { kind: 'taxi', z, homeZ: z, x, w: 0.85, h: 1.4, depth: 3.8, vz: -speed, wake: WAKE });
}

// One obstacle pattern; returns how much track it used.
function pattern(s: GameState, z: number, inChase: boolean): number {
  const c = city(s);
  const r = rand(s);
  const hard = inChase ? 0.25 : 0;
  if (r < 0.14 - hard) {
    const x0 = laneX(s);
    canLine(s, z, x0, rand(s) < 0.5 ? x0 : laneX(s), 6);
    return 15;
  }
  if (r < 0.28) {
    add(s, { kind: 'crate', z, x: 0, w: ROAD_HALF, h: 0.9, depth: 0.9 });
    canArc(s, z, laneX(s));
    return 8;
  }
  if (r < 0.4) {
    add(s, { kind: 'awning', z, x: 0, y: 1.15, w: ROAD_HALF, h: 1.4, depth: 0.7 });
    canLine(s, z - 1.2, 0, 0, 2, 0.35);
    return 6;
  }
  if (r < 0.58) {
    // Oncoming traffic down one side of the street, bottles on the other. The car waits in the haze and sets off
    // when you are WAKE m away, so it meets you inside the stretch kept clear for it (no driving through crates).
    const side = rand(s) < 0.5 ? -1 : 1;
    const x = side * range(s, 1.2, 2.1);
    oncoming(s, z + 34, x, range(s, 6, 9.5) * (0.85 + c.density * 0.4));
    canLine(s, z + 2, -side * 1.6, -side * 1.6, 4);
    return 40;
  }
  if (r < 0.65) {
    // Two cars side by side coming at you, with a gap between them to thread.
    const gap = range(s, -0.9, 0.9);
    const v = range(s, 5, 7.5) * (0.85 + c.density * 0.4);
    oncoming(s, z + 34, Math.max(-2.15, gap - 2.05), v);
    oncoming(s, z + 34 + range(s, 0, 1.5), Math.min(2.15, gap + 2.05), v);
    canLine(s, z + 2, gap, gap, 3);
    return 40;
  }
  if (r < 0.72) {
    // Two-way traffic: cars coming at you on both sides, a gap down the middle with bottles in it.
    const v = range(s, 6, 9) * (0.85 + c.density * 0.4);
    oncoming(s, z + 34, -1.95, v);
    oncoming(s, z + 46, 1.95, v * range(s, 0.9, 1.1));
    canLine(s, z + 2, 0, 0, 5);
    return 52;
  }
  if (r < 0.8) {
    const dir = rand(s) < 0.5 ? -1 : 1;
    add(s, { kind: 'scooter', z: z + 6, x: -dir * 2.6, vx: dir * range(s, 2.5, 4) * (c.density + 0.6), w: 0.5, h: 1.2, depth: 1.4 });
    return 12;
  }
  if (r < 0.88) {
    // A donkey pulling a fruit cart down one side of the street toward you, plodding.
    const side = rand(s) < 0.5 ? -1 : 1;
    add(s, { kind: 'donkey', z: z + 22, homeZ: z + 22, x: side * range(s, 1.3, 2.05), vz: -range(s, 1.8, 2.6), wake: WAKE, w: 0.85, h: 1.7, depth: 3.7 });
    canLine(s, z + 4, -side * 1.5, -side * 1.5, 4);
    return 28;
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
      const r = rand(s);
      const kind: EntityKind = r < 0.32 ? 'skate' : r < 0.52 ? 'magnet' : r < 0.72 ? 'shield' : 'tajine';
      add(s, { kind, z, x: laneX(s), y: 0.3, w: 0.5, h: 0.6, depth: 1.2 });
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
  s.slideQueued = false;
  s.speed = 0;
  s.health = MAX_HEALTH;
  s.invuln = 2;
  s.tajine = 0;
  s.skate = 0;
  for (const e of s.entities) {
    if (e.homeZ !== undefined) e.z = e.homeZ; // cars drive back to where they waited
    if (e.z > s.z - 2) e.passed = false;
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

export const comboMultiplier = (s: GameState) => Math.min(COMBO_MAX, 1 + Math.floor(s.combo / COMBO_STEP));

function hit(s: GameState, e: Entity) {
  e.done = true;
  if (s.invuln > 0) return;
  if (s.shield > 0) {
    // The shield takes the knock and breaks; nothing else is lost.
    s.shield = 0;
    s.invuln = 1;
    s.shake = 0.2;
    s.events.push({ type: 'shieldBreak', x: e.x, z: e.z });
    return;
  }
  s.hits += 1;
  s.combo = 0;
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

export function step(s: GameState, dtRaw: number, inputRaw: Input) {
  let input = inputRaw;
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
  s.comboTimer = Math.max(0, s.comboTimer - dt);
  s.dash = Math.max(0, s.dash - dt);
  s.dashCool = Math.max(0, s.dashCool - dt);
  s.magnet = Math.max(0, s.magnet - dt);
  s.shield = Math.max(0, s.shield - dt);
  if (s.comboTimer === 0) s.combo = 0;

  // Speed: ramps up through a stage, faster in the chase and on a skateboard.
  const endlessBoost = s.mode === 'endless' ? Math.min(10, s.z / 400) : 0;
  let target = c.baseSpeed + progress(s) * 2.5 + endlessBoost;
  if (s.phase === 'chase') target += 3;
  if (s.skate > 0) target += 5;
  if (s.dash > 0) target += 8;
  const accel = s.stun > 0 ? 0 : s.dash > 0 ? 30 : 9;
  s.speed += Math.sign(target - s.speed) * Math.min(Math.abs(target - s.speed), accel * dt);

  // Free lateral steering, like the analog stick in the original. The tajine on
  // your head flips the controls (the trash can gag).
  const steer = s.tajine > 0 ? -input.steer : input.steer;
  s.x = Math.max(-ROAD_HALF + PLAYER_HALF, Math.min(ROAD_HALF - PLAYER_HALF, s.x + steer));

  const grounded = s.y <= 0.0001;
  // A jump pressed a moment before landing is kept and fires on touchdown.
  // Swipe up while sliding: a low dash forward instead of a jump.
  if (input.jump && grounded && s.slide > 0 && s.dashCool === 0) {
    s.dash = DASH_TIME;
    s.dashCool = DASH_COOLDOWN;
    s.slide = DASH_TIME;
    s.events.push({ type: 'dash' });
    input = { ...input, jump: false };
  }
  s.jumpBuffer = input.jump ? JUMP_BUFFER : Math.max(0, s.jumpBuffer - dt);
  if (s.jumpBuffer > 0 && grounded) {
    s.vy = JUMP_V;
    s.slide = 0;
    s.slideQueued = false;
    s.jumpBuffer = 0;
  }
  if (input.slide) {
    if (grounded) s.slide = Math.max(s.slide, SLIDE_TIME);
    else {
      s.vy = Math.min(s.vy, -JUMP_V); // slam down, then slide on landing
      s.slideQueued = true;
    }
  }
  if (!grounded || s.vy > 0) {
    const g = (s.vy > 0 ? GRAVITY : FALL_GRAVITY) * (Math.abs(s.vy) < APEX_V ? APEX_GRAVITY : 1);
    s.vy -= g * dt;
    s.y = Math.max(0, s.y + s.vy * dt);
    if (s.y === 0) {
      s.vy = 0;
      if (s.slideQueued || input.slide) s.slide = SLIDE_TIME;
      s.slideQueued = false;
    }
  }
  s.slide = Math.max(0, s.slide - dt);

  const z0 = s.z;
  s.z += s.speed * dt;
  s.runPhase += dt * (s.speed / STRIDE);

  if (s.magnet > 0) {
    // Bottles and notes ahead drift toward you.
    for (const e of s.entities) {
      if (e.done || (e.kind !== 'can' && e.kind !== 'cash')) continue;
      const d = e.z - s.z;
      if (d < 0 || d > 14 || Math.abs(e.x - s.x) > MAGNET_REACH) continue;
      const k = Math.min(1, dt * 8);
      e.x += (s.x - e.x) * k;
      e.y += (s.y + 0.6 - e.y) * k;
    }
  }
  for (const e of s.entities) {
    if (e.vx) {
      e.x += e.vx * dt;
      if (Math.abs(e.x) > ROAD_HALF - e.w) {
        e.x = Math.sign(e.x) * (ROAD_HALF - e.w);
        e.vx = -e.vx;
      }
    }
    if (e.vz && (e.wake === undefined || e.z - s.z < e.wake)) e.z += e.vz * dt;
    // A car, scooter or cart that has just gone by without touching you, by a whisker: a close call.
    if (!e.done && !e.passed && (e.kind === 'taxi' || e.kind === 'scooter' || e.kind === 'donkey') && e.z + e.depth / 2 < s.z - PLAYER_HALF) {
      e.passed = true;
      const gap = Math.abs(e.x - s.x) - e.w - PLAYER_HALF;
      if (gap < CLOSE_MARGIN && s.invuln === 0) {
        s.bonus += CLOSE_POINTS;
        s.closeCalls += 1;
        s.events.push({ type: 'close', x: e.x, z: e.z });
      }
    }
    if (e.done || !overlaps(s, e, z0, s.z)) continue;
    const top = e.y + e.h;
    const vertical = s.y < top && s.y + standHeight(s) > e.y;
    switch (e.kind) {
      case 'can':
        if (vertical || Math.abs(s.y - e.y) < 1.2) {
          e.done = true;
          s.cans += 1;
          s.lifeCans += 1;
          const before = comboMultiplier(s);
          s.combo += 1;
          s.comboTimer = COMBO_WINDOW;
          const mult = comboMultiplier(s);
          s.maxCombo = Math.max(s.maxCombo, mult);
          s.bonus += CAN_POINTS * (mult - 1);
          s.events.push({ type: 'can', x: e.x, z: e.z });
          if (mult > before) s.events.push({ type: 'combo', n: mult });
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
          s.usedSkate = true;
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
      case 'magnet':
      case 'shield':
        if (s.y < 1) {
          e.done = true;
          if (e.kind === 'magnet') s.magnet = MAGNET_TIME;
          else s.shield = SHIELD_TIME;
          s.powerups += 1;
          s.events.push({ type: e.kind });
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
    s.entities = s.entities.filter((e) => (e.homeZ ?? e.z) > keepFrom);
  }
  generate(s, s.z + 160);
}

export function scoreOf(s: GameState, cleared: boolean) {
  const base = Math.floor(s.z) + s.cans * CAN_POINTS + s.cash * 500 + s.bonus;
  return cleared ? base + s.lives * 1000 + s.health * 250 : base;
}

export function playerHeight(s: GameState) {
  return standHeight(s);
}

// Stars for a cleared stage: one for clearing it, one for grabbing at least 70% of its bottles, one for
// taking no hits.
export const BOTTLE_STAR_SHARE = 0.7;
export function starsOf(s: GameState) {
  if (s.phase !== 'clear') return 0;
  return 1 + (s.cansTotal > 0 && s.cans >= s.cansTotal * BOTTLE_STAR_SHARE ? 1 : 0) + (s.hits === 0 ? 1 : 0);
}
