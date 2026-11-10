// Checks the after-run bookkeeping: stars, wallet, daily challenges, achievements and the suit shop.
// Run: npx tsx scripts/progression-test.ts
import { ACHIEVEMENTS, SUITS, dailyChallenges, today } from '../src/game/progression';
import { applyRun, buySuit, loadSave } from '../src/services/storage';
import type { RunStats } from '../src/game/progression';

// A few asserts of our own (the scripts are type-checked with the app, which has no Node types).
const fail = (msg: string) => {
  throw new Error(msg);
};
const assert = {
  ok: (v: unknown, msg = 'expected true') => void (v || fail(msg)),
  equal: (a: unknown, b: unknown, msg?: string) => void (a === b || fail(msg ?? `${String(a)} !== ${String(b)}`)),
  deepEqual: (a: unknown, b: unknown) => void (JSON.stringify(a) === JSON.stringify(b) || fail('not deep-equal')),
  match: (s: string, re: RegExp) => void (re.test(s) || fail(`${s} !~ ${re}`)),
};

const run = (o: Partial<RunStats>): RunStats => ({
  mode: 'stage',
  cityIndex: 0,
  cleared: true,
  score: 5000,
  cans: 80,
  distance: 1500,
  stars: 2,
  hits: 1,
  closeCalls: 4,
  maxCombo: 3,
  usedSkate: false,
  powerups: 1,
  ...o,
});

(async () => {
  // Daily challenges: three different ones, the same all day, a different set on another day.
  const a = dailyChallenges('2026-11-10');
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map((c) => c.kind)).size, 3);
  assert.deepEqual(a, dailyChallenges('2026-11-10'));
  const days = new Set(Array.from({ length: 14 }, (_, i) => dailyChallenges(`2026-12-${String(i + 1).padStart(2, '0')}`).map((c) => c.kind).join()));
  assert.ok(days.size > 5, 'daily sets vary from day to day');

  const fresh = await loadSave(); // no storage in node: the empty save
  assert.equal(fresh.wallet, 0);
  assert.deepEqual(fresh.suits, ['classic']);

  // A cleared city: stars kept at their best, bottles banked, first-clear achievement.
  const now = new Date(2026, 10, 10);
  let { save, reward } = applyRun(fresh, run({ stars: 2 }), now);
  assert.equal(save.stars.casablanca, 2);
  assert.ok(save.wallet >= 80);
  assert.equal(reward.earned, save.wallet);
  assert.ok(save.achievements.includes('first_clear'));
  assert.ok(!save.achievements.includes('three_stars'));
  ({ save } = applyRun(save, run({ stars: 1 }), now));
  assert.equal(save.stars.casablanca, 2, 'a worse run never lowers the stars');
  ({ save, reward } = applyRun(save, run({ stars: 3, hits: 0, maxCombo: 5 }), now));
  assert.equal(save.stars.casablanca, 3);
  assert.ok(reward.achievements.includes('three_stars') && reward.achievements.includes('combo_max'));
  // Each daily challenge pays once a day.
  const again = applyRun(save, run({ stars: 3, hits: 0, maxCombo: 5, cans: 200, closeCalls: 10, distance: 2000, powerups: 3 }), now);
  const paid = again.reward.daily.map((c) => c.id);
  assert.ok(paid.every((id) => !save.daily.done.includes(id)));
  // A lost run gives no stars.
  ({ save, reward } = applyRun(save, run({ cityIndex: 1, cleared: false, stars: 0 }), now));
  assert.equal(save.stars.rabat, undefined);
  assert.equal(reward.stars, 0);

  // The shop: too dear is refused, affordable is bought and worn, owned is just worn.
  const royal = SUITS.find((s) => s.id === 'royal')!;
  assert.equal(buySuit({ ...save, wallet: 10 }, royal), null);
  const bought = buySuit({ ...save, wallet: royal.price + 5 }, royal)!;
  assert.equal(bought.wallet, 5);
  assert.equal(bought.suit, 'royal');
  assert.ok(bought.achievements.includes('first_suit'));
  const worn = buySuit({ ...bought, wallet: 0 }, SUITS[0])!;
  assert.equal(worn.suit, 'classic');
  assert.equal(worn.wallet, 0);

  assert.equal(new Set(ACHIEVEMENTS.map((x) => x.id)).size, ACHIEVEMENTS.length);
  assert.match(today(now), /^2026-11-10$/);
  console.log('progression ok');
})(); // a failed assert rejects the promise, and Node exits non-zero on an unhandled rejection
