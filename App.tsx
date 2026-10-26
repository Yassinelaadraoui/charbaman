import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, View } from 'react-native';
import * as StoreReview from 'expo-store-review';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CITIES } from './src/game/cities';
import { GameScreen, RunResult } from './src/screens/GameScreen';
import { TitleScreen } from './src/screens/TitleScreen';
import { CitySelect } from './src/screens/CitySelect';
import { ResultScreen, modeKey } from './src/screens/ResultScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { HowToScreen } from './src/screens/HowToScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { SaveData, Settings, loadSave, recordLocal, resetProgress, writeSave } from './src/services/storage';
import { setHaptics, setMuted } from './src/services/sound';
import { playMusic, setMusicEnabled, suspendMusic } from './src/services/music';
import { setLang } from './src/i18n';
import { colors } from './src/theme';

type Route =
  | { name: 'title' }
  | { name: 'cities' }
  | { name: 'howto' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'leaderboard'; tab?: string }
  | { name: 'game'; mode: 'stage' | 'endless'; cityIndex: number; run: number }
  | { name: 'result'; result: RunResult; isBest: boolean; at: number };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'title' });
  const [save, setSave] = useState<SaveData | null>(null);

  const routeRef = useRef(route);
  routeRef.current = route;

  useEffect(() => {
    loadSave().then(setSave);
  }, []);

  // Settings take effect everywhere (t(), sounds, vibration, music) before the screens render.
  const applySettings = (st: Settings) => {
    setLang(st.lang);
    setMuted(!st.sound);
    setHaptics(st.haptics);
    setMusicEnabled(st.music);
  };
  if (save) applySettings(save.settings);

  // The menu theme plays everywhere but in a run, which starts its own.
  useEffect(() => {
    if (save) playMusic(route.name === 'game' ? 'run' : 'menu');
  }, [route.name, save]);

  // No music while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => suspendMusic(st !== 'active'));
    return () => sub.remove();
  }, []);

  // Android back button: back to the previous screen; the game screen pauses itself; the title exits.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const r = routeRef.current;
      if (r.name === 'title') return false;
      if (r.name === 'game') return true;
      setRoute(r.name === 'about' ? { name: 'settings' } : { name: 'title' });
      return true;
    });
    return () => sub.remove();
  }, []);

  const update = (next: SaveData) => {
    setSave(next);
    writeSave(next);
  };

  if (!save) return <View style={{ flex: 1, backgroundColor: colors.orange }} />;

  const play = (mode: 'stage' | 'endless', cityIndex = 0) => setRoute({ name: 'game', mode, cityIndex, run: Date.now() });

  const finish = (result: RunResult) => {
    const key = modeKey(result);
    const isBest = result.score > (save.best[key] ?? 0);
    const at = Date.now();
    let next = recordLocal(save, key, { name: save.name || 'Charbaman', score: result.score, cans: result.cans, at });
    if (result.cleared && result.mode === 'stage') {
      next = { ...next, unlocked: Math.max(next.unlocked, Math.min(CITIES.length, result.cityIndex + 2)) };
    }
    // Ask for a rating once, after a second city is cleared: the player has seen enough to judge, and is happy.
    if (result.cleared && result.mode === 'stage' && next.unlocked >= 3 && !next.reviewAsked && Platform.OS !== 'web') {
      next = { ...next, reviewAsked: true };
      setTimeout(() => {
        StoreReview.isAvailableAsync()
          .then((ok) => (ok ? StoreReview.requestReview() : undefined))
          .catch(() => {});
      }, 2500);
    }
    update(next);
    setRoute({ name: 'result', result, isBest, at });
  };

  let screen: React.ReactNode;
  switch (route.name) {
    case 'title':
      screen = (
        <TitleScreen
          best={save.best.endless ?? 0}
          onStory={() => setRoute({ name: 'cities' })}
          onEndless={() => play('endless')}
          onLeaderboard={() => setRoute({ name: 'leaderboard' })}
          onHowTo={() => setRoute({ name: 'howto' })}
          onSettings={() => setRoute({ name: 'settings' })}
        />
      );
      break;
    case 'cities':
      screen = <CitySelect unlocked={save.unlocked} best={save.best} onPick={(i) => play('stage', i)} onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'howto':
      screen = <HowToScreen onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'settings':
      screen = (
        <SettingsScreen
          settings={save.settings}
          onChange={(st) => update({ ...save, settings: st })}
          onReset={() => update(resetProgress(save))}
          onAbout={() => setRoute({ name: 'about' })}
          onBack={() => setRoute({ name: 'title' })}
        />
      );
      break;
    case 'about':
      screen = <AboutScreen onBack={() => setRoute({ name: 'settings' })} />;
      break;
    case 'leaderboard':
      screen = <LeaderboardScreen local={save.local} initial={route.tab} onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'game':
      screen = (
        <GameScreen
          key={route.run}
          mode={route.mode}
          cityIndex={route.cityIndex}
          lite={save.settings.graphics === 'low'}
          onExit={() => setRoute({ name: 'title' })}
          onFinish={finish}
        />
      );
      break;
    case 'result': {
      const r = route.result;
      const hasNext = r.mode === 'stage' && r.cleared && r.cityIndex + 1 < CITIES.length;
      screen = (
        <ResultScreen
          result={r}
          name={save.name}
          isBest={route.isBest}
          onSaveName={(name) => {
            // Remember the name, and put it on this run's entry in the phone's leaderboard too.
            const key = modeKey(r);
            const list = (save.local[key] ?? []).map((e) => (e.at === route.at ? { ...e, name } : e));
            update({ ...save, name, local: { ...save.local, [key]: list } });
          }}
          onRetry={() => play(r.mode, r.cityIndex)}
          onNext={hasNext ? () => play('stage', r.cityIndex + 1) : undefined}
          onMenu={() => setRoute({ name: 'title' })}
          onLeaderboard={() => setRoute({ name: 'leaderboard', tab: modeKey(r) })}
        />
      );
      break;
    }
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.orange }}>
        <StatusBar style="light" hidden={route.name === 'game'} />
        <ErrorBoundary key={save.settings.lang} onReset={() => setRoute({ name: 'title' })}>
          {screen}
        </ErrorBoundary>
      </View>
    </SafeAreaProvider>
  );
}
