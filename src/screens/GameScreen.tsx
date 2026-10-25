import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CITIES } from '../game/cities';
import { GameEvent, GameMode, GameState, Input, ROAD_HALF, city, createGame, progress, start, step } from '../game/engine';
import { GLView } from 'expo-gl';
import { GameRenderer } from '../game/three/scene';
import { Bottle } from '../game/sprites';
import { colors } from '../theme';

export type RunResult = { mode: GameMode; cityIndex: number; cleared: boolean; score: number; cans: number; distance: number };

type Props = { mode: GameMode; cityIndex: number; onExit: () => void; onFinish: (r: RunResult) => void };

type Popup = { id: number; text: string; color: string; big?: boolean; born: number };

const SWIPE = 32;

const buzz = (kind: 'light' | 'heavy' | 'success') => {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export function GameScreen({ mode, cityIndex, onExit, onFinish }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const gfx = useRef<GameRenderer | null>(null);
  const game = useRef<GameState>(createGame(mode, cityIndex));
  const input = useRef<Input>({ steer: 0, jump: false, slide: false });
  const keys = useRef({ left: false, right: false });
  const [, render] = useReducer((n: number) => n + 1, 0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const popups = useRef<Popup[]>([]);
  const popupId = useRef(0);
  const finished = useRef(false);
  const banner = useRef(new Animated.Value(0)).current;
  const [bannerText, setBannerText] = useState(`${CITIES[cityIndex].name}`);

  pausedRef.current = paused;
  // Exposed on web only, so automated playtests can jump around a stage.
  if (Platform.OS === 'web') (globalThis as { __charbaGame?: GameState }).__charbaGame = game.current;

  const showBanner = (text: string) => {
    setBannerText(text);
    banner.setValue(0);
    Animated.sequence([
      Animated.spring(banner, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.delay(1100),
      Animated.timing(banner, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  const pop = (text: string, color: string, big = false) => {
    popups.current.push({ id: popupId.current++, text, color, big, born: game.current.time });
  };

  const handleEvent = (e: GameEvent) => {
    const s = game.current;
    switch (e.type) {
      case 'can':
        pop('+1', colors.gold);
        buzz('light');
        break;
      case 'hit':
        pop('OUCH!', colors.danger, true);
        buzz('heavy');
        break;
      case 'life':
        pop('1UP!', colors.mint, true);
        buzz('success');
        break;
      case 'lifeLost':
        showBanner(s.phase === 'chase' ? 'CRUSHED! TRY AGAIN' : 'BACK TO CHECKPOINT');
        buzz('heavy');
        break;
      case 'checkpoint':
        pop('CHECKPOINT!', colors.white, true);
        buzz('success');
        break;
      case 'skate':
        pop('SKATEBOARD!', colors.gold, true);
        buzz('success');
        break;
      case 'tajine':
        pop('TAJINE HEAD! CONTROLS FLIPPED', colors.danger, true);
        buzz('heavy');
        break;
      case 'chase':
        showBanner('RUN! THE GIANT CHARBA!');
        buzz('heavy');
        break;
      case 'city':
        showBanner(city(s).name.toUpperCase());
        break;
      case 'clear':
      case 'over':
        buzz(e.type === 'clear' ? 'success' : 'heavy');
        break;
    }
  };

  useEffect(() => {
    showBanner(mode === 'endless' ? 'ENDLESS RUN' : CITIES[cityIndex].name.toUpperCase());
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const s = game.current;
      if (!pausedRef.current) {
        const kb = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
        input.current.steer += kb * 7 * dt;
        step(s, dt, input.current);
        input.current = { steer: 0, jump: false, slide: false };
        for (const e of s.events) handleEvent(e);
        s.events.length = 0;
        popups.current = popups.current.filter((p) => s.time - p.born < 0.9);
        if ((s.phase === 'clear' || s.phase === 'over') && !finished.current) {
          finished.current = true;
          if (s.phase === 'clear') showBanner('STAGE CLEAR!');
          setTimeout(
            () => onFinish({ mode, cityIndex, cleared: s.phase === 'clear', score: s.score, cans: s.cans, distance: Math.floor(s.z) }),
            1500,
          );
        }
      }
      gfx.current?.render(s);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard controls for web testing.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = true;
      if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') {
        start(game.current);
        input.current.jump = true;
      }
      if (e.key === 'ArrowDown' || e.key === 's') input.current.slide = true;
      if (e.key === 'Escape' || e.key === 'p') setPaused((p) => !p);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Touch: drag sideways to steer freely, swipe up to jump, swipe down to slide, tap to jump.
  const gesture = useRef({ lastX: 0, startY: 0, startT: 0, fired: false, moved: 0 });
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (_, g) => {
          gesture.current = { lastX: g.x0, startY: g.y0, startT: Date.now(), fired: false, moved: 0 };
          start(game.current);
        },
        onPanResponderMove: (_, g) => {
          const gs = gesture.current;
          const dx = g.moveX - gs.lastX;
          gs.lastX = g.moveX;
          gs.moved += Math.abs(dx);
          input.current.steer += (dx / (W * 0.42)) * ROAD_HALF;
          const dy = g.moveY - gs.startY;
          if (!gs.fired && Math.abs(dy) > SWIPE && Math.abs(g.dy) > Math.abs(g.dx) * 0.9) {
            gs.fired = true;
            if (dy < 0) input.current.jump = true;
            else input.current.slide = true;
          }
        },
        onPanResponderRelease: (_, g) => {
          const gs = gesture.current;
          if (!gs.fired && gs.moved < 10 && Math.abs(g.dy) < 10 && Date.now() - gs.startT < 250) {
            input.current.jump = true;
          }
        },
      }),
    [W],
  );

  const s = game.current;
  const c = city(s);
  const bannerStyle = {
    opacity: banner,
    transform: [{ scale: banner.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
  };

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <GLView
        style={styles.gl}
        onContextCreate={(gl) => {
          gfx.current = new GameRenderer(gl as unknown as WebGLRenderingContext, W, H, () => gl.endFrameEXP());
          if (Platform.OS === 'web') (globalThis as { __charbaGfx?: GameRenderer }).__charbaGfx = gfx.current;
        }}
      />

      {/* HUD */}
      <View style={styles.hud} pointerEvents="box-none">
        <View style={styles.hudRow} pointerEvents="box-none">
          <View style={styles.pill}>
            <Bottle m={34} />
            <Text style={styles.pillText}>{s.cans}</Text>
          </View>
          <View style={[styles.pill, { gap: 4 }]}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.pip, { backgroundColor: i < s.health ? colors.orange : 'rgba(255,255,255,0.25)' }]} />
            ))}
            <Text style={[styles.pillText, { marginLeft: 6 }]}>×{s.lives}</Text>
          </View>
          <Pressable onPress={() => setPaused(true)} style={styles.pause} hitSlop={12}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </Pressable>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{s.score.toLocaleString()}</Text>
          <Text style={styles.cityName}>{c.name}</Text>
        </View>
        {mode === 'stage' && (
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${progress(s) * 100}%` }]} />
            <View style={[styles.chaseMark, { left: `${(CITIES[cityIndex].length / (CITIES[cityIndex].length + CITIES[cityIndex].chaseLength)) * 100}%` }]} />
          </View>
        )}
        {s.tajine > 0 && <Text style={styles.status}>🔄 Controls flipped {Math.ceil(s.tajine)}s</Text>}
        {s.skate > 0 && <Text style={styles.status}>🛹 Skateboard {Math.ceil(s.skate)}s</Text>}
      </View>

      {popups.current.map((p) => {
        const age = s.time - p.born;
        return (
          <Text
            key={p.id}
            pointerEvents="none"
            style={[
              styles.popup,
              p.big && styles.popupBig,
              { color: p.color, top: H * (p.big ? 0.3 : 0.55) - age * 70, opacity: 1 - age / 0.9, transform: [{ scale: 1 + Math.min(age * 4, 0.3) }] },
            ]}
          >
            {p.text}
          </Text>
        );
      })}

      <Animated.View pointerEvents="none" style={[styles.banner, bannerStyle]}>
        <Text style={styles.bannerText}>{bannerText}</Text>
      </Animated.View>

      {s.phase === 'ready' && (
        <View style={styles.ready} pointerEvents="none">
          <Text style={styles.readyTitle}>Tap to run!</Text>
          <Text style={styles.readyHint}>Drag ← → to steer · Swipe ↑ jump · Swipe ↓ slide</Text>
        </View>
      )}

      {paused && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Paused</Text>
          <Pressable style={styles.btn} onPress={() => setPaused(false)}>
            <Text style={styles.btnText}>Resume</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onExit}>
            <Text style={[styles.btnText, { color: colors.white }]}>Quit to menu</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.45)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.ink, overflow: 'hidden' },
  gl: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: 50, paddingHorizontal: 16 },
  hudRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(43,19,0,0.55)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6, gap: 8 },
  pillText: { color: colors.white, fontWeight: '900', fontSize: 18 },
  pip: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.white },
  pause: { marginLeft: 'auto', width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(43,19,0,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  pauseBar: { width: 5, height: 16, borderRadius: 2, backgroundColor: colors.white },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 },
  score: { color: colors.white, fontWeight: '900', fontSize: 30, ...shadow },
  cityName: { color: colors.white, fontWeight: '800', fontSize: 15, ...shadow },
  progress: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)', marginTop: 6, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.orange },
  chaseMark: { position: 'absolute', top: 0, width: 3, height: 8, backgroundColor: colors.danger },
  status: { marginTop: 8, alignSelf: 'flex-start', color: colors.white, fontWeight: '800', backgroundColor: 'rgba(43,19,0,0.55)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden' },
  popup: { position: 'absolute', alignSelf: 'center', fontWeight: '900', fontSize: 26, ...shadow },
  popupBig: { fontSize: 30 },
  banner: { position: 'absolute', top: '22%', alignSelf: 'center', backgroundColor: colors.orange, paddingHorizontal: 22, paddingVertical: 10, borderRadius: 16, borderWidth: 3, borderColor: colors.gold },
  bannerText: { color: colors.white, fontWeight: '900', fontSize: 24, letterSpacing: 1 },
  ready: { position: 'absolute', bottom: '6%', left: 16, right: 16, alignItems: 'center' },
  readyTitle: { color: colors.white, fontWeight: '900', fontSize: 34, ...shadow },
  readyHint: { color: colors.white, fontWeight: '700', fontSize: 14, marginTop: 6, textAlign: 'center', ...shadow },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43,19,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 },
  overlayTitle: { color: colors.white, fontWeight: '900', fontSize: 40, marginBottom: 10 },
  btn: { backgroundColor: colors.orange, paddingVertical: 14, borderRadius: 16, minWidth: 220, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: colors.orangeDeep },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.white, borderBottomWidth: 2 },
  btnText: { color: colors.white, fontWeight: '900', fontSize: 18 },
});
