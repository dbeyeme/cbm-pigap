import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatCoordonnees, formatDate, formatHeure } from '../lib/format';
import { RETOUR_CHOIX_HEURES, prochaineHeure, retourDans } from '../lib/sorties';
import { SECTEURS_MER } from '../offline/secteurs';
import { colors, fonts, radii, space } from '../theme';
import { GlassField } from './GlassField';
import { GlowButton } from './GlowButton';
import { Chip, IconBadge, Notice, StepBar, useReducedMotion, type Step } from './ui';

/** Choix de l'heure de retour : un nombre d'heures, ou une heure tapée. */
type ChoixRetour = number | 'autre';

export type DepartSortie = {
  position_depart: [number, number];
  retour_prevu_a: Date;
  secteur_vise: string | null;
  demarrerSuivi: boolean;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  boatName: string;
  /** Le suivi GPS tourne déjà : il n'est pas proposé une seconde fois. */
  suiviActif: boolean;
  /** Relève la position du téléphone ; l'écran gère l'autorisation. */
  relever: () => Promise<{ position: [number, number] } | { erreur: string }>;
  /** Faut-il relever d'office à l'ouverture (autorisation déjà accordée) ? */
  releverDOffice: boolean;
  onConfirm: (depart: DepartSortie) => Promise<void>;
};

const STEPS: ReadonlyArray<Step> = [
  { label: 'Départ', icon: 'location-outline' },
  { label: 'Retour', icon: 'time-outline' },
  { label: 'Secteur', icon: 'compass-outline' },
];

function retourCalcule(choix: ChoixRetour, autre: string, depuis: Date): Date | null {
  return choix === 'autre' ? prochaineHeure(autre, depuis) : retourDans(choix, depuis);
}

function libelleRetour(d: Date, maintenant: Date): string {
  const memeJour = d.toDateString() === maintenant.toDateString();
  return memeJour ? `aujourd’hui à ${formatHeure(d)}` : `le ${formatDate(d)} à ${formatHeure(d)}`;
}

/**
 * Déclaration de départ en mer, en trois étapes courtes : point de départ
 * (position du téléphone), heure de retour prévue, secteur visé facultatif.
 */
