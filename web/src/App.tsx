import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  AisVessel,
  fetchMe,
  listAisLive,
  listAlertes,
  listLiveVessels,
  listTrajectories,
  listZones,
  LiveVessel,
  login,
  TrajectorySegment,
  ZoneReglementee,
} from './api';
import AppSidebar from './components/AppSidebar';
import AppTopbar from './components/AppTopbar';
import CompactList from './components/CompactList';
import { IconPirogue, IconShip } from './components/Icons';
import { useToast } from './components/ToastProvider';
import { syncGabonBoundariesOnMap } from './geo/gabonBoundary';
import { GABON_COAST_BOUNDS } from './geo/gabonMaritimeRoutes';
import {
  clearMarkers,
  coordsFromDeclencheur,
  FlowAnimHandle,
  placeAisMarkers,
  placeAlertMarkers,
  placeShipMarkers,
  startLineFlowAnimation,
  VesselKind,
} from './geo/mapEffects';
import { GABON_MAP_VIEW, GABON_SATELLITE_STYLE } from './geo/mapStyle';
import { removeZonesFromMap, syncZonesOnMap } from './geo/zoneMap';
import { useNotifications } from './hooks/useNotifications';
import { friendlyApiError } from './lib/apiErrors';
import { type NavId, type Page } from './nav';
import ActeursHub from './pages/ActeursHub';
import AlertesPage from './pages/AlertesPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import PechesHub from './pages/PechesHub';
import RapportsPage from './pages/RapportsPage';
import UsersPage from './pages/UsersPage';
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

