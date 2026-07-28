const API = import.meta.env.VITE_API_URL ?? '';

export type Embarcation = {
  id: string;
  nom: string;
  immatriculation: string;
  type?: string | null;
  positions_count?: number;
  derniere_position_a?: string | null;
  pecheur_id?: string;
  longueur?: number | null;
};

export type Pecheur = {
  id: string;
  utilisateur_id: string;
  nom: string;
  prenom: string;
  numero_licence: string;
  date_delivrance_licence: string | null;
  statut: string;
  organisation_id: string | null;
};

export type PecheurCreate = {
  nom: string;
  prenom: string;
  numero_licence: string;
  email?: string | null;
  mot_de_passe: string;
  telephone?: string | null;
};

export type PecheurUpdate = {
  nom?: string;
  prenom?: string;
  numero_licence?: string;
  statut?: string;
};

export type EmbarcationCreate = {
  pecheur_id: string;
  nom: string;
  immatriculation: string;
  type?: string | null;
};

export type PositionPoint = {
  id: string;
  embarcation_id: string;
  horodatage: string;
  position: { type: 'Point'; coordinates: [number, number] };
  source: string;
};

export type TrajectorySegment = {
  id: string;
  embarcation_id: string;
  embarcation_nom: string;
  immatriculation: string;
  type?: string | null;
  index: number;
  debut: string;
  fin: string;
  points_count: number;
  points: PositionPoint[];
};

export type LicenceDossier = {
  pecheur_id: string;
  nom: string;
  prenom: string;
  numero_licence: string;
  statut: string;
  embarcations: Embarcation[];
  trajectories: TrajectorySegment[];
  note_infractions: string;
};

async function request<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  if (res.status === 204) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

export function login(email: string, password: string) {
  return request<{ access_token: string }>('/api/v1/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ email, mot_de_passe: password }),
  });
}

export function listTrajectories(token: string, embarcationId?: string) {
  const params = new URLSearchParams();
  if (embarcationId) params.set('embarcation_id', embarcationId);
  const q = params.toString();
  return request<TrajectorySegment[]>(
    `/api/v1/positions/trajectories${q ? `?${q}` : ''}`,
    token,
  );
}

export function getLicenceDossier(token: string, licence: string) {
  const params = new URLSearchParams({ licence });
  return request<LicenceDossier>(`/api/v1/positions/dossier?${params}`, token);
}

export function listPecheurs(token: string, q?: string) {
  const params = new URLSearchParams();
  if (q?.trim()) params.set('q', q.trim());
  const qs = params.toString();
  return request<Pecheur[]>(`/api/v1/pecheurs${qs ? `?${qs}` : ''}`, token);
}