export function SortieSheet({
  visible,
  onClose,
  boatName,
  suiviActif,
  relever,
  releverDOffice,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [step, setStep] = useState(0);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [choix, setChoix] = useState<ChoixRetour>(RETOUR_CHOIX_HEURES[1] ?? 8);
  const [autre, setAutre] = useState('');
  const [secteur, setSecteur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [maintenant, setMaintenant] = useState(() => new Date());

  async function lirePosition() {
    setRecherche(true);
    setNote(null);
    try {
      const result = await relever();
      if ('position' in result) setPosition(result.position);
      else setNote(result.erreur);
    } finally {
      setRecherche(false);
    }
  }

  // Chaque ouverture repart d'une déclaration vierge
  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setPosition(null);
    setNote(null);
    setChoix(RETOUR_CHOIX_HEURES[1] ?? 8);
    setAutre('');
    setSecteur(null);
    setEnvoi(false);
    setMaintenant(new Date());
    if (releverDOffice) void lirePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclenché par l'ouverture
  }, [visible]);

  const retour = retourCalcule(choix, autre, maintenant);

  function suivant() {
    setNote(null);
    if (step === 0 && !position) {
      setNote('Relevez d’abord votre position de départ.');
      return;
    }
    if (step === 1 && !retour) {
      setNote('Heure illisible. Exemple : 17:30.');
      return;
    }
    setMaintenant(new Date());
    setStep(step + 1);
  }

  async function partir(demarrerSuivi: boolean) {
    if (!position || envoi) return;
    const now = new Date();
    const retourPrevu = retourCalcule(choix, autre, now);
    if (!retourPrevu) {
      setStep(1);
      setNote('Heure illisible. Exemple : 17:30.');
      return;
    }
    setEnvoi(true);
    try {
      await onConfirm({
        position_depart: position,
        retour_prevu_a: retourPrevu,
        secteur_vise: secteur,
        demarrerSuivi,
      });
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
        />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.md) + 4 }]}>
          <View style={styles.handle} />
          <View style={styles.head}>
            <IconBadge icon="fa6:sailboat" size={44} />
            <View style={styles.headText}>
              <Text style={styles.title} accessibilityRole="header">
                Partir en mer
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {boatName}
              </Text>
            </View>
          </View>

          <StepBar steps={STEPS} current={step} onSelect={(i) => setStep(i)} />

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyInner}
            keyboardShouldPersistTaps="handled"
          >
            {step === 0 ? (
              <>
                <Text style={styles.question}>D’où partez-vous ?</Text>
                <View style={styles.card}>
                  {recherche ? (
                    <>
                      <ActivityIndicator color={colors.tide} />
                      <Text style={styles.cardTitle}>Recherche de votre position…</Text>
                    </>
                  ) : position ? (
                    <>
                      <IconBadge icon="location" tone="ok" size={40} />
                      <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Position de départ relevée</Text>
                        <Text style={styles.cardMeta} selectable>
                          {formatCoordonnees(position[0], position[1])}
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <IconBadge icon="location-outline" tone="muted" size={40} />
                      <View style={styles.cardText}>
                        <Text style={styles.cardTitle}>Ma position actuelle</Text>
                        <Text style={styles.cardMeta}>Le téléphone relève votre point de départ.</Text>
                      </View>
                    </>
                  )}
                </View>
                {!recherche ? (
                  <GlowButton
                    label={position ? 'Reprendre ma position' : 'Relever ma position'}
                    icon="locate-outline"
                    variant={position ? 'ghost' : 'primary'}
                    onPress={() => void lirePosition()}
                  />
                ) : null}
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Text style={styles.question}>Quand pensez-vous rentrer ?</Text>
                <View style={styles.chips}>
                  {RETOUR_CHOIX_HEURES.map((h) => (
                    <Chip
                      key={h}
                      label={`Dans ${h} h`}
                      icon="time-outline"
                      on={choix === h}
                      onPress={() => setChoix(h)}
                    />
                  ))}
                  <Chip
                    label="Autre heure"
                    icon="create-outline"
                    on={choix === 'autre'}
                    onPress={() => setChoix('autre')}
                  />
                </View>
                {choix === 'autre' ? (
                  <GlassField
                    label="Heure de retour"
                    icon="time-outline"
                    value={autre}
                    onChangeText={setAutre}
                    keyboardType="numbers-and-punctuation"
                    placeholder="Ex. 17:30"
                  />
                ) : null}
                {retour ? (
                  <Notice
                    tone="info"
                    icon="flag-outline"
                    text={`Retour prévu ${libelleRetour(retour, maintenant)}.`}
                  />
                ) : null}
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Text style={styles.question}>Où allez-vous pêcher ? (facultatif)</Text>
                <View style={styles.chips}>
                  <Chip
                    label="Je ne sais pas encore"
                    icon="help-circle-outline"
                    on={secteur === null}
                    onPress={() => setSecteur(null)}
                  />
                  {SECTEURS_MER.map((s) => (
                    <Chip
                      key={s.id}
                      label={s.nom}
                      icon="compass-outline"
                      on={secteur === s.id}
                      onPress={() => setSecteur(s.id)}
                    />
                  ))}
                </View>
              </>
            ) : null}

            {note ? <Notice tone="warn" text={note} /> : null}
          </ScrollView>

          <View style={styles.actions}>
            {step < 2 ? (
              <View style={styles.navRow}>
                <GlowButton
                  label={step === 0 ? 'Annuler' : 'Précédent'}
                  icon={step === 0 ? 'close-outline' : 'chevron-back'}
                  variant="ghost"
                  onPress={() => (step === 0 ? onClose() : setStep(step - 1))}
                  style={styles.navBtn}
                />
                <GlowButton
                  label="Suivant"
                  icon="chevron-forward"
                  onPress={suivant}
                  disabled={recherche}
                  style={styles.navBtn}
                />
              </View>
            ) : suiviActif ? (
              <GlowButton
                label={envoi ? 'Un instant…' : 'Partir en mer'}
                icon="boat-outline"
                onPress={() => void partir(false)}
                disabled={envoi}
              />
            ) : (
              <>
                <GlowButton
                  label={envoi ? 'Un instant…' : 'Partir et démarrer le suivi'}
                  icon="navigate-outline"
                  onPress={() => void partir(true)}
                  disabled={envoi}
                />
                <GlowButton
                  label="Partir sans le suivi GPS"
                  icon="boat-outline"
                  variant="ghost"
                  onPress={() => void partir(false)}
                  disabled={envoi}
                />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(11, 31, 58, 0.55)',
  },
  sheet: {
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: space.lg,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.glassBorder,
    marginBottom: 14,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headText: { flex: 1, minWidth: 0 },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.abyss },
  subtitle: { fontFamily: fonts.body, fontSize: 15, color: colors.inkMuted },
  body: { flexGrow: 0, marginTop: space.sm },
  bodyInner: { gap: 12, paddingBottom: 6 },
  question: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    minHeight: 72,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surface,
  },
  cardText: { flex: 1, minWidth: 0 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  cardMeta: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { marginTop: space.md, gap: 10 },
  navRow: { flexDirection: 'row', gap: 10 },
  navBtn: { flex: 1 },
});
