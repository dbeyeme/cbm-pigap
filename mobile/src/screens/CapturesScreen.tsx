import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Embarcation, listTrackedEmbarcations } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import {
  Chip,
  IconBadge,
  ListRow,
  Notice,
  ScreenHeader,
  Segmented,
  StatRow,
  StatTile,
  StepBar,
  type IconName,
  type Step,
} from '../components/ui';
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
  enqueueCapture,
  listCachedEmbarcations,
  listLocalCaptures,
} from '../offline/db';
import { syncPendingCaptures } from '../offline/syncCaptures';
import { friendlyApiError } from '../lib/apiErrors';
import type { MobileMode } from '../auth/roles';
import { colors, fonts, space } from '../theme';

type Props = {
  token: string;
  mode?: MobileMode;
  onBack: () => void;
};

type View_ = 'nouvelle' | 'historique';

const STEPS: ReadonlyArray<Step> = [
  { label: 'Bateau', icon: 'boat-outline' },
  { label: 'Espèce', icon: 'fish-outline' },
  { label: 'Engin', icon: 'mci:hook' },
  { label: 'Détails', icon: 'scale-outline' },
];

const GROUPES: ReadonlyArray<GroupeEspece> = ['pelagique', 'demersal', 'crustace', 'autre'];

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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export function CapturesScreen({ token, mode = 'agent', onBack }: Props) {
  const [view, setView] = useState<View_>('nouvelle');
  const [step, setStep] = useState(0);
  const [boats, setBoats] = useState<Embarcation[]>([]);
  const [boatId, setBoatId] = useState<string | null>(null);
  const [groupe, setGroupe] = useState<GroupeEspece>('pelagique');
  const [espece, setEspece] = useState<string>(ESPECES_MVP[0]);
  const [methode, setMethode] = useState<string>(METHODES_MVP[0]);
  const [quantite, setQuantite] = useState('5');
  const [debarquement, setDebarquement] = useState('Owendo');
  const [dateCapture, setDateCapture] = useState(
    () => new Date().toISOString().slice(0, 16),
  );
  const [localRows, setLocalRows] = useState<LocalCapture[]>([]);
  const [counts, setCounts] = useState({ pending: 0, synced: 0 });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [rows, c] = await Promise.all([listLocalCaptures(), countByStatus()]);
    setLocalRows(rows);
    setCounts(c);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const cached = await listCachedEmbarcations();
        if (cached.length) {
          setBoats(asBoats(cached));
          if (!boatId && cached[0]) setBoatId(cached[0].id);
        }
      } catch {
        /* cache vide */
      }
      try {
        const emb = await listTrackedEmbarcations(token);
        setBoats(emb);
        if (emb[0]) setBoatId((prev) => prev ?? emb[0].id);
        await cacheEmbarcations(
          emb.map((b) => ({
            id: b.id,
            pecheur_id: b.pecheur_id,
            nom: b.nom,
            immatriculation: b.immatriculation,
            type: b.type,
          })),
        );
        setError(null);
      } catch (err) {
        const cached = await listCachedEmbarcations();
        if (cached.length) {
          setBoats(asBoats(cached));
          if (!boatId && cached[0]) setBoatId(cached[0].id);
          setStatus('Pas de réseau : bateaux lus depuis le téléphone');
        } else {
          setError(
            friendlyApiError(err) ||
              'Impossible de charger les bateaux. Connectez-vous une fois avec internet.',
          );
        }
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / token
  }, [token, refresh]);

  const selectedBoat = boats.find((b) => b.id === boatId) ?? null;
  const especesDuGroupe = useMemo(() => ESPECES_REF.filter((e) => e.groupe === groupe), [groupe]);
  const especeRef = ESPECES_REF.find((e) => e.code === espece);

  function goTo(next: number) {
    setError(null);
    setStatus(null);
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)));
  }

  function next() {
    if (step === 0 && !selectedBoat) {
      setError('Choisissez un bateau');
      return;
    }
    goTo(step + 1);
  }

  async function onSaveLocal() {
    setError(null);
    setStatus(null);
    if (!selectedBoat) {
      setError('Choisissez un bateau');
      goTo(0);
      return;
    }
    const qty = Number(quantite.replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError('Indiquez une quantité en kg (ex. 5 ou 12,5)');
      return;
    }
    if (!debarquement.trim()) {
      setError('Indiquez le lieu de débarquement (ex. Owendo)');
      return;
    }
    const isoDate = dateCapture.includes('T')
      ? new Date(dateCapture).toISOString()
      : new Date(`${dateCapture}:00`).toISOString();

    setBusy(true);
    try {
      await enqueueCapture({
        id: newClientId(),
        pecheur_id: selectedBoat.pecheur_id ?? '',
        embarcation_id: selectedBoat.id,
        espece,
        quantite_kg: qty,
        methode,
        point_debarquement: debarquement.trim(),
        date_capture: isoDate,
      });
      await refresh();
      setStatus('Enregistré sur le téléphone. Envoi possible depuis l’historique.');
      setStep(1);
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
      const report = await syncPendingCaptures(token);
      await refresh();
      if (report.error) {
        setError(report.error);
        setStatus('Pas de réseau : vos déclarations restent sur le téléphone');
      } else if (report.pushed === 0) {
        setStatus('Rien à envoyer pour le moment');
      } else {
        setStatus(
          `Envoi terminé : ${report.accepted} acceptée(s)${
            report.rejected ? `, ${report.rejected} refusée(s)` : ''
          }`,
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader kicker="Déclaration" title="Captures" onBack={onBack} />
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
                          ? 'Aucun bateau lié à votre compte. Contactez un agent.'
                          : 'Aucun bateau. Créez d’abord un dossier pêcheur.'
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
                    style={{ marginBottom: 12 }}
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
                          goTo(3);
                        }}
                      />
                    ))}
                  </View>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <Text style={styles.question}>Combien, où, quand ?</Text>
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
                    icon="location-outline"
                    value={debarquement}
                    onChangeText={setDebarquement}
                    placeholder="Ex. Owendo"
                  />
                  <GlassField
                    label="Date et heure"
                    icon="calendar-outline"
                    value={dateCapture}
                    onChangeText={setDateCapture}
                    autoCapitalize="none"
                    placeholder="AAAA-MM-JJTHH:mm"
                  />
                </>
              ) : null}

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
                    disabled={boats.length === 0}
                    style={styles.navBtn}
                  />
                ) : (
                  <GlowButton
                    label={busy ? '…' : 'Enregistrer'}
                    icon="save-outline"
                    onPress={() => void onSaveLocal()}
                    disabled={busy}
                    style={styles.navBtn}
                  />
                )}
              </View>
            </GlassPanel>
          </>
        ) : (
          <>
            <StatRow style={{ marginBottom: 12 }}>
              <StatTile
                icon="cloud-upload-outline"
                value={counts.pending}
                label="à envoyer"
                tone={counts.pending > 0 ? 'warn' : 'muted'}
              />
              <StatTile icon="cloud-done-outline" value={counts.synced} label="envoyées" tone="ok" />
              <StatTile icon="fish-outline" value={localRows.length} label="déclarations" />
            </StatRow>

            <GlowButton
              label={busy ? '…' : counts.pending > 0 ? `Envoyer ${counts.pending} déclaration(s)` : 'Tout est envoyé'}
              icon={counts.pending > 0 ? 'cloud-upload-outline' : 'checkmark-circle-outline'}
              onPress={() => void onSync()}
              disabled={busy || counts.pending === 0}
              variant={counts.pending > 0 ? 'primary' : 'ghost'}
            />
            {status ? <Notice tone="ok" text={status} /> : null}
            {error ? <Notice tone="error" text={error} /> : null}

            <View style={{ height: space.md }} />
            {localRows.length === 0 ? (
              <Notice tone="muted" icon="fish-outline" text="Aucune déclaration pour l’instant." />
            ) : (
              localRows.map((item) => {
                const ref = ESPECES_REF.find((e) => e.code === item.espece);
                const synced = item.sync_status === 'synced';
                return (
                  <ListRow
                    key={item.id}
                    icon={(ref ? GROUPES_ICON[ref.groupe] : 'fish-outline') as IconName}
                    tone={ref?.protegee ? 'error' : 'info'}
                    title={`${especeNom(item.espece)} · ${item.quantite_kg} kg`}
                    meta={`${enginNom(item.methode)} · ${item.point_debarquement} · ${fmtDate(item.date_capture)}`}
                    right={
                      <IconBadge
                        icon={synced ? 'cloud-done-outline' : 'phone-portrait-outline'}
                        tone={synced ? 'ok' : 'warn'}
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
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.ink, flexShrink: 1 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  navBtn: { flex: 1 },
});
