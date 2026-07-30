import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { createEmbarcation, createPecheur } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { friendlyApiError } from '../lib/apiErrors';
import { colors, fonts, space } from '../theme';

type Props = {
  token: string;
  onDone: () => void;
  onBack: () => void;
};

export function CreatePecheurScreen({ token, onDone, onBack }: Props) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [licence, setLicence] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('PecheurPass1!');
  const [bateau, setBateau] = useState('');
  const [immat, setImmat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [doneFlash, setDoneFlash] = useState(false);

  async function onSubmit() {
    setLoading(true);
    setError(null);
    if (!nom.trim() || !prenom.trim()) {
      setError('Indiquez le nom et le prénom du pêcheur.');
      setLoading(false);
      return;
    }
    if (!licence.trim()) {
      setError('Le numéro de licence est obligatoire.');
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
        numero_licence: licence.trim(),
        email: email.trim() || undefined,
        mot_de_passe: password,
      });
      await createEmbarcation(token, {
        pecheur_id: pecheur.id,
        nom: bateau.trim() || `Embarcation ${licence.trim()}`,
        immatriculation: immat.trim(),
        type: 'pirogue',
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={onBack} style={styles.backRow}>
          <Ionicons name="chevron-back" size={22} color={colors.foam} />
          <Text style={styles.backText}>Retour</Text>
        </Pressable>

        <Text style={styles.title}>Nouveau dossier</Text>
        <Text style={styles.lead}>Pêcheur et embarcation en une seule saisie.</Text>

        <GlassPanel style={styles.panel}>
          <SectionLabel icon="person-outline" text="Identité pêcheur" />
          <GlassField label="Nom" icon="text-outline" value={nom} onChangeText={setNom} />
          <GlassField
            label="Prénom"
            icon="text-outline"
            value={prenom}
            onChangeText={setPrenom}
          />
          <GlassField
            label="N° licence"
            icon="ribbon-outline"
            value={licence}
            onChangeText={setLicence}
            placeholder="Obligatoire"
          />
          <GlassField
            label="E-mail compte"
            icon="mail-outline"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
            placeholder="optionnel"
          />
          <GlassField
            label="Mot de passe compte"
            icon="key-outline"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </GlassPanel>

        <GlassPanel style={styles.panel}>
          <SectionLabel icon="boat-outline" text="Embarcation" />
          <GlassField
            label="Nom du bateau"
            icon="boat-outline"
            value={bateau}
            onChangeText={setBateau}
          />
          <GlassField
            label="Immatriculation"
            icon="pricetag-outline"
            value={immat}
            onChangeText={setImmat}
          />
        </GlassPanel>

        {error ? (
          <View style={styles.errorRow}>
            <Ionicons name="alert-circle" size={16} color={colors.danger} />
            <Text style={styles.error}>{error}</Text>
          </View>
        ) : null}
        {doneFlash ? (
          <View style={styles.successRow}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.success}>Dossier enregistré</Text>
          </View>
        ) : null}

        <GlowButton
          label="Enregistrer le dossier"
          icon="save-outline"
          onPress={onSubmit}
          loading={loading}
          variant="accent"
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SectionLabel({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={styles.section}>
      <Ionicons name={icon} size={16} color={colors.foam} />
      <Text style={styles.sectionText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 32,
    color: colors.ink,
  },
  lead: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    marginBottom: space.lg,
    marginTop: 4,
  },
  panel: { marginBottom: space.md },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  sectionText: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    fontSize: 15,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  error: { flex: 1, color: colors.danger, fontFamily: fonts.body, fontSize: 13 },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: space.md,
  },
  success: { color: colors.success, fontFamily: fonts.bodyBold },
});
