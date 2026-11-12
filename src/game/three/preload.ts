import type { City } from '../cities';
import type { Suit } from '../progression';
import { heroJobs, suitMap } from './hero';
import { WarmJob, warmJobs } from './props';

// Getting a run on screen means decoding the hero and every baked model the city shows (JPEG atlases decoded in
// JS, then geometry and normals), which on a phone takes seconds. This module does that work ahead of time:
// a little at a time while the player is in the menus, and whatever is left behind the loader when a run starts.

const done = new Set<string>();
let queue: WarmJob[] = [];
let paused = false;
let timer: ReturnType<typeof setTimeout> | undefined;

// The jobs a run in this city needs (no city: the endless run, which passes through every city).
export function jobsFor(c: City | undefined, suit?: Suit): WarmJob[] {
  const jobs: WarmJob[] = [...heroJobs];
  if (suit && suit.id !== 'classic') jobs.push({ key: `suit:${suit.id}`, run: () => suitMap(suit) });
  return jobs.concat(warmJobs(c));
}

export const pending = (jobs: WarmJob[]) => jobs.filter((j) => !done.has(j.key));

function runJob(j: WarmJob) {
  if (done.has(j.key)) return;
  j.run();
  done.add(j.key);
}

// A slice of jobs (at least one, then more while under 10 ms) every couple of frames, so the menus keep
// answering taps between slices. (Idle callbacks would be gentler, but the menus animate constantly, so they
// rarely come and the work would not be done in time.)
function pump() {
  if (timer || paused || !queue.length) return;
  timer = setTimeout(() => {
    timer = undefined;
    const start = Date.now();
    while (!paused && queue.length) {
      runJob(queue.shift()!);
      if (Date.now() - start > 10) break;
    }
    pump();
  }, 30);
}

// Queue work for the menus to do in the background. Jobs already done or queued are skipped.
export function preloadInBackground(jobs: WarmJob[]) {
  const queued = new Set(queue.map((j) => j.key));
  for (const j of pending(jobs)) if (!queued.has(j.key)) queue.push(j);
  pump();
}

// A run pauses the background work: a job mid-run would make the game stutter.
export function pausePreload(p: boolean) {
  paused = p;
  if (!p) pump();
}

const nextFrame = () =>
  new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });

// Finish the jobs a run needs, in slices of about 40 ms with a frame between them so the loader keeps moving.
// Returns false if cancelled (the player left before it finished).
export async function prepare(jobs: WarmJob[], onProgress: (share: number) => void, cancelled: () => boolean) {
  const todo = pending(jobs);
  const total = todo.length;
  let at = 0;
  onProgress(total ? 0 : 1);
  while (at < total) {
    const start = Date.now();
    do runJob(todo[at++]);
    while (at < total && Date.now() - start < 40);
    onProgress(at / total);
    await nextFrame();
    if (cancelled()) return false;
  }
  return true;
}
