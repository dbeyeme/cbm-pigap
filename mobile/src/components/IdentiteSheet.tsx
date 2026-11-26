import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getFicheIdentite, getMaFiche, updateEmbarcation, type EmbarcationRegistre, type FicheIdentite } from '../api';
import { friendlyApiError, isNetworkError } from '../lib/apiErrors';
import {
  aDesErreurs,
  lireInscription,
  payloadCorrection,
  saisieDepuis,
  type ChampInscription,
  type SaisieInscription,
} from '../lib/inscription';
import { colors, fonts, space } from '../theme';
import { FicheIdentiteView } from './FicheIdentite';
import { GlassPanel } from './GlassPanel';
import { GlowButton } from './GlowButton';
import { AIDE_INSCRIPTION, InscriptionFields } from './InscriptionFields';
import { OceanBackground } from './OceanBackground';
import { HelpTip, Notice, ScreenHeader, SectionTitle, useReducedMotion, type InfoPoint } from './ui';

const AIDE_AGENT: ReadonlyArray<InfoPoint> = [
  { icon: 'document-text-outline', text: 'Registre : ce que l’administration a inscrit sur le pêcheur, sa licence et ses embarcations.' },
  { icon: 'mci:map-marker-path', text: 'Suivi : ce que les embarcations ont émis, par téléphone ou par balise. Aucune position ici : la carte de suivi reste le seul accès à la localisation.' },
  { icon: 'eye-outline', text: 'Chaque consultation d’une fiche est inscrite au journal des accès.' },
];

const AIDE_PECHEUR: ReadonlyArray<InfoPoint> = [
  { icon: 'document-text-outline', text: 'Registre : ce que l’administration a inscrit sur vous, votre licence et vos embarcations.' },
  { icon: 'mci:map-marker-path', text: 'Suivi : ce que vos embarcations ont émis, par votre téléphone ou par une balise.' },
  { icon: 'create-outline', text: 'Une information manque ou est fausse ? Un agent de contrôle peut la compléter.' },
];

export type SourceFiche = { kind: 'moi' } | { kind: 'pecheur'; pecheurId: string };

type Props = {
  visible: boolean;
  onClose: () => void;
  token: string;
  source: SourceFiche;
  /** Nom déjà connu, affiché pendant le chargement. */
  titre?: string;
};

type Edition = {
  embarcation: EmbarcationRegistre;
  saisie: SaisieInscription;
  erreurs: Partial<Record<ChampInscription, string>>;
};

/**
 * Fiche d'identité en plein écran, au-dessus de l'écran d'origine (contrôle,
 * recherche, carte) : la consultation en cours reste en place au retour.
 * L'agent y complète les informations d'inscription d'une embarcation.
 */
export function IdentiteSheet({ visible, onClose, token, source, titre }: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const agent = source.kind === 'pecheur';
  const pecheurId = source.kind === 'pecheur' ? source.pecheurId : null;

  const [fiche, setFiche] = useState<FicheIdentite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setFiche(pecheurId ? await getFicheIdentite(token, pecheurId) : await getMaFiche(token));
    } catch (err) {
      setError(
        isNetworkError(err) ? 'La fiche se consulte avec du réseau. Réessayez une fois connecté.' : friendlyApiError(err),
      );
    } finally {
      setLoading(false);
    }
  }, [pecheurId, token]);

  useEffect(() => {
    if (!visible) return;
    setFiche(null);
    setInfo(null);
    setEdition(null);
    void load();
  }, [visible, load]);

  function ouvrirEdition(embarcation: EmbarcationRegistre) {
    setInfo(null);
    setSaveError(null);
    setEdition({ embarcation, saisie: saisieDepuis(embarcation), erreurs: {} });
  }

  async function enregistrer() {
    if (!edition) return;
    const lecture = lireInscription(edition.saisie);
    if (aDesErreurs(lecture)) {
      setEdition({ ...edition, erreurs: lecture.erreurs });
      setSaveError('Corrigez les informations signalées.');
      return;
    }
    const patch = payloadCorrection(edition.embarcation, lecture.valeurs);
    if (Object.keys(patch).length === 0) {
      setEdition(null);
      setInfo('Aucun changement à enregistrer.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await updateEmbarcation(token, edition.embarcation.id, patch);
      setEdition(null);
      setInfo(`Inscription de ${edition.embarcation.nom} mise à jour.`);
      await load();
    } catch (err) {
      setSaveError(friendlyApiError(err));
    } finally {
      setSaving(false);
    }
  }

  const nom = fiche ? `${fiche.registre.identite.prenom} ${fiche.registre.identite.nom}` : titre ?? 'Fiche';

  return (
    <Modal
      visible={visible}
      statusBarTranslucent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={edition ? () => setEdition(null) : onClose}
    >
      <OceanBackground>
        <KeyboardAvoidingView
          style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScreenHeader
            kicker={edition ? 'Inscription de l’embarcation' : agent ? 'Fiche d’identité' : 'Ma fiche'}
            title={edition ? edition.embarcation.nom : nom}
            onBack={edition ? () => setEdition(null) : onClose}
            right={
              edition ? (
                <HelpTip title="Informations d’inscription" points={AIDE_INSCRIPTION} icon="boat-outline" />
              ) : (
                <HelpTip
                  title={agent ? 'La fiche d’identité' : 'Votre fiche'}
                  points={agent ? AIDE_AGENT : AIDE_PECHEUR}
                  icon="id-card-outline"
                />
              )
            }
          />
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {edition ? (
              <GlassPanel style={styles.panel}>
                <SectionTitle icon="pricetag-outline" text={edition.embarcation.immatriculation} style={{ marginTop: 0 }} />
                <InscriptionFields
                  value={edition.saisie}
                  onChange={(saisie) => setEdition({ ...edition, saisie, erreurs: {} })}
                  erreurs={edition.erreurs}
                />
                {saveError ? <Notice tone="error" text={saveError} style={styles.notice} /> : null}
                <GlowButton
                  label="Enregistrer"
                  icon="save-outline"
                  variant="accent"
                  loading={saving}
                  onPress={() => void enregistrer()}
                />
                <GlowButton
                  label="Annuler"
                  icon="close-outline"
                  variant="ghost"
                  onPress={() => setEdition(null)}
                  style={styles.second}
                />
              </GlassPanel>
            ) : (
              <>
                {info ? <Notice tone="ok" text={info} style={styles.notice} /> : null}
                {loading && !fiche ? (
                  <GlassPanel contentStyle={styles.loading}>
                    <ActivityIndicator color={colors.tide} />
                    <Text style={styles.loadingText}>Chargement de la fiche…</Text>
                  </GlassPanel>
                ) : null}
                {error ? (
                  <>
                    <Notice tone="error" text={error} style={styles.notice} />
                    <GlowButton label="Réessayer" icon="refresh-outline" onPress={() => void load()} />
                  </>
                ) : null}
                {fiche ? <FicheIdentiteView fiche={fiche} onCompleter={agent ? ouvrirEdition : undefined} /> : null}
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </OceanBackground>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingTop: 4, paddingBottom: space.xxl },
  panel: { marginBottom: space.md },
  notice: { marginTop: 0, marginBottom: 12 },
  second: { marginTop: 10 },
  loading: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
});
