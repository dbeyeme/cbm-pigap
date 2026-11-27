import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  AisLiveResponse,
  AisVessel,
  aisStatutLabel,
  fetchMe,
  getGfwEtat,
  getGfwEvenements,
  listAisLive,
  listAlertes,
  getBulletinMeteo,
  getPortPresence,
  getZonesCalculees,
  type BulletinMeteoMarine,
  type GfwEtat,
  type GfwEvenements,
  type ZoneCalculee,
  ZONE_CLASSE_COLORS,
  type AisTrackPoint,
  listLiveVessels,
  type PortPresenceResponse,
  listTrajectories,
  listZones,
  LiveVessel,
  login,
  TrajectorySegment,
  ZoneReglementee,
} from './api';
import AppSidebar from './components/AppSidebar';
import AisPanel from './components/AisPanel';
import PortPresencePanel from './components/PortPresencePanel';
import VesselDetailDrawer from './components/VesselDetailDrawer';
import PirogueDetailDrawer from './components/PirogueDetailDrawer';
import GfwFiche from './components/GfwFiche';
import GfwPanel from './components/GfwPanel';
import SeaStatePanel from './components/SeaStatePanel';
import HelpTip from './components/HelpTip';
import AppTopbar from './components/AppTopbar';
import GlobalSearch from './components/GlobalSearch';
import {
  IconAnchor,
  IconLayers,
  IconLogin,
  IconShield,
  IconShip,
  IconWaves,
} from './components/Icons';
import MapLegend from './components/MapLegend';
import MapToolbar, { MapPanel } from './components/MapToolbar';
import { useToast } from './components/ToastProvider';
import { syncGabonBoundariesOnMap } from './geo/gabonBoundary';
import { GABON_COAST_BOUNDS } from './geo/gabonMaritimeRoutes';
import {
  FlowAnimHandle,
  VesselKind,
  clearMarkers,
  coordsFromDeclencheur,
  placeAisMarkers,
  placeAlertMarkers,
  placeShipMarkers,
  silhouetteForType,
  startLineFlowAnimation,
} from './geo/mapEffects';
import { COUCHE_GFW, COUCHE_GFW_HALO, syncGfwOnMap } from './geo/gfwLayer';
import {
  GABON_MAP_VIEW,
  GABON_SATELLITE_STYLE,
  GULF_OF_GUINEA_BOUNDS,
  MAP_FONT_REGULAR,
} from './geo/mapStyle';
import { removeZonesFromMap, syncZonesOnMap } from './geo/zoneMap';
import { useMapStage } from './hooks/useMapStage';
import { useNotifications } from './hooks/useNotifications';
import { friendlyApiError } from './lib/apiErrors';
import {
  classePastilleRegularite,
  estAControler,
  libelleRegularite,
} from './lib/regularite';
import { canAccessPage, type NavId, type Page } from './nav';
import ActeursHub from './pages/ActeursHub';
import AlertesPage from './pages/AlertesPage';
import ControlesPage from './pages/ControlesPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import OrgPortalPage from './pages/OrgPortalPage';
import ProfilPublicPage from './pages/ProfilPublicPage';
import PechesHub from './pages/PechesHub';
import RapportsPage from './pages/RapportsPage';
import UsersPage from './pages/UsersPage';
import VerifPage from './pages/VerifPage';
import ZonesPage from './pages/ZonesPage';

const PALETTE = [
  '#1B6CA8',
  '#0D9488',
  '#C2410C',
  '#0369A1',
  '#7C3AED',
  '#059669',
  '#B45309',
  '#0284C7',
];

const LIVE_POLL_MS = 20_000;
const AIS_POLL_MS = 60_000;

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PALETTE.length;
  return PALETTE[h];
}

function isMapPage(page: Page): boolean {
  return page === 'navires' || page === 'map' || page === 'surveillance';
}

function peutLireGfw(role: string | null): boolean {
  return role === 'admin' || role === 'autorite' || role === 'agent_controle';
}

/**
 * Session conservée le temps de l'onglet : un rechargement de la page ne déconnecte plus.
 * `sessionStorage` et non `localStorage` : le jeton disparaît à la fermeture de l'onglet
 * (standards, section 9, à défaut de jeton de renouvellement côté serveur).
 */
const CLE_JETON = 'pigap.jeton';
const CLE_PAGE = 'pigap.page';

function lireSession(cle: string): string | null {
  try {
    return window.sessionStorage.getItem(cle);
  } catch {
    return null;
  }
}

function ecrireSession(cle: string, valeur: string | null): void {
  try {
    if (valeur == null) window.sessionStorage.removeItem(cle);
    else window.sessionStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible (navigation privée) : la session reste en mémoire */
  }
}

/** Panneaux de la carte ; un seul ouvert à la fois, aucun par défaut (carte dégagée). */
type MapPanelId = 'couches' | 'navires' | 'mer' | 'ports';

