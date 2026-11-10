import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Screen } from '../components/ui';
import { ACHIEVEMENTS } from '../game/progression';
import { colors } from '../theme';
import { Key, t } from '../i18n';

export function AchievementsScreen({ unlocked, onBack }: { unlocked: string[]; onBack: () => void }) {
  const got = ACHIEVEMENTS.filter((a) => unlocked.includes(a.id)).length;
  return (
    <LinearGradient colors={[colors.orangeDeep, '#7A2E00']} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{t('achievements')}</Text>
        <Text style={styles.subtitle}>{t('ach.count', { n: got, total: ACHIEVEMENTS.length })}</Text>
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }}>
          {ACHIEVEMENTS.map((a) => {
            const done = unlocked.includes(a.id);
            return (
              <View key={a.id} style={[styles.row, done && styles.rowDone]} accessible accessibilityLabel={`${t(`ach.${a.id}.name` as Key)}. ${t(`ach.${a.id}.desc` as Key)}`}>
                <Text style={[styles.icon, !done && { opacity: 0.35 }]}>{done ? '🏆' : '🔒'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{t(`ach.${a.id}.name` as Key)}</Text>
                  <Text style={styles.desc}>{t(`ach.${a.id}.desc` as Key)}</Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 30, fontWeight: '900', marginTop: 8 },
  subtitle: { color: colors.cream, fontSize: 14, fontWeight: '700', marginBottom: 14, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(43,19,0,0.35)', borderRadius: 16, padding: 12 },
  rowDone: { backgroundColor: 'rgba(255,210,63,0.2)', borderWidth: 2, borderColor: colors.gold },
  icon: { fontSize: 28 },
  name: { color: colors.white, fontWeight: '900', fontSize: 16 },
  desc: { color: colors.cream, fontWeight: '600', fontSize: 13, marginTop: 2 },
});
