// Achievements are earned and kept on the phone (src/game/progression.ts, shown on the Achievements screen).
// This is the one place that would also report them to Game Center (iOS) and Google Play Games (Android).
//
// Both need things only the developer's own accounts can make: the achievements created in App Store Connect
// and the Play Console with the ids from ACHIEVEMENTS, and a native module in a development build (they do
// not run in Expo Go). RELEASE.md, "Game Center and Google Play Games", has the steps. Until a module is
// plugged in below, reporting does nothing and the game works the same.

type Platform = { unlock: (id: string) => Promise<void>; submitScore?: (board: string, score: number) => Promise<void> };

let platform: Platform | null = null;

// Called once at start-up by the native integration, when there is one.
export function connectPlatformAchievements(p: Platform) {
  platform = p;
}

export function reportAchievements(ids: string[]) {
  if (!platform) return;
  for (const id of ids) platform.unlock(id).catch(() => {});
}

export function reportScore(board: string, score: number) {
  platform?.submitScore?.(board, score).catch(() => {});
}
