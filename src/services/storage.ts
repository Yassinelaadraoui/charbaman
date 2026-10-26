import AsyncStorage from '@react-native-async-storage/async-storage';

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
};

export const defaultSettings: Settings = { sound: true, music: true, haptics: true, lang: 'auto', graphics: 'high' };
const empty: SaveData = { name: '', unlocked: 1, best: {}, local: {}, settings: defaultSettings };

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...empty };
    const data = JSON.parse(raw) as Partial<SaveData>;
    // Saves from older versions have no settings (or fewer of them).
    return { ...empty, ...data, settings: { ...defaultSettings, ...data.settings } };
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
