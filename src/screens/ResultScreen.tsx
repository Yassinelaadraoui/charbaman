import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CITIES } from '../game/cities';
import type { RunResult } from './GameScreen';
import { Button, Screen } from '../components/ui';
import { CharbaSprite } from '../components/CharbaSprite';
import { colors } from '../theme';
import { firebaseEnabled, submitScore } from '../services/firebase';

type Props = {
  result: RunResult;
  name: string;
  isBest: boolean;
  onSaveName: (name: string) => void;
  onRetry: () => void;
  onNext?: () => void;
  onMenu: () => void;
  onLeaderboard: () => void;
};

export const modeKey = (r: { mode: string; cityIndex: number }) => (r.mode === 'endless' ? 'endless' : CITIES[r.cityIndex].id);

export function ResultScreen({ result, name, isBest, onSaveName, onRetry, onNext, onMenu, onLeaderboard }: Props) {
  const [draft, setDraft] = useState(name);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const count = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  const pop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
    const id = count.addListener(({ value }) => setShown(Math.round(value)));
    Animated.timing(count, { toValue: result.score, duration: 1200, useNativeDriver: false }).start();
    return () => count.removeListener(id);
  }, [count, pop, result.score]);

  const submit = async () => {
    const clean = draft.trim().slice(0, 16) || 'Charbaman';
    onSaveName(clean);
    setStatus('sending');
    const ok = await submitScore(modeKey(result), { name: clean, score: result.score, cans: result.cans, at: Date.now() });
    setStatus(ok ? 'sent' : 'failed');
  };

  const title = result.cleared ? 'City cleared!' : result.mode === 'endless' ? 'Run over' : 'Game over';
  const where = result.mode === 'endless' ? 'Endless run' : CITIES[result.cityIndex].name;

  return (
    <LinearGradient colors={result.cleared ? [colors.orange, colors.orangeDeep] : ['#7A2E00', colors.ink]} style={{ flex: 1 }}>
      <Screen style={styles.center}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: pop }] }}>
          {result.cleared && <CharbaSprite height={130} />}
          <Text style={styles.where}>{where}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.score}>{shown.toLocaleString()}</Text>
          {isBest && <Text style={styles.best}>★ New best ★</Text>}
        </Animated.View>

        <View style={styles.stats}>
          <Stat label="Charba bottles" value={result.cans} />
          <Stat label="Metres" value={result.distance} />
        </View>

        <View style={styles.submit}>
          <Text style={styles.label}>Your name for the leaderboard</Text>
          <TextInput value={draft} onChangeText={setDraft} placeholder="Charbaman" placeholderTextColor="#B88A66" maxLength={16} style={styles.input} editable={status === 'idle' || status === 'failed'} />
          {status === 'sent' ? (
            <Text style={styles.ok}>Score posted! 🎉</Text>
          ) : (
            <Button label={status === 'sending' ? 'Posting…' : firebaseEnabled ? 'Post score' : 'Save score'} onPress={submit} disabled={status === 'sending'} variant="light" />
          )}
          {status === 'failed' && <Text style={styles.warn}>{firebaseEnabled ? 'Could not reach the leaderboard. Saved on this phone.' : 'Saved on this phone (online leaderboard not set up yet).'}</Text>}
        </View>

        <View style={styles.actions}>
          {onNext && <Button label="Next city ›" onPress={onNext} />}
          <Button label="Try again" onPress={onRetry} variant={onNext ? 'ghost' : 'primary'} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Scores" variant="ghost" onPress={onLeaderboard} style={{ minWidth: 115 }} />
            <Button label="Menu" variant="ghost" onPress={onMenu} style={{ minWidth: 115 }} />
          </View>
        </View>
      </Screen>
    </LinearGradient>
  );
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value.toLocaleString()}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'space-evenly' },
  where: { color: colors.cream, fontWeight: '800', fontSize: 16, letterSpacing: 1 },
  title: { color: colors.white, fontWeight: '900', fontSize: 38 },
  score: { color: colors.gold, fontWeight: '900', fontSize: 56 },
  best: { color: colors.white, fontWeight: '900', fontSize: 16 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 18, alignItems: 'center' },
  statValue: { color: colors.white, fontWeight: '900', fontSize: 22 },
  statLabel: { color: colors.cream, fontWeight: '700', fontSize: 12 },
  submit: { alignItems: 'center', gap: 8, width: '100%' },
  label: { color: colors.cream, fontWeight: '700' },
  input: { backgroundColor: colors.cream, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, fontSize: 18, fontWeight: '800', color: colors.ink, width: 240, textAlign: 'center' },
  ok: { color: colors.white, fontWeight: '900', fontSize: 16 },
  warn: { color: colors.cream, fontSize: 12, textAlign: 'center', maxWidth: 280 },
  actions: { alignItems: 'center', gap: 10 },
});
