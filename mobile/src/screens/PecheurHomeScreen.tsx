import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { getAvisMer, type AvisMer } from '../api';
import { acknowledgeAttachmentInfo, attachmentInfoPending } from '../auth/attachment';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { ShipIcon } from '../components/ShipIcon';
import {
  ActionTile,
  AppIcon,
  HelpTip,
  IconBadge,
  ListRow,
  PhotoBanner,
  type InfoPoint,
} from '../components/ui';
import { formatHeure, formatMoment, pluriel } from '../lib/format';
import { retourDepasse } from '../lib/sorties';
import {
  countByStatus,
  countPendingPositions,
  countPendingSorties,
  currentSortie,
  type LocalSortie,
} from '../offline/db';
import { subscribeSync } from '../offline/sync';
import { PHOTOS } from '../photos';
import { readTrackingState, TRACKING_IDLE, type TrackingState } from '../tracking/state';
import { subscribeTracking } from '../tracking/task';
import { colors, fonts, radii, space } from '../theme';

const ILLU = {
  captures: require('../../assets/illustrations/icon-captures.png'),
  trajectories: require('../../assets/illustrations/icon-trajectories.png'),
  abo: require('../../assets/illustrations/icon-licences.png'),
} as const;

type Props = {
  userName: string;
  userId: string;
  /** Jeton de session : permet d'afficher l'avis de mer du secteur du pêcheur. */
  token?: string;
  /** Dernière position connue [lon, lat] ; défaut : estuaire de Libreville. */
  position?: [number, number];
  onCaptures: () => void;
  onTracking: () => void;
  onCarte: () => void;
  /** Page de profil : présentation, espèces, tarifs, ouverture au public. */
  onProfil?: () => void;
  onAbonnement: () => void;
  onRedevances?: () => void;
  onLogout: () => void;
};

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'fish-outline', text: 'Déclarez vos captures au retour de pêche : l’application marche sans réseau.' },
  { icon: 'navigate-outline', text: 'Démarrez le suivi GPS en quittant le quai, arrêtez-le au retour.' },
  { icon: 'id-card-outline', text: 'Votre carte porte le QR de votre licence : présentez-la lors d’un contrôle.' },
  { icon: 'storefront-outline', text: 'Votre page présente votre activité : espèces pêchées et, si vous le souhaitez, vos tarifs.' },
  { icon: 'cloud-upload-outline', text: 'Ce qui n’a pas pu partir reste sur le téléphone et s’envoie dès que le réseau revient.' },
  { icon: 'phone-portrait-outline', text: 'Ce téléphone est rattaché à votre compte pêcheur. Pour en changer, adressez-vous à un agent de contrôle.' },
];

const HELP_APPAREIL: ReadonlyArray<InfoPoint> = [
  { icon: 'phone-portrait-outline', text: 'Un téléphone n’accepte qu’un seul compte pêcheur : personne ne peut envoyer de positions à votre place depuis un autre compte.' },
  { icon: 'swap-horizontal-outline', text: 'Téléphone changé, perdu ou en panne ? Adressez-vous à un agent de contrôle : il libère l’ancien téléphone.' },
  { icon: 'finger-print-outline', text: 'Pour cela, l’application transmet l’identifiant de ce téléphone à la plateforme CBM-PIGAP.' },
  { icon: 'log-out-outline', text: 'Vous déconnecter ne change rien : le téléphone reste rattaché à votre compte.' },
];

