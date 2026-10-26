import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Short sound effects from Kenney's CC0 packs (converted to m4a, which iOS and Android both play).
const FILES = {
  bottle: require('../../assets/sounds/bottle.m4a'),
  cash: require('../../assets/sounds/cash.m4a'),
  hit: require('../../assets/sounds/hit.m4a'),
  jump: require('../../assets/sounds/jump.m4a'),
  slide: require('../../assets/sounds/slide.m4a'),
  step1: require('../../assets/sounds/step1.m4a'),
  step2: require('../../assets/sounds/step2.m4a'),
  land: require('../../assets/sounds/land.m4a'),
  life: require('../../assets/sounds/life.m4a'),
  checkpoint: require('../../assets/sounds/checkpoint.m4a'),
  skate: require('../../assets/sounds/skate.m4a'),
  tajine: require('../../assets/sounds/tajine.m4a'),
  chase: require('../../assets/sounds/chase.m4a'),
  clear: require('../../assets/sounds/clear.m4a'),
  over: require('../../assets/sounds/over.m4a'),
  click: require('../../assets/sounds/click.m4a'),
};
export type Sound = keyof typeof FILES;

const VOLUME: Partial<Record<Sound, number>> = { step1: 0.25, step2: 0.25, land: 0.5, click: 0.6, bottle: 0.7 };
// A few players per sound so quick repeats (a line of bottles) overlap instead of cutting off.
const POOL = 3;
const players = new Map<Sound, { list: AudioPlayer[]; next: number }>();
let ready = false;
let muted = false;

export function initSounds() {
  if (ready) return;
  ready = true;
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  for (const key of Object.keys(FILES) as Sound[]) {
    const n = key.startsWith('step') || key === 'bottle' ? POOL : 1;
    const list: AudioPlayer[] = [];
    for (let i = 0; i < n; i++) {
      try {
        const p = createAudioPlayer(FILES[key]);
        p.volume = VOLUME[key] ?? 1;
        list.push(p);
      } catch {
        // No audio on this device: stay silent.
      }
    }
    players.set(key, { list, next: 0 });
  }
}

export function play(key: Sound) {
  if (muted) return;
  const slot = players.get(key);
  if (!slot || !slot.list.length) return;
  const p = slot.list[slot.next];
  slot.next = (slot.next + 1) % slot.list.length;
  try {
    p.seekTo(0);
    p.play();
  } catch {
    // ignore
  }
}

export const setMuted = (m: boolean) => (muted = m);
export const isMuted = () => muted;
