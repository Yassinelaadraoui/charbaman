import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CITIES } from '../game/cities';
import { GameEvent, GameMode, GameState, Input, ROAD_HALF, city, createGame, progress, start, step } from '../game/engine';
import { GLView } from 'expo-gl';
import { GameRenderer } from '../game/three/scene';
import { Bottle } from '../game/sprites';
import { colors } from '../theme';
import { hapticsOn, initSounds, play } from '../services/sound';
import { setMusicTempo } from '../services/music';
import { cityName, fmt, t } from '../i18n';

export type RunResult = { mode: GameMode; cityIndex: number; cleared: boolean; score: number; cans: number; distance: number };

type Props = { mode: GameMode; cityIndex: number; lite?: boolean; onExit: () => void; onFinish: (r: RunResult) => void };

type Popup = { id: number; text: string; color: string; big?: boolean; born: number };

const SWIPE = 32;

const buzz = (kind: 'light' | 'heavy' | 'success') => {
  if (Platform.OS === 'web' || !hapticsOn()) return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else Haptics.impactAsync(kind === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export function GameScreen({ mode, cityIndex, lite = false, onExit, onFinish }: Props) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const [bannerText, setBannerText] = useState(cityName(CITIES[cityIndex]));

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
        play('bottle');
        gfx.current?.burst('bottle', e.x ?? s.x, 1, e.z ?? s.z);
        pop('+1', colors.gold);
        buzz('light');
        break;
      case 'cash':
        play('cash');
        gfx.current?.burst('cash', e.x ?? s.x, 1, e.z ?? s.z);
        pop('+200 DH', colors.mint, true);
        buzz('success');
        break;
      case 'hit':
        play('hit');
        gfx.current?.burst('hit', s.x, 0.9, s.z + 0.8);
        pop(t('pop.ouch'), colors.danger, true);
        buzz('heavy');
        break;
      case 'life':
        play('life');
        pop(t('pop.life'), colors.mint, true);
        buzz('success');
        break;
      case 'lifeLost':
        showBanner(s.phase === 'chase' ? t('banner.crushed') : t('banner.checkpoint'));
        buzz('heavy');
        break;
      case 'checkpoint':
        play('checkpoint');
        pop(t('pop.checkpoint'), colors.white, true);
        buzz('success');
        break;
      case 'skate':
        play('skate');
        gfx.current?.burst('skate', s.x, 0.4, s.z);
        pop(t('pop.skate'), colors.gold, true);
        buzz('success');
        break;
      case 'tajine':
        play('tajine');
        pop(t('pop.tajine'), colors.danger, true);
        buzz('heavy');
        break;
      case 'chase':
        play('chase');
        showBanner(t('banner.chase'));
        buzz('heavy');
        break;
      case 'city':
        showBanner(cityName(city(s)).toUpperCase());
        break;
      case 'clear':
      case 'over':
        play(e.type);
        buzz(e.type === 'clear' ? 'success' : 'heavy');
        break;
    }
  };

  useEffect(() => {
    showBanner(mode === 'endless' ? t('banner.endless') : cityName(CITIES[cityIndex]).toUpperCase());
    initSounds();
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      const dt = last ? (ts - last) / 1000 : 0;
      last = ts;
      const s = game.current;
      if (!pausedRef.current) {
        const kb = (keys.current.right ? 1 : 0) - (keys.current.left ? 1 : 0);
        input.current.steer += kb * 7 * dt;
        const wasAir = s.y > 0.05;
        const wasSlide = s.slide > 0;
        const stride = Math.floor(s.runPhase / Math.PI);
        step(s, dt, input.current);
        // Movement sounds come from state changes rather than engine events.
        const air = s.y > 0.05;
        if (!wasAir && air) play('jump');
        if (wasAir && !air) {
          play('land');
          gfx.current?.burst('land', s.x, 0.05, s.z);
        }
        if (!wasSlide && s.slide > 0) play('slide');
        const nextStride = Math.floor(s.runPhase / Math.PI);
        if (!air && s.slide <= 0 && s.skate <= 0 && nextStride !== stride && (s.phase === 'run' || s.phase === 'chase')) {
          play(nextStride % 2 ? 'step1' : 'step2');
        }
        input.current = { steer: 0, jump: false, slide: false };
        for (const e of s.events) handleEvent(e);
        s.events.length = 0;
        popups.current = popups.current.filter((p) => s.time - p.born < 0.9);
        if ((s.phase === 'clear' || s.phase === 'over') && !finished.current) {
          finished.current = true;
          if (s.phase === 'clear') showBanner(t('banner.clear'));
          setTimeout(
            () => onFinish({ mode, cityIndex, cleared: s.phase === 'clear', score: s.score, cans: s.cans, distance: Math.floor(s.z) }),
            1500,
          );
        }
      }
      setMusicTempo(s.phase === 'chase' ? 1.12 : 1);
      gfx.current?.render(s);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      setMusicTempo(1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No screen dimming mid-run (phones only: browsers may refuse the wake lock, and that is fine).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    activateKeepAwakeAsync('run').catch(() => {});
    return () => {
      deactivateKeepAwake('run').catch(() => {});
    };
  }, []);

  // Pause when the phone takes the app away (a call, the home button) and on Android's back button.
  useEffect(() => {
    const running = () => game.current.phase === 'run' || game.current.phase === 'chase';
    const app = AppState.addEventListener('change', (st) => {
      if (st !== 'active' && running()) setPaused(true);
    });
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (running()) setPaused((p) => !p);
      else onExit();
      return true;
    });
    return () => {
      app.remove();
      back.remove();
    };
  }, [onExit]);

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
          gfx.current.lite = lite;
          if (Platform.OS === 'web') (globalThis as { __charbaGfx?: GameRenderer }).__charbaGfx = gfx.current;
        }}
      />

      {/* HUD */}
      <View style={[styles.hud, { paddingTop: Math.max(insets.top + 8, 24) }]} pointerEvents="box-none">
        <View style={styles.hudRow} pointerEvents="box-none">
          <View style={styles.pill}>
            <Bottle m={34} />
            <Text style={styles.pillText}>{fmt(s.cans)}</Text>
          </View>
          <View style={[styles.pill, { gap: 4 }]}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={[styles.pip, { backgroundColor: i < s.health ? colors.orange : 'rgba(255,255,255,0.25)' }]} />
            ))}
            <Text style={[styles.pillText, { marginLeft: 6 }]}>×{s.lives}</Text>
          </View>
          <Pressable onPress={() => setPaused(true)} style={styles.pause} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('paused')}>
            <View style={styles.pauseBar} />
            <View style={styles.pauseBar} />
          </Pressable>
        </View>
        <View style={styles.scoreRow}>
          <Text style={styles.score}>{fmt(s.score)}</Text>
          <Text style={styles.cityName}>{cityName(c)}</Text>
        </View>
        {mode === 'stage' && (
          <View style={styles.progress}>
            <View style={[styles.progressFill, { width: `${progress(s) * 100}%` }]} />
            <View style={[styles.chaseMark, { left: `${(CITIES[cityIndex].length / (CITIES[cityIndex].length + CITIES[cityIndex].chaseLength)) * 100}%` }]} />
          </View>
        )}
        {s.tajine > 0 && <Text style={styles.status}>{t('status.tajine', { n: Math.ceil(s.tajine) })}</Text>}
        {s.skate > 0 && <Text style={styles.status}>{t('status.skate', { n: Math.ceil(s.skate) })}</Text>}
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
        <View style={[styles.ready, { bottom: insets.bottom + 40 }]} pointerEvents="none">
          <Text style={styles.readyTitle}>{t('tapToRun')}</Text>
          <Text style={styles.readyHint}>{t('controlsHint')}</Text>
        </View>
      )}

      {paused && (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>{t('paused')}</Text>
          <Pressable style={styles.btn} onPress={() => setPaused(false)} accessibilityRole="button">
            <Text style={styles.btnText}>{t('resume')}</Text>
          </Pressable>
          <Pressable style={[styles.btn, styles.btnGhost]} onPress={onExit} accessibilityRole="button">
            <Text style={[styles.btnText, { color: colors.white }]}>{t('quit')}</Text>
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
  hud: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16 },
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
  ready: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  readyTitle: { color: colors.white, fontWeight: '900', fontSize: 34, ...shadow },
  readyHint: { color: colors.white, fontWeight: '700', fontSize: 14, marginTop: 6, textAlign: 'center', ...shadow },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(43,19,0,0.75)', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 },
  overlayTitle: { color: colors.white, fontWeight: '900', fontSize: 40, marginBottom: 10 },
  btn: { backgroundColor: colors.orange, paddingVertical: 14, borderRadius: 16, minWidth: 220, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: colors.orangeDeep },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 2, borderColor: colors.white, borderBottomWidth: 2 },
  btnText: { color: colors.white, fontWeight: '900', fontSize: 18 },
});
