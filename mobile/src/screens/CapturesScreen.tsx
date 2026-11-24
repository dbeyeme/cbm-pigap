import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Embarcation, listTrackedEmbarcations, type UtilisateurMe } from '../api';
import type { MobileMode } from '../auth/roles';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import {
  Chip,
  HelpTip,
  IconBadge,
  InfoSheet,
  ListRow,
  Notice,
  PhotoBanner,
  Segmented,
  StatRow,
  StatTile,
  StepBar,
  type IconName,
  type InfoPoint,
  type Step,
} from '../components/ui';
import { isInGabonZone } from '../geo/gabonMaritimeRoutes';
import { friendlyApiError } from '../lib/apiErrors';
import {
  formatCoordonnees,
  formatDateHeure,
  formatHeure,
  formatNombre,
  parsePosition,
  pluriel,
  type Hemisphere,
} from '../lib/format';
import {
  ENGINS_REF,
  ESPECES_MVP,
  ESPECES_REF,
  GROUPES_ICON,
  GROUPES_LABEL,
  METHODES_MVP,
  engineIcon,
  enginNom,
  especeNom,
  type GroupeEspece,
} from '../offline/catalog';
import {
  CachedEmbarcation,
  LocalCapture,
  cacheEmbarcations,
  countByStatus,
  deleteRejectedCapture,
  enqueueCapture,
  listCachedEmbarcations,
  listLocalCaptures,
} from '../offline/db';
import { subscribeSync, syncAll, syncQuietly } from '../offline/sync';
import { PHOTOS } from '../photos';
import { readCurrentPosition } from '../tracking/position';
import {
  MESSAGE_POSITION_APPROXIMATIVE,
  locationAccess,
  requestLocationAccess,
} from '../tracking/tracking';
import { colors, fonts, space } from '../theme';

type Props = {
  token: string;
  user: UtilisateurMe;
  mode?: MobileMode;
  onBack: () => void;
};

type View_ = 'nouvelle' | 'historique';

const STEPS: ReadonlyArray<Step> = [
  { label: 'Bateau', icon: 'boat-outline' },
  { label: 'Espèce', icon: 'fish-outline' },
  { label: 'Engin', icon: 'mci:hook' },
  { label: 'Lieu', icon: 'location-outline' },
  { label: 'Détails', icon: 'scale-outline' },
];
const STEP_LIEU = 3;
const STEP_DETAILS = 4;

const GROUPES: ReadonlyArray<GroupeEspece> = ['pelagique', 'demersal', 'crustace', 'autre'];

/** Lieu de pêche joint à la déclaration. */
type Lieu = {
  position: [number, number];
  /** `gps` : relevé par le téléphone ; `saisie` : coordonnées tapées par le pêcheur. */
  origine: 'gps' | 'saisie';
  releveA: string;
  precisionM: number | null;
};

type LieuEtat = 'vide' | 'recherche' | 'pret';

const HELP_CAPTURES: ReadonlyArray<InfoPoint> = [
  { icon: 'cloud-offline-outline', text: 'La déclaration s’enregistre sur le téléphone, même sans réseau.' },
  { icon: 'cloud-upload-outline', text: 'Elle part toute seule dès que le réseau revient. L’onglet Historique montre ce qui reste à envoyer.' },
  { icon: 'location-outline', text: 'Le lieu de pêche est facultatif : vous pouvez le corriger ou le retirer avant d’enregistrer.' },
  { icon: 'shield-outline', text: 'Une espèce protégée se déclare aussi : elle est signalée aux services des pêches.' },
];

const HELP_LIEU: ReadonlyArray<InfoPoint> = [
  { icon: 'locate-outline', text: 'Le téléphone relève sa position au moment où vous déclarez.' },
  { icon: 'create-outline', text: 'Vous déclarez au port ? Saisissez les coordonnées du lieu de pêche, ou retirez le lieu.' },
  { icon: 'map-outline', text: 'Ce lieu sert aux cartes d’activité par zone des services des pêches.' },
  { icon: 'hand-left-outline', text: 'Rien n’est joint sans que vous le voyiez ici.' },
];

function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function asBoats(cached: CachedEmbarcation[]): Embarcation[] {
  return cached.map((b) => ({
    id: b.id,
    pecheur_id: b.pecheur_id,
    nom: b.nom,
    immatriculation: b.immatriculation,
    type: b.type ?? null,
  }));
}

