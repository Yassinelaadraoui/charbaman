import React, { useRef } from 'react';
import { Animated, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

type BtnProps = { label: string; onPress: () => void; variant?: 'primary' | 'light' | 'ghost'; style?: StyleProp<ViewStyle>; disabled?: boolean };

// Chunky button that squashes when pressed.
export function Button({ label, onPress, variant = 'primary', style, disabled }: BtnProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 8 }).start();
  return (
    <Pressable onPress={onPress} onPressIn={() => to(0.94)} onPressOut={() => to(1)} disabled={disabled}>
      <Animated.View style={[styles.btn, styles[variant], disabled && { opacity: 0.5 }, style, { transform: [{ scale }] }]}>
        <Text style={[styles.label, variant === 'light' && { color: colors.orangeDeep }]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.back}>
      <Text style={styles.backText}>‹ Back</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 24 },
  btn: { paddingVertical: 15, paddingHorizontal: 24, borderRadius: 18, alignItems: 'center', minWidth: 240 },
  primary: { backgroundColor: colors.orange, borderBottomWidth: 5, borderBottomColor: colors.orangeDeep },
  light: { backgroundColor: colors.cream, borderBottomWidth: 5, borderBottomColor: '#F2D2B0' },
  ghost: { backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  label: { color: colors.white, fontWeight: '900', fontSize: 19, letterSpacing: 0.5 },
  back: { alignSelf: 'flex-start', paddingVertical: 6 },
  backText: { color: colors.white, fontWeight: '800', fontSize: 18 },
});
