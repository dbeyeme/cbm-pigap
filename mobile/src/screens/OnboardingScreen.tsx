import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { AppIcon, type IconName } from '../components/ui';
import { colors, fonts, radii, space } from '../theme';

type Slide = {
  key: string;
  illustration: ImageSourcePropType;
  eyebrow: string;
  title: string;
  body: string;
  facts: Array<{ icon: IconName; text: string }>;
};

const SLIDES: ReadonlyArray<Slide> = [
  {
    key: 'captures',
    illustration: require('../../assets/illustrations/icon-captures.png'),
    eyebrow: 'Déclarer',
    title: 'Vos captures, en quatre gestes',
    body: 'Bateau, espèce, engin, poids. La déclaration se fait sans réseau et part dès que le téléphone en retrouve un.',
    facts: [
      { icon: 'cloud-offline-outline', text: 'Fonctionne hors ligne' },
      { icon: 'fish-outline', text: 'Espèces du Gabon' },
    ],
  },
  {
    key: 'gps',
    illustration: require('../../assets/illustrations/icon-trajectories.png'),
    eyebrow: 'Naviguer',
    title: 'Vos sorties, tracées en mer',
    body: 'La position du bateau est relevée en mer et sur les fleuves. Le parcours s’affiche sur la carte, l’avis de mer vous prévient.',
    facts: [
      { icon: 'navigate-outline', text: 'Suivi automatique' },
      { icon: 'mci:waves', text: 'Avis de mer du secteur' },
    ],
  },
  {
    key: 'licence',
    illustration: require('../../assets/illustrations/icon-licences.png'),
    eyebrow: 'Régler',
    title: 'Votre licence, depuis le téléphone',
    body: 'Abonnement et redevances se règlent par Mobile Money depuis votre numéro. La quittance reste dans l’application.',
    facts: [
      { icon: 'wallet-outline', text: 'Mobile Money' },
      { icon: 'receipt-outline', text: 'Quittance conservée' },
    ],
  },
];

type Props = { onDone: () => void };

/** Bienvenue à la première ouverture : trois volets, une promesse par volet. */
export function OnboardingScreen({ onDone }: Props) {
  const insets = useSafeAreaInsets();
  const width = Dimensions.get('window').width;
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) setIndex(i);
  }

  function next() {
    if (last) {
      onDone();
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + space.md, paddingBottom: Math.max(insets.bottom, space.md) }]}>
      <View style={styles.brandRow}>
        <View style={styles.brandBadge}>
          <ShipIcon size={22} />
        </View>
        <Text style={styles.brand}>CBM-PIGAP</Text>
        <View style={{ flex: 1 }} />
        {!last ? (
          <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button">
            <Text style={styles.skip}>Passer</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            <View style={styles.artWrap}>
              <Text style={styles.watermark}>{String(i + 1).padStart(2, '0')}</Text>
              <Image source={item.illustration} style={styles.art} accessibilityIgnoresInvertColors />
            </View>
            <Text style={styles.eyebrow}>{item.eyebrow}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
            <View style={styles.facts}>
              {item.facts.map((f) => (
                <View key={f.text} style={styles.fact}>
                  <AppIcon name={f.icon} size={15} color={colors.tide} />
                  <Text style={styles.factText}>{f.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.progress}>
          {SLIDES.map((s, i) => (
            <View key={s.key} style={[styles.segment, i <= index && styles.segmentOn]} />
          ))}
        </View>
        <GlowButton
          label={last ? 'Commencer' : 'Continuer'}
          icon={last ? 'arrow-forward' : 'chevron-forward'}
          onPress={next}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  brandBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontFamily: fonts.display, fontSize: 18, color: colors.abyss, letterSpacing: -0.2 },
  skip: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.tide, paddingVertical: 8 },
  slide: { paddingHorizontal: space.lg, justifyContent: 'center' },
  artWrap: {
    alignSelf: 'flex-start',
    marginBottom: space.lg,
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  watermark: {
    position: 'absolute',
    left: 0,
    top: -18,
    fontFamily: fonts.displayItalic,
    fontSize: 140,
    lineHeight: 150,
    color: 'rgba(30, 77, 123, 0.08)',
    letterSpacing: -6,
  },
  art: {
    width: 120,
    height: 120,
    borderRadius: 32,
    shadowColor: colors.abyss,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.tide,
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    color: colors.abyss,
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 24,
    color: colors.inkMuted,
    marginBottom: space.md,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  factText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink },
  footer: { paddingHorizontal: space.lg, gap: space.md, marginTop: space.md },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(30, 77, 123, 0.14)' },
  segmentOn: { backgroundColor: colors.tide },
});
