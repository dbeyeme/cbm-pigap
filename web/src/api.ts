const API = import.meta.env.VITE_API_URL ?? '';

export { friendlyApiError, parseApiError, refreshNotifications } from './lib/apiErrors';
import { parseApiError } from './lib/apiErrors';

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
  /** Omis = attribution automatique par la plateforme */
  numero_licence?: string;
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

export type LiveVessel = {
  embarcation_id: string;
  nom: string;
  immatriculation: string;
  type?: string | null;
  position: { type: 'Point'; coordinates: [number, number] };
  horodatage: string;
  source: string;
  age_seconds: number;
  statut: 'actif' | 'recent' | 'silence' | string;
  secteur: 'cote' | 'bras_mer' | 'fleuve' | string;
};

export type AisStatutNav =
  | 'a_quai'
  | 'au_mouillage'
  | 'en_route'
  | 'en_peche'
  | 'en_route_voile'
  | 'inconnu'
  | string;

export type AisVessel = {
  mmsi: string;
  nom: string;
  position: { type: 'Point'; coordinates: [number, number] };
  horodatage: string;
  sog_kn?: number | null;
  cog_deg?: number | null;
  heading_deg?: number | null;
  ship_type?: string | null;
  type_label?: string | null;
  statut_nav: AisStatutNav;
  statut_nav_code?: number | null;
  destination?: string | null;
  imo?: string | null;
  callsign?: string | null;
  longueur_m?: number | null;
  port_id?: string | null;
  port_proche?: string | null;
  distance_port_km?: number | null;
  age_s: number;
  provider: string;
  demo: boolean;
  pavillon?: string | null;
  pavillon_code?: string | null;
  dans_eaux_gabon: boolean;
  entree_prevue_h?: number | null;
  entree_prevue_position?: { type: 'Point'; coordinates: [number, number] } | null;
  position_estimee?: { type: 'Point'; coordinates: [number, number] } | null;
};

export type AisTrackPoint = {
  horodatage: string;
  position: { type: 'Point'; coordinates: [number, number] };
  sog_kn?: number | null;
  cog_deg?: number | null;
};

export type AisRegistreCorrespondance = {
  embarcation_id: string;
  embarcation_nom: string;
  immatriculation: string;
  pecheur_nom: string | null;
  numero_licence: string | null;
  statut_pecheur: string | null;
  organisation: string | null;
  methode: string;
};

export type AisVesselDetail = {
  vessel: AisVessel;
  track: AisTrackPoint[];
  zones_reglementees: { id: string; nom: string; type: string }[];
  registre: AisRegistreCorrespondance | null;
  regularite: 'conforme' | 'a_verifier' | 'alerte' | string;
  motifs: string[];
  libre_immatriculation: boolean;
};

export type AisStreamStatus = {
  provider: string;
  configured: boolean;
  connected: boolean;
  since: string | null;
  last_message_at: string | null;
  messages: number;
  reconnects: number;
  last_error: string | null;
};

export type AisPortSummary = {
  id: string;
  nom: string;
  type: string;
  lon: number;
  lat: number;
  rayon_km: number;
  navires: number;
  a_quai: number;
  au_mouillage: number;
  en_route: number;
  en_peche: number;
};

export type AisLiveResponse = {
  enabled: boolean;
  vessels: AisVessel[];
  fetched_at: string | null;
  source: string;
  note: string;
  eez_filter: boolean;
  stream?: AisStreamStatus | null;
  ports?: AisPortSummary[];
  recepteurs_locaux?: number;
  approches?: AisVessel[];
};

export const AIS_STATUT_LABELS: Record<string, string> = {
  a_quai: 'À quai',
  au_mouillage: 'Au mouillage',
  en_route: 'En route',
  en_peche: 'En pêche',
  en_route_voile: 'En route (voile)',
  non_maitre_manoeuvre: 'Non maître de sa manœuvre',
  manoeuvrabilite_restreinte: 'Manœuvrabilité restreinte',
  contraint_tirant_eau: 'Contraint par son tirant d’eau',
  echoue: 'Échoué',
  detresse: 'En détresse',
  inconnu: 'Statut inconnu',
};

