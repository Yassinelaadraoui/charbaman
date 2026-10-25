import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CITIES } from './src/game/cities';
import { GameScreen, RunResult } from './src/screens/GameScreen';
import { TitleScreen } from './src/screens/TitleScreen';
import { CitySelect } from './src/screens/CitySelect';
import { ResultScreen, modeKey } from './src/screens/ResultScreen';
import { LeaderboardScreen } from './src/screens/LeaderboardScreen';
import { HowToScreen } from './src/screens/HowToScreen';
import { SaveData, loadSave, recordLocal, writeSave } from './src/services/storage';
import { colors } from './src/theme';

type Route =
  | { name: 'title' }
  | { name: 'cities' }
  | { name: 'howto' }
  | { name: 'leaderboard'; tab?: string }
  | { name: 'game'; mode: 'stage' | 'endless'; cityIndex: number; run: number }
  | { name: 'result'; result: RunResult; isBest: boolean };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'title' });
  const [save, setSave] = useState<SaveData | null>(null);

  useEffect(() => {
    loadSave().then(setSave);
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
    let next = recordLocal(save, key, { name: save.name || 'Charbaman', score: result.score, cans: result.cans, at: Date.now() });
    if (result.cleared && result.mode === 'stage') {
      next = { ...next, unlocked: Math.max(next.unlocked, Math.min(CITIES.length, result.cityIndex + 2)) };
    }
    update(next);
    setRoute({ name: 'result', result, isBest });
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
        />
      );
      break;
    case 'cities':
      screen = <CitySelect unlocked={save.unlocked} best={save.best} onPick={(i) => play('stage', i)} onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'howto':
      screen = <HowToScreen onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'leaderboard':
      screen = <LeaderboardScreen local={save.local} initial={route.tab} onBack={() => setRoute({ name: 'title' })} />;
      break;
    case 'game':
      screen = <GameScreen key={route.run} mode={route.mode} cityIndex={route.cityIndex} onExit={() => setRoute({ name: 'title' })} onFinish={finish} />;
      break;
    case 'result': {
      const r = route.result;
      const hasNext = r.mode === 'stage' && r.cleared && r.cityIndex + 1 < CITIES.length;
      screen = (
        <ResultScreen
          result={r}
          name={save.name}
          isBest={route.isBest}
          onSaveName={(name) => update({ ...save, name })}
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
    <View style={{ flex: 1, backgroundColor: colors.orange }}>
      <StatusBar style="light" hidden={route.name === 'game'} />
      {screen}
    </View>
  );
}
