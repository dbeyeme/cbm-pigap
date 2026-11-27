import { API_URL } from './config';
import { deviceId } from './device';
import type { ComplementsEmbarcation } from './lib/inscription';
import type { OrigineLieu } from './offline/db';
import type { LimitesProfil, TarifSaisi } from './lib/profil';
import {
  ApiError,
  MESSAGE_RESEAU,
  MESSAGE_SESSION_EXPIREE,
  extractErrorCode,
  messageForCode,
  messageForStatus,
  parseApiError,
} from './lib/apiErrors';

/** Délai au-delà duquel un appel est abandonné : l'écran n'attend jamais le réseau. */
const DELAI_MS = 20_000;

/**
 * Appelé quand le serveur refuse un jeton (401). Le gestionnaire de session
 * s'y abonne pour effacer le jeton stocké et ramener à l'écran de connexion.
 */
type UnauthorizedHandler = (rejectedToken: string) => void | Promise<void>;
let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
  /**
   * Le serveur confirme que cet appareil est rattaché au compte (ADR-012).
   * Champ attendu du lot 10 côté serveur ; absent tant qu'il n'est pas livré.
   */
  appareil_rattache?: boolean;
};

export type Pecheur = {
  id: string;
  nom: string;
  prenom: string;
  numero_licence: string;
  organisation_id: string | null;
};

export type Embarcation = {
  id: string;
  pecheur_id: string;
  nom: string;
  immatriculation: string;
  type: string | null;
  positions_count?: number;
  derniere_position_a?: string | null;
};

export type PositionPoint = {
  id: string;
  embarcation_id: string;
  horodatage: string;
  position: { type: 'Point'; coordinates: [number, number] };
  source: string;
  synchronise_a: string | null;
};

async function request<T>(
  path: string,
  options: RequestInit & { token?: string; timeoutMs?: number; device?: boolean } = {},
): Promise<T> {
  const { token, headers, timeoutMs = DELAI_MS, device, ...rest } = options;
  // Identifiant de l'appareil (ADR-012) : à la connexion et sur toute requête authentifiée
  const appareil = token || device ? await deviceId() : null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        ...rest,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(appareil ? { 'X-Appareil-Id': appareil } : {}),
          ...headers,
        },
      });
    } catch {
      // Pas de réseau, serveur injoignable ou délai dépassé
      throw new ApiError(MESSAGE_RESEAU, 0, 'RESEAU');
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const code = extractErrorCode(body) ?? response.headers.get('X-Error-Code');
      if (response.status === 401 && token) {
        // Session refusée par le serveur : le jeton stocké est effacé
        try {
          await unauthorizedHandler?.(token);
        } catch {
          // la suite ne dépend pas du gestionnaire
        }
        throw new ApiError(MESSAGE_SESSION_EXPIREE, 401, 'SESSION_EXPIREE');
      }
      const message =
        messageForCode(code) ?? (body.trim() ? parseApiError(body) : messageForStatus(response.status));
      throw new ApiError(message, response.status, code);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    try {
      return (await response.json()) as T;
    } catch {
      // Réponse coupée en cours de route
      throw new ApiError(MESSAGE_RESEAU, 0, 'RESEAU');
    }
  } finally {
    clearTimeout(timer);
  }
}

export function login(email: string, mot_de_passe: string) {
  return request<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    device: true,
    body: JSON.stringify({ email, mot_de_passe }),
  });
}

export type UtilisateurMe = {
  id: string;
  nom: string;
  role: string;
  telephone: string | null;
  email: string | null;
  organisation_id: string | null;
  date_creation: string;
};

export function fetchMe(token: string) {
  return request<UtilisateurMe>('/api/v1/auth/me', { token });
}