export function getAisVessel(token: string, mmsi: string) {
  return request<AisVesselDetail>(`/api/v1/ais/vessels/${encodeURIComponent(mmsi)}`, token);
}

export function aisStatutLabel(statut: string | null | undefined): string {
  return AIS_STATUT_LABELS[statut ?? 'inconnu'] ?? 'Statut inconnu';
}

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
    throw new Error(parseApiError(await res.text()));
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

export type StaffRole = 'agent_controle' | 'admin';

export type StaffUser = {
  id: string;
  nom: string;
  role: StaffRole | string;
  telephone: string | null;
  email: string | null;
  date_creation: string;
};

export type StaffCreate = {
  nom: string;
  role: StaffRole;
  email?: string | null;
  telephone?: string | null;
  mot_de_passe: string;
};

export type StaffUpdate = {
  nom?: string;
  role?: StaffRole;
  email?: string | null;
  telephone?: string | null;
  mot_de_passe?: string;
};

export function fetchMe(token: string) {
  return request<StaffUser>('/api/v1/auth/me', token);
}

export function listStaff(token: string, params?: { role?: StaffRole; q?: string }) {
  const q = new URLSearchParams();
  if (params?.role) q.set('role', params.role);
  if (params?.q?.trim()) q.set('q', params.q.trim());
  const qs = q.toString();
  return request<StaffUser[]>(`/api/v1/utilisateurs${qs ? `?${qs}` : ''}`, token);
}

