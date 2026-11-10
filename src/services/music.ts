import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

// Original loops from scripts/compose-music.py: a calm one for the menus and a fast one for running, which
// each city plays in its own key and tempo (Casablanca and Endless use the plain one). In the chase the run
// theme speeds up.
const FILES = {
  menu: require('../../assets/music/menu.m4a'),
  run: require('../../assets/music/run.m4a'),
  'run-rabat': require('../../assets/music/run-rabat.m4a'),
  'run-safi': require('../../assets/music/run-safi.m4a'),
  'run-agadir': require('../../assets/music/run-agadir.m4a'),
  'run-marrakech': require('../../assets/music/run-marrakech.m4a'),
  'run-fes': require('../../assets/music/run-fes.m4a'),
  'run-chefchaouen': require('../../assets/music/run-chefchaouen.m4a'),
  'run-tangier': require('../../assets/music/run-tangier.m4a'),
};
export type Track = keyof typeof FILES;
export const runTrack = (cityId?: string): Track => (cityId && `run-${cityId}` in FILES ? (`run-${cityId}` as Track) : 'run');

const VOLUME = 0.45;
const players: Partial<Record<Track, AudioPlayer>> = {};
let enabled = true;
let wanted: Track | null = null;
let suspended = false; // the app is in the background

function player(track: Track) {
  if (!players[track]) {
    try {
      const p = createAudioPlayer(FILES[track]);
      p.loop = true;
      p.volume = VOLUME;
      players[track] = p;
    } catch {
      return undefined; // no audio on this device
    }
  }
  return players[track];
}

function apply() {
  for (const [track, p] of Object.entries(players) as [Track, AudioPlayer][]) {
    const on = enabled && !suspended && track === wanted;
    try {
      if (on && !p.playing) p.play();
      if (!on && p.playing) p.pause();
    } catch {
      // ignore
    }
  }
}

export function playMusic(track: Track | null) {
  if (track === wanted) return;
  wanted = track;
  if (track && enabled) {
    const p = player(track);
    try {
      p?.seekTo(0);
      if (p) p.playbackRate = 1;
    } catch {
      // ignore
    }
  }
  apply();
}

// Faster in the chase, back to normal otherwise.
export function setMusicTempo(rate: number) {
  const p = wanted ? players[wanted] : undefined;
  try {
    if (p && Math.abs(p.playbackRate - rate) > 0.01) p.setPlaybackRate(rate);
  } catch {
    // ignore
  }
}

export function setMusicEnabled(on: boolean) {
  enabled = on;
  if (on && wanted) player(wanted);
  apply();
}

export function suspendMusic(s: boolean) {
  suspended = s;
  apply();
}