/** Accueil du pêcheur : déclarer, suivre sa sortie, présenter sa carte, régler. */
export function PecheurHomeScreen({
  userName,
  userId,
  token,
  position,
  onCaptures,
  onTracking,
  onCarte,
  onProfil,
  onAbonnement,
  onRedevances,
  onLogout,
}: Props) {
  const first = userName.trim().split(/\s+/)[0] || '';
  const [avis, setAvis] = useState<AvisMer | null>(null);
  const [tracking, setTracking] = useState<TrackingState>(TRACKING_IDLE);
  const [pending, setPending] = useState({ captures: 0, positions: 0, sorties: 0 });
  const [sortie, setSortie] = useState<LocalSortie | null>(null);
  /** Première connexion sur ce téléphone : le pêcheur est informé du rattachement. */
  const [attachmentInfo, setAttachmentInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void attachmentInfoPending(userId).then((pendingInfo) => {
      if (!cancelled) setAttachmentInfo(pendingInfo);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!token) return;
    const [lon, lat] = position ?? [9.3, 0.3];
    let cancelled = false;
    getAvisMer(token, lon, lat)
      .then((a) => {
        if (!cancelled) setAvis(a);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token, position]);

  /** État du suivi et saisies en attente : lus sur le téléphone, sans réseau. */
  const refreshLocal = useCallback(async () => {
    try {
      const [state, captures, positions, sorties, enCours] = await Promise.all([
        readTrackingState(),
        countByStatus(userId),
        countPendingPositions(userId),
        countPendingSorties(userId),
        currentSortie(userId),
      ]);
      setTracking(state);
      setPending({ captures: captures.pending, positions, sorties });
      setSortie(enCours);
    } catch {
      // stockage local indisponible : l'accueil reste utilisable
    }
  }, [userId]);

  useEffect(() => {
    void refreshLocal();
    const offSync = subscribeSync(() => void refreshLocal());
    const offTracking = subscribeTracking(() => void refreshLocal());
    return () => {
      offSync();
      offTracking();
    };
  }, [refreshLocal]);

  const trackingMine = tracking.actif && tracking.utilisateurId === userId;
  const waiting = pending.captures + pending.positions + pending.sorties;
  const sortieEnRetard = sortie ? retourDepasse(sortie.retour_prevu_a) : false;

  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.mer}
        kicker="Espace pêcheur"
        title={`Bonjour${first ? `, ${first}` : ''}`}
        tall
        right={<HelpTip title="Votre espace" points={HELP_POINTS} icon="boat-outline" onDark />}
      />
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.syncRow} accessibilityLiveRegion="polite">
          <AppIcon
            name={waiting > 0 ? 'cloud-offline-outline' : 'cloud-done-outline'}
            size={20}
            color={waiting > 0 ? colors.warn : colors.success}
          />
          <Text style={[styles.syncText, { color: waiting > 0 ? colors.warn : colors.success }]}>
            {waiting > 0
              ? `En attente de synchronisation : ${pluriel(waiting, 'saisie', 'saisies')}`
              : 'Synchronisé'}
          </Text>
        </View>

        {attachmentInfo ? (
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <IconBadge icon="phone-portrait-outline" size={40} />
              <Text style={styles.infoText}>
                Ce téléphone est rattaché à votre compte : vos positions sont bien les vôtres.
              </Text>
              <HelpTip title="Un téléphone, un compte pêcheur" points={HELP_APPAREIL} icon="phone-portrait-outline" />
            </View>
            <GlowButton
              label="J’ai compris"
              icon="checkmark"
              variant="ghost"
              onPress={() => {
                setAttachmentInfo(false);
                void acknowledgeAttachmentInfo(userId);
              }}
            />
          </View>
        ) : null}

        {!trackingMine && tracking.interrompuA && tracking.utilisateurId === userId ? (
          <ListRow
            icon="alert-circle-outline"
            tone="warn"
            title="Suivi GPS interrompu"
            meta="Touchez pour ouvrir le suivi et le redémarrer si vous êtes encore en mer."
            onPress={onTracking}
            style={styles.interruptedRow}
          />
        ) : null}

        {sortie ? (
          <ListRow
            icon={sortieEnRetard ? 'alarm-outline' : 'fa6:sailboat'}
            tone={sortieEnRetard ? 'warn' : 'ok'}
            title={
              sortieEnRetard
                ? 'Heure de retour dépassée'
                : `Retour prévu ${formatMoment(sortie.retour_prevu_a)}`
            }
            meta={
              sortieEnRetard
                ? 'Touchez pour déclarer votre retour dès que vous êtes à terre.'
                : `${sortie.embarcation_nom ?? 'Votre bateau'} · en mer`
            }
            onPress={onTracking}
            style={sortieEnRetard ? styles.interruptedRow : styles.trackingRow}
          />
        ) : null}

        {trackingMine ? (
          <ListRow
            icon="navigate"
            tone="ok"
            solid
            title="Suivi GPS en cours"
            meta={`${tracking.embarcationNom ?? 'Votre bateau'}${tracking.debutA ? ` · depuis ${formatHeure(tracking.debutA)}` : ''}`}
            onPress={onTracking}
            style={styles.trackingRow}
          />
        ) : null}

        <GlassPanel style={styles.heroCard} contentStyle={styles.heroInner}>
          <View style={styles.heroRow}>
            <View style={styles.heroBadge}>
              <ShipIcon size={30} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroTitle}>Ma sortie</Text>
              <Text style={styles.heroBody}>Déclarez même sans réseau, l’envoi suivra.</Text>
            </View>
          </View>
          <GlowButton label="Enregistrer une capture" icon="fish-outline" onPress={onCaptures} />
        </GlassPanel>

        {avis ? <AvisMerCard avis={avis} /> : null}

        <View style={styles.grid}>
          <ActionTile icon="id-card-outline" title="Ma carte" subtitle="Licence et QR" onPress={onCarte} />
          <ActionTile
            illustration={ILLU.trajectories}
            title="Mon GPS"
            subtitle={trackingMine ? 'Suivi en cours' : 'Suivre ma sortie'}
            badge={pending.positions > 0 ? pluriel(pending.positions, 'à envoyer', 'à envoyer') : undefined}
            onPress={onTracking}
          />
          <ActionTile
            illustration={ILLU.captures}
            title="Mes captures"
            subtitle="Historique et envoi"
            badge={pending.captures > 0 ? pluriel(pending.captures, 'à envoyer', 'à envoyer') : undefined}
            onPress={onCaptures}
          />
          {onProfil ? (
            <ActionTile icon="storefront-outline" title="Ma page" subtitle="Profil et tarifs" onPress={onProfil} />
          ) : null}
          <ActionTile illustration={ILLU.abo} title="Abonnement" subtitle="Mobile Money" onPress={onAbonnement} />
          {onRedevances ? (
            <ActionTile icon="mci:receipt-text-outline" title="Redevances" subtitle="Taxe et quittances" onPress={onRedevances} />
          ) : null}
        </View>

        <GlowButton
          label="Se déconnecter"
          icon="log-out-outline"
          variant="ghost"
          onPress={onLogout}
          style={styles.logout}
        />
      </ScrollView>
    </View>
  );
}

