import React from 'react';
import { Text, View } from 'react-native';
import { City } from './cities';
import { Entity } from './engine';
import { colors } from '../theme';

// Every sprite is drawn bottom-centred, sized in metres times `m` (pixels per metre).
type SpriteProps = { e: Entity; m: number; c: City; t: number };

const abs = { position: 'absolute' as const };

export function Bottle({ m, spin = 1 }: { m: number; spin?: number }) {
  return (
    <View style={{ alignItems: 'center', transform: [{ scaleX: 0.35 + 0.65 * Math.abs(spin) }] }}>
      <View style={{ width: 0.12 * m, height: 0.05 * m, backgroundColor: colors.gold, borderRadius: 0.02 * m }} />
      <View style={{ width: 0.1 * m, height: 0.12 * m, backgroundColor: colors.orangeLight }} />
      <View
        style={{
          width: 0.32 * m,
          height: 0.45 * m,
          borderRadius: 0.1 * m,
          backgroundColor: colors.orange,
          borderWidth: Math.max(1, 0.02 * m),
          borderColor: colors.orangeDeep,
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <View style={{ height: 0.12 * m, backgroundColor: colors.white }} />
        <View style={{ ...abs, left: 0.04 * m, top: 0.03 * m, width: 0.05 * m, height: 0.36 * m, borderRadius: 0.03 * m, backgroundColor: 'rgba(255,255,255,0.45)' }} />
      </View>
    </View>
  );
}

function Crates({ e, m }: SpriteProps) {
  const n = Math.max(1, Math.round((e.w * 2) / 1));
  const cw = (e.w * 2 * m) / n;
  return (
    <View style={{ flexDirection: 'row', width: e.w * 2 * m, height: e.h * m }}>
      {Array.from({ length: n }).map((_, i) => (
        <View
          key={i}
          style={{
            width: cw,
            height: e.h * m,
            backgroundColor: i % 2 ? '#B07A45' : '#A06A38',
            borderWidth: Math.max(1, 0.05 * m),
            borderColor: '#6B4423',
            justifyContent: 'space-evenly',
            overflow: 'visible',
          }}
        >
          <View style={{ height: Math.max(1, 0.04 * m), backgroundColor: '#6B4423' }} />
          <View style={{ height: Math.max(1, 0.04 * m), backgroundColor: '#6B4423' }} />
          {/* oranges piled on top */}
          <View style={{ ...abs, top: -0.18 * m, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around' }}>
            {[0, 1, 2].map((k) => (
              <View key={k} style={{ width: 0.24 * m, height: 0.24 * m, borderRadius: 0.12 * m, backgroundColor: colors.orange }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function Awning({ e, m, c }: SpriteProps) {
  const w = e.w * 2 * m;
  const stripes = 8;
  return (
    <View style={{ width: w + 0.4 * m, height: (e.y + e.h) * m, alignItems: 'center' }}>
      <View style={{ ...abs, left: 0, bottom: 0, width: 0.15 * m, height: (e.y + e.h) * m, backgroundColor: '#5C3A1E' }} />
      <View style={{ ...abs, right: 0, bottom: 0, width: 0.15 * m, height: (e.y + e.h) * m, backgroundColor: '#5C3A1E' }} />
      <View style={{ ...abs, top: 0, left: 0.1 * m, right: 0.1 * m, height: e.h * m, flexDirection: 'row', overflow: 'hidden', borderBottomLeftRadius: 0.2 * m, borderBottomRightRadius: 0.2 * m }}>
        {Array.from({ length: stripes }).map((_, i) => (
          <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? colors.white : c.accent }} />
        ))}
        <View style={{ ...abs, left: 0, right: 0, top: 0.35 * m, alignItems: 'center' }}>
          <View style={{ backgroundColor: colors.orange, paddingHorizontal: 0.3 * m, borderRadius: 0.1 * m }}>
            <Text style={{ color: colors.white, fontWeight: '900', fontSize: Math.max(1, 0.45 * m) }} numberOfLines={1}>
              CHARBA
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function Taxi({ e, m, c }: SpriteProps) {
  const w = e.w * 2 * m;
  return (
    <View style={{ width: w, height: e.h * m, alignItems: 'center' }}>
      <View style={{ ...abs, top: 0, width: 0.5 * m, height: 0.18 * m, backgroundColor: colors.white, borderRadius: 0.05 * m, borderWidth: 1, borderColor: '#333' }} />
      <View style={{ ...abs, top: 0.18 * m, width: w * 0.78, height: 0.5 * m, backgroundColor: c.taxi, borderTopLeftRadius: 0.25 * m, borderTopRightRadius: 0.25 * m, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: '82%', height: '62%', backgroundColor: '#22313F', borderRadius: 0.08 * m }} />
      </View>
      <View style={{ ...abs, top: 0.66 * m, width: w, height: 0.62 * m, backgroundColor: c.taxi, borderRadius: 0.12 * m, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 0.08 * m }}>
        <View style={{ width: 0.28 * m, height: 0.16 * m, backgroundColor: '#FF2E2E', borderRadius: 0.04 * m }} />
        <View style={{ width: 0.5 * m, height: 0.15 * m, backgroundColor: '#F5F5F5', borderRadius: 0.02 * m }} />
        <View style={{ width: 0.28 * m, height: 0.16 * m, backgroundColor: '#FF2E2E', borderRadius: 0.04 * m }} />
      </View>
      <View style={{ ...abs, bottom: 0, left: 0.12 * m, width: 0.35 * m, height: 0.25 * m, backgroundColor: '#111', borderRadius: 0.06 * m }} />
      <View style={{ ...abs, bottom: 0, right: 0.12 * m, width: 0.35 * m, height: 0.25 * m, backgroundColor: '#111', borderRadius: 0.06 * m }} />
    </View>
  );
}

function Scooter({ e, m }: SpriteProps) {
  return (
    <View style={{ width: e.w * 2 * m, height: e.h * m + 0.5 * m, alignItems: 'center' }}>
      <View style={{ width: 0.34 * m, height: 0.34 * m, borderRadius: 0.17 * m, backgroundColor: '#264653' }} />
      <View style={{ width: 0.5 * m, height: 0.55 * m, borderRadius: 0.15 * m, backgroundColor: '#E9C46A' }} />
      <View style={{ width: 0.8 * m, height: 0.4 * m, borderRadius: 0.15 * m, backgroundColor: '#2A9D8F' }} />
      <View style={{ width: 0.18 * m, height: 0.3 * m, borderRadius: 0.06 * m, backgroundColor: '#111' }} />
    </View>
  );
}

function Donkey({ e, m }: SpriteProps) {
  const w = e.w * 2 * m;
  return (
    <View style={{ width: w, height: e.h * m + 0.3 * m, alignItems: 'center', justifyContent: 'flex-end' }}>
      <View style={{ ...abs, top: 0, left: w / 2 - 0.3 * m, flexDirection: 'row', gap: 0.2 * m }}>
        <View style={{ width: 0.1 * m, height: 0.4 * m, borderRadius: 0.05 * m, backgroundColor: '#8D8D8D', transform: [{ rotate: '-15deg' }] }} />
        <View style={{ width: 0.1 * m, height: 0.4 * m, borderRadius: 0.05 * m, backgroundColor: '#8D8D8D', transform: [{ rotate: '15deg' }] }} />
      </View>
      <View style={{ width: 0.6 * m, height: 0.7 * m, borderRadius: 0.25 * m, backgroundColor: '#9E9E9E' }} />
      <View style={{ width: w, height: 0.55 * m, backgroundColor: '#8B5A2B', borderRadius: 0.06 * m, borderWidth: Math.max(1, 0.04 * m), borderColor: '#5C3A1E', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-start' }}>
        {[0, 1, 2, 3].map((k) => (
          <View key={k} style={{ marginTop: -0.14 * m, width: 0.26 * m, height: 0.26 * m, borderRadius: 0.13 * m, backgroundColor: k % 2 ? colors.orange : '#7CB518' }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', width: w * 0.9, justifyContent: 'space-between' }}>
        <View style={{ width: 0.3 * m, height: 0.3 * m, borderRadius: 0.15 * m, backgroundColor: '#3E2723' }} />
        <View style={{ width: 0.3 * m, height: 0.3 * m, borderRadius: 0.15 * m, backgroundColor: '#3E2723' }} />
      </View>
    </View>
  );
}

function Arch({ e, m, label, t }: SpriteProps & { label: string }) {
  const w = e.w * 2 * m;
  const finish = label === 'FINISH';
  return (
    <View style={{ width: w + 0.6 * m, height: e.h * m, alignItems: 'center' }}>
      <View style={{ ...abs, left: 0, bottom: 0, width: 0.3 * m, height: e.h * m, backgroundColor: colors.orangeDeep, borderRadius: 0.1 * m }} />
      <View style={{ ...abs, right: 0, bottom: 0, width: 0.3 * m, height: e.h * m, backgroundColor: colors.orangeDeep, borderRadius: 0.1 * m }} />
      <View
        style={{
          ...abs,
          top: 0,
          left: 0,
          right: 0,
          height: 0.8 * m,
          backgroundColor: finish ? colors.ink : colors.orange,
          borderRadius: 0.2 * m,
          borderWidth: Math.max(1, 0.06 * m),
          borderColor: colors.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.white, fontWeight: '900', fontSize: Math.max(1, 0.5 * m), opacity: e.done ? 0.6 : 1 }} numberOfLines={1}>
          {e.done && !finish ? 'SAVED!' : label}
        </Text>
      </View>
      {!finish && !e.done && (
        <View style={{ ...abs, top: 1.1 * m, transform: [{ rotate: `${t * 240}deg` }] }}>
          <View style={{ width: 0.6 * m, height: 0.6 * m, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }], borderRadius: 0.08 * m }} />
        </View>
      )}
    </View>
  );
}

function Tajine({ m, t }: { m: number; t: number }) {
  return (
    <View style={{ alignItems: 'center', transform: [{ translateY: Math.sin(t * 5) * 0.08 * m }] }}>
      <View style={{ width: 0.1 * m, height: 0.1 * m, borderRadius: 0.05 * m, backgroundColor: '#7B3F1D' }} />
      <View style={{ width: 0, height: 0, borderLeftWidth: 0.35 * m, borderRightWidth: 0.35 * m, borderBottomWidth: 0.55 * m, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#B5562C' }} />
      <View style={{ width: 0.9 * m, height: 0.12 * m, borderRadius: 0.06 * m, backgroundColor: '#7B3F1D' }} />
    </View>
  );
}

function Skate({ m, t }: { m: number; t: number }) {
  return (
    <View style={{ alignItems: 'center', transform: [{ translateY: Math.sin(t * 5) * 0.1 * m }, { rotate: `${Math.sin(t * 3) * 10}deg` }] }}>
      <View style={{ width: 1.0 * m, height: 0.16 * m, borderRadius: 0.08 * m, backgroundColor: colors.orange, borderWidth: Math.max(1, 0.03 * m), borderColor: colors.gold }} />
      <View style={{ flexDirection: 'row', width: 0.7 * m, justifyContent: 'space-between' }}>
        <View style={{ width: 0.14 * m, height: 0.14 * m, borderRadius: 0.07 * m, backgroundColor: colors.ink }} />
        <View style={{ width: 0.14 * m, height: 0.14 * m, borderRadius: 0.07 * m, backgroundColor: colors.ink }} />
      </View>
    </View>
  );
}

export function EntitySprite(props: SpriteProps) {
  const { e, m, t } = props;
  switch (e.kind) {
    case 'can':
      return <Bottle m={m * 1.4} spin={Math.cos(t * 6 + e.id)} />;
    case 'crate':
      return <Crates {...props} />;
    case 'awning':
      return <Awning {...props} />;
    case 'taxi':
      return <Taxi {...props} />;
    case 'scooter':
      return <Scooter {...props} />;
    case 'donkey':
      return <Donkey {...props} />;
    case 'checkpoint':
      return <Arch {...props} label="CHECKPOINT" />;
    case 'finish':
      return <Arch {...props} label="FINISH" />;
    case 'tajine':
      return <Tajine m={m} t={t} />;
    case 'skate':
      return <Skate m={m} t={t} />;
  }
}

// Roadside scenery.
export type DecorKind = 'palm' | 'lamp' | 'house' | 'flag';

export function Decor({ kind, m, c, variant }: { kind: DecorKind; m: number; c: City; variant: number }) {
  if (kind === 'palm') {
    return (
      <View style={{ alignItems: 'center', height: 6 * m, justifyContent: 'flex-end' }}>
        <View style={{ ...abs, top: 0.3 * m, width: 3 * m, height: 1.6 * m, alignItems: 'center' }}>
          {[-55, -20, 20, 55, 90, -90].map((r, i) => (
            <View key={i} style={{ ...abs, top: 0.5 * m, width: 1.6 * m, height: 0.35 * m, borderRadius: 0.3 * m, backgroundColor: i % 2 ? '#2D6A4F' : '#40916C', transform: [{ rotate: `${r}deg` }, { translateX: (r > 0 ? 0.6 : -0.6) * m }] }} />
          ))}
        </View>
        <View style={{ width: 0.28 * m, height: 5.4 * m, backgroundColor: '#8B5E34', borderRadius: 0.1 * m }} />
      </View>
    );
  }
  if (kind === 'lamp') {
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 0.45 * m, height: 0.6 * m, backgroundColor: colors.gold, borderRadius: 0.1 * m, borderWidth: Math.max(1, 0.06 * m), borderColor: '#3D2B1F' }} />
        <View style={{ width: 0.12 * m, height: 3.6 * m, backgroundColor: '#3D2B1F' }} />
      </View>
    );
  }
  if (kind === 'flag') {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <View style={{ width: 1.2 * m, height: 0.8 * m, backgroundColor: '#C1272D', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#006233', fontSize: Math.max(1, 0.6 * m), fontWeight: '900' }}>★</Text>
        </View>
        <View style={{ width: 0.08 * m, height: 4 * m, backgroundColor: '#555' }} />
      </View>
    );
  }
  const h = (5 + (variant % 3) * 2) * m;
  const w = 5 * m;
  const tone = variant % 2 ? c.near : shade(c.near, -12);
  return (
    <View style={{ width: w, height: h, backgroundColor: tone, borderTopLeftRadius: 0.2 * m, borderTopRightRadius: 0.2 * m, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
      <View style={{ ...abs, top: 0, left: 0, right: 0, height: 0.35 * m, backgroundColor: c.accent }} />
      <View style={{ ...abs, top: 1 * m, flexDirection: 'row', gap: 0.9 * m }}>
        {[0, 1, 2].map((k) => (
          <View key={k} style={{ width: 0.7 * m, height: 1 * m, borderTopLeftRadius: 0.35 * m, borderTopRightRadius: 0.35 * m, backgroundColor: k === 1 ? c.accent : '#3A2E2A' }} />
        ))}
      </View>
      <View style={{ width: 1.4 * m, height: 2.4 * m, borderTopLeftRadius: 0.7 * m, borderTopRightRadius: 0.7 * m, backgroundColor: c.accent, borderWidth: Math.max(1, 0.1 * m), borderColor: shade(c.near, -30) }} />
    </View>
  );
}

export function shade(hex: string, pct: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (pct / 100) * 255)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
