import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CITIES } from '../game/cities';
import { BackButton, Screen } from '../components/ui';
import { colors } from '../theme';
import { fetchTop, firebaseEnabled } from '../services/firebase';
import type { ScoreEntry } from '../services/storage';

type Props = { local: Record<string, ScoreEntry[]>; onBack: () => void; initial?: string };

const TABS = [{ id: 'endless', name: 'Endless' }, ...CITIES.map((c) => ({ id: c.id, name: c.name }))];

export function LeaderboardScreen({ local, onBack, initial = 'endless' }: Props) {
  const [tab, setTab] = useState(initial);
  const [rows, setRows] = useState<ScoreEntry[] | null>(null);
  const [online, setOnline] = useState(firebaseEnabled);

  useEffect(() => {
    let alive = true;
    setRows(null);
    fetchTop(tab).then((r) => {
      if (!alive) return;
      setOnline(r !== null);
      setRows(r ?? local[tab] ?? []);
    });
    return () => {
      alive = false;
    };
  }, [tab, local]);

  return (
    <LinearGradient colors={[colors.orangeDeep, '#5A2200']} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Leaderboard</Text>
        <Text style={styles.sub}>{online ? 'Worldwide scores' : 'Scores on this phone'}</Text>
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 12 }}>
            {TABS.map((t) => (
              <Pressable key={t.id} onPress={() => setTab(t.id)} style={[styles.tab, tab === t.id && styles.tabOn]}>
                <Text style={[styles.tabText, tab === t.id && { color: colors.orangeDeep }]}>{t.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        {rows === null ? (
          <ActivityIndicator color={colors.white} style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <Text style={styles.empty}>No scores yet. Be the first!</Text>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(_, i) => String(i)}
            contentContainerStyle={{ gap: 8, paddingBottom: 30 }}
            renderItem={({ item, index }) => (
              <View style={[styles.row, index < 3 && styles.podium]}>
                <Text style={styles.rank}>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}</Text>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.cans}>🍊 {item.cans}</Text>
                <Text style={styles.score}>{item.score.toLocaleString()}</Text>
              </View>
            )}
          />
        )}
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', marginTop: 8 },
  sub: { color: colors.cream, fontWeight: '700' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  tabOn: { backgroundColor: colors.cream, borderColor: colors.cream },
  tabText: { color: colors.white, fontWeight: '800' },
  empty: { color: colors.cream, textAlign: 'center', marginTop: 40, fontWeight: '700', fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, gap: 10 },
  podium: { backgroundColor: 'rgba(255,210,63,0.25)' },
  rank: { color: colors.white, fontWeight: '900', width: 30, fontSize: 18, textAlign: 'center' },
  name: { color: colors.white, fontWeight: '800', fontSize: 16, flex: 1 },
  cans: { color: colors.cream, fontWeight: '700' },
  score: { color: colors.gold, fontWeight: '900', fontSize: 18, minWidth: 70, textAlign: 'right' },
});