const NIVEAU = {
  vert: { label: 'Mer praticable', color: '#15803d', bg: 'rgba(21, 128, 61, 0.1)', icon: 'checkmark-circle-outline' as const },
  orange: { label: 'Prudence en mer', color: '#c2410c', bg: 'rgba(194, 65, 12, 0.1)', icon: 'warning-outline' as const },
  rouge: { label: 'Sortie déconseillée', color: '#b91c1c', bg: 'rgba(185, 28, 28, 0.1)', icon: 'alert-circle-outline' as const },
};

/** Avis de mer du secteur le plus proche : niveau, conseil, conditions clés. */
function AvisMerCard({ avis }: { avis: AvisMer }) {
  const n = NIVEAU[(avis.niveau as keyof typeof NIVEAU) in NIVEAU ? (avis.niveau as keyof typeof NIVEAU) : 'vert'];
  const c = avis.secteur?.conditions;
  const facts: Array<{ icon: Parameters<typeof AppIcon>[0]['name']; text: string }> = [];
  if (c) {
    if (c.etat_mer) facts.push({ icon: 'mci:waves', text: `Mer ${c.etat_mer}` });
    if (c.houle_m != null) facts.push({ icon: 'trending-up-outline', text: `Houle ${c.houle_m.toFixed(1).replace('.', ',')} m` });
    if (c.rafales_max_24h_noeuds != null) facts.push({ icon: 'mci:weather-windy', text: `Rafales ${Math.round(c.rafales_max_24h_noeuds)} nd` });
    if (c.courant_noeuds != null) facts.push({ icon: 'swap-horizontal-outline', text: `Courant ${c.courant_noeuds.toFixed(1).replace('.', ',')} nd` });
    if (c.maree) facts.push({ icon: 'water-outline', text: `Marée ${c.maree}` });
  }
  return (
    <GlassPanel style={styles.avisCard} contentStyle={styles.avisInner}>
      <View style={styles.avisHead}>
        <View style={[styles.avisIcon, { backgroundColor: n.bg }]}>
          <Ionicons name={n.icon} size={24} color={n.color} />
        </View>
        <View style={styles.heroText}>
          <Text style={[styles.avisLevel, { color: n.color }]}>{n.label}</Text>
          <Text style={styles.avisTitle} numberOfLines={1}>
            {avis.secteur?.nom ?? 'Avis de mer'}
          </Text>
        </View>
      </View>
      {facts.length ? (
        <View style={styles.facts}>
          {facts.map((f) => (
            <View key={f.text} style={styles.fact}>
              <AppIcon name={f.icon} size={14} color={colors.tide} />
              <Text style={styles.factText}>{f.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {avis.fleuve_proche && avis.fleuve_proche.niveau !== 'normal' ? (
        <Text style={styles.avisMeta}>{avis.fleuve_proche.conseil}</Text>
      ) : null}
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    paddingHorizontal: space.lg,
    paddingTop: 4,
    paddingBottom: space.xl,
  },
  infoCard: {
    gap: 10,
    padding: 12,
    marginBottom: space.md,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: 'rgba(30, 77, 123, 0.28)',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.ink },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.sm },
  syncText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16 },
  trackingRow: { marginBottom: space.md, borderColor: 'rgba(4, 120, 87, 0.35)' },
  interruptedRow: { marginBottom: space.md, borderColor: 'rgba(180, 83, 9, 0.4)' },
  heroCard: { marginBottom: space.md },
  heroInner: { gap: 14, padding: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroText: { flex: 1, minWidth: 0 },
  heroTitle: { fontFamily: fonts.display, fontSize: 20, color: colors.abyss },
  heroBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.inkMuted, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  logout: { marginTop: space.lg },
  avisCard: { marginBottom: space.md },
  avisInner: { gap: 10, padding: 14 },
  avisHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avisIcon: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avisLevel: { fontFamily: fonts.bodyBold, fontSize: 16 },
  avisTitle: { fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted, marginTop: 1 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  factText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink },
  avisMeta: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.tide },
});
