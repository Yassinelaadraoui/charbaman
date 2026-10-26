import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

// Two original loops from scripts/compose-music.py: a calm one for the menus and a fast one for running.
// In the chase the run theme speeds up.
const FILES = {
  menu: require('../../assets/music/menu.m4a'),
  run: require('../../assets/music/run.m4a'),
};
type Track = keyof typeof FILES;

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
