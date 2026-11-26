import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getMonProfil, updateMonProfil, type ModificationProfil, type MonProfil } from '../api';
import { GlassField } from '../components/GlassField';
import { GlassPanel } from '../components/GlassPanel';
import { GlowButton } from '../components/GlowButton';
import { QrCode } from '../components/QrCode';
import {
  AppIcon,
  HelpTip,
  IconBadge,
  ListRow,
  Notice,
  PhotoBanner,
  SectionTitle,
  Segmented,
  type InfoPoint,
  type SegmentOption,
} from '../components/ui';
import { friendlyApiError, isApiError, isNetworkError } from '../lib/apiErrors';
import { formatMoment, pluriel } from '../lib/format';
import {
  cleTarif,
  construireTarifs,
  erreurPresentation,
  especesAffichees,
  formatTarif,
  libelleUniteSaisie,
  saisieTarifs,
} from '../lib/profil';
import { getSetting, setSetting } from '../offline/db';
import { PHOTOS } from '../photos';
import { colors, fonts, radii, space } from '../theme';

type Onglet = 'apercu' | 'texte' | 'especes' | 'tarifs' | 'partage';

const ONGLETS: ReadonlyArray<SegmentOption<Onglet>> = [
  { id: 'apercu', label: 'Aperçu', icon: 'eye-outline' },
  { id: 'texte', label: 'Texte', icon: 'create-outline' },
  { id: 'especes', label: 'Espèces', icon: 'fa6:fish-fins' },
  { id: 'tarifs', label: 'Tarifs', icon: 'pricetag-outline' },
  { id: 'partage', label: 'Partage', icon: 'qr-code-outline' },
];

const AIDE_PAGE: ReadonlyArray<InfoPoint> = [
  { icon: 'people-outline', text: 'Votre page présente votre activité aux comptes de la plateforme : nom, localité, espèces pêchées, nombre d’embarcations.' },
  { icon: 'options-outline', text: 'Vous choisissez le reste : présentation, tarifs, ouverture au public.' },
  { icon: 'lock-closed-outline', text: 'Aucune coordonnée n’y figure : ni téléphone, ni adresse, ni numéro de licence, ni immatriculation.' },
];

const AIDE_TEXTE: ReadonlyArray<InfoPoint> = [
  { icon: 'create-outline', text: 'Quelques lignes sur votre pêche : zones, engins, saisons.' },
  { icon: 'call-outline', text: 'Sans coordonnées : ni numéro de téléphone, ni adresse électronique, ni adresse de site. Le texte est refusé sinon.' },
  { icon: 'trash-outline', text: 'Enregistrer un texte vide retire la présentation.' },
];

const AIDE_ESPECES: ReadonlyArray<InfoPoint> = [
  { icon: 'fa6:fish-fins', text: 'Les espèces viennent de vos captures déclarées.' },
  { icon: 'eye-off-outline', text: 'Masquez celles que vous ne voulez pas montrer sur votre page.' },
];

const AIDE_TARIFS: ReadonlyArray<InfoPoint> = [
  { icon: 'pricetag-outline', text: 'Facultatifs : en francs CFA, au kilo ou à l’unité, pour les espèces de votre page.' },
  { icon: 'eye-outline', text: 'Ils ne s’affichent que si vous l’activez.' },
  { icon: 'eye-off-outline', text: 'Le tarif d’une espèce masquée reste enregistré, sans s’afficher.' },
];

const AIDE_PARTAGE: ReadonlyArray<InfoPoint> = [
  { icon: 'globe-outline', text: 'Ouverte au public, votre page se lit sans compte, par son lien ou son QR code.' },
  { icon: 'lock-closed-outline', text: 'Le public voit votre nom, votre localité, votre présentation, vos espèces et, si vous les affichez, vos tarifs. Jamais vos coordonnées.' },
  { icon: 'refresh-outline', text: 'Vous pouvez la refermer à tout moment ; le lien reste le même si vous la rouvrez.' },
];

const MESSAGE_RESEAU_PROFIL =
  'Enregistrement impossible sans réseau. Votre saisie reste à l’écran : réessayez une fois connecté.';

type Message = { onglet: Onglet; tone: 'ok' | 'error'; text: string };

