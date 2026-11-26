import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { UtilisateurMe } from '../api';
import { GlowButton } from '../components/GlowButton';
import { IdentiteSheet } from '../components/IdentiteSheet';
import { QrCode } from '../components/QrCode';
import { AppIcon, HelpTip, IconBadge, Notice, PhotoBanner, type InfoPoint } from '../components/ui';
import { friendlyApiError, isNetworkError, isSessionExpired } from '../lib/apiErrors';
import { formatJour, formatMoment } from '../lib/format';
import {
  libelleStatutLicence,
  licenceVerificationUrl,
  statutLicenceAuJour,
  tonStatutLicence,
} from '../lib/licence';
import { fetchCartePro, readCartePro, type CartePro } from '../offline/cartePro';
import { PHOTOS } from '../photos';
import { colors, fonts, radii, space, tones } from '../theme';

type Props = {
  token: string;
  user: UtilisateurMe;
  onBack: () => void;
};

const HELP_POINTS: ReadonlyArray<InfoPoint> = [
  { icon: 'qr-code-outline', text: 'Présentez ce QR à l’agent lors d’un contrôle : il lit votre licence avec son téléphone.' },
  { icon: 'cloud-offline-outline', text: 'La carte reste sur ce téléphone : elle s’affiche même sans réseau.' },
  { icon: 'shield-checkmark-outline', text: 'Le QR mène à la vérification publique de la licence : validité seulement, sans votre nom.' },
  { icon: 'refresh-outline', text: 'La validité affichée date de la dernière mise à jour. Avec du réseau, touchez « Mettre à jour ».' },
];

function initiales(nom: string): string {
  const parts = nom.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

/** Carte professionnelle du pêcheur : identité, licence, validité et QR, consultable hors ligne. */
export function CarteProScreen({ token, user, onBack }: Props) {
  const [carte, setCarte] = useState<CartePro | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Fiche d'identité complète (registre et suivi), lue sur le serveur. */
  const [ficheOuverte, setFicheOuverte] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCarte(await fetchCartePro(token, user.id));
      setOffline(false);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      else if (!isSessionExpired(err)) setError(friendlyApiError(err));
    } finally {
      setLoading(false);
    }
  }, [token, user.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // La carte gardée sur le téléphone s'affiche tout de suite
      const saved = await readCartePro(user.id);
      if (cancelled) return;
      if (saved) setCarte(saved);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id, refresh]);

  const statut = carte ? statutLicenceAuJour(carte.statut, carte.dateExpiration) : 'inconnue';
  const ton = tones[tonStatutLicence(statut)];
  const boats = carte?.embarcations ?? [];

  return (
    <View style={styles.root}>
      <PhotoBanner
        photo={PHOTOS.mer}
        kicker="Licence de pêche artisanale"
        title="Ma carte"
        onBack={onBack}
        right={<HelpTip title="Ma carte professionnelle" points={HELP_POINTS} icon="id-card-outline" onDark />}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {carte ? (
          <View style={styles.card}>
            <View style={styles.identity}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initiales(carte.nom)}</Text>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.name} numberOfLines={2}>
                  {carte.nom}
                </Text>
                <Text style={styles.role}>Pêcheur</Text>
              </View>
            </View>

            <View style={styles.licenceBox}>
              <Text style={styles.label}>Numéro de licence</Text>
              <Text style={styles.licence} selectable adjustsFontSizeToFit numberOfLines={1}>
                {carte.numeroLicence}
              </Text>
            </View>

            <View style={[styles.status, { backgroundColor: ton.bg }]}>
              <AppIcon
                name={
                  statut === 'valide' || statut === 'sans_date'
                    ? 'shield-checkmark'
                    : statut === 'inconnue'
                      ? 'help-circle'
                      : 'warning'
                }
                size={22}
                color={ton.fg}
              />
              <View style={styles.statusText}>
                <Text style={[styles.statusLabel, { color: ton.fg }]}>{libelleStatutLicence(statut)}</Text>
                {carte.dateExpiration ? (
                  <Text style={styles.statusDate}>Valable jusqu’au {formatJour(carte.dateExpiration)}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.qrWrap}>
              <QrCode
                value={licenceVerificationUrl(carte.numeroLicence)}
                size={232}
                accessibilityLabel={`QR de la licence ${carte.numeroLicence}`}
              />
              <Text style={styles.qrCaption}>À présenter lors d’un contrôle</Text>
            </View>

            {boats.length > 0 ? (
              <View style={styles.boats}>
                <IconBadge icon="boat-outline" size={36} />
                <Text style={styles.boatsText} numberOfLines={3}>
                  {boats.map((b) => `${b.nom} (${b.immatriculation})`).join(' · ')}
                </Text>
              </View>
            ) : null}

            {carte.majA ? (
              <Text style={styles.updated}>Mise à jour {formatMoment(carte.majA)}</Text>
            ) : null}
          </View>
        ) : loading ? (
          <View style={styles.empty}>
            <ActivityIndicator color={colors.tide} />
            <Text style={styles.emptyText}>Chargement de votre carte…</Text>
          </View>
        ) : offline ? (
          <Notice
            tone="warn"
            icon="id-card-outline"
            text="Carte pas encore enregistrée sur ce téléphone. Ouvrez-la une fois avec du réseau : elle restera ensuite disponible sans réseau."
            style={styles.topNotice}
          />
        ) : null}

        {carte && offline ? (
          <Notice
            tone="muted"
            icon="cloud-offline-outline"
            text="Pas de réseau : carte affichée depuis ce téléphone."
          />
        ) : null}
        {error ? <Notice tone="error" text={error} /> : null}

        <View style={styles.actions}>
          <GlowButton label="Ma fiche complète" icon="document-text-outline" onPress={() => setFicheOuverte(true)} />
          <GlowButton
            label={loading ? 'Mise à jour…' : 'Mettre à jour'}
            icon="refresh-outline"
            variant="ghost"
            onPress={() => void refresh()}
            disabled={loading}
          />
        </View>
      </ScrollView>
      <IdentiteSheet
        visible={ficheOuverte}
        onClose={() => setFicheOuverte(false)}
        token={token}
        source={{ kind: 'moi' }}
        titre={user.nom}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingBottom: 56, paddingTop: 4 },
  topNotice: { marginTop: 0 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 16,
    gap: 14,
    shadowColor: colors.abyss,
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    backgroundColor: colors.tide,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: fonts.bodyBold, color: '#F8FAFC', fontSize: 20 },
  identityText: { flex: 1, minWidth: 0 },
  name: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: colors.abyss },
  role: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted, marginTop: 2 },
  licenceBox: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  licence: { fontFamily: fonts.bodyBold, fontSize: 22, color: colors.ink, letterSpacing: 0.4, marginTop: 2 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.sm,
  },
  statusText: { flex: 1, minWidth: 0 },
  statusLabel: { fontFamily: fonts.bodyBold, fontSize: 17 },
  statusDate: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink, marginTop: 1 },
  qrWrap: { alignItems: 'center', gap: 8, paddingVertical: 4 },
  qrCaption: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  boats: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  boatsText: { flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.ink },
  updated: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: space.xl },
  emptyText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  actions: { marginTop: space.md, gap: 10 },
});
