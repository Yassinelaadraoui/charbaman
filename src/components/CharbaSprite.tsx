import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

const SPRITE = require('../../assets/charbaman.png');
const RATIO = 549 / 891;

// The pixel-art Charbaman, breathing and swaying in his pose.
export function CharbaSprite({ height, still = false }: { height: number; still?: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (still) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [t, still]);
  return (
    <Animated.Image
      source={SPRITE}
      resizeMode="contain"
      style={{
        width: height * RATIO,
        height,
        transformOrigin: 'bottom',
        transform: [
          { scaleY: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) },
          { scaleX: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
        ],
      }}
    />
  );
}
