// Everything a run feeds into after it ends: stars per city, the bottle wallet and suits, daily challenges
// and achievements. Pure functions over plain data, so they run the same in the app and in tests.

import { CITIES } from './cities';

// ---------- Suits ----------

export type Suit = {
  id: string;
  price: number; // bottles
  main: [number, number, number]; // replaces the orange of the suit
  trim?: [number, number, number]; // replaces the white trim, if set
  swatch: [string, string]; // for the shop card
};

export const SUITS: Suit[] = [
  { id: 'classic', price: 0, main: [255, 122, 0], swatch: ['#FF7A00', '#FFF4E6'] },
  { id: 'mint', price: 250, main: [46, 196, 182], swatch: ['#2EC4B6', '#FFF4E6'] },
  { id: 'majorelle', price: 500, main: [45, 85, 230], trim: [255, 210, 63], swatch: ['#2D55E6', '#FFD23F'] },
  { id: 'sahara', price: 800, main: [214, 160, 92], trim: [120, 66, 30], swatch: ['#D6A05C', '#78421E'] },
  { id: 'zellige', price: 1200, main: [29, 122, 70], trim: [255, 255, 255], swatch: ['#1D7A46', '#FFFFFF'] },
  { id: 'royal', price: 1600, main: [170, 20, 40], trim: [255, 210, 63], swatch: ['#AA1428', '#FFD23F'] },
  { id: 'midnight', price: 2000, main: [30, 32, 48], trim: [255, 122, 0], swatch: ['#1E2030', '#FF7A00'] },
];

export const suitOf = (id: string | undefined) => SUITS.find((s) => s.id === id) ?? SUITS[0];

// ---------- What a run reports ----------

export type RunStats = {
  mode: 'stage' | 'endless';
  cityIndex: number;
  cleared: boolean;
  score: number;
  cans: number;
  distance: number;
  stars: number; // 0 unless a stage was cleared
  hits: number;
  closeCalls: number;
  maxCombo: number;
  usedSkate: boolean;
  powerups: number; // magnets and shields picked up
};

// ---------- Daily challenges ----------

export type ChallengeKind = 'bottles' | 'close' | 'combo' | 'clear' | 'distance' | 'nohit' | 'powerups';
export type Challenge = { id: string; kind: ChallengeKind; goal: number; reward: number };

const POOL: { kind: ChallengeKind; goals: number[]; reward: number }[] = [
  { kind: 'bottles', goals: [60, 90, 120], reward: 120 },
  { kind: 'close', goals: [3, 5, 8], reward: 100 },
  { kind: 'combo', goals: [3, 4, 5], reward: 120 },
  { kind: 'clear', goals: [1], reward: 150 },
  { kind: 'distance', goals: [800, 1200, 1600], reward: 100 },
  { kind: 'nohit', goals: [1], reward: 200 },
  { kind: 'powerups', goals: [2, 3], reward: 100 },
];

// The local date as YYYY-MM-DD, which is what makes the day's set change at midnight.
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Three different challenges for a date, the same for everyone that day.
export function dailyChallenges(date: string): Challenge[] {
  let h = 0;
  for (const ch of date) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = seeded(h);
  const kinds = [...POOL];
  const out: Challenge[] = [];
  while (out.length < 3) {
    const p = kinds.splice(Math.floor(r() * kinds.length), 1)[0];
    const goal = p.goals[Math.floor(r() * p.goals.length)];
    out.push({ id: `${date}:${p.kind}`, kind: p.kind, goal, reward: p.reward });
  }
  return out;
}

export function challengeMet(c: Challenge, r: RunStats) {
  switch (c.kind) {
    case 'bottles':
      return r.cans >= c.goal;
    case 'close':
      return r.closeCalls >= c.goal;
    case 'combo':
      return r.maxCombo >= c.goal;
    case 'clear':
      return r.mode === 'stage' && r.cleared;
    case 'distance':
      return r.distance >= c.goal;
    case 'nohit':
      return r.mode === 'stage' && r.cleared && r.hits === 0;
    case 'powerups':
      return r.powerups >= c.goal;
  }
}

// ---------- Achievements ----------

// Lifetime totals the achievements look at.
export type Totals = { bottles: number; closeCalls: number; runs: number; dailies: number };

export type Progress = {
  stars: Record<string, number>;
  suits: string[];
  totals: Totals;
  unlocked: number;
};

export type Achievement = { id: string; done: (p: Progress, r?: RunStats) => boolean };

const starCount = (p: Progress) => Object.values(p.stars).reduce((a, b) => a + b, 0);

// The ids double as the Game Center / Google Play achievement ids (see RELEASE.md).
export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_clear', done: (p) => Object.keys(p.stars).length >= 1 },
  { id: 'three_stars', done: (p) => Object.values(p.stars).some((n) => n >= 3) },
  { id: 'all_cities', done: (p) => CITIES.every((c) => (p.stars[c.id] ?? 0) >= 1) },
  { id: 'all_stars', done: (p) => starCount(p) >= CITIES.length * 3 },
  { id: 'combo_max', done: (_p, r) => !!r && r.maxCombo >= 5 },
  { id: 'close_calls', done: (p) => p.totals.closeCalls >= 50 },
  { id: 'bottles_1000', done: (p) => p.totals.bottles >= 1000 },
  { id: 'bottles_10000', done: (p) => p.totals.bottles >= 10000 },
  { id: 'endless_2000', done: (_p, r) => !!r && r.mode === 'endless' && r.distance >= 2000 },
  { id: 'first_suit', done: (p) => p.suits.length >= 2 },
  { id: 'all_suits', done: (p) => SUITS.every((s) => s.price === 0 || p.suits.includes(s.id)) },
  { id: 'dailies_10', done: (p) => p.totals.dailies >= 10 },
];

export const newAchievements = (have: string[], p: Progress, r?: RunStats) => ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.done(p, r)).map((a) => a.id);
