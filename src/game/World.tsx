import React, { memo } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { City, Landmark } from './cities';
import { GameState, ROAD_HALF, city as cityOf } from './engine';
import { Decor, DecorKind, EntitySprite, shade } from './sprites';
import { Hero } from './Hero';
import { colors } from '../theme';

const D0 = 4.6; // camera distance behind the hero
const MAX_D = 85;
const DECOR_D = 62;
const SEG = 3;

// Bottom-centre anchoring without percentage transforms (not reliable on native).
const BOX = 4000;
const anchor = (x: number, y: number) => ({
  position: 'absolute' as const,
  left: x - BOX / 2,
  top: y - BOX,
  width: BOX,
  height: BOX,
  alignItems: 'center' as const,
  justifyContent: 'flex-end' as const,
});

export type View3D = {
  W: number;
  H: number;
  F: number;
  horizon: number;
  camH: number;
};

export function makeView(W: number, H: number): View3D {
  const horizon = H * 0.37;
  const playerY = H * 0.8;
  const F = Math.min(W * 0.7, H * 0.42);
  const camH = ((playerY - horizon) * D0) / F;
  return { W, H, F, horizon, camH };
}

// Gentle bends, like the sweeping streets of the original.
const curvature = (z: number) => 0.0028 * Math.sin(z / 150 + 1.3) + 0.0013 * Math.sin(z / 61);
const curveIntegral = (z: number) => -0.0028 * 150 * Math.cos(z / 150 + 1.3) - 0.0013 * 61 * Math.cos(z / 61);

const hash = (i: number) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

type Props = { s: GameState; v: View3D };

