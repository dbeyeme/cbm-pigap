import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { EmbarcationRegistre, EmbarcationSuivi, FicheIdentite } from '../api';
import { formatDateHeure, formatJour, formatMoment, formatNombre } from '../lib/format';
import { capitale, formatAnciennete, libelleSource, libelleStatutPecheur, resumeReleves } from '../lib/identite';
import { lignesInscription } from '../lib/inscription';
import { libelleStatutLicence, tonStatutLicence } from '../lib/licence';
import { colors, fonts, radii, space, tones } from '../theme';
import { GlassPanel } from './GlassPanel';
import { GlowButton } from './GlowButton';
import { IconBadge, ListRow, Notice, SectionTitle, Segmented, StatRow, StatTile, type SegmentOption } from './ui';

type Volet = 'registre' | 'suivi';

const VOLETS: ReadonlyArray<SegmentOption<Volet>> = [
  { id: 'registre', label: 'Registre', icon: 'document-text-outline' },
  { id: 'suivi', label: 'Suivi', icon: 'mci:map-marker-path' },
];

type Tone = keyof typeof tones;

const NON_RENSEIGNE = 'Non renseigné';

/** Étiquette d'état, non cliquable. */
function Etiquette({ texte, tone }: { texte: string; tone: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.etiquette, { backgroundColor: t.bg }]}>
      <Text style={[styles.etiquetteTexte, { color: t.fg }]}>{texte}</Text>
    </View>
  );
}

/** Une information : libellé au-dessus, valeur dessous. */
function Info({ libelle, valeur, selectable }: { libelle: string; valeur: string | null; selectable?: boolean }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLibelle}>{libelle}</Text>
      <Text style={[styles.infoValeur, !valeur && styles.infoVide]} selectable={selectable}>
        {valeur || NON_RENSEIGNE}
      </Text>
    </View>
  );
}

function caracteristiques(e: EmbarcationRegistre): Array<{ libelle: string; valeur: string | null }> {
  const engins = Array.isArray(e.equipements?.engins) ? (e.equipements?.engins as unknown[]) : [];
  return [
    { libelle: 'Type', valeur: capitale(e.type_pirogue ?? e.type) || null },
    { libelle: 'Longueur', valeur: e.longueur_m ? `${formatNombre(e.longueur_m, 1)} m` : null },
    { libelle: 'Matériau', valeur: capitale(e.materiau) || null },
    { libelle: 'Moteur', valeur: e.puissance_moteur_cv ? `${formatNombre(e.puissance_moteur_cv)} ch` : null },
    { libelle: 'Site d’attache', valeur: e.site_attache },
    { libelle: 'Balise satellitaire', valeur: e.balise ? 'Oui' : 'Non' },
    { libelle: 'Engins', valeur: engins.length ? engins.map((x) => capitale(String(x))).join(', ') : null },
  ];
}

function Registre({
  fiche,
  onCompleter,
}: {
  fiche: FicheIdentite;
  onCompleter?: (embarcation: EmbarcationRegistre) => void;
}) {
  const { identite, licence, organisation, embarcations } = fiche.registre;
  const initiales = `${identite.prenom.charAt(0)}${identite.nom.charAt(0)}`.toUpperCase();
  return (
    <>
      <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
        <View style={styles.entete}>
          <View style={styles.initiales}>
            <Text style={styles.initialesTexte}>{initiales}</Text>
          </View>
          <View style={styles.enteteTexte}>
            <Text style={styles.nom}>
              {identite.prenom} {identite.nom}
            </Text>
            <Etiquette
              texte={libelleStatutPecheur(identite.statut)}
              tone={identite.statut === 'actif' ? 'ok' : 'warn'}
            />
          </View>
        </View>
        <Info libelle="Nationalité" valeur={capitale(identite.nationalite) || null} />
      </GlassPanel>

      <SectionTitle icon="ribbon-outline" text="Licence" />
      <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
        <Etiquette texte={libelleStatutLicence(licence.statut)} tone={tonStatutLicence(licence.statut)} />
        <Info libelle="Numéro" valeur={licence.numero} selectable />
        <View style={styles.deuxColonnes}>
          <View style={styles.colonne}>
            <Info libelle="Délivrée le" valeur={formatJour(licence.date_delivrance) || null} />
          </View>
          <View style={styles.colonne}>
            <Info libelle="Valable jusqu’au" valeur={formatJour(licence.date_expiration) || null} />
          </View>
        </View>
      </GlassPanel>

      {organisation ? (
        <ListRow
          icon="people-outline"
          title={organisation.nom}
          meta={capitale(organisation.type) || 'Organisation'}
          style={styles.ligne}
        />
      ) : null}

      <SectionTitle icon="boat-outline" text="Embarcations" />
      {embarcations.length === 0 ? (
        <Notice tone="muted" icon="boat-outline" text="Aucune embarcation inscrite." />
      ) : (
        embarcations.map((e) => (
          <GlassPanel key={e.id} style={styles.panel} contentStyle={styles.panelInner}>
            <View style={styles.bateauTete}>
              <IconBadge icon="boat-outline" size={40} />
              <View style={styles.enteteTexte}>
                <Text style={styles.bateauNom}>{e.nom}</Text>
                <Text style={styles.bateauImmat} selectable>
                  {e.immatriculation}
                </Text>
              </View>
            </View>
            <View style={styles.grille}>
              {caracteristiques(e).map((c) => (
                <View key={c.libelle} style={styles.colonne}>
                  <Info libelle={c.libelle} valeur={c.valeur} />
                </View>
              ))}
            </View>
            <Text style={styles.sousTitre}>Inscription</Text>
            <View style={styles.grille}>
              {lignesInscription(e).map((l) => (
                <View key={l.champ} style={styles.colonne}>
                  <Info libelle={l.libelle} valeur={l.valeur} selectable />
                </View>
              ))}
            </View>
            {onCompleter ? (
              <GlowButton
                label="Compléter l’inscription"
                icon="create-outline"
                variant="ghost"
                onPress={() => onCompleter(e)}
              />
            ) : null}
          </GlassPanel>
        ))
      )}
    </>
  );
}

