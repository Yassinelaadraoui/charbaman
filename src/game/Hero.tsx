import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

type Props = {
  scale: number; // pixels per metre
  runPhase: number;
  airborne: boolean;
  sliding: boolean;
  skating: boolean;
  tajine: boolean;
  blink: boolean;
};

// Charbaman seen from behind: a glossy orange hero with the Charba wave on his back.
export function Hero({ scale: m, runPhase, airborne, sliding, skating, tajine, blink }: Props) {
  const swing = airborne || skating ? 0 : Math.sin(runPhase) * 38;
  const bob = airborne || sliding || skating ? 0 : Math.abs(Math.cos(runPhase)) * 0.06 * m;
  const tuck = airborne ? 50 : 0;
  const lean = sliding ? -72 : skating ? 0 : 6;

  const limb = (w: number, h: number, extra: object) => ({
    position: 'absolute' as const,
    width: w * m,
    height: h * m,
    borderRadius: (w * m) / 2,
    backgroundColor: colors.orangeDeep,
    ...extra,
  });

  const W = 0.9 * m;
  const H = 1.8 * m;
  return (
    <View
      style={{
        width: W,
        height: H,
        opacity: blink ? 0.35 : 1,
        transform: [{ translateY: -bob }],
      }}
    >
      {skating && (
        <View
          style={{
            position: 'absolute',
            bottom: -0.12 * m,
            left: -0.15 * m,
            width: 1.2 * m,
            height: 0.12 * m,
            borderRadius: 0.06 * m,
            backgroundColor: colors.ink,
            borderTopWidth: 0.04 * m,
            borderTopColor: colors.gold,
          }}
        />
      )}
      <View
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: W,
          height: H,
          transformOrigin: 'bottom',
          transform: [{ scaleY: sliding ? 0.5 : 1 }, { skewX: `${lean * 0.2}deg` }],
        }}
      >
        {/* legs */}
        <View
          style={limb(0.2, 0.85, {
            left: 0.24 * m,
            top: 0.95 * m,
            transformOrigin: 'top',
            transform: [{ rotateX: `${swing}deg` }, { rotate: `${airborne ? -tuck * 0.3 : skating ? -8 : 0}deg` }, { scaleY: airborne ? 0.7 : 1 }],
            backgroundColor: colors.orange,
          })}
        />
        <View
          style={limb(0.2, 0.85, {
            right: 0.24 * m,
            top: 0.95 * m,
            transformOrigin: 'top',
            transform: [{ rotateX: `${-swing}deg` }, { rotate: `${airborne ? tuck * 0.3 : skating ? 8 : 0}deg` }, { scaleY: airborne ? 0.7 : 1 }],
            backgroundColor: colors.orange,
          })}
        />
        {/* arms */}
        <View
          style={limb(0.15, 0.68, {
            left: 0.02 * m,
            top: 0.42 * m,
            transformOrigin: 'top',
            transform: [{ rotate: `${airborne ? 150 : skating ? 40 : 12 + swing * 0.5}deg` }],
          })}
        />
        <View
          style={limb(0.15, 0.68, {
            right: 0.02 * m,
            top: 0.42 * m,
            transformOrigin: 'top',
            transform: [{ rotate: `${airborne ? -150 : skating ? -40 : -12 + swing * 0.5}deg` }],
          })}
        />
        {/* torso */}
        <View
          style={{
            position: 'absolute',
            left: 0.17 * m,
            top: 0.36 * m,
            width: 0.56 * m,
            height: 0.68 * m,
            borderRadius: 0.22 * m,
            borderBottomLeftRadius: 0.12 * m,
            borderBottomRightRadius: 0.12 * m,
            backgroundColor: colors.orange,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0.06 * m,
              top: 0.05 * m,
              width: 0.12 * m,
              height: 0.4 * m,
              borderRadius: 0.06 * m,
              backgroundColor: 'rgba(255,255,255,0.35)',
            }}
          />
          {/* Charba wave emblem */}
          <View
            style={{
              width: 0.3 * m,
              height: 0.3 * m,
              borderRadius: 0.15 * m,
              backgroundColor: colors.white,
              overflow: 'hidden',
              borderWidth: 0.025 * m,
              borderColor: colors.cream,
            }}
          >
            <View
              style={{
                position: 'absolute',
                top: 0.13 * m,
                left: -0.08 * m,
                width: 0.46 * m,
                height: 0.3 * m,
                borderRadius: 0.2 * m,
                backgroundColor: colors.orangeDeep,
                transform: [{ rotate: '-14deg' }],
              }}
            />
          </View>
        </View>
        {/* head */}
        <View
          style={{
            position: 'absolute',
            left: 0.24 * m,
            top: 0,
            width: 0.42 * m,
            height: 0.44 * m,
            borderRadius: 0.22 * m,
            backgroundColor: colors.orange,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              position: 'absolute',
              left: 0.07 * m,
              top: 0.05 * m,
              width: 0.12 * m,
              height: 0.16 * m,
              borderRadius: 0.08 * m,
              backgroundColor: 'rgba(255,255,255,0.55)',
            }}
          />
        </View>
        {tajine && (
          <View style={{ position: 'absolute', left: 0.12 * m, top: -0.42 * m, alignItems: 'center' }}>
            <View
              style={{
                width: 0,
                height: 0,
                borderLeftWidth: 0.33 * m,
                borderRightWidth: 0.33 * m,
                borderBottomWidth: 0.5 * m,
                borderLeftColor: 'transparent',
                borderRightColor: 'transparent',
                borderBottomColor: '#A0522D',
              }}
            />
            <View style={{ width: 0.72 * m, height: 0.08 * m, borderRadius: 0.04 * m, backgroundColor: '#7B3F1D' }} />
          </View>
        )}
      </View>
    </View>
  );
}