export function createStaff(token: string, data: StaffCreate) {
  return request<StaffUser>('/api/v1/utilisateurs', token, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateStaff(token: string, id: string, data: StaffUpdate) {
  return request<StaffUser>(`/api/v1/utilisateurs/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function deleteStaff(token: string, id: string) {
  return request<void>(`/api/v1/utilisateurs/${id}`, token, { method: 'DELETE' });
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

/** Circulation near-live (dernière position / embarcation). Poller 15–30 s. */
/* ——— Présence au port (flotte PIGAP, calcul GPS) ——— */

export type DeclarationPresence = {
  embarcation_id: string;
  embarcation_nom: string;
  port_id: string;
  port_nom: string;
  date: string;
  quantite_kg: number;
  coherence: 'coherente' | 'incoherente' | 'non_verifiable' | string;
};

export type EmbarcationPresence = {
  embarcation_id: string;
  nom: string;
  immatriculation: string;
  type: string | null;
  statut: 'a_quai' | 'en_manoeuvre' | 'en_mer' | 'sans_signal' | string;
  port_id: string | null;
  port_nom: string | null;
  depuis: string | null;
  derniere_position: string | null;
  age_s: number | null;
  dernier_port_id: string | null;
  dernier_port_nom: string | null;
  dernier_depart: string | null;
  declaration: DeclarationPresence | null;
};

export type PortPresence = {
  id: string;
  nom: string;
  type: string;
  lon: number;
  lat: number;
  rayon_km: number;
  a_quai: number;
  en_manoeuvre: number;
  arrivees: number;
  departs: number;
  debarquements_declares: number;
  embarcations: EmbarcationPresence[];
};

export type PortPresenceResponse = {
  fetched_at: string;
  fenetre_heures: number;
  seuil_minutes: number;
  ports: PortPresence[];
  en_mer: EmbarcationPresence[];
  sans_signal: number;
  total_suivies: number;
  incoherences: DeclarationPresence[];
};

export function getPortPresence(token: string, fenetreHeures = 24) {
  const params = new URLSearchParams({ fenetre_heures: String(fenetreHeures) });
  return request<PortPresenceResponse>(`/api/v1/positions/presence-ports?${params}`, token);
}

export function listLiveVessels(token: string, sinceMinutes = 360) {
  const params = new URLSearchParams({ since_minutes: String(sinceMinutes) });
  return request<LiveVessel[]>(`/api/v1/positions/live?${params}`, token);
}

/** Navires AIS dans la ZEE Gabon (open data, ADR-005) — distinct GPS PIGAP. */
export function listAisLive(token: string, refresh = false) {
  const params = new URLSearchParams();
  if (refresh) params.set('refresh', 'true');
  const q = params.toString();
  return request<AisLiveResponse>(`/api/v1/ais/live${q ? `?${q}` : ''}`, token);
}

export function getLicenceDossier(token: string, licence: string) {
  const params = new URLSearchParams({ licence });
  return request<LicenceDossier>(`/api/v1/positions/dossier?${params}`, token);
}

export function getPecheur(token: string, id: string) {
  return request<Pecheur>(`/api/v1/pecheurs/${id}`, token);
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

function periodQuery(debut?: string, fin?: string): string {
  const q = new URLSearchParams();
  if (debut) q.set('debut', debut);
  if (fin) q.set('fin', fin);
  const qs = q.toString();
  return qs ? `?${qs}` : '';
}

/** Télécharge un PDF/CSV authentifié (documents officiels). */
export async function downloadAuthenticatedFile(
  token: string,
  path: string,
  fallbackFilename: string,
): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiError(text));
  }
  const blob = await res.blob();
  const disp = res.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disp);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadLicencePdf(token: string, pecheurId: string) {
  return downloadAuthenticatedFile(
    token,
    `/api/v1/documents/licence/${pecheurId}`,
    'licence.pdf',
  );
}

export function downloadFichePecheurPdf(token: string, pecheurId: string) {
  return downloadAuthenticatedFile(
    token,
    `/api/v1/documents/fiche/pecheur/${pecheurId}`,
    'fiche.pdf',
  );
}

export function downloadFicheDemandePdf(token: string, demandeId: string) {
  return downloadAuthenticatedFile(
    token,
    `/api/v1/documents/fiche/demande/${demandeId}`,
    'fiche-demande.pdf',
  );
}

export function downloadBilanPdf(
  token: string,
  pecheurId: string,
  params?: { debut?: string; fin?: string },
) {
  return downloadAuthenticatedFile(
    token,
    `/api/v1/documents/bilan/${pecheurId}${periodQuery(params?.debut, params?.fin)}`,
    'bilan.pdf',
  );
}

export function downloadRapport(
  token: string,
  params?: { debut?: string; fin?: string; format?: 'pdf' | 'csv' },
) {
  const q = new URLSearchParams();
  if (params?.debut) q.set('debut', params.debut);
  if (params?.fin) q.set('fin', params.fin);
  q.set('format', params?.format ?? 'pdf');
  const ext = params?.format === 'csv' ? 'csv' : 'pdf';
  return downloadAuthenticatedFile(
    token,
    `/api/v1/documents/rapport?${q.toString()}`,
    `rapport.${ext}`,
  );
}

export type GrainSerie = 'jour' | 'semaine' | 'mois';

export type DashboardSeries = {
  grain: GrainSerie;
  volume_par_periode: Array<{ periode: string; volume_kg: number }>;
  especes_par_periode: Array<{ periode: string; espece: string; volume_kg: number }>;
  alertes_par_periode: Array<{ periode: string; type: string; count: number }>;
  saisons: Array<{ periode: string; saison: string }>;
  periode_debut: string | null;
  periode_fin: string | null;
  genere_a: string;
};

export function getDashboardSeries(
  token: string,
  params?: { debut?: string; fin?: string; grain?: GrainSerie },
) {
  const q = new URLSearchParams();
  if (params?.debut) q.set('debut', params.debut);
  if (params?.fin) q.set('fin', params.fin);
  if (params?.grain) q.set('grain', params.grain);
  const qs = q.toString();
  return request<DashboardSeries>(`/api/v1/dashboard/series${qs ? `?${qs}` : ''}`, token);
}

export type PredictionsRead = {
  horizon_jours: number;
  mode: 'ok' | 'insuffisant';
  peches: Array<{
    espece: string;
    volume_prevu_kg: number;
    intervalle_bas_kg: number;
    intervalle_haut_kg: number;
    justification: Record<string, unknown>;
  }>;
  penuries: Array<{
    espece: string;
    risque: 'faible' | 'moyen' | 'eleve';
    volume_4sem_kg: number;
    baseline_saison_kg: number;
    volume_prevu_30j_kg: number;
    justification: Record<string, unknown>;
  }>;
  intrusions: Array<{
    zone_id: string | null;
    zone_nom: string;
    count_prevu: number;
    score: number;
    justification: Record<string, unknown>;
  }>;
  zones_incidents: Array<{
    zone_id: string | null;
    zone_nom: string;
    centre: { type: 'Point'; coordinates: [number, number] } | null;
    score: number;
    count_intrusions_hist: number;
    volume_captures_kg: number;
    quota_taux_max: number | null;
    justification: Record<string, unknown>;
  }>;
  genere_a: string;
};

export function getPredictions(token: string, horizonJours: 7 | 30 = 30) {
  return request<PredictionsRead>(
    `/api/v1/predictions?horizon_jours=${horizonJours}`,
    token,
  );
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

/* ——— Demandes licence FO / BO ——— */

export type DemandeLicence = {
  id: string;
  type_demande: 'personne_physique' | 'personne_morale';
  statut: 'en_attente' | 'approuvee' | 'refusee';
  nom: string | null;
  prenom: string | null;
  telephone: string | null;
  email: string | null;
  org_nom: string | null;
  org_type: string | null;
  numero_registre: string | null;
  org_email: string | null;
  org_telephone: string | null;
  org_ville: string | null;
  org_adresse: string | null;
  zone_activite: string | null;
  embarcation_nom: string | null;
  embarcation_immatriculation: string | null;
  embarcation_type: string | null;
  message: string | null;
  pieces_jointes: PieceJointe[];
  motif_refus: string | null;
  pecheur_id: string | null;
  organisation_id: string | null;
  traite_par_id: string | null;
  date_creation: string;
  date_traitement: string | null;
  /** Attribués automatiquement à l'approbation définitive */
  numero_licence_attribue?: string | null;
  immatriculation_attribuee?: string | null;
};

export type PieceJointe = {
  id: string;
  type_piece: string;
  nom_original: string;
  content_type: string;
  taille: number;
};

export type DemandeLicenceCreate = {
  type_demande: 'personne_physique' | 'personne_morale';
  nom?: string | null;
  prenom?: string | null;
  telephone?: string | null;
  email?: string | null;
  org_nom?: string | null;
  org_type?: string | null;
  numero_registre?: string | null;
  org_email?: string | null;
  org_telephone?: string | null;
  org_ville?: string | null;
  org_adresse?: string | null;
  zone_activite?: string | null;
  embarcation_nom?: string | null;
  embarcation_immatriculation?: string | null;
  embarcation_type?: string | null;
  message?: string | null;
};

export type Organisation = {
  id: string;
  nom: string;
  nom_commercial: string | null;
  type_organisation: string | null;
  forme_juridique: string | null;
  numero_registre: string | null;
  email: string | null;
  telephone: string | null;
  ville: string | null;
  zone_activite: string | null;
  actif: boolean;
  date_creation: string;
};

export function createDemandeLicence(payload: DemandeLicenceCreate) {
  return request<DemandeLicence>('/api/v1/demandes-licence', undefined, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function createDemandeLicenceWithFiles(formData: FormData) {
  const res = await fetch(`${API}/api/v1/demandes-licence/with-files`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    throw new Error(parseApiError(await res.text()));
  }
  return (await res.json()) as DemandeLicence;
}

export function pieceDemandeUrl(demandeId: string, pieceId: string) {
  return `${API}/api/v1/demandes-licence/${demandeId}/pieces/${pieceId}`;
}

export function listDemandesLicence(
  token: string,
  params?: { statut?: string; type_demande?: string; q?: string },
) {
  const q = new URLSearchParams();
  if (params?.statut) q.set('statut', params.statut);
  if (params?.type_demande) q.set('type_demande', params.type_demande);
  if (params?.q) q.set('q', params.q);
  const qs = q.toString();
  return request<DemandeLicence[]>(`/api/v1/demandes-licence${qs ? `?${qs}` : ''}`, token);
}

export function approveDemandeLicence(
  token: string,
  id: string,
  body: {
    /** Optionnel : reprise d'un numéro déjà délivré. Omis = attribution automatique. */
    numero_licence?: string;
    immatriculation?: string;
    mot_de_passe: string;
    creer_embarcation?: boolean;
  },
) {
  return request<DemandeLicence>(`/api/v1/demandes-licence/${id}/approve`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function refuseDemandeLicence(token: string, id: string, motif_refus: string) {
  return request<DemandeLicence>(`/api/v1/demandes-licence/${id}/refuse`, token, {
    method: 'POST',
    body: JSON.stringify({ motif_refus }),
  });
}

export function deleteDemandeLicence(token: string, id: string) {
  return request<void>(`/api/v1/demandes-licence/${id}`, token, { method: 'DELETE' });
}

export function listOrganisations(token: string, actif?: boolean) {
  const qs = actif === undefined ? '' : `?actif=${actif}`;
  return request<Organisation[]>(`/api/v1/organisations${qs}`, token);
}

export function createOrganisation(
  token: string,
  body: {
    nom: string;
    type_organisation?: string | null;
    numero_registre?: string | null;
    email?: string | null;
    telephone?: string | null;
    ville?: string | null;
    zone_activite?: string | null;
  },
) {
  return request<Organisation>('/api/v1/organisations', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateOrganisation(
  token: string,
  id: string,
  body: Partial<{
    nom: string;
    type_organisation: string | null;
    numero_registre: string | null;
    email: string | null;
    telephone: string | null;
    ville: string | null;
    zone_activite: string | null;
    actif: boolean;
  }>,
) {
  return request<Organisation>(`/api/v1/organisations/${id}`, token, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

/* ——— Notifications temps réel ——— */

export type NotificationItem = {
  kind: 'demande' | 'alerte';
  id: string;
  title: string;
  body: string;
  created_at: string;
  page: 'demandes' | 'alertes';
};

export type NotificationSummary = {
  demandes_en_attente: number;
  alertes_nouvelles: number;
  total: number;
  items: NotificationItem[];
};

export function fetchNotificationSummary(token: string) {
  return request<NotificationSummary>('/api/v1/notifications/summary', token);
}

/* ——— Abonnements / Mobile Money ——— */

export type OffreAbonnement = {
  code: string;
  canal: string;
  periode: string;
  montant_fcfa: number;
  libelle: string;
  description: string;
  embarcations_incluses: number;
};

export type Abonnement = {
  id: string;
  canal: string;
  code_offre: string;
  periode: string;
  montant_fcfa: number;
  statut: string;
  pecheur_id: string | null;
  organisation_id: string | null;
  embarcations_incluses: number;
  date_debut: string | null;
  date_fin: string | null;
  auto_renouvellement: boolean;
  notes: string | null;
  date_creation: string;
};

export type PaiementMM = {
  id: string;
  abonnement_id: string;
  montant_fcfa: number;
  operateur: string;
  msisdn: string | null;
  statut: string;
  reference_interne: string;
  reference_operateur: string | null;
  date_creation: string;
  date_confirmation: string | null;
  instructions: string | null;
};

export type InitierAbonnementResponse = {
  abonnement: Abonnement;
  paiement: PaiementMM;
};

export type CouvertureAbonnement = {
  pecheur_id: string;
  numero_licence: string;
  couvert: boolean;
  motif: string;
  abonnement: Abonnement | null;
  enforce: boolean;
  source_couverture: string | null;
};

export function listOffresAbonnement() {
  return request<OffreAbonnement[]>('/api/v1/abonnements/offres');
}

export function listAbonnements(
  token: string,
  params?: { canal?: string; statut?: string; pecheur_id?: string; organisation_id?: string },
) {
  const q = new URLSearchParams();
  if (params?.canal) q.set('canal', params.canal);
  if (params?.statut) q.set('statut', params.statut);
  if (params?.pecheur_id) q.set('pecheur_id', params.pecheur_id);
  if (params?.organisation_id) q.set('organisation_id', params.organisation_id);
  const qs = q.toString();
  return request<Abonnement[]>(`/api/v1/abonnements${qs ? `?${qs}` : ''}`, token);
}

export function getCouvertureAbonnement(token: string, pecheurId: string) {
  return request<CouvertureAbonnement>(`/api/v1/abonnements/couverture/${pecheurId}`, token);
}

export function initierAbonnementB2C(
  token: string,
  body: {
    code_offre: string;
    pecheur_id?: string;
    numero_licence?: string;
    operateur?: string;
    msisdn?: string;
    numero_tiers_autorise?: boolean;
  },
) {
  return request<InitierAbonnementResponse>('/api/v1/abonnements/initier-b2c', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function initierAbonnementB2B(
  token: string,
  body: {
    code_offre: string;
    organisation_id: string;
    embarcations?: number;
    operateur?: string;
    msisdn?: string;
    activer_demo?: boolean;
    numero_tiers_autorise?: boolean;
  },
) {
  return request<InitierAbonnementResponse>('/api/v1/abonnements/initier-b2b', token, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function confirmerPaiementDemo(token: string, paiementId: string) {
  return request<InitierAbonnementResponse>(
    `/api/v1/abonnements/paiements/${paiementId}/confirmer-demo`,
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export type PaiementConfig = {
  mode: string;
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
    token,
    { method: 'POST', body: JSON.stringify({}) },
  );
}

export function activerAbonnementManuel(token: string, abonnementId: string, notes?: string) {
  const q = notes ? `?notes=${encodeURIComponent(notes)}` : '';
  return request<Abonnement>(`/api/v1/abonnements/${abonnementId}/activer-manuel${q}`, token, {
    method: 'POST',
  });
}

export function annulerAbonnement(token: string, abonnementId: string, notes?: string) {
  const q = notes ? `?notes=${encodeURIComponent(notes)}` : '';
  return request<Abonnement>(`/api/v1/abonnements/${abonnementId}/annuler${q}`, token, {
    method: 'POST',
  });
}

export type OrgModulesRead = {
  organisation_id: string;
  modules: Record<string, boolean>;
  catalog: Array<{ key: string; label: string }>;
  inscription_validee: boolean;
  abonnement: Abonnement | null;
  couvert: boolean;
  motif: string;
};

export type OrgPortalRead = {
  organisation_id: string;
  organisation_nom: string;
  inscription_validee: boolean;
  couvert: boolean;
  motif: string;
  abonnement: Abonnement | null;
  modules: Record<string, boolean>;
  pecheurs_count: number;
  embarcations_count: number;
};

export function getOrgModules(token: string, organisationId: string) {
  return request<OrgModulesRead>(
    `/api/v1/abonnements/organisations/${organisationId}/modules`,
    token,
  );
}

export function patchOrgModules(
  token: string,
  organisationId: string,
  modules: Record<string, boolean>,
) {
  return request<OrgModulesRead>(
    `/api/v1/abonnements/organisations/${organisationId}/modules`,
    token,
    { method: 'PATCH', body: JSON.stringify({ modules }) },
  );
}

export function getOrgPortalMe(token: string) {
  return request<OrgPortalRead>('/api/v1/abonnements/portail/me', token);
}

/**
 * SSE notifications — retourne une fonction stop.
 * Utilise fetch (Authorization) plutôt qu’EventSource.
 */
export function openNotificationStream(
  token: string,
  onSummary: (s: NotificationSummary) => void,
  onStatus?: (ok: boolean) => void,
  signal?: AbortSignal,
): () => void {
  const ac = new AbortController();
  const onAbort = () => ac.abort();
  signal?.addEventListener('abort', onAbort);

  let stopped = false;

  async function run() {
    try {
      const res = await fetch(`${API}/api/v1/notifications/stream`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        onStatus?.(false);
        return;
      }
      onStatus?.(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        for (const chunk of chunks) {
          const dataLine = chunk
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          try {
            const summary = JSON.parse(dataLine.slice(6)) as NotificationSummary;
            onSummary(summary);
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch {
      if (!stopped) onStatus?.(false);
    }
  }

  void run();

  return () => {
    stopped = true;
    ac.abort();
    signal?.removeEventListener('abort', onAbort);
  };
}


/* ——— Libellés métier des alertes (aucun code brut à l'écran) ——— */

export const ALERT_TYPE_LABELS: Record<string, string> = {
  zone_interdite: 'Intrusion en zone interdite',
  depassement_quota: 'Dépassement de quota',
  anomalie: 'Activité inhabituelle',
};

export const ALERT_RULE_LABELS: Record<string, string> = {
  intrusion_zone_interdite: 'Position relevée dans une zone interdite',
  depassement_quota: 'Volume déclaré supérieur au quota autorisé',
  activite_inhabituelle: 'Activité inhabituelle détectée',
  silence_gps: 'Absence de signal GPS prolongée',
  meteo_marine: 'Conditions de mer dangereuses pour les pirogues',
  crue_fleuve: 'Crue annoncée sur le fleuve',
};

export const GRAVITE_LABELS: Record<string, string> = {
  info: 'Information',
  attention: 'Attention',
  critique: 'Critique',
};

export function alertTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return ALERT_TYPE_LABELS[type] ?? type.replaceAll('_', ' ');
}

export function alertRuleLabel(code: unknown): string {
  if (code === null || code === undefined) return '—';
  const text = String(code);
  return ALERT_RULE_LABELS[text] ?? text.replaceAll('_', ' ');
}

export function graviteLabel(g: string | null | undefined): string {
  if (!g) return '—';
  return GRAVITE_LABELS[g] ?? g;
}


/* ——— Météo-marine : bulletin, zones calculées, avis ——— */

export type ConditionsMer = {
  horodatage: string;
  houle_m: number | null;
  houle_max_24h_m: number | null;
  houle_direction_deg: number | null;
  periode_s: number | null;
  courant_noeuds: number | null;
  courant_direction_deg: number | null;
  vent_noeuds: number | null;
  rafales_noeuds: number | null;
  rafales_max_24h_noeuds: number | null;
  vent_direction_deg: number | null;
  pluie_mm_h: number | null;
  visibilite_km: number | null;
  temperature_mer_c: number | null;
  niveau_mer_m: number | null;
  maree: string | null;
  prochaine_pleine_mer: string | null;
  prochaine_basse_mer: string | null;
  etat_mer: string;
};

export type SecteurBulletin = {
  id: string;
  nom: string;
  type: string;
  lon: number;
  lat: number;
  rayon_km: number;
  conditions: ConditionsMer;
  risque: { niveau_pirogue: 'vert' | 'orange' | 'rouge' | string; niveau_navire: string; motifs: string[] };
  opportunite: {
    score: number;
    classe: 'favorable' | 'prudence' | 'surexploitee' | 'danger' | 'neutre' | string;
    motifs: string[];
    captures_30j_kg: number;
    sorties_30j: number;
    quota_max_taux: number | null;
    especes_sous_pression: string[];
  };
  conseil: string;
};

export type FleuveBulletin = {
  id: string;
  nom: string;
  fleuve: string;
  lon: number;
  lat: number;
  debit_m3s: number | null;
  debit_j3_m3s: number | null;
  debit_max_7j_m3s: number | null;
  tendance: string;
  variation_pct: number | null;
  niveau: 'bas' | 'normal' | 'haut' | 'crue' | string;
  conseil: string;
};

export type BulletinMeteoMarine = {
  genere_a: string;
  valide_jusqua: string;
  source: string;
  disponible: boolean;
  note: string;
  synthese: string;
  secteurs: SecteurBulletin[];
  fleuves: FleuveBulletin[];
  alertes_emises: number;
};

export type ZoneCalculee = {
  id: string;
  nom: string;
  classe: string;
  niveau_pirogue: string;
  score: number;
  motifs: string[];
  centre: [number, number];
  rayon_km: number;
  polygone: [number, number][];
};

export type ZonesCalculeesResponse = {
  genere_a: string;
  zones: ZoneCalculee[];
  legende: Record<string, string>;
};

export function getBulletinMeteo(token: string, refresh = false) {
  return request<BulletinMeteoMarine>(`/api/v1/meteo/bulletin${refresh ? '?refresh=true' : ''}`, token);
}

export function getZonesCalculees(token: string) {
  return request<ZonesCalculeesResponse>('/api/v1/meteo/zones', token);
}

export const ZONE_CLASSE_COLORS: Record<string, string> = {
  danger: '#c81e1e',
  prudence: '#ea580c',
  favorable: '#15803d',
  surexploitee: '#7c3aed',
  neutre: '#64748b',
};


/* ——— Fiche embarcation PIGAP (clic sur la carte) ——— */

export type FicheEmbarcation = {
  embarcation_id: string;
  nom: string;
  immatriculation: string;
  type: string | null;
  longueur_m: number | null;
  pecheur_id: string;
  pecheur_nom: string;
  numero_licence: string;
  statut_pecheur: string;
  date_delivrance_licence: string | null;
  organisation: string | null;
  couverture_ok: boolean;
  couverture_motif: string;
  couverture_source: string | null;
  derniere_position: { type: 'Point'; coordinates: [number, number] } | null;
  derniere_horodatage: string | null;
  age_s: number | null;
  statut_signal: string;
  secteur: string | null;
  statut_presence: string;
  port_nom: string | null;
  depuis: string | null;
  dernier_port_nom: string | null;
  dernier_depart: string | null;
  trajectoire: { horodatage: string; position: { type: 'Point'; coordinates: [number, number] }; source: string }[];
  zones_reglementees: { id: string; nom: string; type: string }[];
  alertes: { id: string; type: string; niveau_gravite: string; statut: string; horodatage: string; regle: string }[];
  captures_30j_kg: number;
  captures_30j: number;
  regularite: string;
  motifs: string[];
};

export function getFicheEmbarcation(token: string, embarcationId: string) {
  return request<FicheEmbarcation>(`/api/v1/positions/embarcations/${embarcationId}/fiche`, token);
}


/* ——— Payeur attendu d'un dépôt Mobile Money ——— */

export type Payeur = {
  acteur: 'pecheur' | 'organisation' | string;
  acteur_id: string;
  nom: string;
  telephone: string | null;
  msisdn: string | null;
  valide: boolean;
  motif: string;
};

export function getPayeur(
  token: string,
  q: { pecheur_id?: string; numero_licence?: string; organisation_id?: string },
) {
  const params = new URLSearchParams();
  if (q.pecheur_id) params.set('pecheur_id', q.pecheur_id);
  if (q.numero_licence) params.set('numero_licence', q.numero_licence);
  if (q.organisation_id) params.set('organisation_id', q.organisation_id);
  return request<Payeur>(`/api/v1/abonnements/payeur?${params}`, token);
}
