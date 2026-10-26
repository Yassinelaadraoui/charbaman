import React from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Button, Screen } from '../components/ui';
import { colors } from '../theme';
import { LANGS, t } from '../i18n';
import type { Settings } from '../services/storage';

type Props = { settings: Settings; onChange: (s: Settings) => void; onReset: () => void; onAbout: () => void; onBack: () => void };

export function SettingsScreen({ settings, onChange, onReset, onAbout, onBack }: Props) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });

  const confirmReset = () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(`${t('resetTitle')}\n${t('resetBody')}`)) onReset();
      return;
    }
    Alert.alert(t('resetTitle'), t('resetBody'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('reset'), style: 'destructive', onPress: onReset },
    ]);
  };

  return (
    <LinearGradient colors={[colors.orange, colors.orangeDeep]} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{t('settingsTitle')}</Text>
        <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 14 }}>
          <Toggle label={t('sound')} value={settings.sound} onChange={(v) => set('sound', v)} />
          <Toggle label={t('music')} value={settings.music} onChange={(v) => set('music', v)} />
          {Platform.OS !== 'web' && <Toggle label={t('haptics')} value={settings.haptics} onChange={(v) => set('haptics', v)} />}

          <View style={styles.card}>
            <Text style={styles.label}>{t('language')}</Text>
            <Choice
              options={[{ id: 'auto', label: t('langAuto') }, ...LANGS]}
              value={settings.lang}
              onChange={(v) => set('lang', v as Settings['lang'])}
            />
          </View>

          <View style={styles.card}>
            <Text style={styles.label}>{t('graphics')}</Text>
            <Choice
              options={[{ id: 'high', label: t('gfxHigh') }, { id: 'low', label: t('gfxLow') }]}
              value={settings.graphics}
              onChange={(v) => set('graphics', v as Settings['graphics'])}
            />
            <Text style={styles.hint}>{t('gfxHint')}</Text>
          </View>

          <Button label={t('about')} variant="ghost" onPress={onAbout} />
          <Button label={t('resetProgress')} variant="ghost" onPress={confirmReset} style={styles.danger} />
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      style={styles.card}
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
        <View style={[styles.switch, value && styles.switchOn]}>
          <View style={[styles.knob, value && styles.knobOn]} />
        </View>
      </View>
    </Pressable>
  );
}

function Choice({ options, value, onChange }: { options: { id: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={styles.choices}>
      {options.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={[styles.choice, value === o.id && styles.choiceOn]}
          accessibilityRole="radio"
          accessibilityState={{ selected: value === o.id }}
        >
          <Text style={[styles.choiceText, value === o.id && { color: colors.orangeDeep }]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', marginTop: 8 },
  card: { backgroundColor: 'rgba(255,255,255,0.16)', padding: 14, borderRadius: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: colors.white, fontWeight: '900', fontSize: 17 },
  hint: { color: colors.cream, fontWeight: '600', fontSize: 13 },
  switch: { width: 54, height: 30, borderRadius: 15, backgroundColor: 'rgba(43,19,0,0.35)', padding: 3 },
  switchOn: { backgroundColor: colors.mint },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  knobOn: { transform: [{ translateX: 24 }] },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  choiceOn: { backgroundColor: colors.cream, borderColor: colors.cream },
  choiceText: { color: colors.white, fontWeight: '800' },
  danger: { borderColor: 'rgba(255,220,220,0.9)' },
});
