import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';

import { verifierLicence, type VerificationLicence } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import {
  AppIcon,
  HelpTip,
  IconBadge,
  ListRow,
  Notice,
  PhotoBanner,
  Segmented,
  StatRow,
  StatTile,
  type InfoPoint,
} from '../components/ui';
import { friendlyApiError, isNetworkError } from '../lib/apiErrors';
import { formatFcfa, formatJour, pluriel } from '../lib/format';
import { libelleStatutLicence, readLicenceQr, tonStatutLicence } from '../lib/licence';
import { enginNom } from '../offline/catalog';
import { PHOTOS } from '../photos';
import { colors, fonts, radii, space, tones } from '../theme';

type Props = {
  token: string;
  onBack: () => void;
};

type Mode = 'scanner' | 'saisir';

type Outcome =
  | { kind: 'attente' }
  | { kind: 'recherche'; numero: string }
  | { kind: 'resultat'; data: VerificationLicence }
  | { kind: 'erreur'; numero: string; message: string; reseau: boolean };

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'qr-code-outline', text: 'Visez le QR de la carte du pêcheur ou de sa licence imprimée : la lecture est automatique.' },
  { icon: 'flashlight-outline', text: 'De nuit, allumez la lampe du téléphone.' },
  { icon: 'keypad-outline', text: 'QR illisible ou caméra indisponible ? Passez sur « Saisir » et tapez le numéro de licence.' },
  { icon: 'cloud-offline-outline', text: 'La vérification interroge le registre : elle demande du réseau. Sans réseau, notez le numéro lu.' },
];