export function World({ s, v }: Props) {
  const c = cityOf(s);
  const { W, H, F, horizon, camH } = v;
  const camZ = s.z - D0;
  const camX = s.x * 0.55;
  const k = curvature(s.z);
  const bend = (d: number) => (d > D0 ? 0.5 * k * (d - D0) * (d - D0) : 0);
  const projY = (d: number) => horizon + (camH * F) / d;
  const projX = (x: number, d: number) => W / 2 + (x - camX + bend(d)) * (F / d);
  const t = s.time;

  // Road bands, far to near.
  const bands: React.ReactNode[] = [];
  const first = Math.floor((camZ + 1) / SEG);
  const last = Math.floor((camZ + MAX_D) / SEG);
  for (let i = last; i >= first; i--) {
    const d0 = Math.max(0.8, i * SEG - camZ);
    const d1 = i * SEG + SEG - camZ;
    if (d1 <= 0.8) continue;
    const yTop = projY(d1);
    const yBot = Math.min(H + 2, projY(d0));
    if (yBot <= yTop || yTop > H) continue;
    const alt = i & 1;
    const h = yBot - yTop + 1;
    bands.push(<View key={`g${i}`} style={{ position: 'absolute', left: 0, width: W, top: yTop, height: h, backgroundColor: c.ground[alt] }} />);
    // Near bands cover many pixels, so split them into thin strips; each strip is
    // sized for its own depth, which keeps the road edges smooth instead of stepped.
    const strips = Math.max(1, Math.ceil(h / 12));
    for (let k = 0; k < strips; k++) {
      const sTop = yTop + (h * k) / strips;
      const sBot = yTop + (h * (k + 1)) / strips;
      const d = Math.max(0.8, (camH * F) / Math.max(1, sBot - horizon));
      const m = F / d;
      const cx = projX(0, d);
      const half = ROAD_HALF * m;
      const curb = 0.4 * m;
      const sh = sBot - sTop + 1;
      bands.push(
        <View
          key={`r${i}_${k}`}
          style={{
            position: 'absolute',
            left: cx - half - curb,
            width: 2 * (half + curb),
            top: sTop,
            height: sh,
            backgroundColor: c.road[alt],
            borderLeftWidth: curb,
            borderRightWidth: curb,
            borderLeftColor: c.curb[alt],
            borderRightColor: c.curb[alt],
          }}
        />,
      );
      if (alt) {
        bands.push(<View key={`l${i}_${k}`} style={{ position: 'absolute', left: cx - 0.07 * m, width: 0.14 * m, top: sTop, height: sh, backgroundColor: c.line, opacity: 0.85 }} />);
      }
    }
  }

  // Sprites: entities, roadside decor and the hero, painted far to near.
  type Item = { d: number; node: React.ReactNode };
  const items: Item[] = [];
  const place = (key: string, x: number, y: number, d: number, node: React.ReactNode) => {
    const m = F / d;
    const fade = Math.max(0, Math.min(1, (MAX_D - d) / 14));
    items.push({
      d,
      node: (
        <View
          key={key}
          pointerEvents="none"
          style={[anchor(projX(x, d), projY(d) - y * m), { opacity: fade }]}
        >
          {node}
        </View>
      ),
    });
  };

  for (const e of s.entities) {
    const d = e.z - camZ;
    if (d < 1 || d > MAX_D) continue;
    if (e.done && (e.kind === 'can' || e.kind === 'skate' || e.kind === 'tajine')) continue;
    place(`e${e.id}`, e.x, e.y, d, <EntitySprite e={e} m={F / d} c={c} t={t} />);
  }

  const DECOR_STEP = 7;
  for (let i = Math.floor((camZ + 2) / DECOR_STEP); i * DECOR_STEP < camZ + DECOR_D; i++) {
    const d = i * DECOR_STEP - camZ;
    if (d < 1.5) continue;
    for (const side of [-1, 1]) {
      const r = hash(i * 2 + (side > 0 ? 1 : 0));
      place(`h${i}${side}`, side * (ROAD_HALF + 5.4), 0, d + 0.01, <Decor kind="house" m={F / d} c={c} variant={Math.floor(r * 6)} />);
      const kinds: DecorKind[] = c.id === 'marrakech' ? ['palm', 'palm', 'lamp', 'flag'] : ['palm', 'lamp', 'lamp', 'flag'];
      const kind = kinds[Math.floor(r * kinds.length)];
      place(`d${i}${side}`, side * (ROAD_HALF + 1.3), 0, d, <Decor kind={kind} m={F / d} c={c} variant={0} />);
    }
  }

  const hm = F / D0;
  items.push({
    d: D0,
    node: (
      <View key="hero" pointerEvents="none" style={anchor(projX(s.x, D0), projY(D0) - s.y * hm)}>
        <Hero
          scale={hm}
          runPhase={s.runPhase}
          airborne={s.y > 0.05}
          sliding={s.slide > 0}
          skating={s.skate > 0}
          tajine={s.tajine > 0}
          blink={s.invuln > 0 && Math.floor(s.time * 12) % 2 === 0}
        />
      </View>
    ),
  });
  items.sort((a, b) => b.d - a.d);

  const shadowW = 0.9 * hm * Math.max(0.4, 1 - s.y * 0.25);
  const shakeX = s.shake > 0 ? Math.sin(s.time * 90) * s.shake * 14 : 0;
  const shakeY = s.shake > 0 ? Math.cos(s.time * 70) * s.shake * 8 : 0;

  return (
    <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, overflow: 'hidden', transform: [{ translateX: shakeX }, { translateY: shakeY }] }}>
      <LinearGradient colors={[c.skyTop, c.skyBottom]} style={{ position: 'absolute', left: 0, top: 0, width: W, height: horizon + 2 }} />
      <View style={{ position: 'absolute', left: W * 0.68, top: horizon * 0.22, width: W * 0.2, height: W * 0.2, borderRadius: W * 0.1, backgroundColor: c.sun, opacity: 0.9 }} />
      <Skyline c={c} W={W} horizon={horizon} offset={Math.round(curveIntegral(s.z) * W * 0.9 - camX * 6)} />
      {bands}
      <View pointerEvents="none" style={{ position: 'absolute', left: projX(s.x, D0) - shadowW / 2, top: projY(D0) - shadowW * 0.12, width: shadowW, height: shadowW * 0.24, borderRadius: shadowW, backgroundColor: 'rgba(0,0,0,0.25)' }} />
      {items.map((it) => it.node)}
      {s.skate > 0 && <SpeedLines W={W} H={H} t={t} />}
      {s.phase === 'chase' && <GiantBottle W={W} H={H} gap={s.chaseGap} t={t} />}
    </View>
  );
}

const SpeedLines = ({ W, H, t }: { W: number; H: number; t: number }) => (
  <>
    {Array.from({ length: 10 }).map((_, i) => {
      const r = hash(i + Math.floor(t * 20) * 13);
      return (
        <View
          key={i}
          pointerEvents="none"
          style={{ position: 'absolute', left: r < 0.5 ? r * W * 0.5 : W * 0.75 + r * W * 0.25 - W * 0.12, top: H * (0.4 + hash(i * 7 + Math.floor(t * 20)) * 0.55), width: 3, height: H * 0.12, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 2 }}
        />
      );
    })}
  </>
);

// The giant rolling Charba bottle chasing you at the end of every city.
function GiantBottle({ W, H, gap, t }: { W: number; H: number; gap: number; t: number }) {
  const close = Math.max(0, Math.min(1, 1 - gap / 12));
  const size = W * 1.5;
  const visible = H * (0.08 + close * 0.3);
  const roll = (t * 600) % (size * 0.25);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: (W - size) / 2, top: H - visible + Math.sin(t * 30) * 3, width: size, height: size * 0.55, borderRadius: size * 0.2, backgroundColor: colors.orange, overflow: 'hidden', borderWidth: 6, borderColor: colors.orangeDeep }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * size * 0.25 - roll, width: size * 0.06, backgroundColor: i % 2 ? colors.white : colors.gold, opacity: 0.85 }} />
      ))}
      <View style={{ position: 'absolute', left: size * 0.1, right: size * 0.1, top: size * 0.04, height: size * 0.05, borderRadius: size * 0.03, backgroundColor: 'rgba(255,255,255,0.4)' }} />
    </View>
  );
}

