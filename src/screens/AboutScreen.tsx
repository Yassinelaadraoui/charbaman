import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { BackButton, Screen } from '../components/ui';
import { colors } from '../theme';
import { t } from '../i18n';
import { CONTACT_EMAIL } from '../config';

// Every outside asset in the game. 3D models are CC-BY-4.0 unless marked otherwise.
const CREDITS: [string, string][] = [
  ['Hero body and run', 'Denys Almaral (Sketchfab Standard licence)'],
  ['Petit taxi, based on "Hong Kong Taxi"', 'Goedude'],
  ['Hassan II Mosque, Derby House, Popular House, Old Neighborhood House, Morocco House', 'abdlilah ben'],
  ['Hassan Tower', 'Ysn.Aitaddi'],
  ['City Gate, Mixed Facade, Moroccan Boy, Majmar', 'Mrigua Mohamed'],
  ['City walls ("Moroccan culture")', 'medbunz'],
  ['Dacia Lodgy', 'abdelghani.0'],
  ['Police van', 'FF 3DMODEL'],
  ['Palm tree', 'KrazzyElf'],
  ['Maple tree', 'atrodler'],
  ['Tea table', 'A9908244'],
  ['Apple box', 'Pixxellab'],
  ['Juice bottle', 'Spacesea'],
  ['200 dirham note', 'lordmehemedz (Sketchfab Standard licence)'],
  ['Tagine', 'laabidate'],
  ['Fruit stall', 'Isa_van_den_Bosch'],
  ['Spice market', 'zeroual.elmehdi'],
  ['Donkey', 'WildMesh 3D'],
  ['Chicken', 'MAXDESIGN-3D'],
  ['Bus stop', 'evtushenko'],
  ['Danger sign', 'AbouAli'],
  ['Old man', 'anandmohan662'],
  ['Sound effects and particles', 'Kenney (CC0)'],
  ['Music, suit, cats, pigeons, gulls and lamps', 'made for Charbaman'],
];

export function AboutScreen({ onBack }: { onBack: () => void }) {
  const version = Constants.expoConfig?.version ?? '1.0.0';
  return (
    <LinearGradient colors={[colors.orangeDeep, '#5A2200']} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>{t('aboutTitle')}</Text>
        <ScrollView contentContainerStyle={{ gap: 12, paddingVertical: 14 }}>
          <Text style={styles.body}>Charbaman · {t('version', { v: version })}</Text>

          <View style={styles.card}>
            <Text style={styles.head}>{t('privacyTitle')}</Text>
            <Text style={styles.body}>{t('privacyBody')}</Text>
            {!!CONTACT_EMAIL && <Text style={styles.body}>✉ {CONTACT_EMAIL}</Text>}
          </View>

          <View style={styles.card}>
            <Text style={styles.head}>{t('creditsTitle')}</Text>
            <Text style={styles.body}>{t('creditsIntro')}</Text>
            {CREDITS.map(([what, who]) => (
              <Text key={what} style={styles.credit}>
                <Text style={{ fontWeight: '800' }}>{what}</Text> · {who}
              </Text>
            ))}
          </View>
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.white, fontSize: 32, fontWeight: '900', marginTop: 8 },
  card: { backgroundColor: 'rgba(255,255,255,0.14)', padding: 14, borderRadius: 16, gap: 8 },
  head: { color: colors.white, fontWeight: '900', fontSize: 18 },
  body: { color: colors.cream, fontWeight: '600', fontSize: 14, lineHeight: 20 },
  credit: { color: colors.cream, fontSize: 13, lineHeight: 18 },
});
