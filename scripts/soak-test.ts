// Headless soak test of the game engine: a simple bot plays every stage and an endless run and the test
// checks that nothing throws, nothing turns into NaN, stages can be cleared and entities don't pile up.
// Run: npx tsx scripts/soak-test.ts
import { CITIES } from '../src/game/cities';
import { GameState, Input, createGame, start, step } from '../src/game/engine';

const DT = 1 / 60;

// Look a little ahead: steer away from what is in the way, jump low things, slide under awnings.
function bot(s: GameState): Input {
  const input: Input = { steer: 0, jump: false, slide: false };
  const ahead = s.entities.filter((e) => !e.done && e.z > s.z && e.z < s.z + 9);
  for (const e of ahead) {
    if (e.kind === 'can' || e.kind === 'cash' || e.kind === 'skate') continue;
    if (Math.abs(e.x - s.x) > e.w + 0.6) continue;
    if (e.kind === 'awning') input.slide = e.z - s.z < 2 + s.speed * 0.15;
    else if (e.kind === 'crate') input.jump = e.z - s.z < 1 + s.speed * 0.25; // the jump clears 0.9 m for ~0.5 s
    else if (e.kind === 'checkpoint' || e.kind === 'finish') continue;
    else input.steer = (s.x > e.x ? 1 : -1) * 0.12;
  }
  return input;
}

function play(mode: 'stage' | 'endless', cityIndex: number, seconds: number) {
  const s = createGame(mode, cityIndex);
  start(s);
  let maxEntities = 0;
  for (let i = 0; i < seconds / DT; i++) {
    step(s, DT, bot(s));
    s.events.length = 0;
    maxEntities = Math.max(maxEntities, s.entities.length);
    for (const v of [s.x, s.y, s.z, s.speed, s.score]) if (!Number.isFinite(v)) throw new Error(`NaN at t=${s.time.toFixed(1)}`);
    if (Math.abs(s.x) > 3.5) throw new Error(`left the street: x=${s.x}`);
    if (s.phase === 'clear' || s.phase === 'over') break;
  }
  return { phase: s.phase, z: Math.round(s.z), time: Math.round(s.time), score: s.score, lives: s.lives, maxEntities };
}

let failed = false;
CITIES.forEach((c, i) => {
  const r = play('stage', i, 600);
  const ok = r.phase === 'clear' || r.phase === 'over';
  if (!ok) failed = true;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(11)} ${JSON.stringify(r)}`);
});
const e = play('endless', 0, 300);
if (e.maxEntities > 400) failed = true;
console.log(`${e.maxEntities > 400 ? 'FAIL' : 'ok  '} Endless     ${JSON.stringify(e)}`);
process.exit(failed ? 1 : 0);
