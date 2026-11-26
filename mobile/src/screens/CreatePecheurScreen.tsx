import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { createEmbarcation, createPecheur } from '../api';
import { GlassField } from '../components/GlassField';
import { AIDE_INSCRIPTION, InscriptionFields } from '../components/InscriptionFields';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import {
  Chip,
  HelpTip,
  IconBadge,
  Notice,
  ScreenHeader,
  SectionTitle,
  StepBar,
  type IconName,
  type InfoPoint,
  type Step,
} from '../components/ui';
import { DEMO_ACCOUNTS } from '../auth/roles';
import { friendlyApiError } from '../lib/apiErrors';
import {
  SAISIE_INSCRIPTION_VIDE,
  aDesErreurs,
  lireInscription,
  payloadCreation,
  type ChampInscription,
  type SaisieInscription,
} from '../lib/inscription';
import { colors, fonts, radii, space } from '../theme';

const HELP_LICENCE: ReadonlyArray<InfoPoint> = [
  { icon: 'ribbon-outline', text: 'Le numéro de licence est attribué automatiquement à l’enregistrement du dossier.' },
  { icon: 'eye-outline', text: 'Il s’affiche dès que le dossier est enregistré : communiquez-le au pêcheur.' },
  { icon: 'document-text-outline', text: 'Le pêcheur a déjà une licence sur papier ? Ouvrez « Reprendre un numéro déjà délivré » et recopiez son numéro.' },
];

const STEPS: ReadonlyArray<Step> = [
  { label: 'Pêcheur', icon: 'person-outline' },
  { label: 'Embarcation', icon: 'boat-outline' },
];

type Props = {
  token: string;
  onDone: () => void;
  onBack: () => void;
};

/** Équipements utilisés (§5.1) : mêmes codes que le portail web. */
const ENGINS: Array<{ code: string; label: string; icon: IconName }> = [
  { code: 'filet', label: 'Filet', icon: 'mci:waves' },
  { code: 'ligne', label: 'Ligne', icon: 'mci:hook' },
  { code: 'nasse', label: 'Nasse', icon: 'mci:basket-outline' },
  { code: 'senne', label: 'Senne', icon: 'mci:waves' },
  { code: 'palangre', label: 'Palangre', icon: 'mci:hook' },
];
const SECURITE: Array<{ code: string; label: string; icon: IconName }> = [
  { code: 'gilets', label: 'Gilets', icon: 'mci:lifebuoy' },
  { code: 'gps', label: 'GPS / téléphone', icon: 'phone-portrait-outline' },
  { code: 'vhf', label: 'Radio VHF', icon: 'radio-outline' },
  { code: 'feux', label: 'Feux', icon: 'flashlight-outline' },
  { code: 'glaciere', label: 'Glacière', icon: 'snow-outline' },
];

function equipementsPayload(e: {
  engins: string[];
  moteur: string;
  securite: string[];
}): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  if (e.engins.length) out.engins = e.engins;
  if (e.moteur.trim()) out.moteur = e.moteur.trim();
  if (e.securite.length) out.securite = e.securite;
  return Object.keys(out).length ? out : null;
}

function ChipGroup({
  items,
  selected,
  onChange,
}: {
  items: Array<{ code: string; label: string; icon: IconName }>;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <View style={styles.chips}>
      {items.map((item) => {
        const on = selected.includes(item.code);
        return (
          <Chip
            key={item.code}
            label={item.label}
            icon={item.icon}
            on={on}
            multi
            onPress={() =>
              onChange(on ? selected.filter((c) => c !== item.code) : [...selected, item.code])
            }
          />
        );
      })}
    </View>
  );
}