/** Contrôle d'une licence par l'agent : lecture du QR par la caméra, saisie du numéro en secours. */
export function ControleLicenceScreen({ token, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('scanner');
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [numero, setNumero] = useState('');
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'attente' });
  const [scanNote, setScanNote] = useState<string | null>(null);
  /** Empêche la caméra de relancer une vérification à chaque image du même QR. */
  const locked = useRef(false);

  const verify = useCallback(
    async (value: string) => {
      const cleaned = value.trim();
      if (!cleaned) return;
      setScanNote(null);
      setTorch(false);
      setOutcome({ kind: 'recherche', numero: cleaned });
      try {
        setOutcome({ kind: 'resultat', data: await verifierLicence(token, cleaned) });
      } catch (err) {
        setOutcome({
          kind: 'erreur',
          numero: cleaned,
          message: friendlyApiError(err),
          reseau: isNetworkError(err),
        });
      }
    },
    [token],
  );

  function onScanned(result: BarcodeScanningResult) {
    if (locked.current) return;
    const reading = readLicenceQr(result.data);
    if (reading.kind === 'licence') {
      locked.current = true;
      void verify(reading.numero);
      return;
    }
    setScanNote(
      reading.kind === 'quittance'
        ? 'Ce QR est celui d’une quittance, pas d’une licence.'
        : 'Ce QR n’est pas celui d’une licence CBM-PIGAP.',
    );
  }

  function reset() {
    locked.current = false;
    setOutcome({ kind: 'attente' });
    setScanNote(null);
    setNumero('');
  }

  const waiting = outcome.kind === 'attente';
  const cameraReady = permission?.granted === true;

  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.port}
        kicker="Contrôle"
        title="Vérifier une licence"
        onBack={onBack}
        right={<HelpTip title="Vérifier une licence" points={HELP_POINTS} icon="qr-code-outline" onDark />}
      />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {waiting ? (
          <>
            <Segmented<Mode>
              value={mode}
              onChange={(next) => {
                setMode(next);
                setScanNote(null);
                setTorch(false);
              }}
              style={styles.segmented}
              options={[
                { id: 'scanner', label: 'Scanner le QR', icon: 'qr-code-outline' },
                { id: 'saisir', label: 'Saisir le numéro', icon: 'keypad-outline' },
              ]}
            />

            {mode === 'scanner' ? (
              cameraReady ? (
                <>
                  <View style={styles.cameraWrap}>
                    <CameraView
                      style={styles.camera}
                      facing="back"
                      enableTorch={torch}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                      onBarcodeScanned={onScanned}
                    />
                    <View style={styles.frame} pointerEvents="none" />
                  </View>
                  <Text style={styles.hint}>Placez le QR dans le cadre.</Text>
                  {scanNote ? <Notice tone="warn" text={scanNote} /> : null}
                  <View style={styles.actions}>
                    <GlowButton
                      label={torch ? 'Éteindre la lampe' : 'Allumer la lampe'}
                      icon={torch ? 'flashlight' : 'flashlight-outline'}
                      variant="ghost"
                      onPress={() => setTorch((v) => !v)}
                    />
                  </View>
                </>
              ) : (
                <GlassPanel contentStyle={styles.panel}>
                  <View style={styles.emptyHead}>
                    <IconBadge icon="camera-outline" size={48} />
                    <Text style={styles.emptyTitle}>La caméra lit le QR de la licence</Text>
                  </View>
                  <Text style={styles.emptyBody}>
                    Aucune photo n’est prise ni conservée : seul le numéro de licence est lu.
                  </Text>
                  {permission && !permission.granted && !permission.canAskAgain ? (
                    <>
                      <Notice
                        tone="warn"
                        text="Caméra refusée pour CBM-PIGAP. Autorisez-la dans les réglages, ou saisissez le numéro."
                      />
                      <GlowButton
                        label="Ouvrir les réglages du téléphone"
                        icon="settings-outline"
                        variant="ghost"
                        onPress={() => void Linking.openSettings()}
                      />
                    </>
                  ) : (
                    <GlowButton
                      label="Autoriser la caméra"
                      icon="camera-outline"
                      onPress={() => void requestPermission()}
                    />
                  )}
                  <GlowButton
                    label="Saisir le numéro à la place"
                    icon="keypad-outline"
                    variant="ghost"
                    onPress={() => setMode('saisir')}
                  />
                </GlassPanel>
              )
            ) : (
              <GlassPanel contentStyle={styles.panel}>
                <GlassField
                  label="Numéro de licence"
                  icon="id-card-outline"
                  value={numero}
                  onChangeText={setNumero}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  placeholder="Ex. GA-PA-2026-00012"
                  returnKeyType="search"
                  onSubmitEditing={() => void verify(numero)}
                />
                <GlowButton
                  label="Vérifier la licence"
                  icon="shield-checkmark-outline"
                  onPress={() => void verify(numero)}
                  disabled={!numero.trim()}
                />
              </GlassPanel>
            )}
          </>
        ) : null}

        {outcome.kind === 'recherche' ? (
          <GlassPanel contentStyle={styles.loading}>
            <ActivityIndicator color={colors.tide} />
            <Text style={styles.loadingText}>Vérification de la licence {outcome.numero}…</Text>
          </GlassPanel>
        ) : null}

        {outcome.kind === 'erreur' ? (
          <>
            <Notice
              tone="error"
              icon={outcome.reseau ? 'cloud-offline-outline' : 'alert-circle'}
              text={
                outcome.reseau
                  ? `Vérification impossible sans réseau. Numéro lu : ${outcome.numero}.`
                  : outcome.message
              }
              style={styles.topNotice}
            />
            <View style={styles.actions}>
              <GlowButton
                label="Réessayer la vérification"
                icon="refresh-outline"
                onPress={() => void verify(outcome.numero)}
              />
              <GlowButton
                label="Vérifier une autre licence"
                icon="qr-code-outline"
                variant="ghost"
                onPress={reset}
              />
            </View>
          </>
        ) : null}

        {outcome.kind === 'resultat' ? <Resultat data={outcome.data} onReset={reset} /> : null}
      </ScrollView>
    </View>
  );
}