/** Date et heure locales au format du champ : « AAAA-MM-JJTHH:mm ». */
function localInputNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function CapturesScreen({ token, user, mode = 'agent', onBack }: Props) {
  const userId = user.id;
  const session = useMemo(() => ({ token, user }), [token, user]);

  const [view, setView] = useState<View_>('nouvelle');
  const [step, setStep] = useState(0);
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [groupe, setGroupe] = useState<GroupeEspece>('pelagique');
  const [espece, setEspece] = useState<string>(ESPECES_MVP[0]);
  const [methode, setMethode] = useState<string>(METHODES_MVP[0]);
  const [quantite, setQuantite] = useState('5');
  const [debarquement, setDebarquement] = useState('Owendo');
  const [dateCapture, setDateCapture] = useState(localInputNow);
  /** Tant que le pêcheur n'a pas touché à la date, elle suit l'heure du téléphone. */
  const [dateEdited, setDateEdited] = useState(false);
  const [localRows, setLocalRows] = useState<LocalCapture[]>([]);
  const [counts, setCounts] = useState({ pending: 0, synced: 0, rejected: 0 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lieu de pêche
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [lieuEtat, setLieuEtat] = useState<LieuEtat>('vide');
  const [lieuNote, setLieuNote] = useState<string | null>(null);
  const [lieuRetire, setLieuRetire] = useState(false);
  const [explainLocation, setExplainLocation] = useState(false);
  const [editing, setEditing] = useState(false);
  const [latText, setLatText] = useState('');
  const [hemisphere, setHemisphere] = useState<Hemisphere>('N');
  const [lonText, setLonText] = useState('');

  const refresh = useCallback(async () => {
    try {
      const [rows, c] = await Promise.all([listLocalCaptures(userId), countByStatus(userId)]);
      setLocalRows(rows);
      setCounts(c);
    } catch {
      // stockage local indisponible : la liste garde son dernier état
    }
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let cached: CachedEmbarcation[] = [];
      try {
        cached = await listCachedEmbarcations(userId);
      } catch {
        // aucun bateau connu du téléphone
      }
      if (cancelled) return;
      if (cached.length) {
        setBoats(asBoats(cached));
        setBoatId((prev) => prev ?? cached[0].id);
      }
      try {
        const emb = await listTrackedEmbarcations(token);
        if (cancelled) return;
        setBoats(emb);
        if (emb[0]) setBoatId((prev) => prev ?? emb[0].id);
        await cacheEmbarcations(
          userId,
          emb.map((b) => ({
            id: b.id,
            pecheur_id: b.pecheur_id,
            nom: b.nom,
            immatriculation: b.immatriculation,
            type: b.type,
          })),
        );
      } catch (err) {
        if (cancelled) return;
        if (cached.length) {
          setStatus('Pas de réseau : vos bateaux sont lus depuis le téléphone.');
        } else {
          setError(
            friendlyApiError(err) ||
              'Impossible de charger les bateaux. Connectez-vous une fois avec internet.',
          );
        }
      }
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [token, userId, refresh]);

  // Un envoi terminé ailleurs (retour du réseau, suivi GPS) met la liste à jour
  useEffect(() => subscribeSync(() => void refresh()), [refresh]);

  const selectedBoat = boats.find((b) => b.id === boatId) ?? null;
  const especesDuGroupe = useMemo(() => ESPECES_REF.filter((e) => e.groupe === groupe), [groupe]);
  const especeRef = ESPECES_REF.find((e) => e.code === espece);

  /** Relève la position du téléphone ; l'autorisation a déjà été expliquée et accordée. */
  const locate = useCallback(async () => {
    setLieuEtat('recherche');
    setLieuNote(null);
    setEditing(false);
    try {
      const location = await readCurrentPosition();
      const { longitude, latitude, accuracy } = location.coords;
      if (!isInGabonZone(longitude, latitude)) {
        setLieu(null);
        setLieuEtat('vide');
        setLieuNote('Votre position est hors des eaux gabonaises : elle n’est pas jointe.');
        return;
      }
      setLieu({
        position: [longitude, latitude],
        origine: 'gps',
        releveA: new Date(location.timestamp).toISOString(),
        precisionM: accuracy == null ? null : Math.round(accuracy),
      });
      setLieuRetire(false);
      setLieuEtat('pret');
    } catch (err) {
      setLieu(null);
      setLieuEtat('vide');
      setLieuNote(friendlyApiError(err));
    }
  }, []);

  /** Demande la position ; explique d'abord si le téléphone ne l'a pas encore autorisée. */
  async function askLocation() {
    const access = await locationAccess();
    if (access === 'accordee') {
      await locate();
      return;
    }
    if (access === 'approximative') {
      setLieuNote(MESSAGE_POSITION_APPROXIMATIVE);
      return;
    }
    setExplainLocation(true);
  }

  async function confirmLocation() {
    setExplainLocation(false);
    let access = await locationAccess();
    if (access === 'a_demander') access = await requestLocationAccess();
    if (access !== 'accordee') {
      setLieuNote(
        access === 'approximative'
          ? MESSAGE_POSITION_APPROXIMATIVE
          : 'Localisation non autorisée. Vous pouvez saisir les coordonnées, ou continuer sans lieu de pêche.',
      );
      return;
    }
    await locate();
  }

  // À l'arrivée sur l'étape, la position est relevée d'office si le téléphone
  // l'autorise déjà et si le pêcheur ne l'a pas retirée ; sinon rien n'est demandé.
  useEffect(() => {
    if (view !== 'nouvelle' || step !== STEP_LIEU) return;
    if (lieu || lieuRetire || lieuEtat !== 'vide') return;
    let cancelled = false;
    void locationAccess().then((access) => {
      if (!cancelled && access === 'accordee') void locate();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- déclenché par l'arrivée sur l'étape
  }, [view, step]);

  function openEditor() {
    setLieuNote(null);
    if (lieu) {
      setLatText(formatNombre(Math.abs(lieu.position[1]), 4));
      setHemisphere(lieu.position[1] < 0 ? 'S' : 'N');
      setLonText(formatNombre(Math.abs(lieu.position[0]), 4));
    }
    setEditing(true);
  }

  function applyEditor() {
    const position = parsePosition(latText, hemisphere, lonText);
    if (!position) {
      setLieuNote('Coordonnées illisibles. Exemple : latitude 0,3845 et longitude 9,2410.');
      return;
    }
    if (!isInGabonZone(position[0], position[1])) {
      setLieuNote('Ce point est hors des eaux gabonaises. Vérifiez la latitude et la longitude.');
      return;
    }
    setLieu({ position, origine: 'saisie', releveA: new Date().toISOString(), precisionM: null });
    setLieuRetire(false);
    setLieuEtat('pret');
    setLieuNote(null);
    setEditing(false);
  }

  function removeLieu() {
    setLieu(null);
    setLieuEtat('vide');
    setLieuRetire(true);
    setLieuNote(null);
    setEditing(false);
  }

  function goTo(next: number) {
    const target = Math.max(0, Math.min(STEPS.length - 1, next));
    setError(null);
    setStatus(null);
    // L'heure proposée est celle de l'arrivée sur l'étape, pas celle de l'ouverture de l'écran
    if (target === STEP_DETAILS && !dateEdited) setDateCapture(localInputNow());
    setStep(target);
  }

  /** Retire de la liste une déclaration que le serveur a refusée. */
  function removeRejected(item: LocalCapture) {
    Alert.alert(
      'Retirer cette déclaration ?',
      'Elle a été refusée et ne sera pas envoyée. Refaites la déclaration si elle est toujours d’actualité.',
      [
        { text: 'La garder', style: 'cancel' },
        {
          text: 'La retirer',
          style: 'destructive',
          onPress: () => {
            void deleteRejectedCapture(userId, item.id).then(refresh);
          },
        },
      ],
    );
  }

  function next() {
    if (step === 0 && !selectedBoat) {
      setError('Choisissez un bateau.');
      return;
    }
    goTo(step + 1);
  }

  async function onSaveLocal() {
    setError(null);
    setStatus(null);
    if (!selectedBoat) {
      setError('Choisissez un bateau.');
      goTo(0);
      return;
    }
    const qty = Number(quantite.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Indiquez une quantité en kilos, par exemple 5 ou 12,5.');
      return;
    }
    if (!debarquement.trim()) {
      setError('Indiquez le lieu de débarquement, par exemple Owendo.');
      return;
    }
    const parsedDate = new Date(dateCapture.includes('T') ? dateCapture : `${dateCapture}T00:00`);
    if (Number.isNaN(parsedDate.getTime())) {
      setError('Date illisible. Exemple : 2026-11-24T14:30.');
      return;
    }

    setBusy(true);
    try {
      await enqueueCapture({
        id: newClientId(),
        utilisateur_id: userId,
        pecheur_id: selectedBoat.pecheur_id ?? '',
        embarcation_id: selectedBoat.id,
        espece,
        quantite_kg: qty,
        methode,
        point_debarquement: debarquement.trim(),
        date_capture: parsedDate.toISOString(),
        position: lieu ? lieu.position : null,
      });
      await refresh();
      setStatus('Enregistré sur le téléphone. Envoi automatique dès que le réseau le permet.');
      setDateEdited(false);
      setStep(1);
      // L'écran n'attend pas le réseau : l'envoi se fait en parallèle
      void syncQuietly(session);
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSync() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const summary = await syncAll(session);
      await refresh();
      const report = summary.captures;
      if (report.error) {
        setError(report.error);
      } else if (report.pushed === 0) {
        setStatus('Rien à envoyer pour le moment.');
      } else {
        const sent = report.accepted + report.duplicates;
        const parts = [pluriel(sent, 'déclaration envoyée', 'déclarations envoyées')];
        if (report.rejected > 0) parts.push(pluriel(report.rejected, 'refusée', 'refusées'));
        if (report.deferred > 0) parts.push(pluriel(report.deferred, 'à renvoyer', 'à renvoyer'));
        setStatus(`${parts.join(', ')}.`);
      }
    } catch (err) {
      setError(friendlyApiError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.quai}
        kicker="Déclaration"
        title="Captures"
        onBack={onBack}
        right={<HelpTip title="Déclarer une capture" points={HELP_CAPTURES} icon="fish-outline" onDark />}
      />
      <View style={styles.segWrap}>
        <Segmented<View_>
          value={view}
          onChange={(v) => {
            setView(v);
            setError(null);
            setStatus(null);
          }}
          options={[
            { id: 'nouvelle', label: 'Nouvelle', icon: 'add-circle-outline' },
            { id: 'historique', label: 'Historique', icon: 'list-outline', badge: counts.pending },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {view === 'nouvelle' ? (
          <>
            <StepBar steps={STEPS} current={step} onSelect={goTo} />

            {/* Récapitulatif des choix déjà faits */}
            {step > 0 ? (
              <View style={styles.recap}>
                {selectedBoat ? <RecapPill icon="boat-outline" text={selectedBoat.nom} /> : null}
                {step > 1 && especeRef ? (
                  <RecapPill icon={GROUPES_ICON[especeRef.groupe] as IconName} text={especeRef.nom} />
                ) : null}
                {step > 2 ? <RecapPill icon={engineIcon(methode) as IconName} text={enginNom(methode)} /> : null}
                {step > STEP_LIEU ? (
                  <RecapPill
                    icon={lieu ? 'location' : 'location-outline'}
                    text={lieu ? 'Lieu joint' : 'Sans lieu'}
                  />
                ) : null}
              </View>
            ) : null}

            {status ? <Notice tone="ok" text={status} style={styles.topNotice} /> : null}
            {error ? <Notice tone="error" text={error} style={styles.topNotice} /> : null}

            <GlassPanel contentStyle={styles.panel}>
              {step === 0 ? (
                <>
                  <Text style={styles.question}>Quel bateau ?</Text>
                  {boats.length === 0 ? (
                    <Notice
                      tone="warn"
                      icon="boat-outline"
                      text={
                        mode === 'pecheur'
                          ? 'Aucun bateau lié à votre compte. Demandez à un agent de l’enregistrer.'
                          : 'Aucun bateau enregistré. Créez d’abord un dossier pêcheur.'
                      }
                    />
                  ) : (
                    boats.map((b) => (
                      <ListRow
                        key={b.id}
                        icon="boat-outline"
                        tone={b.id === boatId ? 'info' : 'muted'}
                        solid={b.id === boatId}
                        title={b.nom}
                        meta={[b.immatriculation, b.type].filter(Boolean).join(' · ')}
                        onPress={() => {
                          setBoatId(b.id);
                          goTo(1);
                        }}
                        right={
                          b.id === boatId ? (
                            <IconBadge icon="checkmark" tone="ok" solid size={28} />
                          ) : undefined
                        }
                      />
                    ))
                  )}
                </>
              ) : null}

              {step === 1 ? (
                <>
                  <Text style={styles.question}>Quelle espèce ?</Text>
                  <Segmented<GroupeEspece>
                    value={groupe}
                    onChange={setGroupe}
                    style={styles.groupes}
                    options={GROUPES.map((g) => ({
                      id: g,
                      label: GROUPES_LABEL[g],
                      icon: GROUPES_ICON[g] as IconName,
                    }))}
                  />
                  <View style={styles.wrapChips}>
                    {especesDuGroupe.map((e) => (
                      <Chip
                        key={e.code}
                        label={e.nom.replace(/\s*\(protégée?\)/, '')}
                        icon={e.protegee ? 'shield-outline' : (GROUPES_ICON[e.groupe] as IconName)}
                        alert={e.protegee}
                        on={e.code === espece}
                        onPress={() => {
                          setEspece(e.code);
                          if (!e.protegee) goTo(2);
                        }}
                      />
                    ))}
                  </View>
                  {especeRef?.protegee ? (
                    <Notice tone="error" icon="shield-outline" text="Espèce protégée : déclaration à signaler." />
                  ) : null}
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <Text style={styles.question}>Quel engin ?</Text>
                  <View style={styles.wrapChips}>
                    {ENGINS_REF.map((m) => (
                      <Chip
                        key={m.code}
                        label={m.nom}
                        icon={engineIcon(m.code) as IconName}
                        on={m.code === methode}
                        onPress={() => {
                          setMethode(m.code);
                          goTo(STEP_LIEU);
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {step === STEP_LIEU ? (
                <>
                  <View style={styles.questionRow}>
                    <Text style={[styles.question, styles.questionFlex]}>Où avez-vous pêché ?</Text>
                    <HelpTip title="Le lieu de pêche" points={HELP_LIEU} icon="location-outline" />
                  </View>

                  {lieuEtat === 'recherche' ? (
                    <View style={styles.lieuCard}>
                      <ActivityIndicator color={colors.tide} />
                      <Text style={styles.lieuTitle}>Recherche de votre position…</Text>
                    </View>
                  ) : lieu ? (
                    <View style={styles.lieuCard}>
                      <IconBadge icon="location" tone="ok" size={44} />
                      <View style={styles.lieuText}>
                        <Text style={styles.lieuTitle}>
                          {lieu.origine === 'gps'
                            ? `Position relevée à ${formatHeure(lieu.releveA)}`
                            : 'Coordonnées saisies'}
                        </Text>
                        <Text style={styles.lieuCoords} selectable>
                          {formatCoordonnees(lieu.position[0], lieu.position[1])}
                        </Text>
                        {lieu.precisionM != null ? (
                          <Text style={styles.lieuMeta}>Précision : environ {lieu.precisionM} m</Text>
                        ) : null}
                      </View>
                    </View>
                  ) : (
                    <View style={styles.lieuCard}>
                      <IconBadge icon="location-outline" tone="muted" size={44} />
                      <View style={styles.lieuText}>
                        <Text style={styles.lieuTitle}>Aucun lieu de pêche joint</Text>
                        <Text style={styles.lieuMeta}>
                          Facultatif : ajoutez-le pour situer votre pêche sur la carte.
                        </Text>
                      </View>
                    </View>
                  )}

                  {lieuNote ? <Notice tone="warn" text={lieuNote} /> : null}

                  {editing || lieuEtat === 'recherche' ? null : (
                    <View style={styles.navRow}>
                      <GlowButton
                        label="Précédent"
                        icon="chevron-back"
                        variant="ghost"
                        onPress={() => goTo(step - 1)}
                        style={styles.navBtn}
                      />
                      <GlowButton label="Suivant" icon="chevron-forward" onPress={next} style={styles.navBtn} />
                    </View>
                  )}

                  {editing ? (
                    <View style={styles.editor}>
                      <GlassField
                        label="Latitude (degrés)"
                        icon="swap-vertical-outline"
                        value={latText}
                        onChangeText={setLatText}
                        keyboardType="decimal-pad"
                        placeholder="Ex. 0,3845"
                      />
                      <Segmented<Hemisphere>
                        value={hemisphere}
                        onChange={setHemisphere}
                        style={styles.hemisphere}
                        options={[
                          { id: 'N', label: 'Nord', icon: 'arrow-up-outline' },
                          { id: 'S', label: 'Sud', icon: 'arrow-down-outline' },
                        ]}
                      />
                      <GlassField
                        label="Longitude est (degrés)"
                        icon="swap-horizontal-outline"
                        value={lonText}
                        onChangeText={setLonText}
                        keyboardType="decimal-pad"
                        placeholder="Ex. 9,2410"
                      />
                      <GlowButton
                        label="Utiliser ces coordonnées"
                        icon="checkmark-circle-outline"
                        onPress={applyEditor}
                      />
                      <GlowButton
                        label="Annuler la saisie"
                        icon="close-outline"
                        variant="ghost"
                        onPress={() => {
                          setEditing(false);
                          setLieuNote(null);
                        }}
                      />
                    </View>
                  ) : lieuEtat !== 'recherche' ? (
                    <View style={styles.lieuActions}>
                      <Text style={styles.lieuAutre}>
                        {lieu ? 'Ce n’est pas le bon endroit ?' : 'Ajouter le lieu de pêche'}
                      </Text>
                      <GlowButton
                        label={lieu ? 'Reprendre ma position' : 'Utiliser ma position'}
                        icon="locate-outline"
                        variant="ghost"
                        onPress={() => void askLocation()}
                      />
                      <GlowButton
                        label={lieu ? 'Corriger les coordonnées' : 'Saisir les coordonnées'}
                        icon="create-outline"
                        variant="ghost"
                        onPress={openEditor}
                      />
                      {lieu ? (
                        <GlowButton
                          label="Retirer le lieu de pêche"
                          icon="trash-outline"
                          variant="ghost"
                          onPress={removeLieu}
                        />
                      ) : null}
                    </View>
                  ) : null}
                </>
              ) : null}

              {step === STEP_DETAILS ? (
                <>
                  <Text style={styles.question}>Combien, où débarqué, quand ?</Text>
                  <GlassField
                    label="Quantité (kg)"
                    icon="scale-outline"
                    value={quantite}
                    onChangeText={setQuantite}
                    keyboardType="decimal-pad"
                    placeholder="Ex. 5"
                  />
                  <GlassField
                    label="Lieu de débarquement"
                    icon="flag-outline"
                    value={debarquement}
                    onChangeText={setDebarquement}
                    placeholder="Ex. Owendo"
                  />
                  <GlassField
                    label="Date et heure de la pêche"
                    icon="calendar-outline"
                    value={dateCapture}
                    onChangeText={(value) => {
                      setDateEdited(true);
                      setDateCapture(value);
                    }}
                    autoCapitalize="none"
                    placeholder="AAAA-MM-JJTHH:mm"
                  />
                </>
              ) : null}

              {step === STEP_LIEU ? null : (
                <View style={styles.navRow}>
                  {step > 0 ? (
                    <GlowButton
                      label="Précédent"
                      icon="chevron-back"
                      variant="ghost"
                      onPress={() => goTo(step - 1)}
                      style={styles.navBtn}
                    />
                  ) : null}
                  {step < STEPS.length - 1 ? (
                    <GlowButton
                      label="Suivant"
                      icon="chevron-forward"
                      onPress={next}
                      disabled={boats.length === 0 || lieuEtat === 'recherche'}
                      style={styles.navBtn}
                    />
                  ) : (
                    <GlowButton
                      label={busy ? 'Un instant…' : 'Enregistrer'}
                      icon="save-outline"
                      onPress={() => void onSaveLocal()}
                      disabled={busy}
                      style={styles.navBtn}
                    />
                  )}
                </View>
              )}
            </GlassPanel>
          </>
        ) : (
          <>
            <StatRow style={styles.historyStats}>
              <StatTile
                icon="cloud-upload-outline"
                value={counts.pending}
                label="à envoyer"
                tone={counts.pending > 0 ? 'warn' : 'muted'}
              />
              <StatTile
                icon="cloud-done-outline"
                value={counts.synced}
                label={counts.synced > 1 ? 'envoyées' : 'envoyée'}
                tone="ok"
              />
              {counts.rejected > 0 ? (
                <StatTile
                  icon="alert-circle-outline"
                  value={counts.rejected}
                  label={counts.rejected > 1 ? 'refusées' : 'refusée'}
                  tone="error"
                />
              ) : (
                <StatTile
                  icon="fish-outline"
                  value={localRows.length}
                  label={localRows.length > 1 ? 'déclarations' : 'déclaration'}
                />
              )}
            </StatRow>

            <GlowButton
              label={
                busy
                  ? 'Envoi en cours…'
                  : counts.pending > 0
                    ? `Envoyer ${pluriel(counts.pending, 'déclaration', 'déclarations')}`
                    : 'Tout est envoyé'
              }
              icon={counts.pending > 0 ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
              onPress={() => void onSync()}
              disabled={busy || counts.pending === 0}
              variant={counts.pending > 0 ? 'primary' : 'ghost'}
            />
            {status ? <Notice tone="ok" text={status} /> : null}
            {error ? <Notice tone="error" text={error} /> : null}

            <View style={styles.spacer} />
            {localRows.length === 0 ? (
              <Notice
                tone="muted"
                icon="fish-outline"
                text="Aucune déclaration pour l’instant. Vos déclarations apparaîtront ici, avec leur état d’envoi."
              />
            ) : (
              localRows.map((item) => {
                const ref = ESPECES_REF.find((e) => e.code === item.espece);
                const synced = item.sync_status === 'synced';
                const refused = item.sync_status === 'rejected';
                const waiting = item.sync_status === 'pending' && Boolean(item.last_error);
                const details = `${enginNom(item.methode)} · ${item.point_debarquement} · ${formatDateHeure(item.date_capture)}${item.position ? ' · lieu joint' : ''}`;
                return (
                  <ListRow
                    key={item.id}
                    icon={(ref ? GROUPES_ICON[ref.groupe] : 'fish-outline') as IconName}
                    tone={ref?.protegee ? 'error' : 'info'}
                    title={`${especeNom(item.espece)} · ${formatNombre(item.quantite_kg, Number.isInteger(item.quantite_kg) ? 0 : 1)} kg`}
                    meta={
                      refused
                        ? `Refusée : ${item.last_error ?? 'motif non précisé'} Touchez pour la retirer.`
                        : waiting
                          ? `En attente : ${item.last_error}`
                          : details
                    }
                    onPress={refused ? () => removeRejected(item) : undefined}
                    right={
                      <IconBadge
                        icon={
                          synced
                            ? 'cloud-done-outline'
                            : refused
                              ? 'alert-circle-outline'
                              : 'phone-portrait-outline'
                        }
                        tone={synced ? 'ok' : refused ? 'error' : 'warn'}
                        size={32}
                      />
                    }
                  />
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <InfoSheet
        visible={explainLocation}
        onClose={() => setExplainLocation(false)}
        title="Avant d’utiliser votre position"
        icon="location-outline"
        points={[
          { icon: 'locate-outline', text: 'Le téléphone relève sa position une seule fois, pour cette déclaration.' },
          { icon: 'create-outline', text: 'Vous la voyez avant d’enregistrer : vous pouvez la corriger ou la retirer.' },
          { icon: 'location-outline', text: 'Le téléphone va vous demander l’accès à la position : acceptez pour continuer.' },
        ]}
        actions={
          <>
            <GlowButton label="Utiliser ma position" icon="locate-outline" onPress={() => void confirmLocation()} />
            <GlowButton
              label="Pas maintenant"
              icon="close-outline"
              variant="ghost"
              onPress={() => setExplainLocation(false)}
            />
          </>
        }
      />
    </View>
  );
}

function RecapPill({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.pill}>
      <IconBadge icon={icon} size={24} />
      <Text style={styles.pillText} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  segWrap: { paddingHorizontal: space.lg, marginBottom: space.sm },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56, paddingTop: 4 },
  panel: { padding: 16 },
  question: {
    fontFamily: fonts.display,
    fontSize: 20,
    color: colors.abyss,
    marginBottom: 12,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  questionFlex: { flex: 1, marginBottom: 0 },
  groupes: { marginBottom: 12 },
  recap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  topNotice: { marginTop: 0, marginBottom: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
    paddingLeft: 4,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    maxWidth: '100%',
  },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.ink, flexShrink: 1 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  lieuCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 76,
    marginTop: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  lieuText: { flex: 1, minWidth: 0 },
  lieuTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  lieuCoords: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.tide, marginTop: 2 },
  lieuMeta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkMuted, marginTop: 2 },
  lieuActions: { gap: 8, marginTop: 18 },
  lieuAutre: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.inkMuted },
  editor: { marginTop: 12, gap: 8 },
  hemisphere: { marginTop: -8, marginBottom: 8 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  navBtn: { flex: 1 },
  historyStats: { marginBottom: 12 },
  spacer: { height: space.md },
});
