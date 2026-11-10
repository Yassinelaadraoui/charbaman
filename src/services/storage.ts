import AsyncStorage from '@react-native-async-storage/async-storage';
import { CITIES } from '../game/cities';
import { Challenge, RunStats, Suit, challengeMet, dailyChallenges, newAchievements, today } from '../game/progression';

const KEY = 'charbaman:save:v1';

export type ScoreEntry = { name: string; score: number; cans: number; at: number };

export type Settings = {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  lang: 'auto' | 'en' | 'fr' | 'ar';
  graphics: 'high' | 'low';
};

export type SaveData = {
  name: string;
  unlocked: number; // how many cities are open
  best: Record<string, number>;
  local: Record<string, ScoreEntry[]>; // offline leaderboard per mode
  settings: Settings;
  reviewAsked?: boolean; // the store rating prompt is offered once
  coached?: boolean; // the first-run control hints have been shown
  stars: Record<string, number>; // best stars per city id
  wallet: number; // bottles to spend on suits
  suits: string[]; // suits owned
  suit: string; // suit worn
  daily: { date: string; done: string[] }; // today's finished challenge ids
  achievements: string[];
  totals: { bottles: number; closeCalls: number; runs: number; dailies: number };
};

export const defaultSettings: Settings = { sound: true, music: true, haptics: true, lang: 'auto', graphics: 'high' };
const empty: SaveData = {
  name: '',
  unlocked: 1,
  best: {},
  local: {},
  settings: defaultSettings,
  stars: {},
  wallet: 0,
  suits: ['classic'],
  suit: 'classic',
  daily: { date: '', done: [] },
  achievements: [],
  totals: { bottles: 0, closeCalls: 0, runs: 0, dailies: 0 },
};

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const data = JSON.parse(raw) as Partial<SaveData>;
    // Saves from older versions have no settings (or fewer of them).
    return { ...empty, ...data, settings: { ...defaultSettings, ...data.settings }, totals: { ...empty.totals, ...data.totals } };
  } catch {
    return { ...empty };
  }
}

export async function writeSave(data: SaveData) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Saving is best effort; the game keeps working without it.
  }
}

export function recordLocal(data: SaveData, mode: string, entry: ScoreEntry): SaveData {
  const list = [...(data.local[mode] ?? []), entry].sort((a, b) => b.score - a.score).slice(0, 20);
  return {
    ...data,
    best: { ...data.best, [mode]: Math.max(data.best[mode] ?? 0, entry.score) },
    local: { ...data.local, [mode]: list },
  };
}

// Locks the cities and clears scores, but keeps the player's name and settings.
export const resetProgress = (data: SaveData): SaveData => ({ ...empty, name: data.name, settings: data.settings });

export type RunReward = { earned: number; daily: Challenge[]; achievements: string[]; stars: number; starsBefore: number };

// What a finished run adds up to: best stars for the city, bottles into the wallet, today's challenges met,
// lifetime totals, and any achievements that newly hold.
export function applyRun(data: SaveData, r: RunStats, now = new Date()): { save: SaveData; reward: RunReward } {
  const city = r.mode === 'stage' ? CITIES[r.cityIndex].id : '';
  const starsBefore = city ? data.stars[city] ?? 0 : 0;
  const stars = city && r.cleared ? { ...data.stars, [city]: Math.max(starsBefore, r.stars) } : data.stars;
  const date = today(now);
  const doneToday = data.daily.date === date ? data.daily.done : [];
  const daily = dailyChallenges(date).filter((c) => !doneToday.includes(c.id) && challengeMet(c, r));
  const earned = r.cans + daily.reduce((n, c) => n + c.reward, 0);
  const totals = {
    bottles: data.totals.bottles + r.cans,
    closeCalls: data.totals.closeCalls + r.closeCalls,
    runs: data.totals.runs + 1,
    dailies: data.totals.dailies + daily.length,
  };
  let save: SaveData = {
    ...data,
    stars,
    wallet: data.wallet + earned,
    daily: { date, done: [...doneToday, ...daily.map((c) => c.id)] },
    totals,
  };
  const fresh = newAchievements(save.achievements, { stars, suits: save.suits, totals, unlocked: save.unlocked }, r);
  save = { ...save, achievements: [...save.achievements, ...fresh] };
  return { save, reward: { earned, daily, achievements: fresh, stars: r.cleared ? r.stars : 0, starsBefore } };
}

// Buying a suit: returns the new save, or null if it costs more than the wallet holds.
export function buySuit(data: SaveData, suit: Suit): SaveData | null {
  if (data.suits.includes(suit.id)) return { ...data, suit: suit.id };
  if (data.wallet < suit.price) return null;
  const save = { ...data, wallet: data.wallet - suit.price, suits: [...data.suits, suit.id], suit: suit.id };
  const fresh = newAchievements(save.achievements, { stars: save.stars, suits: save.suits, totals: save.totals, unlocked: save.unlocked });
  return { ...save, achievements: [...save.achievements, ...fresh] };
}