type Props = {
  token: string;
  user: { id: string };
  onBack: () => void;
};

function cleCache(userId: string): string {
  return `profil_${userId}`;
}

/** Page de profil du pêcheur : ce que les autres voient, et ses réglages. */
export function ProfilScreen({ token, user, onBack }: Props) {
  const [profil, setProfil] = useState<MonProfil | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [onglet, setOnglet] = useState<Onglet>('apercu');
  const [saving, setSaving] = useState<Onglet | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  // Brouillons, un par onglet : enregistrer un onglet ne touche pas aux autres
  const [texte, setTexte] = useState('');
  const [masquees, setMasquees] = useState<string[]>([]);
  const [saisiePrix, setSaisiePrix] = useState<Record<string, string>>({});
  const [tarifsVisibles, setTarifsVisibles] = useState(false);
  const [erreursPrix, setErreursPrix] = useState<Record<string, string>>({});

  const appliquer = useCallback((p: MonProfil, onglets: ReadonlyArray<Onglet>) => {
    setProfil(p);
    if (onglets.includes('texte')) setTexte(p.presentation ?? '');
    if (onglets.includes('especes')) setMasquees(p.especes_masquees);
    if (onglets.includes('tarifs')) {
      setSaisiePrix(saisieTarifs(p.mes_tarifs));
      setTarifsVisibles(p.tarifs_visibles);
      setErreursPrix({});
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await getMonProfil(token);
      appliquer(p, ['texte', 'especes', 'tarifs']);
      setHorsLigne(false);
      await setSetting(cleCache(user.id), JSON.stringify(p)).catch(() => undefined);
    } catch (err) {
      if (isNetworkError(err)) {
        const cache = await getSetting(cleCache(user.id)).catch(() => null);
        if (cache) {
          appliquer(JSON.parse(cache) as MonProfil, ['texte', 'especes', 'tarifs']);
          setHorsLigne(true);
        } else {
          setError('Votre page se consulte et se règle avec du réseau. Réessayez une fois connecté.');
        }
      } else if (isApiError(err) && err.code === 'PROFIL_NOT_FOUND') {
        setError('Votre compte n’est rattaché à aucun dossier de pêcheur : adressez-vous à un agent.');
      } else {
        setError(friendlyApiError(err));
      }
    } finally {
      setLoading(false);
    }
  }, [appliquer, token, user.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function enregistrer(cible: Onglet, patch: ModificationProfil, succes: string) {
    setSaving(cible);
    setMessage(null);
    try {
      const p = await updateMonProfil(token, patch);
      appliquer(p, [cible]);
      setHorsLigne(false);
      setMessage({ onglet: cible, tone: 'ok', text: succes });
      await setSetting(cleCache(user.id), JSON.stringify(p)).catch(() => undefined);
    } catch (err) {
      setMessage({
        onglet: cible,
        tone: 'error',
        text: isNetworkError(err) ? MESSAGE_RESEAU_PROFIL : friendlyApiError(err),
      });
    } finally {
      setSaving(null);
    }
  }

  const affichees = useMemo(
    () => (profil ? especesAffichees(profil.especes_declarees, masquees) : []),
    [profil, masquees],
  );

  function changerOnglet(id: Onglet) {
    setMessage(null);
    setOnglet(id);
  }

  function messageDe(cible: Onglet) {
    return message && message.onglet === cible ? (
      <Notice tone={message.tone} text={message.text} style={styles.notice} />
    ) : null;
  }

  function enregistrerTexte() {
    if (!profil) return;
    const trop = erreurPresentation(texte, profil.limites);
    if (trop) {
      setMessage({ onglet: 'texte', tone: 'error', text: trop });
      return;
    }
    const propre = texte.trim();
    void enregistrer(
      'texte',
      { presentation: propre },
      propre ? 'Présentation enregistrée.' : 'Présentation retirée de votre page.',
    );
  }

  function enregistrerTarifs() {
    if (!profil) return;
    const construction = construireTarifs(
      saisiePrix,
      affichees.map((e) => e.espece),
      profil.mes_tarifs,
      profil.limites,
    );
    setErreursPrix(construction.erreurs);
    if (Object.keys(construction.erreurs).length || construction.erreurGenerale) {
      setMessage({
        onglet: 'tarifs',
        tone: 'error',
        text: construction.erreurGenerale ?? 'Corrigez les prix signalés.',
      });
      return;
    }
    void enregistrer(
      'tarifs',
      { tarifs: construction.tarifs, tarifs_visibles: tarifsVisibles },
      tarifsVisibles ? 'Tarifs enregistrés et affichés sur votre page.' : 'Tarifs enregistrés, non affichés.',
    );
  }

  function ouvrirAuPublic(ouvrir: boolean) {
    Alert.alert(
      ouvrir ? 'Ouvrir votre page au public ?' : 'Fermer votre page au public ?',
      ouvrir
        ? 'Toute personne qui a le lien ou le QR code pourra la lire, sans compte : nom, localité, présentation, espèces et, si vous les affichez, vos tarifs.'
        : 'Le lien et le QR code ne mèneront plus à votre page. Les comptes de la plateforme la voient toujours.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: ouvrir ? 'Ouvrir' : 'Fermer',
          onPress: () =>
            void enregistrer(
              'partage',
              { ouvert_au_public: ouvrir },
              ouvrir ? 'Votre page est ouverte au public.' : 'Votre page est fermée au public.',
            ),
        },
      ],
    );
  }

  async function partager(lien: string) {
    try {
      await Share.share({ message: lien });
    } catch {
      // partage annulé ou indisponible : le lien reste affiché et sélectionnable
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PhotoBanner
        photo={PHOTOS.quai}
        kicker="Profil"
        title="Ma page"
        onBack={onBack}
        right={<HelpTip title="Votre page" points={AIDE_PAGE} icon="storefront-outline" onDark />}
      />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {loading && !profil ? (
          <GlassPanel contentStyle={styles.loading}>
            <ActivityIndicator color={colors.tide} />
            <Text style={styles.loadingText}>Chargement de votre page…</Text>
          </GlassPanel>
        ) : null}

        {error ? (
          <>
            <Notice tone="error" text={error} style={styles.notice} />
            <GlowButton label="Réessayer" icon="refresh-outline" onPress={() => void load()} />
          </>
        ) : null}

        {profil ? (
          <>
            {horsLigne ? (
              <Notice
                tone="muted"
                icon="cloud-offline-outline"
                text="Pas de réseau : page affichée telle qu’enregistrée sur ce téléphone."
                style={styles.notice}
              />
            ) : null}
            <Segmented options={ONGLETS} value={onglet} onChange={changerOnglet} style={styles.segments} />

            {onglet === 'apercu' ? (
              <Apercu profil={profil} onOnglet={changerOnglet} />
            ) : null}

            {onglet === 'texte' ? (
              <GlassPanel style={styles.panel}>
                <View style={styles.titreLigne}>
                  <SectionTitle icon="create-outline" text="Présentation" style={styles.titreSection} />
                  <HelpTip title="Votre présentation" points={AIDE_TEXTE} icon="create-outline" />
                </View>
                <GlassField
                  label="Votre texte"
                  value={texte}
                  onChangeText={setTexte}
                  multiline
                  maxLength={profil.limites.presentation_max_caracteres}
                  placeholder="Votre pêche, vos zones, vos engins…"
                  style={styles.multiligne}
                />
                <Text style={styles.compteur}>
                  {texte.trim().length} / {profil.limites.presentation_max_caracteres} caractères
                </Text>
                {messageDe('texte')}
                <GlowButton
                  label="Enregistrer la présentation"
                  icon="save-outline"
                  variant="accent"
                  loading={saving === 'texte'}
                  disabled={texte.trim() === (profil.presentation ?? '').trim()}
                  onPress={enregistrerTexte}
                />
              </GlassPanel>
            ) : null}

            {onglet === 'especes' ? (
              <GlassPanel style={styles.panel}>
                <View style={styles.titreLigne}>
                  <SectionTitle icon="fa6:fish-fins" text="Espèces de votre page" style={styles.titreSection} />
                  <HelpTip title="Vos espèces" points={AIDE_ESPECES} icon="fa6:fish-fins" />
                </View>
                {profil.especes_declarees.length === 0 ? (
                  <Vide
                    icon="fa6:fish-fins"
                    texte="Vos espèces apparaissent ici dès que vos captures sont déclarées."
                  />
                ) : (
                  <>
                    {profil.especes_declarees.map((e) => {
                      const masquee = masquees.includes(e.espece);
                      return (
                        <Pressable
                          key={e.espece}
                          onPress={() =>
                            setMasquees((avant) =>
                              masquee ? avant.filter((c) => c !== e.espece) : [...avant, e.espece],
                            )
                          }
                          style={({ pressed }) => [styles.espece, pressed && styles.pressed]}
                          accessibilityRole="switch"
                          accessibilityState={{ checked: !masquee }}
                          accessibilityLabel={`${e.nom} : ${masquee ? 'masquée' : 'affichée'}`}
                        >
                          <IconBadge icon="fa6:fish-fins" size={36} tone={masquee ? 'muted' : 'info'} />
                          <Text style={[styles.especeNom, masquee && styles.especeMasquee]}>{e.nom}</Text>
                          <View style={styles.etat}>
                            <AppIcon
                              name={masquee ? 'eye-off-outline' : 'eye-outline'}
                              size={20}
                              color={masquee ? colors.inkSoft : colors.success}
                            />
                            <Text style={[styles.etatTexte, { color: masquee ? colors.inkSoft : colors.success }]}>
                              {masquee ? 'Masquée' : 'Affichée'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    {messageDe('especes')}
                    <GlowButton
                      label="Enregistrer"
                      icon="save-outline"
                      variant="accent"
                      loading={saving === 'especes'}
                      disabled={
                        [...masquees].sort().join('|') === [...profil.especes_masquees].sort().join('|')
                      }
                      onPress={() =>
                        void enregistrer('especes', { especes_masquees: masquees }, 'Espèces de votre page enregistrées.')
                      }
                    />
                  </>
                )}
              </GlassPanel>
            ) : null}

            {onglet === 'tarifs' ? (
              <GlassPanel style={styles.panel}>
                <View style={styles.titreLigne}>
                  <SectionTitle icon="pricetag-outline" text="Vos tarifs" style={styles.titreSection} />
                  <HelpTip title="Vos tarifs" points={AIDE_TARIFS} icon="pricetag-outline" />
                </View>
                <Pressable
                  onPress={() => setTarifsVisibles((v) => !v)}
                  style={({ pressed }) => [styles.interrupteur, pressed && styles.pressed]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: tarifsVisibles }}
                  accessibilityLabel="Afficher mes tarifs sur ma page"
                >
                  <Text style={styles.interrupteurTexte}>Afficher mes tarifs sur ma page</Text>
                  <Switch
                    value={tarifsVisibles}
                    onValueChange={setTarifsVisibles}
                    trackColor={{ true: colors.lagoon, false: colors.glassBorder }}
                    thumbColor={colors.card}
                    importantForAccessibility="no"
                  />
                </Pressable>
                {affichees.length === 0 ? (
                  <Vide
                    icon="pricetag-outline"
                    texte="Les tarifs se fixent pour les espèces de votre page : déclarez une capture, ou affichez une espèce masquée."
                  />
                ) : (
                  affichees.map((e) => (
                    <View key={e.espece} style={styles.tarifBloc}>
                      <Text style={styles.tarifEspece}>{e.nom}</Text>
                      {profil.limites.unites_tarif.map((unite) => {
                        const cle = cleTarif(e.espece, unite);
                        return (
                          <View key={cle}>
                            <View style={styles.prixLigne}>
                              <Text style={styles.prixUnite}>{libelleUniteSaisie(unite)}</Text>
                              <View style={[styles.prixChamp, erreursPrix[cle] ? styles.prixChampErreur : null]}>
                                <TextInput
                                  value={saisiePrix[cle] ?? ''}
                                  onChangeText={(v) => setSaisiePrix((avant) => ({ ...avant, [cle]: v }))}
                                  keyboardType="number-pad"
                                  placeholder="Aucun"
                                  placeholderTextColor={colors.inkSoft}
                                  style={styles.prixSaisie}
                                  maxLength={12}
                                  accessibilityLabel={`${e.nom}, prix ${libelleUniteSaisie(unite).toLowerCase()} en francs CFA`}
                                />
                                <Text style={styles.prixDevise}>FCFA</Text>
                              </View>
                            </View>
                            {erreursPrix[cle] ? <Text style={styles.prixErreur}>{erreursPrix[cle]}</Text> : null}
                          </View>
                        );
                      })}
                    </View>
                  ))
                )}
                {messageDe('tarifs')}
                <GlowButton
                  label="Enregistrer les tarifs"
                  icon="save-outline"
                  variant="accent"
                  loading={saving === 'tarifs'}
                  onPress={enregistrerTarifs}
                />
              </GlassPanel>
            ) : null}

            {onglet === 'partage' ? (
              <GlassPanel style={styles.panel} contentStyle={styles.partage}>
                <View style={styles.titreLigne}>
                  <SectionTitle
                    icon="globe-outline"
                    text={profil.ouvert_au_public ? 'Ouverte au public' : 'Fermée au public'}
                    style={styles.titreSection}
                  />
                  <HelpTip title="Ouvrir sa page au public" points={AIDE_PARTAGE} icon="globe-outline" />
                </View>
                {profil.ouvert_au_public && profil.lien_public ? (
                  <>
                    <View style={styles.qr}>
                      <QrCode value={profil.lien_public} size={220} accessibilityLabel="QR code de votre page" />
                    </View>
                    <Text style={styles.lien} selectable>
                      {profil.lien_public}
                    </Text>
                    {messageDe('partage')}
                    <GlowButton
                      label="Partager le lien"
                      icon="share-social-outline"
                      onPress={() => void partager(profil.lien_public as string)}
                    />
                    <GlowButton
                      label="Fermer ma page au public"
                      icon="lock-closed-outline"
                      variant="ghost"
                      loading={saving === 'partage'}
                      onPress={() => ouvrirAuPublic(false)}
                    />
                  </>
                ) : (
                  <>
                    <Vide
                      icon="lock-closed-outline"
                      texte="Seuls les comptes de la plateforme voient votre page. Ouverte, elle se lit aussi sans compte, par un lien ou un QR code."
                    />
                    {messageDe('partage')}
                    <GlowButton
                      label="Ouvrir ma page au public"
                      icon="globe-outline"
                      variant="accent"
                      loading={saving === 'partage'}
                      onPress={() => ouvrirAuPublic(true)}
                    />
                  </>
                )}
              </GlassPanel>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** État vide : une icône et une phrase qui dit comment le remplir. */
function Vide({ icon, texte }: { icon: 'fa6:fish-fins' | 'pricetag-outline' | 'lock-closed-outline'; texte: string }) {
  return (
    <View style={styles.vide}>
      <IconBadge icon={icon} size={44} tone="muted" />
      <Text style={styles.videTexte}>{texte}</Text>
    </View>
  );
}

/** La page telle que la voient les autres comptes de la plateforme. */
function Apercu({ profil, onOnglet }: { profil: MonProfil; onOnglet: (o: Onglet) => void }) {
  const lieu = [profil.localite, profil.organisation].filter(Boolean).join(' · ');
  return (
    <>
      <GlassPanel style={styles.panel} contentStyle={styles.apercu}>
        <Text style={styles.nom}>{profil.nom}</Text>
        {lieu ? (
          <View style={styles.lieu}>
            <AppIcon name="location-outline" size={18} color={colors.tide} />
            <Text style={styles.lieuTexte}>{lieu}</Text>
          </View>
        ) : null}
        <Text style={styles.meta}>{pluriel(profil.nb_embarcations, 'embarcation', 'embarcations')}</Text>

        {profil.presentation ? (
          // Texte brut : affiché tel quel, jamais interprété
          <Text style={styles.presentation} selectable>
            {profil.presentation}
          </Text>
        ) : (
          <Pressable onPress={() => onOnglet('texte')} style={styles.ajout} accessibilityRole="button">
            <AppIcon name="add-circle-outline" size={20} color={colors.tide} />
            <Text style={styles.ajoutTexte}>Écrire ma présentation</Text>
          </Pressable>
        )}

        <Text style={styles.sousTitre}>Espèces</Text>
        {profil.especes.length ? (
          <View style={styles.etiquettes}>
            {profil.especes.map((e) => (
              <View key={e.espece} style={styles.etiquette}>
                <AppIcon name="fa6:fish-fins" size={14} color={colors.tide} />
                <Text style={styles.etiquetteTexte}>{e.nom}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.videLigne}>Aucune espèce affichée pour l’instant.</Text>
        )}

        <Text style={styles.sousTitre}>Tarifs</Text>
        {profil.tarifs_affiches && profil.tarifs.length ? (
          profil.tarifs.map((t) => (
            <View key={cleTarif(t.espece, t.unite)} style={styles.tarifLigne}>
              <Text style={styles.tarifNom}>{t.nom}</Text>
              <Text style={styles.tarifPrix}>{formatTarif(t.prix_fcfa, t.unite)}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.videLigne}>
            {profil.tarifs_visibles ? 'Aucun tarif saisi.' : 'Tarifs non affichés.'}
          </Text>
        )}
        {profil.mise_a_jour ? (
          <Text style={styles.maj}>Mise à jour {formatMoment(profil.mise_a_jour)}</Text>
        ) : null}
      </GlassPanel>

      <ListRow
        icon="people-outline"
        title="Visible sur la plateforme"
        meta="Nom, localité, espèces, nombre d’embarcations"
        style={styles.ligne}
      />
      <ListRow
        icon="globe-outline"
        tone={profil.ouvert_au_public ? 'ok' : 'muted'}
        title={profil.ouvert_au_public ? 'Ouverte au public' : 'Fermée au public'}
        meta={profil.ouvert_au_public ? 'Lien et QR code actifs' : 'Ouvrir par un lien ou un QR code'}
        onPress={() => onOnglet('partage')}
        style={styles.ligne}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingTop: 4, paddingBottom: space.xxl },
  segments: { marginBottom: space.md },
  panel: { marginBottom: space.md },
  notice: { marginTop: 0, marginBottom: 12 },
  ligne: { marginBottom: 10 },
  loading: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  loadingText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  titreLigne: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  titreSection: { flex: 1, marginTop: 0, marginBottom: 0 },
  multiligne: { minHeight: 150, textAlignVertical: 'top', paddingTop: 14, paddingBottom: 14 },
  compteur: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'right', marginTop: -8, marginBottom: 12 },
  pressed: { opacity: 0.85 },
  espece: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.glassBorder,
  },
  especeNom: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink },
  especeMasquee: { color: colors.inkSoft, fontFamily: fonts.bodyMedium },
  etat: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 104, justifyContent: 'flex-end' },
  etatTexte: { fontFamily: fonts.bodyBold, fontSize: 15 },
  interrupteur: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    marginBottom: 14,
  },
  interrupteurTexte: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  tarifBloc: { marginBottom: 14, gap: 8 },
  tarifEspece: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.abyss },
  prixLigne: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  prixUnite: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  prixChamp: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 172,
    minHeight: 48,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderColor: colors.glassBorder,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
  },
  prixChampErreur: { borderColor: colors.danger },
  prixSaisie: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  prixDevise: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkMuted },
  prixErreur: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.danger, textAlign: 'right', marginTop: 4 },
  partage: { gap: 14 },
  qr: { alignSelf: 'center', padding: 14, borderRadius: radii.md, backgroundColor: colors.card },
  lien: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.tide, textAlign: 'center' },
  vide: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  videTexte: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.inkMuted, textAlign: 'center' },
  apercu: { padding: 18, gap: 10 },
  nom: { fontFamily: fonts.display, fontSize: 24, color: colors.abyss },
  lieu: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lieuTexte: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.inkMuted },
  meta: { fontFamily: fonts.body, fontSize: 16, color: colors.inkMuted },
  presentation: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  ajout: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 },
  ajoutTexte: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.tide },
  sousTitre: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.tide, marginTop: 6 },
  etiquettes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  etiquette: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.surface,
  },
  etiquetteTexte: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.ink },
  videLigne: { fontFamily: fonts.body, fontSize: 16, color: colors.inkSoft },
  tarifLigne: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  tarifNom: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
  tarifPrix: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.abyss },
  maj: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, marginTop: 6 },
});