export function createPecheur(
  token: string,
  payload: {
    nom: string;
    prenom: string;
    /** Omis = numéro attribué automatiquement par la plateforme */
    numero_licence?: string;
    telephone?: string;
    email?: string;
    mot_de_passe: string;
  },
) {
  return request<Pecheur>('/api/v1/pecheurs', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function createEmbarcation(
  token: string,
  payload: {
    pecheur_id: string;
    nom: string;
    immatriculation: string;
    type?: string;
    longueur?: number | null;
    equipements?: Record<string, unknown> | null;
  } & Partial<ComplementsEmbarcation>,
) {
  return request('/api/v1/embarcations', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function searchPecheurs(token: string, q: string) {
  const query = encodeURIComponent(q);
  return request<Pecheur[]>(`/api/v1/pecheurs?q=${query}`, { token });
}

export type LicenceDossier = {
  pecheur_id: string;
  nom: string;
  prenom: string;
  numero_licence: string;
  statut: string;
  embarcations: Embarcation[];
  trajectories: Array<{
    id: string;
    embarcation_id: string;
    embarcation_nom: string;
    immatriculation: string;
    index: number;
    debut: string;
    fin: string;
    points_count: number;
  }>;
  note_infractions: string;
};

export function getLicenceDossier(token: string, licence: string) {
  const params = new URLSearchParams({ licence });
  return request<LicenceDossier>(`/api/v1/positions/dossier?${params}`, { token });
}

export function getGeolocConfig(token: string) {
  return request<{ gps_interval_minutes: number }>('/api/v1/geoloc/config', { token });
}

export function listTrackedEmbarcations(token: string) {
  return request<Embarcation[]>('/api/v1/positions/embarcations', { token });
}

export function postPosition(
  token: string,
  payload: {
    embarcation_id: string;
    position: { type: 'Point'; coordinates: [number, number] };
    horodatage: string;
    source?: string;
  },
) {
  return request<PositionPoint>('/api/v1/positions', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export function postPositionsBatch(
  token: string,
  positions: Array<{
    embarcation_id: string;
    position: { type: 'Point'; coordinates: [number, number] };
    horodatage: string;
    source?: string;
  }>,
) {
  return request<PositionPoint[]>('/api/v1/positions/batch', {
    method: 'POST',
    token,
    body: JSON.stringify({ positions }),
  });
}

export function getTrajectory(token: string, embarcationId: string) {
  return request<PositionPoint[]>(
    `/api/v1/positions/trajectory?embarcation_id=${encodeURIComponent(embarcationId)}`,
    { token },
  );
}

export function clearTrajectory(token: string, embarcationId: string) {
  return request<{ detail: string }>(
    `/api/v1/positions/embarcation/${encodeURIComponent(embarcationId)}`,
    { method: 'DELETE', token },
  );
}

export type CaptureRead = {
  id: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: string;
  quantite_kg: number;
  methode: string | null;
  point_debarquement: string | null;
  date_capture: string;
  prix_fcfa_kg?: number | null;
  /** Provenance du lieu de pêche (lot 11), `null` sans lieu. */
  origine_lieu?: OrigineLieu | null;
  synchronise_a: string | null;
};

export type CaptureSyncResult = {
  accepts: string[];
  duplicates: string[];
  rejects: Array<{ id?: string | null; detail?: string; code?: string }>;
};

export type CaptureCreatePayload = {
  id?: string;
  pecheur_id: string;
  embarcation_id: string;
  espece: string;
  quantite_kg: number;
  methode: string;
  point_debarquement: string;
  date_capture: string;
  position_capture?: { type: 'Point'; coordinates: [number, number] };
  /** Provenance du lieu ; envoyée seulement avec `position_capture`. */
  origine_lieu?: OrigineLieu;
  prix_fcfa_kg?: number | null;
};

export function getCapturesCatalog(token: string) {
  return request<{ especes: string[]; methodes: string[] }>('/api/v1/captures/catalog', {
    token,
  });
}

export function listCaptures(token: string, params?: { pecheur_id?: string; embarcation_id?: string }) {
  const qs = new URLSearchParams();
  if (params?.pecheur_id) qs.set('pecheur_id', params.pecheur_id);
  if (params?.embarcation_id) qs.set('embarcation_id', params.embarcation_id);
  const suffix = qs.toString() ? `?${qs}` : '';
  return request<CaptureRead[]>(`/api/v1/captures${suffix}`, { token });
}

export function syncCapturesBatch(token: string, captures: CaptureCreatePayload[]) {
  return request<CaptureSyncResult>('/api/v1/captures/sync', {
    method: 'POST',
    token,
    body: JSON.stringify({ captures }),
  });
}

/* Sorties en mer et lieu de pêche proposé (lot 11, ADR-016) */

type GeoPoint = { type: 'Point'; coordinates: [number, number] };

/** Déclaration de sortie, création ou complément : renvoyer la même sortie est sans danger. */
export type SortiePayload = {
  client_id: string;
  embarcation_id: string;
  port_depart_id: string | null;
  position_depart: GeoPoint | null;
  depart_a: string;
  retour_prevu_a: string;
  secteur_vise: string | null;
  retour_a: string | null;
  port_retour_id: string | null;
  position_retour: GeoPoint | null;
};

export type SortieRead = {
  id: string;
  client_id: string;
  embarcation_id: string;
  embarcation_nom: string;
  immatriculation: string;
  pecheur_id: string;
  pecheur_nom: string;
  port_depart_id: string | null;
  port_depart_nom: string | null;
  position_depart: GeoPoint | null;
  depart_a: string;
  retour_prevu_a: string;
  secteur_vise: string | null;
  secteur_vise_nom: string | null;
  retour_a: string | null;
  port_retour_id: string | null;
  port_retour_nom: string | null;
  position_retour: GeoPoint | null;
  statut: 'en_cours' | 'en_retard' | 'terminee';
  retard_minutes: number;
  alerte_emise: boolean;
  retour_constate_par: 'pecheur' | 'agent_controle' | 'admin' | null;
  derniere_position: GeoPoint | null;
  derniere_position_a: string | null;
};

/** `201` à la création, `200` si le serveur connaît déjà cette sortie. */
export function postSortie(token: string, payload: SortiePayload) {
  return request<SortieRead>('/api/v1/sorties', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  });
}

export type LieuDePeche = {
  disponible: boolean;
  position: GeoPoint | null;
  debut: string | null;
  fin: string | null;
  releves: number;
  duree_minutes: number;
  motif: string;
  regle?: { version: string; statut: string; valideurs: string[] };
};

/** Point où le bateau est resté le plus longtemps pendant la sortie qui couvre `avant`. */
export function getLieuDePeche(token: string, embarcationId: string, avant: string) {
  const params = new URLSearchParams({ embarcation_id: embarcationId, avant });
  return request<LieuDePeche>(`/api/v1/sorties/lieu-de-peche?${params}`, { token });
}

export type PointCourbePrix = {
  periode: string;
  espece: string | null;
  prix_moyen_fcfa_kg: number | null;
  masque: boolean;
  nb_declarations: number;
  nb_pecheurs: number;
  volume_kg: number;
  prix_reference_2024_fcfa_kg: number | null;
};

export type CourbesPrixRead = {
  grain: 'jour' | 'semaine' | 'mois';
  points: PointCourbePrix[];
  anonymat_min_declarations: number;
  anonymat_min_pecheurs: number;
  statut_regles: string;
};

export type JourneeCarnet = {
  jour: string;
  embarcation_id?: string;
  embarcation_nom: string;
  immatriculation: string;
  volume_kg: number;
  valeur_estimee_fcfa: number;
  rendement_kg: number;
  charges_fcfa: number | null;
};

export type CarnetRead = {
  pecheur_nom: string;
  jours: JourneeCarnet[];
  volume_kg: number;
  valeur_estimee_fcfa: number;
  note_rentabilite: string;
};

export function getCourbesPrix(
  token: string,
  params?: { debut?: string; fin?: string; grain?: 'jour' | 'semaine' | 'mois' },
) {
  const q = new URLSearchParams();
  if (params?.debut) q.set('debut', params.debut);
  if (params?.fin) q.set('fin', params.fin);
  if (params?.grain) q.set('grain', params.grain);
  const qs = q.toString();
  return request<CourbesPrixRead>(`/api/v1/prix/courbes${qs ? `?${qs}` : ''}`, { token });
}

export function getCarnetDeclarations(
  token: string,
  params?: { debut?: string; fin?: string; pecheur_id?: string },
) {
  const q = new URLSearchParams();
  if (params?.debut) q.set('debut', params.debut);
  if (params?.fin) q.set('fin', params.fin);
  if (params?.pecheur_id) q.set('pecheur_id', params.pecheur_id);
  const qs = q.toString();
  return request<CarnetRead>(`/api/v1/prix/carnet${qs ? `?${qs}` : ''}`, { token });
}

/* Abonnements */

export type OffreAbonnement = {
  code: string;
  canal: string;
  periode: string;
  montant_fcfa: number;
  libelle: string;
  description: string;
};

export type InitierAbonnementResponse = {
  abonnement: {
    id: string;
    statut: string;
    montant_fcfa: number;
    code_offre: string;
    date_fin: string | null;
  };
  paiement: {
    id: string;
    reference_interne: string;
    instructions: string | null;
    statut: string;
    operateur: string;
    msisdn?: string | null;
  };
};

export type CouvertureAbonnement = {
  pecheur_id: string;
  numero_licence: string;
  couvert: boolean;
  motif: string;
  enforce: boolean;
  source_couverture: string | null;
};

export function listOffresAbonnement() {
  return request<OffreAbonnement[]>('/api/v1/abonnements/offres');
}

export function getCouvertureAbonnement(token: string, pecheurId: string) {
  return request<CouvertureAbonnement>(`/api/v1/abonnements/couverture/${pecheurId}`, {
    token,
  });
}

export function initierAbonnementB2C(
  token: string,
  body: {
    code_offre: string;
    numero_licence?: string;
    pecheur_id?: string;
    operateur?: string;
    msisdn?: string;
  },
) {
  return request<InitierAbonnementResponse>('/api/v1/abonnements/initier-b2c', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  });
}

export function confirmerPaiementDemo(token: string, paiementId: string) {
  return request<InitierAbonnementResponse>(
    `/api/v1/abonnements/paiements/${paiementId}/confirmer-demo`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  );
}

export type PaiementConfig = {
  mode: 'demo' | 'live' | string;
  msisdn_required: boolean;
  operateurs: string[];
  provider: string | null;
  devise: string;
  pays: string;
};

export function getPaiementConfig() {
  return request<PaiementConfig>('/api/v1/abonnements/paiement-config');
}

export function synchroniserPaiement(token: string, paiementId: string) {
  return request<InitierAbonnementResponse>(
    `/api/v1/abonnements/paiements/${paiementId}/synchroniser`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  );
}


/* Météo-marine : avis pour la position du pêcheur */

export type AvisMer = {
  niveau: 'vert' | 'orange' | 'rouge' | string;
  message: string;
  distance_km: number | null;
  secteur: {
    id: string;
    nom: string;
    conseil: string;
    conditions: {
      etat_mer: string;
      houle_m: number | null;
      vent_noeuds: number | null;
      rafales_max_24h_noeuds: number | null;
      courant_noeuds: number | null;
      maree: string | null;
      temperature_mer_c: number | null;
    };
    opportunite: { classe: string; score: number; motifs: string[] };
  } | null;
  fleuve_proche: { nom: string; niveau: string; conseil: string } | null;
};

export function getAvisMer(token: string, lon: number, lat: number) {
  return request<AvisMer>(`/api/v1/meteo/avis?lon=${lon}&lat=${lat}`, { token });
}


/* Payeur attendu : téléphone enregistré du pêcheur */

export type Payeur = {
  acteur: string;
  acteur_id: string;
  nom: string;
  telephone: string | null;
  msisdn: string | null;
  valide: boolean;
  motif: string;
};

export function getPayeur(token: string) {
  return request<Payeur>('/api/v1/abonnements/payeur', { token });
}

/** Le pêcheur met à jour lui-même son numéro Mobile Money. */
export function updateMonTelephone(token: string, telephone: string) {
  return request<UtilisateurMe>('/api/v1/auth/me/telephone', {
    token,
    method: 'PATCH',
    body: JSON.stringify({ telephone }),
  });
}


/* Redevances : taxe à la production, quittances */

export type EncoursRedevances = {
  pecheur_id: string | null;
  organisation_id: string | null;
  nb_captures: number;
  quantite_kg: number;
  montant_fcfa: number;
  par_groupe: Array<{ groupe: string; quantite_kg: number; montant_fcfa: number }>;
  depuis: string | null;
  jusqu_a: string | null;
};

export type QuittancePaiement = {
  id: string;
  quittance_id: string | null;
  montant_fcfa: number;
  operateur: string;
  msisdn: string | null;
  statut: string;
  reference_interne: string;
  reference_operateur: string | null;
};

export type Quittance = {
  id: string;
  numero: string;
  montant_fcfa: number;
  nb_captures: number;
  statut: 'en_attente' | 'payee' | 'annulee';
  date_creation: string;
  date_paiement: string | null;
  paiement: QuittancePaiement | null;
  titulaire: string | null;
};

export function getEncoursRedevances(token: string) {
  return request<EncoursRedevances>('/api/v1/redevances/encours', { token });
}

export function listQuittances(token: string) {
  return request<Quittance[]>('/api/v1/redevances/quittances', { token });
}

export function createQuittance(token: string) {
  return request<Quittance>('/api/v1/redevances/quittances', {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  });
}

export function payerQuittance(
  token: string,
  quittanceId: string,
  data: { operateur?: string; msisdn?: string; numero_tiers_autorise?: boolean },
) {
  return request<{ quittance: Quittance; paiement: QuittancePaiement }>(
    `/api/v1/redevances/quittances/${quittanceId}/payer`,
    { method: 'POST', token, body: JSON.stringify(data) },
  );
}

export function confirmerQuittanceDemo(token: string, paiementId: string) {
  return request<{ quittance: Quittance; paiement: QuittancePaiement }>(
    `/api/v1/redevances/paiements/${paiementId}/confirmer-demo`,
    { method: 'POST', token },
  );
}


/* Carte professionnelle du pêcheur et contrôle de licence */

/** Couverture et numéro de licence du pêcheur connecté. */
export function getMaCouverture(token: string) {
  return request<CouvertureAbonnement>('/api/v1/abonnements/me', { token });
}

/** Vérification publique d'une licence : aucune donnée personnelle. */
export type VerifPublique = {
  numero: string;
  type: string;
  valide: boolean;
  /** `valide`, `sans_date`, `expiree`, `suspendue` ou `inconnue`. */
  statut: string;
  date_expiration: string | null;
  nb_embarcations: number;
  montant_fcfa: number | null;
};

export function verifPubliqueLicence(numero: string) {
  return request<VerifPublique>(`/api/v1/public/verif/licence/${encodeURIComponent(numero)}`);
}

/** Vérification complète d'une licence, réservée aux agents. */
export type VerificationLicence = {
  numero_licence: string;
  trouvee: boolean;
  /** `valide`, `sans_date`, `expiree`, `suspendue` ou `inconnue`. */
  statut_licence: string;
  date_delivrance: string | null;
  date_expiration: string | null;
  pecheur_id: string | null;
  pecheur_nom: string | null;
  nationalite: string | null;
  organisation: string | null;
  embarcations: Array<{ id: string; nom: string; immatriculation: string; type: string | null }>;
  taxes_dues_fcfa: number;
  alertes_nouvelles: number;
  controles_12_mois: number;
  infractions_12_mois: number;
  engins_autorises: string[];
};

export function verifierLicence(token: string, numero: string) {
  const params = new URLSearchParams({ numero });
  return request<VerificationLicence>(`/api/v1/controles/verifier-licence?${params}`, { token });
}

/* Lot 2 : informations d'inscription, page de profil, fiche d'identité */

/** Correction des informations d'une embarcation (agent) ; `null` efface une information. */
export function updateEmbarcation(token: string, id: string, patch: Partial<ComplementsEmbarcation>) {
  return request<Embarcation & Partial<ComplementsEmbarcation>>(
    `/api/v1/embarcations/${encodeURIComponent(id)}`,
    { method: 'PATCH', token, body: JSON.stringify(patch) },
  );
}

export type EspeceProfil = { espece: string; nom: string };

export type TarifProfil = TarifSaisi & { nom: string };

/** Page de profil du pêcheur connecté, avec ses réglages (`/profils/moi`). */
export type MonProfil = {
  genre: 'pecheur' | 'organisation';
  nom: string;
  localite: string | null;
  /** Texte brut, à afficher comme du texte. */
  presentation: string | null;
  especes: EspeceProfil[];
  tarifs_affiches: boolean;
  /** Tarifs tels que les autres les voient : vide tant qu'ils ne sont pas affichés. */
  tarifs: TarifProfil[];
  mise_a_jour: string | null;
  acteur_id: string;
  organisation: string | null;
  nb_embarcations: number;
  especes_declarees: EspeceProfil[];
  especes_masquees: string[];
  tarifs_visibles: boolean;
  mes_tarifs: TarifProfil[];
  ouvert_au_public: boolean;
  lien_public: string | null;
  limites: LimitesProfil;
  statut_regles: string;
};

export type ModificationProfil = Partial<{
  presentation: string;
  especes_masquees: string[];
  tarifs: TarifSaisi[];
  tarifs_visibles: boolean;
  ouvert_au_public: boolean;
}>;

export function getMonProfil(token: string) {
  return request<MonProfil>('/api/v1/profils/moi', { token });
}

/** Seuls les champs envoyés changent ; `tarifs` remplace toute la liste. */
export function updateMonProfil(token: string, patch: ModificationProfil) {
  return request<MonProfil>('/api/v1/profils/moi', {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch),
  });
}

export type EmbarcationRegistre = Partial<ComplementsEmbarcation> & {
  id: string;
  nom: string;
  immatriculation: string;
  type: string | null;
  longueur_m: number | null;
  filiere: string | null;
  type_pirogue: string | null;
  materiau: string | null;
  puissance_moteur_cv: number | null;
  site_attache: string | null;
  strate: string | null;
  equipements: Record<string, unknown> | null;
  balise: boolean;
};

export type EmbarcationSuivi = {
  embarcation_id: string;
  nom: string;
  immatriculation: string;
  dernier_releve: { source: string; horodatage: string; age_secondes: number } | null;
  periode_observee: { debut: string; fin: string } | null;
  nb_releves: number;
  releves_par_source: Record<string, number>;
};

/** Fiche d'identité à deux volets : ce que dit le registre, ce que l'embarcation émet. */
export type FicheIdentite = {
  pecheur_id: string;
  registre: {
    identite: { nom: string; prenom: string; nationalite: string | null; statut: string };
    licence: {
      numero: string;
      date_delivrance: string | null;
      date_expiration: string | null;
      /** `valide`, `expiree`, `suspendue` ou `sans_date`. */
      statut: string;
      validite_jours: number;
    };
    organisation: { id: string; nom: string; type: string | null } | null;
    embarcations: EmbarcationRegistre[];
  };
  suivi: {
    embarcations: EmbarcationSuivi[];
    nb_releves: number;
    genere_a: string;
  };
};

/** Fiche du pêcheur connecté. */
export function getMaFiche(token: string) {
  return request<FicheIdentite>('/api/v1/identite/moi', { token });
}

/** Fiche d'un pêcheur, dans le périmètre du compte ; chaque consultation est journalisée. */
export function getFicheIdentite(token: string, pecheurId: string) {
  return request<FicheIdentite>(`/api/v1/identite/pecheurs/${encodeURIComponent(pecheurId)}`, { token });
}