function vesselKind(type: string | null | undefined): VesselKind {
  const t = (type ?? '').toLowerCase();
  if (
    t.includes('chaloupe') ||
    t.includes('chalut') ||
    t.includes('navire') ||
    t.includes('bateau')
  ) {
    return 'navire';
  }
  return 'pirogue';
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec / 3600)} h`;
}

function secteurLabel(s: string): string {
  if (s === 'cote') return 'côte';
  if (s === 'bras_mer') return 'bras de mer';
  if (s === 'fleuve') return 'fleuve';
  return s;
}

function pointFlotte(v: LiveVessel) {
  return {
    lng: v.position.coordinates[0],
    lat: v.position.coordinates[1],
    id: v.embarcation_id,
    kind: vesselKind(v.type),
    statut: v.statut,
    label: v.nom,
    alert: v.statut === 'silence',
    regularite: v.regularite ?? undefined,
    regulariteLibelle: v.regularite_libelle,
    ageLibelle: v.age_libelle,
    perimee: v.perimee,
  };
}

function pointAis(v: AisVessel, extra?: { approche?: boolean; label?: string }) {
  return {
    lng: v.position.coordinates[0],
    lat: v.position.coordinates[1],
    demo: v.demo,
    mmsi: v.mmsi,
    name: v.nom,
    kind: silhouetteForType(v.type_label, v.ship_type),
    statut: v.statut_nav,
    headingDeg: v.heading_deg ?? v.cog_deg ?? null,
    speedKn: v.sog_kn ?? null,
    lengthM: v.longueur_m ?? null,
    flagCode: v.pavillon_code ?? null,
    regularite: v.regularite ?? undefined,
    regulariteLibelle: v.regularite_libelle,
    ageLibelle: v.age_libelle,
    approche: extra?.approche,
    label:
      extra?.label ??
      (v.demo
        ? 'démonstration'
        : `${aisStatutLabel(v.statut_nav)}${v.port_proche ? ` · ${v.port_proche}` : ''}${
            v.age_libelle ? ` · ${v.age_libelle}` : ''
          }`),
  };
}

export default function App() {
  const toast = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const flowAnim = useRef<FlowAnimHandle | null>(null);
  const shipMarkers = useRef<maplibregl.Marker[]>([]);
  const aisMarkers = useRef<maplibregl.Marker[]>([]);
  const alertMarkers = useRef<maplibregl.Marker[]>([]);
  /** Dernier contexte pour lequel la carte a été recadrée (page, mode, sélection). */
  const lastFit = useRef('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meNom, setMeNom] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { summary: notifSummary, connected: notifConnected } = useNotifications(
    meRole === 'organisation' ? null : token,
  );
  const [segments, setSegments] = useState<TrajectorySegment[]>([]);
  const [liveVessels, setLiveVessels] = useState<LiveVessel[]>([]);
  const [aisVessels, setAisVessels] = useState<AisVessel[]>([]);
  const [aisNote, setAisNote] = useState('');
  const [aisLive, setAisLive] = useState<AisLiveResponse | null>(null);
  const [portPresence, setPortPresence] = useState<PortPresenceResponse | null>(null);
  const [selectedMmsi, setSelectedMmsi] = useState<string | null>(null);
  const [selectedEmbarcation, setSelectedEmbarcation] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<AisTrackPoint[]>([]);
  const [mapExtent, setMapExtent] = useState<'gabon' | 'golfe'>('gabon');
  const [mapPanel, setMapPanel] = useState<MapPanelId | null>(null);
  const mapStage = useMapStage<HTMLElement>();
  const [bulletin, setBulletin] = useState<BulletinMeteoMarine | null>(null);
  const [bulletinLoading, setBulletinLoading] = useState(false);
  const [zonesCalc, setZonesCalc] = useState<ZoneCalculee[]>([]);
  const [meteoOverlay, setMeteoOverlay] = useState(true);
  const [presenceLoading, setPresenceLoading] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [aisOverlay, setAisOverlay] = useState(true);
  const [filtreAControler, setFiltreAControler] = useState(false);
  const [gfwEtat, setGfwEtat] = useState<GfwEtat | null>(null);
  const [gfwEvenements, setGfwEvenements] = useState<GfwEvenements | null>(null);
  const [gfwOverlay, setGfwOverlay] = useState(true);
  const [gfwErreur, setGfwErreur] = useState<string | null>(null);
  const [gfwChargement, setGfwChargement] = useState(false);
  const [selectedGfwId, setSelectedGfwId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boatFilter, setBoatFilter] = useState('');
  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [showZonesOverlay, setShowZonesOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  /** Recherche globale : terme à poser dans le registre, zone à ouvrir dans la cartographie. */
  const [rechercheRegistre, setRechercheRegistre] = useState('');
  const [zoneAOuvrir, setZoneAOuvrir] = useState<string | null>(null);
  const [acteursTab, setActeursTab] = useState<
    'demandes' | 'licences' | 'organisations' | 'abonnements'
  >('demandes');
  const [pechesTab, setPechesTab] = useState<'captures' | 'quotas' | 'redevances'>('captures');

  const boats = useMemo(() => {
    const map = new Map<string, { id: string; nom: string; immatriculation: string; trips: number }>();
    for (const s of segments) {
      const cur = map.get(s.embarcation_id);
      if (cur) cur.trips += 1;
      else
        map.set(s.embarcation_id, {
          id: s.embarcation_id,
          nom: s.embarcation_nom,
          immatriculation: s.immatriculation,
          trips: 1,
        });
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [segments]);

  const visible = useMemo(() => {
    let list = segments;
    if (boatFilter) list = list.filter((s) => s.embarcation_id === boatFilter);
    if (selectedId) list = list.filter((s) => s.id === selectedId);
    return list;
  }, [segments, boatFilter, selectedId]);

  const liveVisible = useMemo(() => {
    let list = liveVessels;
    if (boatFilter) list = list.filter((v) => v.embarcation_id === boatFilter);
    if (filtreAControler) list = list.filter((v) => estAControler(v.regularite));
    return list;
  }, [liveVessels, boatFilter, filtreAControler]);

  const aisVisibles = useMemo(() => {
    if (!filtreAControler) return aisVessels;
    return aisVessels.filter((v) => estAControler(v.regularite));
  }, [aisVessels, filtreAControler]);

  const approchesVisibles = useMemo(() => {
    const approches = aisLive?.approches ?? [];
    if (!filtreAControler) return approches;
    return approches.filter((v) => estAControler(v.regularite));
  }, [aisLive, filtreAControler]);

  const nbAControler = useMemo(
    () =>
      liveVessels.filter((v) => estAControler(v.regularite)).length +
      aisVessels.filter((v) => estAControler(v.regularite)).length +
      (aisLive?.approches ?? []).filter((v) => estAControler(v.regularite)).length,
    [liveVessels, aisVessels, aisLive],
  );

  const onMap = isMapPage(page);
  /** Pages où la carte occupe toute la surface : pas de marge sous le contenu. */
  const fullBleed = onMap || page === 'cartographie' || page === 'zones';

  /** Sur petit écran, la fiche ouverte prend la place du panneau. */
  function sceneEtroite(): boolean {
    return (mapStage.stageRef.current?.clientWidth ?? window.innerWidth) <= 760;
  }

  function closePanelOnSmallScreen() {
    if (sceneEtroite()) setMapPanel(null);
  }

  /** Fiche et panneau partagent le bas de scène en mode étroit : un seul à la fois. */
  useEffect(() => {
    if (!onMap) return;
    const fiche = Boolean(selectedMmsi || selectedEmbarcation || selectedGfwId);
    if (fiche && sceneEtroite()) setMapPanel(null);
  }, [onMap, selectedMmsi, selectedEmbarcation, selectedGfwId]);

  // La fiche et le panneau recouvrent une partie de la carte : le centre utile se décale
  // d'autant, pour qu'un navire sélectionné ne se retrouve jamais dessous.
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap) return;
    const fiche = Boolean(selectedMmsi || selectedEmbarcation || selectedGfwId);
    const etroit = sceneEtroite();
    const padding = etroit
      ? {
          top: 0,
          left: 0,
          right: 0,
          bottom: fiche || mapPanel ? Math.round(map.getContainer().clientHeight * 0.5) : 0,
        }
      : { top: 0, bottom: 0, left: mapPanel ? 384 : 0, right: fiche ? 404 : 0 };
    map.easeTo({ padding, duration: 280 });
  }, [onMap, mapPanel, selectedMmsi, selectedEmbarcation, selectedGfwId]);

  useEffect(() => {
    if (!token || !meRole) return;
    if (meRole === 'organisation') return;
    if (!canAccessPage(meRole, page)) {
      setPage('dashboard');
    }
  }, [token, meRole, page]);

  useEffect(() => {
    if (!onMap || !mapRef.current) return;
    if (mapObj.current) {
      mapObj.current.resize();
      return;
    }
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: GABON_SATELLITE_STYLE,
      center: GABON_MAP_VIEW.center,
      zoom: GABON_MAP_VIEW.zoom,
      maxBounds: GABON_MAP_VIEW.maxBounds,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapObj.current = map;
    const POINT_CLICK_LAYERS = [
      COUCHE_GFW,
      COUCHE_GFW_HALO,
      'ais-zee-circles',
      'ais-approche-circles',
      'all-traj-points',
    ];
    const zoneClic = (point: { x: number; y: number }): [[number, number], [number, number]] => [
      [point.x - 14, point.y - 14],
      [point.x + 14, point.y + 14],
    ];
    map.on('click', (e) => {
      const layers = POINT_CLICK_LAYERS.filter((l) => map.getLayer(l));
      if (!layers.length) return;
      const feats = map.queryRenderedFeatures(zoneClic(e.point), { layers });
      const gfw = feats.find((f) => f.layer.id === COUCHE_GFW || f.layer.id === COUCHE_GFW_HALO);
      const gfwId = gfw?.properties?.id;
      if (gfwId) {
        setSelectedMmsi(null);
        setSelectedEmbarcation(null);
        setSelectedGfwId(String(gfwId));
        return;
      }
      const ais = feats.find((f) => f.layer.id === 'ais-zee-circles' || f.layer.id === 'ais-approche-circles');
      const mmsi = ais?.properties?.mmsi;
      if (mmsi) {
        setSelectedGfwId(null);
        setSelectedEmbarcation(null);
        setSelectedMmsi(String(mmsi));
        closePanelOnSmallScreen();
        return;
      }
      const embarcationId = feats.find((f) => f.layer.id === 'all-traj-points')?.properties?.embarcation_id;
      if (embarcationId) {
        setSelectedGfwId(null);
        setSelectedMmsi(null);
        setSelectedEmbarcation(String(embarcationId));
        closePanelOnSmallScreen();
      }
    });
    map.on('mousemove', (e) => {
      const layers = POINT_CLICK_LAYERS.filter((l) => map.getLayer(l));
      if (!layers.length) return;
      const hit = map.queryRenderedFeatures(zoneClic(e.point), { layers }).length > 0;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
    map.once('load', () => {
      map.fitBounds(GABON_MAP_VIEW.fitBounds, { padding: 48, maxZoom: 7.6 });
      void syncGabonBoundariesOnMap(map);
    });
    // Le conteneur change de taille (sidebar repliée, panneau, mobile) : resynchroniser
    // le canevas, sinon les marqueurs HTML se décalent par rapport au fond de carte.
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapRef.current);
    return () => {
      ro.disconnect();
      flowAnim.current?.stop();
      flowAnim.current = null;
      clearMarkers(shipMarkers.current);
      clearMarkers(aisMarkers.current);
      clearMarkers(alertMarkers.current);
      map.remove();
      mapObj.current = null;
      lastFit.current = '';
    };
  }, [onMap]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap) return;

    const draw = () => {
      const sourceId = 'all-trajectories';
      const glowId = 'all-traj-glow';
      const lineId = 'all-traj-lines';
      const pointsId = 'all-traj-points';
      flowAnim.current?.stop();
      flowAnim.current = null;
      clearMarkers(shipMarkers.current);
      if (map.getLayer(glowId)) map.removeLayer(glowId);
      if (map.getLayer(lineId)) map.removeLayer(lineId);
      if (map.getLayer(pointsId)) map.removeLayer(pointsId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      const aisSrc = 'ais-zee-live';
      const aisLayer = 'ais-zee-circles';
      const appSrc = 'ais-approche';
      const appLayer = 'ais-approche-circles';
      const appRouteSrc = 'ais-approche-routes';
      const appRouteLayer = 'ais-approche-routes-line';
      for (const id of [aisLayer, appLayer, appRouteLayer]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      for (const id of [aisSrc, appSrc, appRouteSrc]) {
        if (map.getSource(id)) map.removeSource(id);
      }
      const approches = approchesVisibles;

      const paintAis = () => {
        if (!aisOverlay || (!aisVisibles.length && !approches.length)) {
          clearMarkers(aisMarkers.current);
          return;
        }
        if (approches.length) {
          map.addSource(appSrc, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: approches.map((v) => ({
                type: 'Feature',
                properties: { nom: v.nom, mmsi: v.mmsi, heures: v.entree_prevue_h ?? null },
                geometry: { type: 'Point', coordinates: v.position.coordinates },
              })),
            },
          });
          map.addSource(appRouteSrc, {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: approches
                .filter((v) => v.entree_prevue_position)
                .map((v) => ({
                  type: 'Feature',
                  properties: { mmsi: v.mmsi },
                  geometry: {
                    type: 'LineString',
                    coordinates: [
                      v.position.coordinates,
                      v.entree_prevue_position!.coordinates,
                    ],
                  },
                })),
            },
          });
          map.addLayer({
            id: appRouteLayer,
            type: 'line',
            source: appRouteSrc,
            paint: {
              'line-color': '#7cc4ff',
              'line-width': 1.6,
              'line-dasharray': [2, 2],
              'line-opacity': 0.85,
            },
          });
          map.addLayer({
            id: appLayer,
            type: 'circle',
            source: appSrc,
            paint: {
              'circle-radius': 8,
              'circle-color': 'rgba(124, 196, 255, 0.25)',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#7cc4ff',
            },
          });
        }
        if (!aisVisibles.length) {
          placeAisMarkers(
            map,
            approches.map((v) =>
              pointAis(v, {
                approche: true,
                label: `entrée prévue ${v.entree_prevue_h != null ? `dans ${Math.round(v.entree_prevue_h)} h` : ''}`,
              }),
            ),
            aisMarkers.current,
            {
              onSelect: (mmsi) => {
                setSelectedGfwId(null);
                setSelectedEmbarcation(null);
                setSelectedMmsi(mmsi);
                closePanelOnSmallScreen();
              },
            },
          );
          return;
        }
        map.addSource(aisSrc, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: aisVisibles.map((v) => ({
              type: 'Feature',
              properties: {
                nom: v.nom,
                mmsi: v.mmsi,
                demo: v.demo,
                statut: v.statut_nav ?? 'inconnu',
              },
              geometry: {
                type: 'Point',
                coordinates: v.position.coordinates,
              },
            })),
          },
        });
        map.addLayer({
          id: aisLayer,
          type: 'circle',
          source: aisSrc,
          paint: {
            'circle-radius': 9,
            'circle-color': [
              'case',
              ['get', 'demo'],
              '#94a3b8',
              ['==', ['get', 'statut'], 'a_quai'],
              '#0d4f82',
              ['==', ['get', 'statut'], 'au_mouillage'],
              '#1b6ca8',
              ['==', ['get', 'statut'], 'en_peche'],
              '#15803d',
              '#c2410c',
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        });
        placeAisMarkers(
          map,
          [
            ...aisVisibles.map((v) => pointAis(v)),
            ...approches.map((v) =>
              pointAis(v, {
                approche: true,
                label: `entrée prévue ${v.entree_prevue_h != null ? `dans ${Math.round(v.entree_prevue_h)} h` : ''}`,
              }),
            ),
          ],
          aisMarkers.current,
          {
            onSelect: (mmsi) => {
              setSelectedGfwId(null);
              setSelectedEmbarcation(null);
              setSelectedMmsi(mmsi);
              closePanelOnSmallScreen();
            },
          },
        );
      };

      // Recadrage seulement quand le contexte change : un rafraîchissement des positions
      // (toutes les vingt secondes) ne doit jamais défaire le zoom de l'utilisateur.
      const fitKey = `${page}|${liveMode ? 'direct' : 'trajets'}|${selectedId ?? ''}|${visible.length === 0 ? 'vide' : 'trajets'}`;
      const doitRecadrer = lastFit.current !== fitKey;
      lastFit.current = fitKey;

      if (visible.length === 0) {
        if (!(liveMode && liveVisible.length)) clearMarkers(shipMarkers.current);
        if (liveMode && liveVisible.length) {
          placeShipMarkers(
            map,
            liveVisible.map(pointFlotte),
            shipMarkers.current,
            {
              onSelect: (id) => {
                setSelectedGfwId(null);
                setSelectedMmsi(null);
                setSelectedEmbarcation(id);
                closePanelOnSmallScreen();
              },
            },
          );
        }
        if (aisOverlay) {
          paintAis();
        } else {
          clearMarkers(aisMarkers.current);
        }
        if (doitRecadrer) {
          map.fitBounds(
            [
              [GABON_COAST_BOUNDS.west, GABON_COAST_BOUNDS.south],
              [GABON_COAST_BOUNDS.east, GABON_COAST_BOUNDS.north],
            ],
            { padding: 32, maxZoom: 7 },
          );
        }
      } else {
        const features: Array<{
          type: 'Feature';
          properties: Record<string, unknown>;
          geometry:
            | { type: 'LineString'; coordinates: [number, number][] }
            | { type: 'Point'; coordinates: [number, number] };
        }> = [];
        const allCoords: [number, number][] = [];
        const ends: Array<{
          lng: number;
          lat: number;
          kind: VesselKind;
          label: string;
          id?: string;
        }> = [];
        const preferLive = liveMode && liveVisible.length > 0;

        for (const seg of visible) {
          const color = colorFor(seg.id);
          const coords = seg.points.map((p) => p.position.coordinates as [number, number]);
          allCoords.push(...coords);
          if (coords.length >= 2) {
            features.push({
              type: 'Feature',
              properties: { id: seg.id, color },
              geometry: { type: 'LineString', coordinates: coords },
            });
          }
          // Historique : un seul point d'extrémité (pas chaque GPS). Live = HTML markers.
          if (!preferLive && coords.length) {
            const end = coords[coords.length - 1];
            features.push({
              type: 'Feature',
              properties: { id: seg.id, embarcation_id: seg.embarcation_id, color, isEnd: true },
              geometry: { type: 'Point', coordinates: end },
            });
            ends.push({
              lng: end[0],
              lat: end[1],
              id: seg.embarcation_id,
              kind: vesselKind(seg.type),
              label: seg.embarcation_nom,
            });
          }
        }

        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
        map.addLayer({
          id: glowId,
          type: 'line',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': '#7dd3fc',
            'line-width': selectedId ? 16 : 12,
            'line-opacity': preferLive ? 0.12 : 0.28,
            'line-blur': 5,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': selectedId ? 4.5 : preferLive ? 2 : 3,
            'line-opacity': preferLive ? 0.45 : 0.95,
            'line-dasharray': [0, 3.5],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        // Cercles GPS : uniquement en mode historique (1 extrémité), jamais en live.
        if (!preferLive) {
          map.addLayer({
            id: pointsId,
            type: 'circle',
            source: sourceId,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
              'circle-radius': 6,
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.85,
            },
          });
        }

        placeShipMarkers(
          map,
          preferLive
            ? liveVisible.map(pointFlotte)
            : ends.slice(0, 24),
          shipMarkers.current,
          {
            onSelect: (id) => {
              setSelectedGfwId(null);
              setSelectedMmsi(null);
              setSelectedEmbarcation(id);
              closePanelOnSmallScreen();
            },
          },
        );

        if (aisOverlay) {
          paintAis();
        } else {
          clearMarkers(aisMarkers.current);
        }

        flowAnim.current = startLineFlowAnimation(map, lineId);

        if (doitRecadrer && !liveMode && allCoords.length) {
          const bounds = allCoords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
          );
          map.fitBounds(bounds, { padding: 56, maxZoom: selectedId ? 12 : 8 });
        }
      }

      removeZonesFromMap(map);
      if (showZonesOverlay || page === 'surveillance') {
        syncZonesOnMap(map, zones, { visible: true });
      }
      syncGfwOnMap(
        map,
        gfwOverlay && gfwEvenements ? gfwEvenements.evenements : null,
        selectedGfwId,
      );
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);

    return () => {
      flowAnim.current?.stop();
      flowAnim.current = null;
    };
  }, [
    visible,
    liveVisible,
    liveMode,
    aisOverlay,
    aisVisibles,
    approchesVisibles,
    aisLive,
    onMap,
    page,
    selectedId,
    zones,
    showZonesOverlay,
    gfwOverlay,
    gfwEvenements,
    selectedGfwId,
  ]);

  // Trace du navire AIS sélectionné
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap) return;
    const src = 'ais-selected-track';
    const line = 'ais-selected-track-line';
    const pts = 'ais-selected-track-points';
    const apply = () => {
      if (map.getLayer(line)) map.removeLayer(line);
      if (map.getLayer(pts)) map.removeLayer(pts);
      if (map.getSource(src)) map.removeSource(src);
      if ((!selectedMmsi && !selectedEmbarcation) || selectedTrack.length === 0) return;
      const coords = selectedTrack.map((t) => t.position.coordinates);
      map.addSource(src, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [
            { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } },
            ...coords.map((c) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'Point' as const, coordinates: c },
            })),
          ],
        },
      });
      map.addLayer({
        id: line,
        type: 'line',
        source: src,
        filter: ['==', ['geometry-type'], 'LineString'],
        paint: { 'line-color': '#fbbf24', 'line-width': 2.5, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: pts,
        type: 'circle',
        source: src,
        filter: ['==', ['geometry-type'], 'Point'],
        paint: {
          'circle-radius': 3,
          'circle-color': '#fbbf24',
          'circle-stroke-color': '#0b1f3a',
          'circle-stroke-width': 1,
        },
      });
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [selectedMmsi, selectedEmbarcation, selectedTrack, onMap]);

  // Zones calculées (météo-marine × captures × quotas × zones) : polygones colorés
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap) return;
    const src = 'meteo-zones';
    const fill = 'meteo-zones-fill';
    const line = 'meteo-zones-line';
    const label = 'meteo-zones-label';
    const apply = () => {
      for (const id of [label, line, fill]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(src)) map.removeSource(src);
      if (!meteoOverlay || zonesCalc.length === 0) return;
      map.addSource(src, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: zonesCalc.map((z) => ({
            type: 'Feature',
            properties: {
              nom: z.nom,
              classe: z.classe,
              color: ZONE_CLASSE_COLORS[z.classe] ?? ZONE_CLASSE_COLORS.neutre,
              etiquette: `${z.nom.split(' (')[0].split(' et ')[0]} · ${
                { danger: 'danger', prudence: 'prudence', favorable: 'favorable', surexploitee: 'surexploitée', neutre: '' }[z.classe] ?? ''
              }`,
            },
            geometry: { type: 'Polygon', coordinates: [z.polygone] },
          })),
        },
      });
      const before = map.getLayer('ais-zee-circles') ? 'ais-zee-circles' : undefined;
      map.addLayer(
        {
          id: fill,
          type: 'fill',
          source: src,
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': ['case', ['==', ['get', 'classe'], 'neutre'], 0.04, 0.14],
          },
        },
        before,
      );
      map.addLayer(
        {
          id: line,
          type: 'line',
          source: src,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['case', ['==', ['get', 'classe'], 'neutre'], 0.8, 1.8],
            'line-dasharray': [3, 2],
            'line-opacity': 0.9,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: label,
          type: 'symbol',
          source: src,
          layout: {
            'text-field': ['get', 'etiquette'],
            'text-size': 11,
            'text-font': MAP_FONT_REGULAR,
            'text-anchor': 'center',
            'text-allow-overlap': false,
          },
          paint: {
            'text-color': ['get', 'color'],
            'text-halo-color': 'rgba(255,255,255,0.9)',
            'text-halo-width': 1.4,
          },
        },
        before,
      );
    };
    if (map.isStyleLoaded()) apply();
    else map.once('load', apply);
  }, [zonesCalc, meteoOverlay, onMap]);

  // Emprise : Gabon ou golfe de Guinée
  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap) return;
    if (mapExtent === 'golfe') {
      map.fitBounds(GULF_OF_GUINEA_BOUNDS, { padding: 24, maxZoom: 6 });
    }
  }, [mapExtent, onMap]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !onMap || !token) return;
    let cancelled = false;

    const run = async () => {
      try {
        await syncGabonBoundariesOnMap(map);
        const rows = await listAlertes(token, { statut: 'nouvelle' });
        if (cancelled) return;
        const points = rows
          .map((a) => {
            const c = coordsFromDeclencheur(a.declencheur);
            if (!c) return null;
            return {
              lng: c[0],
              lat: c[1],
              id: a.id,
              label: `${a.type.replaceAll('_', ' ')} · ${a.niveau_gravite}`,
            };
          })
          .filter((p): p is { lng: number; lat: number; id: string; label: string } => p != null);
        placeAlertMarkers(map, points, alertMarkers.current, {
          onSelect: () => {
            if (canAccessPage(meRole, 'alertes')) setPage('alertes');
          },
        });
        if (page === 'surveillance' && points.length) {
          const bounds = new maplibregl.LngLatBounds();
          for (const p of points) bounds.extend([p.lng, p.lat]);
          map.fitBounds(bounds, { padding: 64, maxZoom: 9 });
        }
      } catch {
        /* alertes carte optionnelles */
      }
    };

    if (map.isStyleLoaded()) void run();
    else map.once('load', () => void run());

    return () => {
      cancelled = true;
    };
  }, [onMap, page, token, meRole]);

  async function loadTrajectories(accessToken: string) {
    const trajs = await listTrajectories(accessToken);
    setSegments(trajs);
    setSelectedId(null);
    setBoatFilter('');
    if (!liveMode) {
      setStatus(
        trajs.length
          ? `${trajs.length} trajectoire(s) · ${new Set(trajs.map((t) => t.embarcation_id)).size} embarcation(s)`
          : 'Aucune trajectoire enregistrée sur la période.',
      );
    }
  }

  async function loadLive(accessToken: string) {
    const fleet = await listLiveVessels(accessToken, 1440);
    setLiveVessels(fleet);
    const actifs = fleet.filter((v) => v.statut === 'actif').length;
    const cotes = fleet.filter((v) => v.secteur === 'cote' || v.secteur === 'bras_mer').length;
    const fleuves = fleet.filter((v) => v.secteur === 'fleuve').length;
    setStatus(
      fleet.length
        ? `Temps réel · ${fleet.length} embarcation${fleet.length > 1 ? 's' : ''} suivie${fleet.length > 1 ? 's' : ''} (${actifs} en activité) · ${cotes} littoral et estuaires · ${fleuves} fleuves · mise à jour ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
        : 'Temps réel · aucune position GPS reçue au cours des dernières 24 heures.',
    );
  }

  async function loadMeteo(accessToken: string, refresh = false) {
    setBulletinLoading(true);
    try {
      const [b, z] = await Promise.all([
        getBulletinMeteo(accessToken, refresh),
        getZonesCalculees(accessToken),
      ]);
      setBulletin(b);
      setZonesCalc(z.zones);
    } catch {
      /* panneau optionnel */
    } finally {
      setBulletinLoading(false);
    }
  }

  async function loadPresence(accessToken: string) {
    setPresenceLoading(true);
    try {
      setPortPresence(await getPortPresence(accessToken, 24));
    } catch {
      /* panneau optionnel : conserve la dernière valeur */
    } finally {
      setPresenceLoading(false);
    }
  }

  async function loadAis(accessToken: string, refresh = false) {
    try {
      const res = await listAisLive(accessToken, refresh);
      setAisVessels(res.enabled ? res.vessels : []);
      setAisLive(res);
      setAisNote(res.note || (res.enabled ? '' : 'AIS désactivé'));
    } catch {
      setAisVessels([]);
      setAisNote('AIS indisponible');
    }
  }

  async function loadGfw(accessToken: string) {
    if (!peutLireGfw(meRole)) return;
    setGfwChargement(true);
    setGfwErreur(null);
    try {
      const etat = await getGfwEtat(accessToken);
      setGfwEtat(etat);
      if (!etat.active) {
        setGfwEvenements(null);
        return;
      }
      setGfwEvenements(await getGfwEvenements(accessToken));
    } catch (err) {
      setGfwEvenements(null);
      setGfwErreur(err instanceof Error ? err.message : 'Source indisponible');
    } finally {
      setGfwChargement(false);
    }
  }

  async function ensureZones(accessToken: string) {
    if (zones.length) return;
    try {
      const list = await listZones(accessToken);
      setZones(list);
    } catch {
      /* overlay optionnel */
    }
  }

  /** Charge les données de la carte ; `jeton` est passé explicitement pour servir aussi à la restauration. */
  async function chargerCarte(jeton: string, as: 'navires' | 'surveillance') {
    setPage(as);
    setError(null);
    if (as === 'surveillance') setShowZonesOverlay(true);
    setLoading(true);
    try {
      await loadTrajectories(jeton);
      await loadLive(jeton);
      await loadAis(jeton, true);
      await loadGfw(jeton);
      await ensureZones(jeton);
      void loadPresence(jeton);
      void loadMeteo(jeton);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }

  async function goMap(as: 'navires' | 'surveillance' = 'navires') {
    if (!token) return;
    await chargerCarte(token, as);
  }

  // Restauration de la session après un rechargement de la page.
  useEffect(() => {
    const jeton = lireSession(CLE_JETON);
    if (!jeton) return;
    let annule = false;
    fetchMe(jeton)
      .then((me) => {
        if (annule || me.role === 'pecheur') return;
        setToken(jeton);
        setMeId(me.id);
        setMeNom(me.nom);
        setMeRole(me.role);
        if (me.role === 'organisation') {
          setPage('org');
          return;
        }
        const memo = lireSession(CLE_PAGE) as Page | null;
        if (memo === 'navires' || memo === 'surveillance') {
          void chargerCarte(jeton, memo);
        } else {
          if (memo && canAccessPage(me.role, memo)) setPage(memo);
          void loadTrajectories(jeton);
        }
      })
      .catch(() => {
        // Jeton expiré ou refusé : retour à la connexion, sans message d'erreur.
        if (!annule) ecrireSession(CLE_JETON, null);
      });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // La page courante est mémorisée pour être retrouvée après un rechargement.
  useEffect(() => {
    if (token) ecrireSession(CLE_PAGE, page);
  }, [token, page]);

  useEffect(() => {
    if (!token || !onMap || !liveMode) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fleet = await listLiveVessels(token, 1440);
        if (cancelled) return;
        setLiveVessels(fleet);
        void loadPresence(token);
        const actifs = fleet.filter((v) => v.statut === 'actif').length;
        const cotes = fleet.filter(
          (v) => v.secteur === 'cote' || v.secteur === 'bras_mer',
        ).length;
        const fleuves = fleet.filter((v) => v.secteur === 'fleuve').length;
        setStatus(
          fleet.length
            ? `Temps réel · ${fleet.length} embarcation${fleet.length > 1 ? 's' : ''} suivie${fleet.length > 1 ? 's' : ''} (${actifs} en activité) · ${cotes} littoral et estuaires · ${fleuves} fleuves · mise à jour ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
            : 'Temps réel · aucune position GPS reçue au cours des dernières 24 heures.',
        );
      } catch {
        /* polling soft-fail */
      }
    };
    const id = window.setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, onMap, liveMode]);

  useEffect(() => {
    if (!token || !onMap || !aisOverlay) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await listAisLive(token, false);
        if (cancelled) return;
        setAisVessels(res.enabled ? res.vessels : []);
      setAisLive(res);
        setAisNote(res.note || '');
      } catch {
        /* soft */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), AIS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token, onMap, aisOverlay]);

  useEffect(() => {
    if (!token || !onMap || !peutLireGfw(meRole)) return;
    void loadGfw(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, onMap, meRole]);

  function navigate(id: NavId) {
    setError(null);
    setNotifOpen(false);
    const targetPage: Page =
      id === 'navires' || id === 'surveillance'
        ? id
        : id === 'acteurs'
          ? 'acteurs'
          : id === 'peches'
            ? 'peches'
            : id === 'cartographie'
              ? 'cartographie'
              : id === 'admin'
                ? 'admin'
                : id;
    if (!canAccessPage(meRole, targetPage)) {
      setError('Cette section n’est pas disponible pour votre rôle.');
      return;
    }
    switch (id) {
      case 'dashboard':
        setPage('dashboard');
        break;
      case 'acteurs':
        setActeursTab('demandes');
        setPage('acteurs');
        break;
      case 'navires':
        void goMap('navires');
        break;
      case 'peches':
        setPechesTab('captures');
        setPage('peches');
        break;
      case 'surveillance':
        void goMap('surveillance');
        break;
      case 'alertes':
        setPage('alertes');
        break;
      case 'controles':
        setPage('controles');
        break;
      case 'rapports':
        setPage('rapports');
        break;
      case 'cartographie':
        setPage('cartographie');
        break;
      case 'admin':
        setPage('admin');
        break;
      default:
        break;
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await login(email, password);
      const me = await fetchMe(res.access_token);
      if (me.role === 'pecheur') {
        throw new Error(
          'Compte pêcheur : utilisez l’application mobile CBM-PIGAP, pas le portail web.',
        );
      }
      setToken(res.access_token);
      ecrireSession(CLE_JETON, res.access_token);
      setMeId(me.id);
      setMeNom(me.nom);
      setMeRole(me.role);
      if (me.role === 'organisation') {
        setPage('org');
      } else {
        setPage('dashboard');
        await loadTrajectories(res.access_token);
      }
      toast.success('Connexion réussie', 'Bienvenue sur le portail.');
    } catch (err) {
      setToken(null);
      setMeId(null);
      setMeNom(null);
      setMeRole(null);
      const msg = friendlyApiError(err);
      setError(msg);
      toast.error('Connexion impossible', msg);
    } finally {
      setLoading(false);
    }
  }

  async function toggleZonesOverlay() {
    if (!token) return;
    const next = !showZonesOverlay;
    setShowZonesOverlay(next);
    if (next && !zones.length) {
      try {
        const list = await listZones(token);
        setZones(list);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Chargement zones impossible');
        setShowZonesOverlay(false);
      }
    }
  }

  function logout() {
    ecrireSession(CLE_JETON, null);
    ecrireSession(CLE_PAGE, null);
    setToken(null);
    setMeId(null);
    setMeNom(null);
    setMeRole(null);
    setSegments([]);
    setZones([]);
    setShowZonesOverlay(false);
    setPage('dashboard');
    setError(null);
  }

  const verifMatch = /^\/verif\/(licence|quittance)\/([^/]+)$/.exec(window.location.pathname);
  if (verifMatch) {
    return <VerifPage type={verifMatch[1] as 'licence' | 'quittance'} numero={decodeURIComponent(verifMatch[2])} />;
  }
  const profilMatch = /^\/profil\/([^/]+)$/.exec(window.location.pathname);
  if (profilMatch) {
    return <ProfilPublicPage jeton={decodeURIComponent(profilMatch[1])} />;
  }

  if (!token) {
    return (
      <LandingPage
        email={email}
        password={password}
        loading={loading}
        error={error}
        onEmail={setEmail}
        onPassword={setPassword}
        onLogin={onLogin}
      />
    );
  }

  if (meRole === 'organisation') {
    return (
      <div className="app app-cmd ds-app">
        <header className="ds-topbar" style={{ padding: '12px 20px', display: 'flex', gap: 16 }}>
          <strong>PIGAP · Organisation</strong>
          <button type="button" className="btn ghost" onClick={logout} style={{ marginLeft: 'auto' }}><IconLogin size={16} /> Déconnexion</button>
        </header>
        {error ? <p className="error pad">{error}</p> : null}
        <OrgPortalPage token={token} onError={setError} />
      </div>
    );
  }

  return (
    <div className="app app-cmd ds-app">
      <AppSidebar
        page={page}
        alertesBadge={notifSummary.alertes_nouvelles}
        demandesBadge={notifSummary.demandes_en_attente}
        meRole={meRole}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onNavigate={navigate}
        onLogout={logout}
        systemStatus={{
          aisKnown: Boolean(aisLive?.stream),
          aisConfigured: Boolean(aisLive?.stream?.configured),
          aisConnected: Boolean(aisLive?.stream?.connected),
          aisVessels: aisVessels.length,
          liveVessels: liveVessels.length,
          receivers: aisLive?.recepteurs_locaux ?? 0,
        }}
      />

      <div className="cmd-main ds-main">
        <AppTopbar
          page={page}
          meRole={meRole}
          meNom={meNom}
          search={
            <GlobalSearch
              token={token}
              peutVoirRegistre={canAccessPage(meRole, 'acteurs')}
              onOuvrirEmbarcation={(v) => {
                setSelectedGfwId(null);
                setSelectedMmsi(null);
                setBoatFilter('');
                setSelectedEmbarcation(v.embarcation_id);
                void goMap('navires').then(() =>
                  window.setTimeout(
                    () => mapObj.current?.flyTo({ center: v.position.coordinates, zoom: 11 }),
                    450,
                  ),
                );
              }}
              onOuvrirNavire={(v) => {
                setSelectedGfwId(null);
                setSelectedEmbarcation(null);
                setSelectedMmsi(v.mmsi);
                void goMap('navires').then(() =>
                  window.setTimeout(
                    () => mapObj.current?.flyTo({ center: v.position.coordinates, zoom: 9 }),
                    450,
                  ),
                );
              }}
              onOuvrirPecheur={(p) => {
                setError(null);
                setRechercheRegistre(p.numero_licence);
                setActeursTab('licences');
                setPage('acteurs');
              }}
              onOuvrirZone={(z) => {
                setError(null);
                setZoneAOuvrir(z.id);
                setPage('cartographie');
              }}
            />
          }
          notifSummary={notifSummary}
          notifConnected={notifConnected}
          notifOpen={notifOpen}
          onNotifToggle={() => setNotifOpen((v) => !v)}
          onNotifNavigate={(p) => {
            if (p === 'demandes') {
              if (!canAccessPage(meRole, 'acteurs')) {
                setError('Demandes réservées aux agents / admins.');
                setNotifOpen(false);
                return;
              }
              setActeursTab('demandes');
              setPage('acteurs');
            } else if (canAccessPage(meRole, 'alertes')) {
              setPage('alertes');
            }
            setNotifOpen(false);
            setError(null);
          }}
          onMenuOpen={() => setMobileNavOpen(true)}
        />

        <div className={`cmd-content ds-content${fullBleed ? ' ds-content--map' : ''}`}>
          <div key={onMap ? 'map' : page} className="ds-page">
          {error && onMap ? (
            <p className="error pad" style={{ paddingInline: 22 }}>
              {error}
            </p>
          ) : null}

          {page === 'dashboard' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <DashboardPage
                token={token}
                onError={setError}
                onNavigate={navigate}
                peutVoirRapports={canAccessPage(meRole, 'rapports')}
              />
            </>
          ) : null}

          {page === 'acteurs' ||
          page === 'demandes' ||
          page === 'search' ||
          page === 'organisations' ||
          page === 'abonnements' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <ActeursHub
                key={`${acteursTab}:${rechercheRegistre}`}
                initialQuery={rechercheRegistre}
                token={token}
                demandesBadge={notifSummary.demandes_en_attente}
                onError={setError}
                colorFor={colorFor}
                isSuperAdmin={meRole === 'admin'}
                role={meRole}
                initialTab={
                  page === 'search'
                    ? 'licences'
                    : page === 'organisations'
                      ? 'organisations'
                      : page === 'abonnements'
                        ? 'abonnements'
                        : acteursTab
                }
                onOpenTrajectory={(s) => {
                  setSelectedId(s.id);
                  setBoatFilter(s.embarcation_id);
                  setMapPanel('navires');
                  void goMap('navires');
                }}
              />
            </>
          ) : null}

          {page === 'org' && meRole === 'organisation' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <OrgPortalPage token={token} onError={setError} />
            </>
          ) : null}

          {onMap ? (
            <section ref={mapStage.stageRef} className="map-stage">
              <div className="map-wrap">
                <div ref={mapRef} className="map" />
              </div>

              {token ? (
                <VesselDetailDrawer
                  token={token}
                  mmsi={selectedMmsi}
                  onClose={() => {
                    setSelectedMmsi(null);
                    setSelectedTrack([]);
                  }}
                  onLocate={(lng, lat) => mapObj.current?.flyTo({ center: [lng, lat], zoom: 9 })}
                  onDetail={(d) => setSelectedTrack(d?.track ?? [])}
                />
              ) : null}
              {token ? (
                <PirogueDetailDrawer
                  token={token}
                  embarcationId={selectedEmbarcation}
                  onClose={() => {
                    setSelectedEmbarcation(null);
                    setSelectedTrack([]);
                  }}
                  onLocate={(lng, lat) => mapObj.current?.flyTo({ center: [lng, lat], zoom: 11 })}
                  onDetail={(f) =>
                    setSelectedTrack(
                      f ? f.trajectoire.map((t) => ({ horodatage: t.horodatage, position: t.position })) : [],
                    )
                  }
                />
              ) : null}
              {token ? (
                <GfwFiche
                  token={token}
                  evenement={gfwEvenements?.evenements.find((e) => e.id === selectedGfwId) ?? null}
                  avertissement={gfwEvenements?.avertissement}
                  attribution={gfwEvenements?.attribution ?? gfwEtat?.attribution}
                  onClose={() => setSelectedGfwId(null)}
                  onLocate={(lng, lat) => mapObj.current?.flyTo({ center: [lng, lat], zoom: 8 })}
                />
              ) : null}

              <MapToolbar
                items={[
                  { id: 'couches', label: 'Couches', icon: IconLayers, hint: 'Emprise et informations affichées' },
                  {
                    id: 'navires',
                    label: 'Navires',
                    icon: IconShip,
                    count: liveMode ? liveVessels.length : segments.length,
                    hint: 'Embarcations suivies et navires AIS',
                  },
                  { id: 'mer', label: 'Mer', icon: IconWaves, hint: 'État de la mer et des fleuves' },
                  { id: 'ports', label: 'Ports', icon: IconAnchor, hint: 'Présence au port' },
                ]}
                active={mapPanel}
                onToggle={setMapPanel}
                fullscreen={mapStage.fullscreen}
                canFullscreen={mapStage.canFullscreen}
                onFullscreen={mapStage.toggleFullscreen}
                extra={
                  <button
                    type="button"
                    className={`map-bar-btn${filtreAControler ? ' is-on' : ''}`}
                    aria-pressed={filtreAControler}
                    title="Afficher uniquement les navires à contrôler. Une présomption, pas une infraction."
                    onClick={() => setFiltreAControler((on) => !on)}
                  >
                    <IconShield size={16} />
                    <span>À contrôler</span>
                    {nbAControler > 0 ? <span className="map-bar-count">{nbAControler}</span> : null}
                  </button>
                }
              />

              {loading ? (
                <p className="map-loading" role="status">
                  <span className="ds-spinner" aria-hidden /> Chargement des données…
                </p>
              ) : null}

              {mapPanel === 'couches' ? (
                <MapPanel
                  title="Couches"
                  subtitle="Emprise de la carte et informations affichées."
                  onClose={() => setMapPanel(null)}
                >
                  <div className="map-extent" role="group" aria-label="Emprise de la carte">
                    <button
                      type="button"
                      className={mapExtent === 'gabon' ? 'is-on' : ''}
                      onClick={() => {
                        setMapExtent('gabon');
                        mapObj.current?.fitBounds(GABON_MAP_VIEW.fitBounds, { padding: 48, maxZoom: 7.6 });
                      }}
                    >
                      Eaux gabonaises
                    </button>
                    <button
                      type="button"
                      className={mapExtent === 'golfe' ? 'is-on' : ''}
                      onClick={() => setMapExtent('golfe')}
                      title="Zone de veille élargie : navires en approche"
                    >
                      Golfe de Guinée
                    </button>
                  </div>
                  <div className="map-layer-toggles">
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={liveMode}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setLiveMode(on);
                          if (token) {
                            if (on) void loadLive(token);
                            else void loadTrajectories(token);
                          }
                        }}
                      />
                      Positions GPS en direct
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={aisOverlay}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setAisOverlay(on);
                          if (on && token) void loadAis(token, true);
                          if (!on) {
                            clearMarkers(aisMarkers.current);
                            setAisVessels([]);
                          }
                        }}
                      />
                      Navires AIS (eaux gabonaises)
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={filtreAControler}
                        onChange={(e) => setFiltreAControler(e.target.checked)}
                      />
                      À contrôler seulement
                      <HelpTip title="Navire à contrôler" side="right">
                        Présomption calculée d’après le registre, les zones et l’âge du signal.
                        Ce n’est pas une infraction : la qualification revient à l’agent.
                      </HelpTip>
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={meteoOverlay}
                        onChange={(e) => setMeteoOverlay(e.target.checked)}
                      />
                      Zones calculées (mer, pêche, quotas)
                      <HelpTip title="Zones calculées" side="right">
                        Secteurs colorés d'après le croisement de l'état de la mer, des captures
                        déclarées, des quotas et des zones réglementées : rouge danger, orange
                        prudence, vert favorable, violet surexploité. Recalculées toutes les trente
                        minutes.
                      </HelpTip>
                    </label>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={showZonesOverlay || page === 'surveillance'}
                        onChange={() => void toggleZonesOverlay()}
                        disabled={page === 'surveillance'}
                      />
                      Zones réglementées
                    </label>
                  </div>
                  {showZonesOverlay || page === 'surveillance' ? (
                    <div className="zone-legend compact zone-legend-rich">
                      <span>
                        <img src="/icons/zone-interdite.svg" alt="" width="16" height="16" /> interdite
                      </span>
                      <span>
                        <img src="/icons/zone-protegee.svg" alt="" width="16" height="16" /> protégée
                      </span>
                      <span>
                        <img src="/icons/zone-sensible.svg" alt="" width="16" height="16" /> sensible
                      </span>
                      <span>
                        <img src="/icons/zone-autorisee.svg" alt="" width="16" height="16" /> autorisée
                      </span>
                    </div>
                  ) : null}
                  <MapLegend />
                  {peutLireGfw(meRole) ? (
                    <GfwPanel
                      etat={gfwEtat}
                      evenements={gfwEvenements}
                      erreur={gfwErreur}
                      chargement={gfwChargement}
                      overlay={gfwOverlay}
                      onOverlay={setGfwOverlay}
                      onRefresh={() => {
                        if (token) void loadGfw(token);
                      }}
                      selection={selectedGfwId}
                      onSelect={(id) => {
                        setSelectedMmsi(null);
                        setSelectedEmbarcation(null);
                        setSelectedGfwId(id);
                        const ev = gfwEvenements?.evenements.find((e) => e.id === id);
                        if (ev) mapObj.current?.flyTo({ center: [ev.longitude, ev.latitude], zoom: 8 });
                        closePanelOnSmallScreen();
                      }}
                    />
                  ) : null}
                </MapPanel>
              ) : null}

              {mapPanel === 'navires' ? (
                <MapPanel
                  title={page === 'surveillance' ? 'Surveillance' : 'Navires'}
                  subtitle={status || 'Chargement des données…'}
                  onClose={() => setMapPanel(null)}
                >
                  <section className="navires-section" aria-label="Flotte GPS">
                    <h3 className="navires-section-title">
                      Flotte GPS
                      {liveMode
                        ? ` · ${liveVisible.length}${filtreAControler ? ' à contrôler' : ''}`
                        : ` · ${boatFilter ? segments.filter((s) => s.embarcation_id === boatFilter).length : segments.length} trajets`}
                    </h3>
                    <label className="filter-label">
                      Embarcation
                      <select
                        value={boatFilter}
                        onChange={(e) => {
                          setBoatFilter(e.target.value);
                          setSelectedId(null);
                        }}
                      >
                        <option value="">Toutes</option>
                        {boats.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.nom} · {b.trips}
                          </option>
                        ))}
                      </select>
                    </label>
                    {liveMode ? (
                      liveVisible.length === 0 ? (
                        <p className="empty-list">
                          {filtreAControler
                            ? 'Aucun navire à contrôler parmi les positions GPS récentes.'
                            : 'Aucune position GPS récente. Les embarcations apparaissent dès qu’un relevé est transmis par l’application mobile.'}
                        </p>
                      ) : (
                        <div className="table-defile table-defile--panel">
                          <table className="ds-table empilable">
                            <thead>
                              <tr>
                                <th scope="col">Embarcation</th>
                                <th scope="col">Régularité</th>
                                <th scope="col">Âge</th>
                              </tr>
                            </thead>
                            <tbody>
                              {liveVisible.map((v) => (
                                <tr
                                  key={v.embarcation_id}
                                  className="is-clickable"
                                  onClick={() => {
                                    setBoatFilter(v.embarcation_id);
                                    setSelectedMmsi(null);
                                    setSelectedEmbarcation(v.embarcation_id);
                                    closePanelOnSmallScreen();
                                  }}
                                >
                                  <td data-label="Embarcation">
                                    <button type="button" className="ligne-bouton">
                                      {v.nom}
                                    </button>
                                    <span className="cellule-note">
                                      {secteurLabel(v.secteur)}
                                      {v.perimee ? ' · position périmée' : ''}
                                    </span>
                                  </td>
                                  <td data-label="Régularité">
                                    <span className={classePastilleRegularite(v.regularite)}>
                                      {libelleRegularite(v.regularite, v.regularite_libelle)}
                                    </span>
                                  </td>
                                  <td data-label="Âge" className="cellule-serree">
                                    {v.age_libelle ?? formatAge(v.age_seconds)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )
                    ) : (
                      (() => {
                        const trajs = boatFilter
                          ? segments.filter((s) => s.embarcation_id === boatFilter)
                          : segments;
                        if (trajs.length === 0) {
                          return (
                            <p className="empty-list">
                              Aucune trajectoire enregistrée. Les sorties s’affichent dès que des
                              relevés GPS sont consolidés.
                            </p>
                          );
                        }
                        return (
                          <div className="table-defile table-defile--panel">
                            <table className="ds-table empilable">
                              <thead>
                                <tr>
                                  <th scope="col">Embarcation</th>
                                  <th scope="col">Sortie</th>
                                  <th scope="col">Points</th>
                                  <th scope="col">Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {trajs.map((s) => {
                                  const on = selectedId === s.id;
                                  return (
                                    <tr
                                      key={s.id}
                                      className={`is-clickable${on ? ' is-selected' : ''}`}
                                      onClick={() => setSelectedId(on ? null : s.id)}
                                    >
                                      <td data-label="Embarcation">
                                        <button type="button" className="ligne-bouton">
                                          {s.embarcation_nom}
                                        </button>
                                      </td>
                                      <td data-label="Sortie" className="cellule-serree">
                                        {s.index}
                                      </td>
                                      <td data-label="Points" className="cellule-serree">
                                        {s.points_count}
                                      </td>
                                      <td data-label="Date" className="cellule-serree">
                                        {new Date(s.debut).toLocaleDateString('fr-FR')}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()
                    )}
                  </section>
                  {aisOverlay ? (
                    <AisPanel
                      live={aisLive}
                      vessels={aisVisibles}
                      note={aisNote}
                      filtreAControler={filtreAControler}
                      onRefresh={() => {
                        if (token) void loadAis(token, true);
                      }}
                      onSelect={(mmsi) => {
                        setSelectedGfwId(null);
                        setSelectedEmbarcation(null);
                        setSelectedMmsi(mmsi);
                        closePanelOnSmallScreen();
                      }}
                    />
                  ) : null}
                </MapPanel>
              ) : null}

              {mapPanel === 'mer' ? (
                <MapPanel title="Mer et fleuves" onClose={() => setMapPanel(null)}>
                  <SeaStatePanel
                    bulletin={bulletin}
                    loading={bulletinLoading}
                    onRefresh={() => {
                      if (token) void loadMeteo(token, true);
                    }}
                    onLocate={(lng, lat) => {
                      mapObj.current?.flyTo({ center: [lng, lat], zoom: 8 });
                      closePanelOnSmallScreen();
                    }}
                  />
                </MapPanel>
              ) : null}

              {mapPanel === 'ports' ? (
                <MapPanel title="Ports" onClose={() => setMapPanel(null)}>
                  {liveMode ? (
                    <PortPresencePanel
                      data={portPresence}
                      loading={presenceLoading}
                      onRefresh={() => {
                        if (token) void loadPresence(token);
                      }}
                      onSelectEmbarcation={(id) => {
                        setBoatFilter(id);
                        setSelectedMmsi(null);
                        setSelectedEmbarcation(id);
                        closePanelOnSmallScreen();
                      }}
                    />
                  ) : (
                    <p className="empty-list">
                      La présence au port s’affiche lorsque la couche « Positions GPS en direct »
                      est active.
                    </p>
                  )}
                </MapPanel>
              ) : null}
            </section>
          ) : null}

          {page === 'peches' || page === 'captures' || page === 'quotas' || page === 'redevances' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <PechesHub
                key={pechesTab}
                token={token}
                onError={setError}
                initialTab={page === 'quotas' ? 'quotas' : page === 'redevances' ? 'redevances' : pechesTab}
              />
            </>
          ) : null}

          {page === 'alertes' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <AlertesPage token={token} role={meRole} onError={setError} />
            </>
          ) : null}

          {page === 'controles' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <ControlesPage token={token} onError={setError} />
            </>
          ) : null}

          {page === 'rapports' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <RapportsPage token={token} onError={setError} />
            </>
          ) : null}

          {page === 'cartographie' || page === 'zones' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <ZonesPage token={token} onStatus={setStatus} onError={setError} initialZoneId={zoneAOuvrir} />
            </>
          ) : null}

          {(page === 'admin' || page === 'users') && meRole === 'admin' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <UsersPage token={token} currentUserId={meId} onError={setError} />
            </>
          ) : null}

          </div>
        </div>
      </div>
    </div>
  );
}
