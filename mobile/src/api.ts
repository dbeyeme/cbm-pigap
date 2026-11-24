import { API_URL } from './config';
import { deviceId } from './device';
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
  },
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