type SkyProps = { c: City; W: number; horizon: number; offset: number };

const Skyline = memo(function Skyline({ c, W, horizon, offset }: SkyProps) {
  const span = W * 2;
  const shapes = buildSkyline(c, W, horizon);
  const ox = ((offset % span) + span) % span;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: horizon + 1, overflow: 'hidden' }}>
      {c.sea && <View style={{ position: 'absolute', left: 0, right: 0, top: horizon - horizon * 0.06, height: horizon * 0.06 + 1, backgroundColor: c.sea }} />}
      {[-span, 0, span].map((base) => (
        <View key={base} style={{ position: 'absolute', left: base + ox - span / 2, top: 0, width: span, height: horizon }}>
          {shapes}
        </View>
      ))}
    </View>
  );
});

const skylineCache = new Map<string, React.ReactNode[]>();

function buildSkyline(c: City, W: number, horizon: number) {
  const key = `${c.id}:${Math.round(W)}:${Math.round(horizon)}`;
  const hit = skylineCache.get(key);
  if (hit) return hit;
  const span = W * 2;
  const nodes: React.ReactNode[] = [];
  const far = c.far;
  const dark = shade(c.far, -10);
  let x = 0;
  let i = 0;
  while (x < span) {
    const r = hash(c.seed * 100 + i);
    const w = W * (0.06 + r * 0.08);
    const h = horizon * (0.1 + hash(c.seed * 200 + i) * 0.16);
    nodes.push(<View key={`b${i}`} style={{ position: 'absolute', left: x, bottom: 0, width: w + 1, height: h, backgroundColor: i % 2 ? far : dark }} />);
    x += w;
    i++;
  }
  c.landmarks.forEach((lm, j) => {
    const lx = span * (0.1 + j * 0.24) + hash(c.seed + j) * W * 0.1;
    nodes.push(<LandmarkShape key={`lm${j}`} kind={lm} x={lx} W={W} horizon={horizon} color={shade(c.far, -18)} accent={c.accent} />);
  });
  skylineCache.set(key, nodes);
  return nodes;
}

function LandmarkShape({ kind, x, W, horizon, color, accent }: { kind: Landmark; x: number; W: number; horizon: number; color: string; accent: string }) {
  const u = W / 100;
  const base = { position: 'absolute' as const, left: x, bottom: 0, alignItems: 'center' as const };
  switch (kind) {
    case 'minaret':
      return (
        <View style={base}>
          <View style={{ width: 1.2 * u, height: 2 * u, backgroundColor: accent }} />
          <View style={{ width: 3.4 * u, height: 3 * u, backgroundColor: color, borderTopWidth: 0.8 * u, borderTopColor: accent }} />
          <View style={{ width: 6 * u, height: horizon * 0.42, backgroundColor: color, borderTopWidth: 1.2 * u, borderTopColor: accent }} />
        </View>
      );
    case 'dome':
      return (
        <View style={base}>
          <View style={{ width: 14 * u, height: 7 * u, borderTopLeftRadius: 7 * u, borderTopRightRadius: 7 * u, backgroundColor: accent }} />
          <View style={{ width: 16 * u, height: horizon * 0.14, backgroundColor: color }} />
        </View>
      );
    case 'gate':
      return (
        <View style={base}>
          <View style={{ width: 22 * u, height: horizon * 0.26, backgroundColor: accent, alignItems: 'center', justifyContent: 'flex-end', borderWidth: 1.2 * u, borderColor: color }}>
            <View style={{ width: 8 * u, height: horizon * 0.16, borderTopLeftRadius: 4 * u, borderTopRightRadius: 4 * u, backgroundColor: color }} />
          </View>
        </View>
      );
    case 'lighthouse':
      return (
        <View style={base}>
          <View style={{ width: 3 * u, height: 3 * u, backgroundColor: '#FFE066', borderRadius: 0.6 * u }} />
          <View style={{ width: 4 * u, height: horizon * 0.36, backgroundColor: '#FFFFFF', justifyContent: 'space-evenly' }}>
            <View style={{ height: 2 * u, backgroundColor: '#E63946' }} />
            <View style={{ height: 2 * u, backgroundColor: '#E63946' }} />
          </View>
        </View>
      );
    case 'palm':
      return (
        <View style={base}>
          <View style={{ width: 10 * u, height: 3 * u, borderRadius: 3 * u, backgroundColor: color }} />
          <View style={{ width: 1.2 * u, height: horizon * 0.24, backgroundColor: color }} />
        </View>
      );
    case 'tower':
      return (
        <View style={base}>
          <View style={{ width: 9 * u, height: horizon * 0.34, backgroundColor: color, borderTopWidth: 1 * u, borderTopColor: accent }} />
        </View>
      );
  }
}
