import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { createEmbarcation, createPecheur } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { Chip, Notice, ScreenHeader, SectionTitle, StepBar, type IconName, type Step } from '../components/ui';
import { friendlyApiError } from '../lib/apiErrors';
import { space } from '../theme';

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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('PecheurPass1!');
  const [bateau, setBateau] = useState('');
  const [immat, setImmat] = useState('');
  const [longueur, setLongueur] = useState('');
  const [moteur, setMoteur] = useState('');
  const [engins, setEngins] = useState<string[]>([]);
  const [securite, setSecurite] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneFlash, setDoneFlash] = useState(false);
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
    try {
      const pecheur = await createPecheur(token, {
        nom: nom.trim(),
        prenom: prenom.trim(),
        ...(licence.trim() ? { numero_licence: licence.trim() } : {}),
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
      });
      setDoneFlash(true);
      setTimeout(onDone, 700);
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
      <ScreenHeader kicker="Agent" title="Nouveau dossier" onBack={step === 0 ? onBack : () => setStep(0)} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <StepBar steps={STEPS} current={step} onSelect={setStep} />

        {step === 0 ? (
          <GlassPanel style={styles.panel}>
            <SectionTitle icon="person-outline" text="Identité du pêcheur" style={{ marginTop: 0 }} />
            <GlassField label="Nom" icon="person-outline" value={nom} onChangeText={setNom} />
            <GlassField label="Prénom" icon="person-outline" value={prenom} onChangeText={setPrenom} />
            <GlassField
              label="N° licence"
              icon="ribbon-outline"
              value={licence}
              onChangeText={setLicence}
              placeholder="Vide : attribution automatique"
            />
            <SectionTitle icon="key-outline" text="Compte mobile" />
            <GlassField
              label="E-mail"
              icon="mail-outline"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              placeholder="optionnel"
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
              placeholder="ex. 7,5"
            />
            <GlassField
              label="Moteur"
              icon="speedometer-outline"
              value={moteur}
              onChangeText={setMoteur}
              placeholder="ex. hors-bord 15 ch, ou aucun"
            />
            <SectionTitle icon="mci:hook" text="Engins de pêche" />
            <ChipGroup items={ENGINS} selected={engins} onChange={setEngins} />
            <SectionTitle icon="mci:lifebuoy" text="Sécurité et navigation" />
            <ChipGroup items={SECURITE} selected={securite} onChange={setSecurite} />

            {error ? <Notice tone="error" text={error} style={{ marginTop: 0, marginBottom: 12 }} /> : null}
            {doneFlash ? <Notice tone="ok" text="Dossier enregistré" style={{ marginTop: 0, marginBottom: 12 }} /> : null}

            <GlowButton
              label="Enregistrer le dossier"
              icon="save-outline"
              onPress={onSubmit}
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
});
