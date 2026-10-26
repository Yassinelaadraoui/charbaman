"""Compose the game's two music loops (original, so free to ship) and write them as m4a.

Usage: python3 scripts/compose-music.py assets/music
Needs: numpy, and ffmpeg on the PATH

A chiptune take on Moroccan street music: the melody uses the Hijaz scale on D (D Eb F# G A Bb C), the bass
holds the roots, a darbuka plays the maqsum rhythm (doum-tek-tek-doum-tek) and, in the run theme, qraqeb
(the iron castanets of Gnawa music) clatter in triplets. menu.m4a is the same tune, slower and softer.
Each file is exactly 16 bars, so it loops cleanly.
"""
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

OUT = Path(sys.argv[1])
SR = 32000
rng = np.random.default_rng(7)
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'])}


def hz(name):
    return 440 * 2 ** ((NOTE[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


# Melody: 16 bars of 8 eighth notes. '-' holds the previous note, '.' is a rest.
MELODY = '''
A4 - D5 - C5 Bb4 A4 -  | Bb4 A4 G4 F#4 G4 - A4 -  | A4 - D5 - Eb5 D5 C5 Bb4 | A4 - - - . . G4 F#4
A4 - D5 - C5 Bb4 A4 -  | Bb4 C5 D5 Eb5 D5 C5 Bb4 A4 | G4 A4 Bb4 A4 G4 F#4 Eb4 F#4 | D4 - - - . . . .
D5 - F#5 - G5 F#5 Eb5 D5 | C5 D5 Eb5 D5 C5 Bb4 A4 - | Bb4 - D5 - C5 Bb4 A4 G4 | F#4 G4 A4 - . . A4 .
D5 - F#5 - G5 A5 G5 F#5 | Eb5 F#5 Eb5 D5 C5 D5 C5 Bb4 | A4 Bb4 A4 G4 F#4 G4 Eb4 F#4 | D4 - - - D4 . . .
'''
ROOTS = 'D G D D D G C D D C G D D C G D'.split()
FIFTH = {'D': 'A', 'G': 'D', 'C': 'G'}


def melody_events():
    bars = [b.split() for b in MELODY.replace('\n', '|').split('|') if b.strip()]
    assert len(bars) == 16 and all(len(b) == 8 for b in bars), [len(b) for b in bars]
    events, cur = [], None  # (start eighth, length in eighths, note)
    for bi, bar in enumerate(bars):
        for k, tok in enumerate(bar):
            step = bi * 8 + k
            if tok == '-' and cur:
                cur[1] += 1
            elif tok == '.':
                cur = None
            else:
                cur = [step, 1, tok]
                events.append(cur)
    return events


def env(n, attack=0.005, release=0.04, decay=None):
    t = np.arange(n) / SR
    e = np.minimum(1, t / attack) * np.minimum(1, (n / SR - t) / release)
    if decay:
        e *= np.exp(-t / decay)
    return np.clip(e, 0, 1)


def pulse(f, n, duty=0.25, vib=0.0):
    t = np.arange(n) / SR
    ph = np.cumsum(f * (1 + vib * np.sin(2 * np.pi * 5.5 * t) * np.minimum(1, t / 0.15)) / SR)
    return np.where((ph % 1) < duty, 1.0, -1.0)


def tri(f, n):
    ph = np.arange(n) * f / SR
    return 2 * np.abs(2 * (ph % 1) - 1) - 1


def doum(n):
    t = np.arange(n) / SR
    f = 55 + 70 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.16)


def tek(n, bright=1.0):
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = np.diff(np.r_[0, x])  # crude high-pass
    return x * np.exp(-t / (0.025 * bright)) * 0.5 + np.sin(2 * np.pi * 420 * t) * np.exp(-t / 0.03) * 0.5


def qraqeb(n):
    t = np.arange(n) / SR
    x = np.diff(np.r_[0, rng.standard_normal(n)])
    return x * (np.exp(-t / 0.012) + 0.6 * np.exp(-np.maximum(0, t - 0.018) / 0.01) * (t > 0.018))


def render(bpm, lead_duty, lead_vol, drums, castanets, soft):
    eighth = 60 / bpm / 2
    total = int(round(16 * 8 * eighth * SR))
    mix = np.zeros(total + SR)
    at = lambda step: int(round(step * eighth * SR))

    def add(start, sig, vol):
        mix[start:start + len(sig)] += sig * vol

    for start, length, note in melody_events():
        n = at(length) - int(0.01 * SR)
        sig = (tri(hz(note), n) if soft else pulse(hz(note), n, lead_duty, vib=0.006)) * env(n, release=0.05)
        add(at(start), sig, lead_vol)
        # a quiet echo an eighth later, like a second ghaita answering
        add(at(start + 1), sig * 0.35, lead_vol * 0.5)
    for bar, root in enumerate(ROOTS):
        pattern = [root + '2', None, root + '3', None, FIFTH[root] + '2', None, root + '3', None]
        for k, nt in enumerate(pattern):
            if nt:
                n = at(1.6)
                add(at(bar * 8 + k), tri(hz(nt), n) * env(n, release=0.06), 0.28 if not soft else 0.2)
    if drums:
        # maqsum over one bar of eighths: D T . T D . T .
        for bar in range(16):
            for k, hit in enumerate('DT.TD.T.'):
                s = at(bar * 8 + k)
                if hit == 'D':
                    add(s, doum(at(1.5)), 0.55 if not soft else 0.35)
                elif hit == 'T':
                    add(s, tek(at(1)), 0.28 if not soft else 0.16)
            if not soft:
                for k in range(16):  # light ticks on the sixteenths
                    add(at(bar * 8 + k / 2), tek(at(0.4), 0.4), 0.06)
    if castanets:
        for bar in range(16):
            for beat in range(4):
                for k, v in enumerate((0.16, 0.08, 0.12)):  # Gnawa triplets
                    add(at(bar * 8 + beat * 2 + k * 2 / 3), qraqeb(at(0.6)), v)
    # fold the tail over the start so the loop is seamless, then normalise
    tail = mix[total:]
    mix = mix[:total]
    mix[:len(tail)] += tail
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    return mix / np.abs(mix).max() * 0.8


def write(name, sig):
    OUT.mkdir(parents=True, exist_ok=True)
    wav = OUT / f'{name}.wav'
    with wave.open(str(wav), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((sig * 32767).astype('<i2').tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav), '-c:a', 'aac', '-b:a', '80k', str(OUT / f'{name}.m4a')], check=True)
    wav.unlink()
    print(f'{name}: {len(sig) / SR:.1f} s')


write('run', render(bpm=150, lead_duty=0.25, lead_vol=0.22, drums=True, castanets=True, soft=False))
write('menu', render(bpm=104, lead_duty=0.5, lead_vol=0.2, drums=True, castanets=False, soft=True))
