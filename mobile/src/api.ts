import { parseApiError } from './lib/apiErrors';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:8000';

export type TokenResponse = { access_token: string; token_type: string };

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
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(parseApiError(body || `HTTP ${response.status}`));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function login(email: string, mot_de_passe: string) {
  return request<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, mot_de_passe }),
  });
}

export function createPecheur(
  token: string,
  payload: {
    nom: string;
    prenom: string;
    numero_licence: string;
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

/* ——— Abonnements ——— */

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
