import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Screen } from '../components/ui';
import { colors } from '../theme';

const TIPS: [string, string, string][] = [
  ['👆', 'Drag left / right', 'Steer freely anywhere on the street, no lanes.'],
  ['⬆️', 'Swipe up or tap', 'Jump over crates of oranges.'],
  ['⬇️', 'Swipe down', 'Slide under market awnings. In the air it slams you down.'],
  ['🍊', 'Charba bottles', 'Grab them for points. Every 25 bottles is an extra life.'],
  ['💥', 'Three hits', 'Taxis, scooters and donkey carts knock off health. Lose all 3 and you restart from the last checkpoint.'],
  ['🛹', 'Skateboard', 'Speed boost for a few seconds.'],
  ['🏺', 'Tajine', 'Lands on your head and flips your controls. Avoid it!'],
  ['🟠', 'The giant Charba', 'The end of every city is a chase. Get hit and it rolls closer. If it catches you, you lose a life.'],
];

export function HowToScreen({ onBack }: { onBack: () => void }) {
  return (
    <LinearGradient colors={[colors.orange, colors.orangeDeep]} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <Text style={styles.title}>How to play</Text>
        <ScrollView contentContainerStyle={{ gap: 10, paddingVertical: 14 }}>
          {TIPS.map(([icon, head, body]) => (
            <View key={head} style={styles.card}>
              <Text style={styles.icon}>{icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.head}>{head}</Text>
                <Text style={styles.body}>{body}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.credits}>
            Credits (3D models, all CC-BY-4.0, from Sketchfab): petit taxi based on "Hong Kong Taxi" by Goedude; Hassan II
            Mosque, Derby House, Popular House, Old Neighborhood House and Morocco House by abdlilah ben; Hassan Tower by
            Ysn.Aitaddi; City Gate, Mixed Facade and Moroccan Boy by Mrigua Mohamed; city walls from "Moroccan culture" by
            medbunz; Dacia Lodgy by abdelghani.0; police car by FF 3DMODEL; palm by KrazzyElf; maple by atrodler; lamppost by Haggy the model ripper; tea table by
            A9908244; apple box by Pixxellab; juice bottle by Spacesea; 200 dirham note by lordmehemedz (Sketchfab Standard).
            Models were simplified and recoloured for the game.
          </Text>
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
  credits: { color: colors.cream, fontSize: 11, marginTop: 10, opacity: 0.8 },
});
