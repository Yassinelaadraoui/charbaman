import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CharbaSprite } from '../components/CharbaSprite';
import { Bottle } from '../game/sprites';
import { Button } from '../components/ui';
import { colors } from '../theme';

type Props = { onStory: () => void; onEndless: () => void; onLeaderboard: () => void; onHowTo: () => void; best: number };

export function TitleScreen({ onStory, onEndless, onLeaderboard, onHowTo, best }: Props) {
  const [phase, setPhase] = useState(0);
  const bounce = useRef(new Animated.Value(0)).current;
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let raf = 0;
    const tick = (t: number) => {
      setPhase(t / 110);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    Animated.spring(intro, { toValue: 1, useNativeDriver: true, friction: 5, tension: 40 }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounce, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    ).start();
    return () => cancelAnimationFrame(raf);
  }, [bounce, intro]);

  const logoStyle = {
    transform: [
      { translateY: bounce.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
      { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
      { rotate: intro.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '-4deg'] }) },
    ],
    opacity: intro,
  };

  return (
    <LinearGradient colors={['#FF9E2C', colors.orange, colors.orangeDeep]} style={styles.root}>
      {/* Sun rays */}
      <View style={styles.rays} pointerEvents="none">
        {Array.from({ length: 12 }).map((_, i) => (
          <View key={i} style={[styles.ray, { transform: [{ rotate: `${i * 30 + phase * 1.5}deg` }] }]} />
        ))}
      </View>

      <Animated.View style={[styles.logoWrap, logoStyle]}>
        <Text style={styles.logoShadow}>CHARBAMAN</Text>
        <Text style={styles.logo}>CHARBAMAN</Text>
        <Text style={styles.sub}>شربة مان · The Moroccan street-drink hero</Text>
      </Animated.View>

      <View style={styles.heroStage}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.floatBottle, { left: `${15 + i * 32}%`, transform: [{ translateY: Math.sin(phase / 6 + i * 2) * 10 }, { rotate: `${Math.sin(phase / 8 + i) * 15}deg` }] }]}>
            <Bottle m={70} spin={Math.cos(phase / 5 + i)} />
          </View>
        ))}
        <View style={styles.heroShadow} />
        <CharbaSprite height={250} />
      </View>

      <View style={styles.menu}>
        <Button label="▶  Play the Cities" variant="light" onPress={onStory} />
        <Button label="∞  Endless Run" onPress={onEndless} />
        <View style={styles.row}>
          <Button label="🏆 Scores" variant="ghost" onPress={onLeaderboard} style={styles.half} />
          <Button label="? How to" variant="ghost" onPress={onHowTo} style={styles.half} />
        </View>
        {best > 0 && <Text style={styles.best}>Endless best: {best.toLocaleString()}</Text>}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingTop: 70, paddingBottom: 36, paddingHorizontal: 16, overflow: 'hidden' },
  rays: { position: 'absolute', top: '38%', left: '50%', width: 0, height: 0 },
  ray: { position: 'absolute', left: -30, top: -600, width: 60, height: 1200, backgroundColor: 'rgba(255,255,255,0.07)' },
  logoWrap: { alignItems: 'center' },
  logo: { fontSize: 48, fontWeight: '900', color: colors.white, letterSpacing: 1, fontStyle: 'italic' },
  logoShadow: { position: 'absolute', top: 5, left: 5, fontSize: 48, fontWeight: '900', color: colors.ink, letterSpacing: 1, fontStyle: 'italic', opacity: 0.35 },
  sub: { marginTop: 6, color: colors.cream, fontWeight: '800', fontSize: 14, textAlign: 'center' },
  heroStage: { alignItems: 'center', justifyContent: 'flex-end', height: 260, width: '100%' },
  heroShadow: { position: 'absolute', bottom: -6, width: 150, height: 22, borderRadius: 60, backgroundColor: 'rgba(0,0,0,0.2)' },
  floatBottle: { position: 'absolute', top: 0 },
  menu: { alignItems: 'center', gap: 12, width: '100%' },
  row: { flexDirection: 'row', gap: 10 },
  half: { minWidth: 115 },
  best: { color: colors.cream, fontWeight: '800', marginTop: 4 },
});