function Resultat({ data, onReset }: { data: VerificationLicence; onReset: () => void }) {
  const statut = data.trouvee ? data.statut_licence : 'inconnue';
  const tone = tonStatutLicence(statut);
  const ton = tones[tone];
  const engins = data.engins_autorises.map(enginNom);

  return (
    <>
      <GlassPanel style={styles.resultPanel} contentStyle={styles.panel}>
        <View style={[styles.verdict, { backgroundColor: ton.bg }]}>
          <AppIcon
            name={tone === 'ok' ? 'shield-checkmark' : tone === 'error' ? 'close-circle' : 'warning'}
            size={28}
            color={ton.fg}
          />
          <Text style={[styles.verdictText, { color: ton.fg }]}>{libelleStatutLicence(statut)}</Text>
        </View>

        <View>
          <Text style={styles.label}>Numéro de licence</Text>
          <Text style={styles.value} selectable>
            {data.numero_licence}
          </Text>
        </View>

        {data.trouvee ? (
          <>
            <View>
              <Text style={styles.label}>Titulaire</Text>
              <Text style={styles.value}>{data.pecheur_nom ?? 'Non renseigné'}</Text>
              {data.organisation ? <Text style={styles.sub}>{data.organisation}</Text> : null}
            </View>
            <View style={styles.dates}>
              <View style={styles.dateCol}>
                <Text style={styles.label}>Délivrée le</Text>
                <Text style={styles.value}>{formatJour(data.date_delivrance) || 'Non renseigné'}</Text>
              </View>
              <View style={styles.dateCol}>
                <Text style={styles.label}>Valable jusqu’au</Text>
                <Text style={styles.value}>{formatJour(data.date_expiration) || 'Non renseigné'}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={styles.sub}>
            Ce numéro ne figure pas au registre. Vérifiez la saisie ou relisez le QR.
          </Text>
        )}
      </GlassPanel>

      {data.trouvee ? (
        <>
          <StatRow style={styles.stats}>
            <StatTile
              icon="wallet-outline"
              value={formatFcfa(data.taxes_dues_fcfa)}
              label="taxes dues"
              tone={data.taxes_dues_fcfa > 0 ? 'warn' : 'muted'}
            />
            <StatTile
              icon="notifications-outline"
              value={data.alertes_nouvelles}
              label={data.alertes_nouvelles > 1 ? 'alertes à traiter' : 'alerte à traiter'}
              tone={data.alertes_nouvelles > 0 ? 'warn' : 'muted'}
            />
          </StatRow>

          <ListRow
            icon="clipboard-outline"
            tone={data.infractions_12_mois > 0 ? 'warn' : 'muted'}
            title="Contrôles sur 12 mois"
            meta={`${pluriel(data.controles_12_mois, 'contrôle', 'contrôles')} · ${
              data.infractions_12_mois > 0
                ? pluriel(data.infractions_12_mois, 'infraction relevée', 'infractions relevées')
                : 'aucune infraction relevée'
            }`}
          />

          {data.embarcations.length === 0 ? (
            <Notice tone="muted" icon="boat-outline" text="Aucun bateau rattaché à cette licence." />
          ) : (
            data.embarcations.map((b) => (
              <ListRow
                key={b.id}
                icon="boat-outline"
                title={b.nom}
                meta={[b.immatriculation, b.type].filter(Boolean).join(' · ')}
              />
            ))
          )}
          {engins.length > 0 ? (
            <ListRow icon="mci:hook" tone="muted" title="Engins autorisés" meta={engins.join(' · ')} />
          ) : null}
        </>
      ) : null}

      <View style={styles.actions}>
        <GlowButton label="Vérifier une autre licence" icon="qr-code-outline" onPress={onReset} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56, paddingTop: 4 },
  segmented: { marginBottom: space.md },
  topNotice: { marginTop: 0 },
  panel: { padding: 16, gap: 12 },
  cameraWrap: {
    height: 300,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.abyss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  camera: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  frame: {
    width: 208,
    height: 208,
    borderRadius: radii.md,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  hint: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: 10,
  },
  actions: { gap: 8, marginTop: space.md },
  emptyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emptyTitle: { flex: 1, fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.abyss },
  emptyBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkMuted },
  loading: { padding: 20, alignItems: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted, textAlign: 'center' },
  resultPanel: { marginBottom: space.md },
  verdict: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  verdictText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 19 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  value: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.ink, marginTop: 2 },
  sub: { fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.inkMuted, marginTop: 2 },
  dates: { flexDirection: 'row', gap: 12 },
  dateCol: { flex: 1 },
  stats: { marginBottom: space.md },
});
