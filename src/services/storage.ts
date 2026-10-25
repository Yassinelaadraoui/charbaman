import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'charbaman:save:v1';

export type ScoreEntry = { name: string; score: number; cans: number; at: number };

export type SaveData = {
  name: string;
  unlocked: number; // how many cities are open
  best: Record<string, number>;
  local: Record<string, ScoreEntry[]>; // offline leaderboard per mode
};

const empty: SaveData = { name: '', unlocked: 1, best: {}, local: {} };

export async function loadSave(): Promise<SaveData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
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