export function CreatePecheurScreen({ token, onDone, onBack }: Props) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [licence, setLicence] = useState('');
  /** Reprise d'un numéro déjà délivré sur papier : repliée, hors du parcours normal. */
  const [paperLicence, setPaperLicence] = useState(false);
  const [email, setEmail] = useState('');
  // En démonstration, le mot de passe du compte d'essai est proposé ; sur le terrain, l'agent le saisit
  const [password, setPassword] = useState(DEMO_ACCOUNTS?.pecheur.password ?? '');
  const [bateau, setBateau] = useState('');
  const [immat, setImmat] = useState('');
  const [longueur, setLongueur] = useState('');
  const [moteur, setMoteur] = useState('');
  const [engins, setEngins] = useState<string[]>([]);
  const [securite, setSecurite] = useState<string[]>([]);
  /** Informations d'inscription facultatives (MMSI, OMI…) : repliées par défaut. */
  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);
  const [inscription, setInscription] = useState<SaisieInscription>(SAISIE_INSCRIPTION_VIDE);
  const [erreursInscription, setErreursInscription] = useState<Partial<Record<ChampInscription, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /** Numéro de licence du dossier enregistré, à communiquer au pêcheur. */
  const [savedLicence, setSavedLicence] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  function nextStep() {
    setError(null);
    if (!nom.trim() || !prenom.trim()) {
      setError('Indiquez le nom et le prénom du pêcheur.');
      return;
    }
    if (password.length < 8) {
      setError('Mot de passe : saisissez au moins 8 caractères.');
      return;
    }
    setStep(1);
  }

  async function onSubmit() {
    setLoading(true);
    setError(null);
    if (!nom.trim() || !prenom.trim()) {
      setError('Indiquez le nom et le prénom du pêcheur.');
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError('Mot de passe : saisissez au moins 8 caractères.');
      setLoading(false);
      return;
    }
    if (!immat.trim()) {
      setError('L’immatriculation de l’embarcation est obligatoire.');
      setLoading(false);
      return;
    }
    const lecture = lireInscription(inscription);
    setErreursInscription(lecture.erreurs);
    if (aDesErreurs(lecture)) {
      setInscriptionOuverte(true);
      setError('Corrigez les informations d’inscription signalées.');
      setLoading(false);
      return;
    }
    try {
      const pecheur = await createPecheur(token, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        ...(paperLicence && licence.trim() ? { numero_licence: licence.trim() } : {}),
        email: email.trim() || undefined,
        mot_de_passe: password,
      });
      await createEmbarcation(token, {
        pecheur_id: pecheur.id,
        nom: bateau.trim() || `Embarcation ${pecheur.numero_licence}`,
        immatriculation: immat.trim(),
        type: 'pirogue',
        longueur: longueur.trim() ? Number(longueur.replace(',', '.')) : null,
        equipements: equipementsPayload({ engins, moteur, securite }),
        ...payloadCreation(lecture.valeurs),
      });
      setSavedLicence(pecheur.numero_licence);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScreenHeader
        kicker="Agent"
        title="Nouveau dossier"
        onBack={savedLicence || step === 0 ? onBack : () => setStep(0)}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {savedLicence ? null : <StepBar steps={STEPS} current={step} onSelect={setStep} />}

        {savedLicence ? (
          <GlassPanel style={styles.panel} contentStyle={styles.savedInner}>
            <View style={styles.savedHead}>
              <IconBadge icon="checkmark-circle" tone="ok" solid size={48} />
              <Text style={styles.savedTitle}>Dossier enregistré</Text>
            </View>
            <View style={styles.savedBox}>
              <Text style={styles.savedLabel}>Numéro de licence</Text>
              <Text style={styles.savedNumber} selectable adjustsFontSizeToFit numberOfLines={1}>
                {savedLicence}
              </Text>
            </View>
            <Text style={styles.savedBody}>
              Communiquez ce numéro au pêcheur : il se connecte avec son e-mail et son mot de passe.
            </Text>
            <GlowButton label="Terminer" icon="checkmark" onPress={onDone} />
          </GlassPanel>
        ) : step === 0 ? (
          <GlassPanel style={styles.panel}>
            <SectionTitle icon="person-outline" text="Identité du pêcheur" style={{ marginTop: 0 }} />
            <GlassField label="Nom" icon="person-outline" value={nom} onChangeText={setNom} />
            <GlassField label="Prénom" icon="person-outline" value={prenom} onChangeText={setPrenom} />
            <View style={styles.licenceRow}>
              <IconBadge icon="ribbon-outline" size={40} />
              <Text style={styles.licenceText}>
                Le numéro de licence est attribué automatiquement à l’enregistrement.
              </Text>
              <HelpTip title="Le numéro de licence" points={HELP_LICENCE} icon="ribbon-outline" />
            </View>
            <Pressable
              onPress={() => setPaperLicence((v) => !v)}
              style={styles.disclosure}
              accessibilityRole="button"
              accessibilityState={{ expanded: paperLicence }}
            >
              <Ionicons name="document-text-outline" size={20} color={colors.tide} />
              <Text style={styles.disclosureText}>Reprendre un numéro déjà délivré (support papier)</Text>
              <Ionicons name={paperLicence ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
            </Pressable>
            {paperLicence ? (
              <GlassField
                label="Numéro de la licence papier"
                icon="ribbon-outline"
                value={licence}
                onChangeText={setLicence}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="Laisser vide pour une attribution automatique"
              />
            ) : null}
            <SectionTitle icon="key-outline" text="Compte mobile" />
            <GlassField
              label="E-mail"
              icon="mail-outline"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              placeholder="Facultatif"
            />
            <GlassField
              label="Mot de passe"
              icon="key-outline"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Notice tone="error" text={error} style={{ marginTop: 0, marginBottom: 12 }} /> : null}
            <GlowButton label="Suivant : embarcation" icon="chevron-forward" onPress={nextStep} />
          </GlassPanel>
        ) : (
          <GlassPanel style={styles.panel}>
            <SectionTitle icon="boat-outline" text="Embarcation" style={{ marginTop: 0 }} />
            <GlassField label="Nom du bateau" icon="boat-outline" value={bateau} onChangeText={setBateau} />
            <GlassField label="Immatriculation" icon="pricetag-outline" value={immat} onChangeText={setImmat} />
            <GlassField
              label="Longueur (m)"
              icon="resize-outline"
              value={longueur}
              onChangeText={setLongueur}
              keyboardType="decimal-pad"
              placeholder="Ex. 7,5"
            />
            <GlassField
              label="Moteur"
              icon="speedometer-outline"
              value={moteur}
              onChangeText={setMoteur}
              placeholder="Ex. hors-bord 15 ch, ou aucun"
            />
            <SectionTitle icon="mci:hook" text="Engins de pêche" />
            <ChipGroup items={ENGINS} selected={engins} onChange={setEngins} />
            <SectionTitle icon="mci:lifebuoy" text="Sécurité et navigation" />
            <ChipGroup items={SECURITE} selected={securite} onChange={setSecurite} />

            <View style={styles.disclosureRow}>
              <Pressable
                onPress={() => setInscriptionOuverte((v) => !v)}
                style={[styles.disclosure, styles.disclosureFlex]}
                accessibilityRole="button"
                accessibilityState={{ expanded: inscriptionOuverte }}
              >
                <Ionicons name="radio-outline" size={20} color={colors.tide} />
                <Text style={styles.disclosureText}>Informations d’inscription (facultatives)</Text>
                <Ionicons name={inscriptionOuverte ? 'chevron-up' : 'chevron-down'} size={20} color={colors.inkSoft} />
              </Pressable>
              <HelpTip title="Informations d’inscription" points={AIDE_INSCRIPTION} icon="boat-outline" />
            </View>
            {inscriptionOuverte ? (
              <InscriptionFields
                value={inscription}
                onChange={(next) => {
                  setInscription(next);
                  setErreursInscription({});
                }}
                erreurs={erreursInscription}
              />
            ) : null}

            {error ? <Notice tone="error" text={error} style={{ marginTop: 0, marginBottom: 12 }} /> : null}

            <GlowButton
              label="Enregistrer le dossier"
              icon="save-outline"
              onPress={() => void onSubmit()}
              loading={loading}
              variant="accent"
            />
          </GlassPanel>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: 4,
    paddingBottom: space.xxl,
  },
  panel: { marginBottom: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  licenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  licenceText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.ink },
  disclosure: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    marginTop: 4,
    marginBottom: 8,
  },
  disclosureText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.tide },
  disclosureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disclosureFlex: { flex: 1 },
  savedInner: { padding: 18, gap: 14 },
  savedHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  savedTitle: { flex: 1, fontFamily: fonts.display, fontSize: 22, color: colors.abyss },
  savedBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  savedLabel: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  savedNumber: { fontFamily: fonts.bodyBold, fontSize: 24, color: colors.ink, letterSpacing: 0.4, marginTop: 2 },
  savedBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkMuted },
});