function BateauSuivi({ b }: { b: EmbarcationSuivi }) {
  return (
    <GlassPanel style={styles.panel} contentStyle={styles.panelInner}>
      <View style={styles.bateauTete}>
        <IconBadge icon="boat-outline" size={40} tone={b.dernier_releve ? 'info' : 'muted'} />
        <View style={styles.enteteTexte}>
          <Text style={styles.bateauNom}>{b.nom}</Text>
          <Text style={styles.bateauImmat}>{b.immatriculation}</Text>
        </View>
      </View>
      {b.dernier_releve ? (
        <>
          <Info
            libelle="Dernier relevé"
            valeur={`${capitale(formatAnciennete(b.dernier_releve.age_secondes))} · ${libelleSource(
              b.dernier_releve.source,
            )}`}
          />
          <Text style={styles.detail}>{formatDateHeure(b.dernier_releve.horodatage)}</Text>
          {b.periode_observee ? (
            <Info
              libelle="Période observée"
              valeur={`Du ${formatDateHeure(b.periode_observee.debut)} au ${formatDateHeure(b.periode_observee.fin)}`}
            />
          ) : null}
          <Info libelle="Relevés" valeur={resumeReleves(b.nb_releves, b.releves_par_source)} />
        </>
      ) : (
        <Notice tone="muted" icon="navigate-outline" text="Aucun relevé reçu pour cette embarcation." />
      )}
    </GlassPanel>
  );
}

function Suivi({ fiche }: { fiche: FicheIdentite }) {
  const { suivi } = fiche;
  const actives = suivi.embarcations.filter((b) => b.dernier_releve).length;
  return (
    <>
      <StatRow style={styles.stats}>
        <StatTile icon="mci:map-marker-path" value={suivi.nb_releves} label={suivi.nb_releves > 1 ? 'relevés' : 'relevé'} />
        <StatTile
          icon="boat-outline"
          value={`${actives}/${suivi.embarcations.length}`}
          label="bateaux suivis"
          tone={actives > 0 ? 'info' : 'muted'}
        />
      </StatRow>
      {suivi.embarcations.length === 0 ? (
        <Notice tone="muted" icon="boat-outline" text="Aucune embarcation inscrite." />
      ) : (
        suivi.embarcations.map((b) => <BateauSuivi key={b.embarcation_id} b={b} />)
      )}
      <Text style={styles.genere}>Mis à jour {formatMoment(suivi.genere_a)}</Text>
    </>
  );
}

type Props = {
  fiche: FicheIdentite;
  /** Agent : correction des informations d'inscription d'une embarcation. */
  onCompleter?: (embarcation: EmbarcationRegistre) => void;
};

/**
 * Fiche d'identité en deux volets : ce que dit le registre, ce que les
 * embarcations émettent. Aucune position n'y figure.
 */
export function FicheIdentiteView({ fiche, onCompleter }: Props) {
  const [volet, setVolet] = useState<Volet>('registre');
  return (
    <>
      <Segmented options={VOLETS} value={volet} onChange={setVolet} style={styles.segments} />
      {volet === 'registre' ? <Registre fiche={fiche} onCompleter={onCompleter} /> : <Suivi fiche={fiche} />}
    </>
  );
}

const styles = StyleSheet.create({
  segments: { marginBottom: space.md },
  panel: { marginBottom: space.md },
  panelInner: { padding: 16, gap: 12 },
  ligne: { marginBottom: space.md },
  stats: { marginBottom: space.md },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  enteteTexte: { flex: 1, minWidth: 0, gap: 6, alignItems: 'flex-start' },
  initiales: {
    width: 52,
    height: 52,
    borderRadius: radii.md,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialesTexte: { fontFamily: fonts.bodyBold, fontSize: 20, color: '#F8FAFC' },
  nom: { fontFamily: fonts.display, fontSize: 22, color: colors.abyss },
  etiquette: { alignSelf: 'flex-start', borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  etiquetteTexte: { fontFamily: fonts.bodyBold, fontSize: 15 },
  info: { gap: 2 },
  infoLibelle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  infoValeur: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.ink },
  infoVide: { fontFamily: fonts.body, color: colors.inkSoft },
  deuxColonnes: { flexDirection: 'row', gap: 12 },
  grille: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 12 },
  colonne: { flexBasis: '46%', flexGrow: 1 },
  bateauTete: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bateauNom: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.abyss },
  bateauImmat: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  sousTitre: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.tide, marginTop: 4 },
  detail: { fontFamily: fonts.body, fontSize: 16, color: colors.inkMuted, marginTop: -8 },
  genere: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', marginTop: 4 },
});
