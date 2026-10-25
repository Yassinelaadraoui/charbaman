import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CITIES } from '../game/cities';
import { BackButton, Screen } from '../components/ui';
import { colors } from '../theme';

type Props = { unlocked: number; best: Record<string, number>; onPick: (i: number) => void; onBack: () => void };

export function CitySelect({ unlocked, best, onPick, onBack }: Props) {
  const anims = useRef(CITIES.map(() => new Animated.Value(0))).current;
  useEffect(() => {
    Animated.stagger(90, anims.map((a) => Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 7 }))).start();
  }, [anims]);

  return (
    <LinearGradient colors={[colors.orangeDeep, '#7A2E00']} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>Choose your city</Text>
        <Text style={styles.subtitle}>Clear a city to unlock the next. Every city ends with the giant Charba chase.</Text>
        <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 30 }}>
          {CITIES.map((c, i) => {
            const locked = i >= unlocked;
            const a = anims[i];
            return (
              <Animated.View key={c.id} style={{ opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) }] }}>
                <Pressable disabled={locked} onPress={() => onPick(i)}>
                  <LinearGradient colors={[c.skyTop, c.skyBottom]} style={[styles.card, locked && { opacity: 0.55 }]}>
                    <View style={styles.cardSkyline}>
                      {[0.5, 0.8, 0.35, 0.95, 0.6, 0.4, 0.7].map((h, k) => (
                        <View key={k} style={{ flex: 1, height: `${h * 100}%`, backgroundColor: k === 3 ? c.accent : c.far, marginHorizontal: 1 }} />
                      ))}
                    </View>
                    <View style={[styles.road, { backgroundColor: c.road[0] }]} />
                    <View style={styles.cardBody}>
                      <Text style={styles.stage}>STAGE {i + 1}</Text>
                      <Text style={styles.cityName}>{c.name}</Text>
                      <Text style={styles.arabic}>{c.arabic}</Text>
                      <Text style={styles.tagline}>{locked ? '🔒 Clear the previous city' : c.tagline}</Text>
                    </View>
                    {!!best[c.id] && <Text style={styles.best}>Best {best[c.id].toLocaleString()}</Text>}
                  </LinearGradient>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.4)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 };

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', marginTop: 8 },
  subtitle: { color: colors.cream, fontSize: 14, fontWeight: '600', marginBottom: 16, marginTop: 4 },
  card: { height: 150, borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)' },
  cardSkyline: { position: 'absolute', right: 0, bottom: 26, width: '55%', height: 70, flexDirection: 'row', alignItems: 'flex-end' },
  road: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 26 },
  cardBody: { padding: 14 },
  stage: { color: colors.white, fontWeight: '900', fontSize: 12, letterSpacing: 2, ...shadow },
  cityName: { color: colors.white, fontWeight: '900', fontSize: 30, ...shadow },
  arabic: { color: colors.white, fontWeight: '700', fontSize: 16, ...shadow },
  tagline: { color: colors.white, fontWeight: '700', fontSize: 13, marginTop: 4, maxWidth: '60%', ...shadow },
  best: { position: 'absolute', right: 10, top: 10, color: colors.ink, backgroundColor: colors.gold, fontWeight: '900', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
});