export function createPecheur(token: string, data: PecheurCreate) {
  return request<Pecheur>('/api/v1/pecheurs', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updatePecheur(token: string, id: string, data: PecheurUpdate) {
  return request<Pecheur>(`/api/v1/pecheurs/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deletePecheur(token: string, id: string) {
  return request<void>(`/api/v1/pecheurs/${id}`, token, { method: 'DELETE' });
}

export function listEmbarcations(token: string, pecheurId?: string) {
  const params = new URLSearchParams();
  if (pecheurId) params.set('pecheur_id', pecheurId);
  const qs = params.toString();
  return request<Embarcation[]>(`/api/v1/embarcations${qs ? `?${qs}` : ''}`, token);
}

export function createEmbarcation(token: string, data: EmbarcationCreate) {
  return request<Embarcation>('/api/v1/embarcations', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export type ZoneReglementee = {
  id: string;
  nom: string;
  type: 'interdite' | 'protegee' | 'sensible';
  geometrie: { type: 'Polygon'; coordinates: [number, number][][] };
  periode_debut: string | null;
  periode_fin: string | null;
  actif: boolean;
};

export type ZoneCreate = {
  nom: string;
  type: ZoneReglementee['type'];
  geometrie: ZoneReglementee['geometrie'];
  actif?: boolean;
};

export type ZoneUpdate = {
  nom?: string;
  type?: ZoneReglementee['type'];
  geometrie?: ZoneReglementee['geometrie'];
  actif?: boolean;
};

export type IntersectionResult = {
  intersects: boolean;
  zones: ZoneReglementee[];
};

export function listZones(token: string, params?: { actif?: boolean; type?: string }) {
  const q = new URLSearchParams();
  if (params?.actif !== undefined) q.set('actif', String(params.actif));
  if (params?.type) q.set('type', params.type);
  const qs = q.toString();
  return request<ZoneReglementee[]>(`/api/v1/zones${qs ? `?${qs}` : ''}`, token);
}

export function createZone(token: string, data: ZoneCreate) {
  return request<ZoneReglementee>('/api/v1/zones', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateZone(token: string, id: string, data: ZoneUpdate) {
  return request<ZoneReglementee>(`/api/v1/zones/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function importZonesGeoJSON(token: string, featureCollection: object) {
  return request<{ imported: number; zones: ZoneReglementee[] }>(
    '/api/v1/zones/import/geojson',
    token,
    { method: 'POST', body: JSON.stringify(featureCollection) },
  );
}

export function detectZoneIntersection(
  token: string,
  position: [number, number],
  types?: string[],
) {
  return request<IntersectionResult>('/api/v1/zones/detect/intersection', token, {
    method: 'POST',
    body: JSON.stringify({
      position: { type: 'Point', coordinates: position },
      ...(types ? { types } : {}),
    }),
  });
}

export function deleteZone(token: string, id: string) {
  return request<{ detail: string }>(`/api/v1/zones/${id}`, token, { method: 'DELETE' });
}

/** Bounding box → Polygon GeoJSON (anneau fermé lon/lat). */
export function bboxToPolygon(
  minLon: number,
  minLat: number,
  maxLon: number,
  maxLat: number,
): ZoneReglementee['geometrie'] {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
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

export type CaptureCatalog = {
  especes: string[];
  methodes: string[];
};

export type CaptureCreate = {
  pecheur_id: string;
  embarcation_id: string;
  espece: string;
  quantite_kg: number;
  methode: string;
  point_debarquement: string;
  date_capture: string;
  id?: string;
};

export type CaptureUpdate = {
  pecheur_id?: string;
  embarcation_id?: string;
  espece?: string;
  quantite_kg?: number;
  methode?: string;
  point_debarquement?: string;
  date_capture?: string;
};

export function getCapturesCatalog(token: string) {
  return request<CaptureCatalog>('/api/v1/captures/catalog', token);
}

export function listCaptures(
  token: string,
  params?: { pecheur_id?: string; embarcation_id?: string; espece?: string },
) {
  const q = new URLSearchParams();
  if (params?.pecheur_id) q.set('pecheur_id', params.pecheur_id);
  if (params?.embarcation_id) q.set('embarcation_id', params.embarcation_id);
  if (params?.espece) q.set('espece', params.espece);
  const qs = q.toString();
  return request<CaptureRead[]>(`/api/v1/captures${qs ? `?${qs}` : ''}`, token);
}

export function createCapture(token: string, data: CaptureCreate) {
  return request<CaptureRead>('/api/v1/captures', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateCapture(token: string, id: string, data: CaptureUpdate) {
  return request<CaptureRead>(`/api/v1/captures/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteCapture(token: string, id: string) {
  return request<{ detail: string }>(`/api/v1/captures/${id}`, token, {
    method: 'DELETE',
  });
}

export type QuotaRead = {
  id: string;
  espece: string;
  zone_id: string | null;
  periode_debut: string;
  periode_fin: string;
  volume_autorise_kg: number;
  volume_consomme_kg: number;
  taux_consommation: number;
};

export type QuotaCreate = {
  espece: string;
  zone_id?: string | null;
  periode_debut: string;
  periode_fin: string;
  volume_autorise_kg: number;
};

export type QuotaAlerte = {
  id: string;
  type: string;
  niveau_gravite: string;
  embarcation_id: string | null;
  declencheur: Record<string, unknown>;
  horodatage: string;
  statut: string;
};

export function listQuotas(token: string, espece?: string) {
  const q = espece ? `?espece=${encodeURIComponent(espece)}` : '';
  return request<QuotaRead[]>(`/api/v1/quotas${q}`, token);
}

export function createQuota(token: string, data: QuotaCreate) {
  return request<QuotaRead>('/api/v1/quotas', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteQuota(token: string, id: string) {
  return request<{ detail: string }>(`/api/v1/quotas/${id}`, token, {
    method: 'DELETE',
  });
}

export function listQuotaAlertes(token: string) {
  return request<QuotaAlerte[]>('/api/v1/quotas/alertes', token);
}

export type DashboardRead = {
  pecheurs_actifs: number;
  volume_total_kg: number;
  repartition_especes: Array<{ espece: string; volume_kg: number }>;
  alertes_actives: QuotaAlerte[];
  zones_forte_activite: Array<{
    label: string | null;
    centre: { type: 'Point'; coordinates: [number, number] };
    nb_captures: number;
    volume_kg: number;
  }>;
  periode_debut: string | null;
  periode_fin: string | null;
  genere_a: string;
};

export function getDashboard(
  token: string,
  params?: { debut?: string; fin?: string },
) {
  const q = new URLSearchParams();
  if (params?.debut) q.set('debut', params.debut);
  if (params?.fin) q.set('fin', params.fin);
  const qs = q.toString();
  return request<DashboardRead>(`/api/v1/dashboard${qs ? `?${qs}` : ''}`, token);
}

export function listAlertes(
  token: string,
  params?: { type?: string; statut?: string; embarcation_id?: string },
) {
  const q = new URLSearchParams();
  if (params?.type) q.set('type', params.type);
  if (params?.statut) q.set('statut', params.statut);
  if (params?.embarcation_id) q.set('embarcation_id', params.embarcation_id);
  const qs = q.toString();
  return request<QuotaAlerte[]>(`/api/v1/alertes${qs ? `?${qs}` : ''}`, token);
}

export function patchAlerteStatut(
  token: string,
  id: string,
  statut: 'nouvelle' | 'traitee' | 'ignoree',
) {
  return request<QuotaAlerte>(`/api/v1/alertes/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ statut }),
  });
}
