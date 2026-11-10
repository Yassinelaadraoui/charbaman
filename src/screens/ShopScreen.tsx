import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BackButton, Screen } from '../components/ui';
import { Bottle } from '../game/sprites';
import { SUITS, Suit } from '../game/progression';
import type { SaveData } from '../services/storage';
import { play } from '../services/sound';
import { colors } from '../theme';
import { Key, fmt, t } from '../i18n';

type Props = { save: SaveData; onBuy: (s: Suit) => boolean; onBack: () => void };

// A little figure in the suit's colours: helmet, body, belt and boots, like the hero from behind.
function SuitFigure({ suit }: { suit: Suit }) {
  const [main, trim] = suit.swatch;
  return (
    <View style={styles.figure}>
      <View style={[styles.head, { backgroundColor: main, borderColor: trim }]} />
      <View style={[styles.torso, { backgroundColor: main }]}>
        <View style={[styles.belt, { backgroundColor: trim }]} />
      </View>
      <View style={styles.legs}>
        <View style={[styles.leg, { backgroundColor: main, borderBottomColor: trim }]} />
        <View style={[styles.leg, { backgroundColor: main, borderBottomColor: trim }]} />
      </View>
    </View>
  );
}

export function ShopScreen({ save, onBuy, onBack }: Props) {
  const [shake, setShake] = useState<string | null>(null);
  return (
    <LinearGradient colors={[colors.orangeDeep, '#7A2E00']} style={{ flex: 1 }}>
      <Screen>
        <BackButton onPress={onBack} />
        <View style={styles.header}>
          <Text style={styles.title}>{t('shop.title')}</Text>
          <View style={styles.wallet}>
            <Bottle m={26} />
            <Text style={styles.walletText}>{fmt(save.wallet)}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>{t('shop.hint')}</Text>
        <ScrollView contentContainerStyle={styles.grid}>
          {SUITS.map((s) => {
            const owned = save.suits.includes(s.id);
            const worn = save.suit === s.id;
            const short = s.price - save.wallet;
            const label = worn ? t('shop.wearing') : owned ? t('shop.wear') : short > 0 ? t('shop.short', { n: fmt(short) }) : t('shop.wallet', { n: fmt(s.price) });
            return (
              <Pressable
                key={s.id}
                style={[styles.card, worn && styles.cardWorn, shake === s.id && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${t(`suit.${s.id}` as Key)}, ${label}`}
                onPress={() => {
                  if (worn) return;
                  if (onBuy(s)) play(owned ? 'click' : 'cash');
                  else {
                    play('hit');
                    setShake(s.id);
                    setTimeout(() => setShake(null), 250);
                  }
                }}
              >
                <SuitFigure suit={s} />
                <Text style={styles.name}>{t(`suit.${s.id}` as Key)}</Text>
                <View style={[styles.price, owned ? styles.priceOwned : short > 0 ? styles.priceShort : null]}>
                  {!owned && <Bottle m={16} />}
                  <Text style={[styles.priceText, owned && { color: colors.ink }]}>{label}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </Screen>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  title: { color: colors.white, fontSize: 30, fontWeight: '900' },
  wallet: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(43,19,0,0.45)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4 },
  walletText: { color: colors.gold, fontWeight: '900', fontSize: 18 },
  subtitle: { color: colors.cream, fontSize: 14, fontWeight: '600', marginBottom: 14, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', paddingBottom: 30 },
  card: { width: '47.5%', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 18, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  cardWorn: { borderColor: colors.gold, backgroundColor: 'rgba(255,210,63,0.18)' },
  figure: { alignItems: 'center', height: 104, justifyContent: 'flex-end', marginBottom: 8 },
  head: { width: 30, height: 32, borderRadius: 15, borderWidth: 3, marginBottom: 3 },
  torso: { width: 44, height: 40, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, justifyContent: 'flex-end', overflow: 'hidden' },
  belt: { height: 7 },
  legs: { flexDirection: 'row', gap: 6 },
  leg: { width: 15, height: 26, borderBottomWidth: 6, borderBottomLeftRadius: 4, borderBottomRightRadius: 4 },
  name: { color: colors.white, fontWeight: '900', fontSize: 15, textAlign: 'center' },
  price: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.orange, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  priceOwned: { backgroundColor: colors.cream },
  priceShort: { backgroundColor: 'rgba(43,19,0,0.45)' },
  priceText: { color: colors.white, fontWeight: '900', fontSize: 13 },
});
