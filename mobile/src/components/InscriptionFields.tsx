import type { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, type KeyboardTypeOptions } from 'react-native';

import type { ChampInscription, SaisieInscription } from '../lib/inscription';
import { LIBELLES_INSCRIPTION } from '../lib/inscription';
import { colors, fonts } from '../theme';
import { GlassField } from './GlassField';
import type { InfoPoint } from './ui';

/** Aide commune au nouveau dossier et à la correction depuis la fiche. */
export const AIDE_INSCRIPTION: ReadonlyArray<InfoPoint> = [
  { icon: 'checkmark-done-outline', text: 'Toutes ces informations sont facultatives : renseignez celles que vous connaissez.' },
  { icon: 'radio-outline', text: 'MMSI : identifiant à 9 chiffres de la radio maritime de bord, s’il y en a une.' },
  { icon: 'boat-outline', text: 'Numéro OMI : 7 chiffres, pour les navires qui en ont un.' },
  { icon: 'people-outline', text: 'Propriétaire et exploitant : seulement s’ils diffèrent du titulaire de la licence.' },
];

type Spec = {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'characters' | 'sentences' | 'words';
  maxLength?: number;
};

const SPECS: Record<ChampInscription, Spec> = {
  mmsi: { icon: 'radio-outline', placeholder: '9 chiffres', keyboardType: 'number-pad', maxLength: 15 },
  numero_omi: { icon: 'barcode-outline', placeholder: '7 chiffres', autoCapitalize: 'characters', maxLength: 14 },
  indicatif_radio: { icon: 'mic-outline', placeholder: 'Lettres et chiffres', autoCapitalize: 'characters', maxLength: 12 },
  jauge_brute: { icon: 'cube-outline', placeholder: 'Ex. 12,5', keyboardType: 'decimal-pad', maxLength: 10 },
  annee_construction: { icon: 'calendar-outline', placeholder: 'Ex. 2014', keyboardType: 'number-pad', maxLength: 4 },
  proprietaire: { icon: 'person-outline', placeholder: 'S’il diffère du titulaire', autoCapitalize: 'words', maxLength: 255 },
  exploitant: { icon: 'briefcase-outline', placeholder: 'S’il diffère du propriétaire', autoCapitalize: 'words', maxLength: 255 },
};

const ORDRE: ReadonlyArray<ChampInscription> = [
  'mmsi',
  'numero_omi',
  'indicatif_radio',
  'jauge_brute',
  'annee_construction',
  'proprietaire',
  'exploitant',
];

type Props = {
  value: SaisieInscription;
  onChange: (next: SaisieInscription) => void;
  erreurs?: Partial<Record<ChampInscription, string>>;
};

/** Les sept informations d'inscription d'une embarcation, toutes facultatives. */
export function InscriptionFields({ value, onChange, erreurs = {} }: Props) {
  return (
    <View>
      {ORDRE.map((champ) => {
        const spec = SPECS[champ];
        const erreur = erreurs[champ];
        return (
          <View key={champ}>
            <GlassField
              label={LIBELLES_INSCRIPTION[champ]}
              icon={spec.icon}
              value={value[champ]}
              onChangeText={(texte) => onChange({ ...value, [champ]: texte })}
              placeholder={spec.placeholder}
              keyboardType={spec.keyboardType}
              autoCapitalize={spec.autoCapitalize ?? 'none'}
              autoCorrect={false}
              maxLength={spec.maxLength}
              accessibilityHint={erreur}
            />
            {erreur ? (
              <Text style={styles.erreur} accessibilityLiveRegion="polite">
                {erreur}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  erreur: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
    marginTop: -8,
    marginBottom: 14,
  },
});
