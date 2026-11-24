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

import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import { AppIcon, type IconName } from '../components/ui';
import { fonts, radii, space } from '../theme';

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
    title: 'Vos captures, en quelques gestes',
    body: 'Bateau, espèce, engin, lieu, poids. La déclaration se fait sans réseau et part dès que le téléphone en retrouve un.',
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
    body: 'Vous démarrez le suivi en quittant le quai : la position du bateau est relevée même écran éteint. L’avis de mer vous prévient.',
    facts: [
      { icon: 'navigate-outline', text: 'Suivi à votre demande' },
      { icon: 'mci:waves', text: 'Avis de mer du secteur' },
    ],
  },
  {
    key: 'licence',
    illustration: require('../../assets/illustrations/icon-licences.png'),
    eyebrow: 'Présenter',
    title: 'Votre licence, dans le téléphone',
    body: 'Votre carte porte le QR de votre licence, même sans réseau. Abonnement et redevances se règlent par Mobile Money.',
    facts: [
      { icon: 'qr-code-outline', text: 'Carte avec QR' },
      { icon: 'wallet-outline', text: 'Mobile Money' },
    ],
  },
];

type Props = { onDone: () => void };

/** Bienvenue à la première ouverture : trois volets, une promesse par volet. */
export function OnboardingScreen({ onDone }: Props) {
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
    <View style={styles.root}>
      <View style={styles.brandRow}>
        <View style={styles.brandBadge}>
          <ShipIcon size={22} />
        </View>
        <Text style={styles.brand}>CBM-PIGAP</Text>
        <View style={{ flex: 1 }} />
        {!last ? (
          <Pressable onPress={onDone} hitSlop={12} style={styles.skipBtn} accessibilityRole="button">
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
                  <AppIcon name={f.icon} size={16} color="#FFFFFF" />
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
          variant="ghost"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: space.md, paddingBottom: space.md },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  brandBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { fontFamily: fonts.display, fontSize: 20, color: '#FFFFFF', letterSpacing: -0.2 },
  skipBtn: { minHeight: 48, minWidth: 48, alignItems: 'flex-end', justifyContent: 'center' },
  skip: { fontFamily: fonts.bodyMedium, fontSize: 16, color: '#D6E6F5' },
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
    color: 'rgba(255, 255, 255, 0.12)',
    letterSpacing: -6,
  },
  art: {
    width: 120,
    height: 120,
    borderRadius: 32,
  },
  eyebrow: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#A9CFF2',
    marginBottom: 8,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 38,
    color: '#FFFFFF',
    letterSpacing: -0.5,
    marginBottom: 12,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 17,
    lineHeight: 25,
    color: '#E6EEF7',
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
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.34)',
  },
  factText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: '#FFFFFF' },
  footer: { paddingHorizontal: space.lg, gap: space.md, marginTop: space.md },
  progress: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255, 255, 255, 0.26)' },
  segmentOn: { backgroundColor: '#FFFFFF' },
});