export default function App() {
  const toast = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const flowAnim = useRef<FlowAnimHandle | null>(null);
  const shipMarkers = useRef<maplibregl.Marker[]>([]);
  const aisMarkers = useRef<maplibregl.Marker[]>([]);
  const alertMarkers = useRef<maplibregl.Marker[]>([]);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('AdminPass123!');
  const [token, setToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('dashboard');
  const [notifOpen, setNotifOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { summary: notifSummary, connected: notifConnected } = useNotifications(token);
  const [segments, setSegments] = useState<TrajectorySegment[]>([]);
  const [liveVessels, setLiveVessels] = useState<LiveVessel[]>([]);
  const [aisVessels, setAisVessels] = useState<AisVessel[]>([]);
  const [aisNote, setAisNote] = useState('');
  const [liveMode, setLiveMode] = useState(true);
  const [aisOverlay, setAisOverlay] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boatFilter, setBoatFilter] = useState('');
  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [showZonesOverlay, setShowZonesOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [acteursTab, setActeursTab] = useState<'demandes' | 'licences' | 'organisations'>(
    'demandes',
  );
  const [pechesTab, setPechesTab] = useState<'captures' | 'quotas'>('captures');

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
    return list;
  }, [liveVessels, boatFilter]);

  const onMap = isMapPage(page);

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
    map.once('load', () => {
      map.fitBounds(GABON_MAP_VIEW.fitBounds, { padding: 48, maxZoom: 7.6 });
      void syncGabonBoundariesOnMap(map);
    });
    return () => {
      flowAnim.current?.stop();
      flowAnim.current = null;
      clearMarkers(shipMarkers.current);
      clearMarkers(aisMarkers.current);
      clearMarkers(alertMarkers.current);
      map.remove();
      mapObj.current = null;
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
      if (map.getLayer(aisLayer)) map.removeLayer(aisLayer);
      if (map.getSource(aisSrc)) map.removeSource(aisSrc);

      const paintAis = () => {
        if (!aisOverlay || !aisVessels.length) {
          clearMarkers(aisMarkers.current);
          return;
        }
        map.addSource(aisSrc, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: aisVessels.map((v) => ({
              type: 'Feature',
              properties: {
                nom: v.nom,
                mmsi: v.mmsi,
                demo: v.demo,
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
            'circle-color': ['case', ['get', 'demo'], '#94a3b8', '#c2410c'],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.92,
          },
        });
        placeAisMarkers(
          map,
          aisVessels.map((v) => ({
            lng: v.position.coordinates[0],
            lat: v.position.coordinates[1],
            demo: v.demo,
            label: v.demo ? `${v.nom}` : `${v.nom} · MMSI ${v.mmsi}`,
          })),
          aisMarkers.current,
        );
      };

      if (visible.length === 0) {
        clearMarkers(shipMarkers.current);
        if (liveMode && liveVisible.length) {
          placeShipMarkers(
            map,
            liveVisible.map((v) => ({
              lng: v.position.coordinates[0],
              lat: v.position.coordinates[1],
              kind: vesselKind(v.type),
              statut: v.statut,
              label: v.nom,
              alert: v.statut === 'silence',
            })),
            shipMarkers.current,
          );
        }
        if (aisOverlay) {
          paintAis();
        } else {
          clearMarkers(aisMarkers.current);
        }
        map.fitBounds(
          [
            [GABON_COAST_BOUNDS.west, GABON_COAST_BOUNDS.south],
            [GABON_COAST_BOUNDS.east, GABON_COAST_BOUNDS.north],
          ],
          { padding: 32, maxZoom: 7 },
        );
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
              properties: { id: seg.id, color, isEnd: true },
              geometry: { type: 'Point', coordinates: end },
            });
            ends.push({
              lng: end[0],
              lat: end[1],
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
              'circle-radius': 3,
              'circle-color': ['get', 'color'],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#ffffff',
              'circle-opacity': 0.35,
            },
          });
        }

        placeShipMarkers(
          map,
          preferLive
            ? liveVisible.map((v) => ({
                lng: v.position.coordinates[0],
                lat: v.position.coordinates[1],
                kind: vesselKind(v.type),
                statut: v.statut,
                label: v.nom,
                alert: v.statut === 'silence',
              }))
            : ends.slice(0, 24),
          shipMarkers.current,
        );

        if (aisOverlay) {
          paintAis();
        } else {
          clearMarkers(aisMarkers.current);
        }

        flowAnim.current = startLineFlowAnimation(map, lineId);

        if (!liveMode && allCoords.length) {
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
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);

    return () => {
      flowAnim.current?.stop();
      flowAnim.current = null;
    };
  }, [visible, liveVisible, liveMode, aisOverlay, aisVessels, onMap, page, selectedId, zones, showZonesOverlay]);

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
              label: `${a.type.replaceAll('_', ' ')} · ${a.niveau_gravite}`,
            };
          })
          .filter((p): p is { lng: number; lat: number; label: string } => p != null);
        placeAlertMarkers(map, points, alertMarkers.current);
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
  }, [onMap, page, token]);

  async function loadTrajectories(accessToken: string) {
    const trajs = await listTrajectories(accessToken);
    setSegments(trajs);
    setSelectedId(null);
    setBoatFilter('');
    if (!liveMode) {
      setStatus(
        trajs.length
          ? `${trajs.length} trajectoire(s) · ${new Set(trajs.map((t) => t.embarcation_id)).size} embarcation(s)`
          : 'Aucune trajectoire — lance le semis maritime.',
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
        ? `Live · ${fleet.length} en circulation (${actifs} actifs) · ${cotes} côte/bras · ${fleuves} fleuve · MAJ ${new Date().toLocaleTimeString()}`
        : 'Live · aucun signal récent (semis ou simulateur).',
    );
  }

  async function loadAis(accessToken: string, refresh = false) {
    try {
      const res = await listAisLive(accessToken, refresh);
      setAisVessels(res.enabled ? res.vessels : []);
      setAisNote(res.note || (res.enabled ? '' : 'AIS désactivé'));
    } catch {
      setAisVessels([]);
      setAisNote('AIS indisponible');
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

  async function goMap(as: 'navires' | 'surveillance' = 'navires') {
    if (!token) return;
    setPage(as);
    setError(null);
    if (as === 'surveillance') setShowZonesOverlay(true);
    setLoading(true);
    try {
      await loadTrajectories(token);
      await loadLive(token);
      await loadAis(token, true);
      await ensureZones(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token || !onMap || !liveMode) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const fleet = await listLiveVessels(token, 1440);
        if (cancelled) return;
        setLiveVessels(fleet);
        const actifs = fleet.filter((v) => v.statut === 'actif').length;
        const cotes = fleet.filter(
          (v) => v.secteur === 'cote' || v.secteur === 'bras_mer',
        ).length;
        const fleuves = fleet.filter((v) => v.secteur === 'fleuve').length;
        setStatus(
          fleet.length
            ? `Live · ${fleet.length} en circulation (${actifs} actifs) · ${cotes} côte/bras · ${fleuves} fleuve · MAJ ${new Date().toLocaleTimeString()}`
            : 'Live · aucun signal récent (semis ou simulateur).',
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

  function navigate(id: NavId) {
    setError(null);
    setNotifOpen(false);
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
      setToken(res.access_token);
      try {
        const me = await fetchMe(res.access_token);
        setMeId(me.id);
        setMeRole(me.role);
      } catch {
        setMeId(null);
        setMeRole(null);
      }
      setPage('dashboard');
      await loadTrajectories(res.access_token);
      toast.success('Connexion réussie', 'Bienvenue sur le portail des autorités.');
    } catch (err) {
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
    setToken(null);
    setMeId(null);
    setMeRole(null);
    setSegments([]);
    setZones([]);
    setShowZonesOverlay(false);
    setPage('dashboard');
    setError(null);
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

  return (
    <div className="app app-cmd ds-app">
      <AppSidebar
        page={page}
        alertesBadge={notifSummary.alertes_nouvelles}
        demandesBadge={notifSummary.demandes_en_attente}
        showAdmin={meRole === 'admin'}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        onNavigate={navigate}
        onLogout={logout}
      />

      <div className="cmd-main ds-main">
        <AppTopbar
          page={page}
          meRole={meRole}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchSubmit={() => {
            setActeursTab('licences');
            setPage('acteurs');
          }}
          notifSummary={notifSummary}
          notifConnected={notifConnected}
          notifOpen={notifOpen}
          onNotifToggle={() => setNotifOpen((v) => !v)}
          onNotifNavigate={(p) => {
            if (p === 'demandes') {
              setActeursTab('demandes');
              setPage('acteurs');
            } else {
              setPage('alertes');
            }
            setNotifOpen(false);
            setError(null);
          }}
          onMenuOpen={() => setMobileNavOpen(true)}
        />

        <div className="cmd-content ds-content">
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
              <DashboardPage token={token} onError={setError} onNavigate={navigate} />
            </>
          ) : null}

          {page === 'acteurs' ||
          page === 'demandes' ||
          page === 'search' ||
          page === 'organisations' ? (
            <>
              {error ? (
                <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
                  {error}
                </p>
              ) : null}
              <ActeursHub
                key={acteursTab}
                token={token}
                demandesBadge={notifSummary.demandes_en_attente}
                onError={setError}
                colorFor={colorFor}
                initialTab={
                  page === 'search'
                    ? 'licences'
                    : page === 'organisations'
                      ? 'organisations'
                      : acteursTab
                }
                onOpenTrajectory={(s) => {
                  setSelectedId(s.id);
                  setBoatFilter(s.embarcation_id);
                  void goMap('navires');
                }}
              />
            </>
          ) : null}

          {onMap ? (
            <section className="map-stage">
              <aside className="side">
                <header className="zones-head page-head-with-icon zones-head-icon">
                  <div>
                    <h2>{page === 'surveillance' ? 'Surveillance' : 'Navires'}</h2>
                    <p className="side-status">{status || 'Chargement…'}</p>
                  </div>
                </header>
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
                    Live GPS PIGAP
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
                    AIS ZEE
                  </label>
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={showZonesOverlay || page === 'surveillance'}
                      onChange={() => void toggleZonesOverlay()}
                      disabled={page === 'surveillance'}
                    />
                    Zones
                  </label>
                </div>
                {aisOverlay ? (
                  <p className="side-status ais-side-note">
                    {aisVessels.length} signal(aux) AIS
                    {aisVessels.some((v) => v.demo) ? ' · démo' : ''}
                    {aisNote ? ` — ${aisNote}` : ''}
                    {aisVessels.length === 0
                      ? ' — aucun en ZEE pour l’instant'
                      : ''}
                  </p>
                ) : null}
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
                  </div>
                ) : null}
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
                  <CompactList
                    items={liveVisible}
                    getKey={(v) => v.embarcation_id}
                    initial={8}
                    empty={
                      <p className="empty-list">
                        Aucun signal live — semis maritime ou simulate_live_fleet.py
                      </p>
                    }
                    renderItem={(v) => {
                      const kind = vesselKind(v.type);
                      const VesselIcon = kind === 'navire' ? IconShip : IconPirogue;
                      return (
                        <button
                          type="button"
                          className={`traj-item traj-item--vessel traj-item--${kind}`}
                          style={{ borderLeftColor: colorFor(v.embarcation_id) }}
                          title={`${v.nom} · ${v.statut} · ${formatAge(v.age_seconds)}`}
                          onClick={() => setBoatFilter(v.embarcation_id)}
                        >
                          <span className={`traj-vessel-icon traj-vessel-icon--${kind}`} aria-hidden>
                            <VesselIcon size={18} />
                          </span>
                          <span className="traj-item-body">
                            <span className="traj-title">{v.nom}</span>
                            <span className="traj-meta">
                              {secteurLabel(v.secteur)} · {v.statut} · {formatAge(v.age_seconds)}
                            </span>
                          </span>
                        </button>
                      );
                    }}
                  />
                ) : (
                  <CompactList
                    items={
                      boatFilter
                        ? segments.filter((s) => s.embarcation_id === boatFilter)
                        : segments
                    }
                    getKey={(s) => s.id}
                    initial={8}
                    empty={
                      <p className="empty-list">
                        Aucune trajectoire — semis maritime puis recharge.
                      </p>
                    }
                    renderItem={(s) => {
                      const on = selectedId === s.id;
                      const kind = vesselKind(s.type);
                      const VesselIcon = kind === 'navire' ? IconShip : IconPirogue;
                      return (
                        <button
                          type="button"
                          className={`traj-item traj-item--vessel traj-item--${kind}${on ? ' on' : ''}`}
                          style={{ borderLeftColor: colorFor(s.id) }}
                          title={`${s.embarcation_nom} · sortie ${s.index}`}
                          onClick={() => setSelectedId(on ? null : s.id)}
                        >
                          <span className={`traj-vessel-icon traj-vessel-icon--${kind}`} aria-hidden>
                            <VesselIcon size={18} />
                          </span>
                          <span className="traj-item-body">
                            <span className="traj-title">
                              {s.embarcation_nom}
                              <em> · {s.index}</em>
                            </span>
                            <span className="traj-meta">
                              {s.points_count} pts · {new Date(s.debut).toLocaleDateString()}
                            </span>
                          </span>
                        </button>
                      );
                    }}
                  />
                )}
              </aside>
              <div className="map-wrap">
                <div ref={mapRef} className="map" />
              </div>
            </section>
          ) : null}

          {page === 'peches' || page === 'captures' || page === 'quotas' ? (
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
                initialTab={page === 'quotas' ? 'quotas' : pechesTab}
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
              <AlertesPage token={token} onError={setError} />
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
              <ZonesPage token={token} onStatus={setStatus} onError={setError} />
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

          {loading && onMap ? (
            <p className="status-line" style={{ padding: 12 }}>
              Chargement…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
