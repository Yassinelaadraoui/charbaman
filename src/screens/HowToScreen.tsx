import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Screen } from '../components/ui';
import { colors } from '../theme';
import { Key, t } from '../i18n';

const TIPS: [string, string][] = [
  ['👆', 'steer'],
  ['⬆️', 'jump'],
  ['⬇️', 'slide'],
  ['🍊', 'bottles'],
  ['💥', 'hits'],
  ['🛹', 'skate'],
  ['🏺', 'tajine'],
  ['🟠', 'chase'],
];

export function HowToScreen({ onBack }: { onBack: () => void }) {
  return (
    <LinearGradient colors={[colors.orange, colors.orangeDeep]} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{t('howToTitle')}</Text>
        <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 14 }}>
          {TIPS.map(([icon, id]) => (
            <View key={id} style={styles.card}>
              <Text style={styles.icon}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.head}>{t(`tip.${id}.head` as Key)}</Text>
                <Text style={styles.body}>{t(`tip.${id}.body` as Key)}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', marginTop: 8 },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)', padding: 14, borderRadius: 16 },
  icon: { fontSize: 28 },
  head: { color: colors.white, fontWeight: '900', fontSize: 17 },
  body: { color: colors.cream, fontWeight: '600', fontSize: 14, marginTop: 2 },
});
