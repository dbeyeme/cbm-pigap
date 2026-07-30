import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchMe,
  listTrajectories,
  listZones,
  login,
  TrajectorySegment,
  ZoneReglementee,
} from './api';
import { GABON_COAST_BOUNDS } from './geo/gabonMaritimeRoutes';
import {
  clearMarkers,
  FlowAnimHandle,
  placeShipMarkers,
  startLineFlowAnimation,
} from './geo/mapEffects';
import { removeZonesFromMap, syncZonesOnMap, zoneColor } from './geo/zoneMap';
import CompactList from './components/CompactList';
import HomeCarousel from './components/HomeCarousel';
import NotificationBell, { RailBadge } from './components/NotificationBell';
import { useToast } from './components/ToastProvider';
import AlertesPage from './pages/AlertesPage';
import CapturesPage from './pages/CapturesPage';
import DashboardPage from './pages/DashboardPage';
import DemandesPage from './pages/DemandesPage';
import LandingPage from './pages/LandingPage';
import LicencesPage from './pages/LicencesPage';
import OrganisationsPage from './pages/OrganisationsPage';
import QuotasPage from './pages/QuotasPage';
import UsersPage from './pages/UsersPage';
import ZonesPage from './pages/ZonesPage';
import { useNotifications } from './hooks/useNotifications';
import { friendlyApiError } from './lib/apiErrors';
import { MODULE_VISUALS } from './media';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

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

type Page =
  | 'home'
  | 'map'
  | 'search'
  | 'zones'
  | 'captures'
  | 'quotas'
  | 'dashboard'
  | 'alertes'
  | 'demandes'
  | 'organisations'
  | 'users';

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PALETTE.length;
  return PALETTE[h];
}

export default function App() {
  const toast = useToast();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const flowAnim = useRef<FlowAnimHandle | null>(null);
  const shipMarkers = useRef<maplibregl.Marker[]>([]);
  const [email, setEmail] = useState('admin@example.com');
  const [password, setPassword] = useState('AdminPass123!');
  const [token, setToken] = useState<string | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [meRole, setMeRole] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');
  const [notifOpen, setNotifOpen] = useState(false);
  const { summary: notifSummary, connected: notifConnected } = useNotifications(token);
  const [segments, setSegments] = useState<TrajectorySegment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [boatFilter, setBoatFilter] = useState('');
  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [showZonesOverlay, setShowZonesOverlay] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    if (page !== 'map' || !mapRef.current) return;
    if (mapObj.current) {
      mapObj.current.resize();
      return;
    }
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
      center: [9.2, 0.0],
      zoom: 6.8,
      maxBounds: [
        [GABON_COAST_BOUNDS.west - 1.5, GABON_COAST_BOUNDS.south - 1],
        [GABON_COAST_BOUNDS.east + 1.5, GABON_COAST_BOUNDS.north + 1],
      ],
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapObj.current = map;
    return () => {
      flowAnim.current?.stop();
      flowAnim.current = null;
      clearMarkers(shipMarkers.current);
      map.remove();
      mapObj.current = null;
    };
  }, [page]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || page !== 'map') return;

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

      if (visible.length === 0) {
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
        const ends: Array<{ lng: number; lat: number }> = [];

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
          coords.forEach((c, i) => {
            const isEnd = i === 0 || i === coords.length - 1;
            features.push({
              type: 'Feature',
              properties: { id: seg.id, color, isEnd },
              geometry: { type: 'Point', coordinates: c },
            });
            if (i === coords.length - 1) ends.push({ lng: c[0], lat: c[1] });
          });
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
            'line-color': ['get', 'color'],
            'line-width': selectedId ? 14 : 10,
            'line-opacity': 0.22,
            'line-blur': 4,
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
            'line-width': selectedId ? 5 : 3.5,
            'line-opacity': 0.95,
            'line-dasharray': [0, 4],
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.addLayer({
          id: pointsId,
          type: 'circle',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': ['case', ['get', 'isEnd'], 5, 3],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': ['case', ['get', 'isEnd'], 0.35, 0.85],
          },
        });

        placeShipMarkers(map, ends.slice(0, 24), shipMarkers.current);
        flowAnim.current = startLineFlowAnimation(map, lineId);

        if (allCoords.length) {
          const bounds = allCoords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
          );
          map.fitBounds(bounds, { padding: 56, maxZoom: selectedId ? 12 : 8 });
        }
      }

      removeZonesFromMap(map);
      if (showZonesOverlay) {
        syncZonesOnMap(map, zones, { visible: true });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);

    return () => {
      flowAnim.current?.stop();
      flowAnim.current = null;
    };
  }, [visible, page, selectedId, zones, showZonesOverlay]);

  async function loadTrajectories(accessToken: string) {
    const trajs = await listTrajectories(accessToken);
    setSegments(trajs);
    setSelectedId(null);
    setBoatFilter('');
    setStatus(
      trajs.length
        ? `${trajs.length} trajectoire(s) · ${new Set(trajs.map((t) => t.embarcation_id)).size} embarcation(s)`
        : 'Aucune trajectoire — lance le semis maritime.',
    );
  }

  async function ensureZones(accessToken: string) {
    if (zones.length) return;
    try {
      const list = await listZones(accessToken);
      setZones(list);
    } catch {
      /* overlay optionnel — ne bloque pas la carte */
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
      setPage('home');
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

  async function goMap() {
    if (!token) return;
    setPage('map');
    setLoading(true);
    try {
      await loadTrajectories(token);
      await ensureZones(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chargement impossible');
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
    setPage('home');
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
    <div className="app app-cmd">
      <aside className="icon-rail" aria-label="Navigation">
        <button
          type="button"
          className={`rail-btn ${page === 'home' ? 'rail-on' : ''}`}
          title="Accueil"
          onClick={() => setPage('home')}
        >
          <span className="rail-glyph" aria-hidden>
            ⌂
          </span>
          <span className="rail-label">Accueil</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'dashboard' ? 'rail-on' : ''}`}
          title="Tableau de bord"
          onClick={() => {
            setPage('dashboard');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.dashboard.src} alt="" />
          <span className="rail-label">Pilotage</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'map' ? 'rail-on' : ''}`}
          title="Trajectoires"
          onClick={() => void goMap()}
        >
          <img src={MODULE_VISUALS.trajectories.src} alt="" />
          <span className="rail-label">Carte</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'search' ? 'rail-on' : ''}`}
          title="Licences"
          onClick={() => {
            setPage('search');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.licences.src} alt="" />
          <span className="rail-label">Licences</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'zones' ? 'rail-on' : ''}`}
          title="Zones"
          onClick={() => {
            setPage('zones');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.zones.src} alt="" />
          <span className="rail-label">Zones</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'captures' ? 'rail-on' : ''}`}
          title="Captures"
          onClick={() => {
            setPage('captures');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.captures.src} alt="" />
          <span className="rail-label">Captures</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'quotas' ? 'rail-on' : ''}`}
          title="Quotas"
          onClick={() => {
            setPage('quotas');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.quotas.src} alt="" />
          <span className="rail-label">Quotas</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'alertes' ? 'rail-on' : ''}${notifSummary.alertes_nouvelles > 0 ? ' rail-attention' : ''}`}
          title="Alertes"
          onClick={() => {
            setPage('alertes');
            setError(null);
            setNotifOpen(false);
          }}
        >
          <img src={MODULE_VISUALS.alertes.src} alt="" />
          <span className="rail-label">Alertes</span>
          <RailBadge count={notifSummary.alertes_nouvelles} />
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'demandes' ? 'rail-on' : ''}${notifSummary.demandes_en_attente > 0 ? ' rail-attention' : ''}`}
          title="Demandes licence"
          onClick={() => {
            setPage('demandes');
            setError(null);
            setNotifOpen(false);
          }}
        >
          <img src={MODULE_VISUALS.licences.src} alt="" />
          <span className="rail-label">Demandes</span>
          <RailBadge count={notifSummary.demandes_en_attente} />
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'organisations' ? 'rail-on' : ''}`}
          title="Organisations"
          onClick={() => {
            setPage('organisations');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.quotas.src} alt="" />
          <span className="rail-label">Organis.</span>
        </button>
        {meRole === 'admin' ? (
          <button
            type="button"
            className={`rail-btn ${page === 'users' ? 'rail-on' : ''}`}
            title="Équipe"
            onClick={() => {
              setPage('users');
              setError(null);
            }}
          >
            <img src={MODULE_VISUALS.users.src} alt="" />
            <span className="rail-label">Équipe</span>
          </button>
        ) : null}
        <button type="button" className="rail-btn rail-logout" title="Déconnexion" onClick={logout}>
          <span className="rail-glyph" aria-hidden>
            ⎋
          </span>
          <span className="rail-label">Sortir</span>
        </button>
      </aside>

      <div className="cmd-main">
        <header className="cmd-top">
          <div className="brand brand-with-logo">
            <img src="/logo-cbm-pigap.png" alt="" className="brand-logo brand-logo-sm" />
            <div>
              <strong>CBM-PIGAP</strong>
              <span>Portail des autorités · Gabon</span>
            </div>
          </div>
          <div className="cmd-top-actions">
            <NotificationBell
              summary={notifSummary}
              connected={notifConnected}
              open={notifOpen}
              onToggle={() => setNotifOpen((v) => !v)}
              onNavigate={(p) => {
                setPage(p);
                setNotifOpen(false);
                setError(null);
              }}
            />
            <button type="button" className="ghost logout cmd-logout-wide" onClick={logout}>
              Déconnexion
            </button>
          </div>
        </header>

        <div className="cmd-content">
      {error &&
      page !== 'search' &&
      page !== 'zones' &&
      page !== 'captures' &&
      page !== 'quotas' &&
      page !== 'dashboard' &&
      page !== 'alertes' &&
      page !== 'demandes' &&
      page !== 'organisations' &&
      page !== 'users' ? (
        <p className="error pad" style={{ paddingInline: 22 }}>
          {error}
        </p>
      ) : null}

      {page === 'home' ? (
        <section className="stage home-stage">
          <div className="home-intro stage-head glass-block home-intro-anim">
            <p className="eyebrow">Zone pilote · Estuaire / Gabon</p>
            <h1>Portail des autorités</h1>
            <p>
              Bienvenue. Utilisez le diaporama ou choisissez une action ci-dessous —
              grands boutons, textes simples.
            </p>
            <p className="status-line">
              {status || 'Astuce : commencez par le Tableau de bord ou les Alertes.'}
            </p>
          </div>

          <HomeCarousel
            onAction={(action) => {
              setError(null);
              if (action === 'map') void goMap();
              else setPage(action);
            }}
          />

          <div className="home-groups">
            <div className="home-group home-group-anim" style={{ animationDelay: '80ms' }}>
              <h2>Voir l’essentiel</h2>
              <p className="home-group-lede">
                Vue d’ensemble et alertes — le premier écran pour les autorités.
              </p>
              <div className="home-module-grid" role="list">
                <button
                  type="button"
                  className="home-module-card home-module-primary home-card-anim"
                  style={{ animationDelay: '120ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('dashboard');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.dashboard.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Recommandé</span>
                  <strong>Tableau de bord</strong>
                  <span>Chiffres clés et carte d’activité</span>
                </button>
                <button
                  type="button"
                  className="home-module-card home-module-alert home-card-anim"
                  style={{ animationDelay: '180ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('alertes');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.alertes.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Prioritaire</span>
                  <strong>Alertes</strong>
                  <span>Situations à traiter en premier</span>
                </button>
              </div>
            </div>

            <div className="home-group home-group-anim" style={{ animationDelay: '160ms' }}>
              <h2>Surveiller</h2>
              <p className="home-group-lede">
                Trajectoires des embarcations et zones réglementées sur la carte.
              </p>
              <div className="home-module-grid" role="list">
                <button
                  type="button"
                  className="home-module-card home-card-anim"
                  style={{ animationDelay: '200ms' }}
                  role="listitem"
                  onClick={() => void goMap()}
                >
                  <img src={MODULE_VISUALS.trajectories.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Carte</span>
                  <strong>Trajectoires</strong>
                  <span>Suivi des sorties en mer et fleuves</span>
                </button>
                <button
                  type="button"
                  className="home-module-card home-card-anim"
                  style={{ animationDelay: '260ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('zones');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.zones.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Carte</span>
                  <strong>Zones</strong>
                  <span>Zones interdites, protégées, sensibles</span>
                </button>
              </div>
            </div>

            <div className="home-group home-group-anim" style={{ animationDelay: '240ms' }}>
              <h2>Gérer</h2>
              <p className="home-group-lede">Licences, captures déclarées et quotas.</p>
              <div className="home-module-grid" role="list">
                <button
                  type="button"
                  className="home-module-card home-card-anim"
                  style={{ animationDelay: '280ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('search');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.licences.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Dossiers</span>
                  <strong>Licences</strong>
                  <span>Pêcheurs et embarcations</span>
                </button>
                <button
                  type="button"
                  className="home-module-card home-card-anim"
                  style={{ animationDelay: '340ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('captures');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.captures.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Déclarations</span>
                  <strong>Captures</strong>
                  <span>Volumes déclarés par espèce</span>
                </button>
                <button
                  type="button"
                  className="home-module-card home-card-anim"
                  style={{ animationDelay: '400ms' }}
                  role="listitem"
                  onClick={() => {
                    setPage('quotas');
                    setError(null);
                  }}
                >
                  <img src={MODULE_VISUALS.quotas.src} alt="" className="home-module-icon" />
                  <span className="mod-kicker">Limites</span>
                  <strong>Quotas</strong>
                  <span>Consommation et seuils</span>
                </button>
                {meRole === 'admin' ? (
                  <button
                    type="button"
                    className="home-module-card home-card-anim"
                    style={{ animationDelay: '460ms' }}
                    role="listitem"
                    onClick={() => {
                      setPage('users');
                      setError(null);
                    }}
                  >
                    <img src={MODULE_VISUALS.users.src} alt="" className="home-module-icon" />
                    <span className="mod-kicker">Admin</span>
                    <strong>Équipe</strong>
                    <span>Agents et administrateurs</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {page === 'map' ? (
        <section className="map-stage">
          <aside className="side">
            <header className="zones-head page-head-with-icon zones-head-icon">
              <img src={MODULE_VISUALS.trajectories.src} alt="" className="page-module-icon sm" />
              <div>
                <h2>Trajectoires</h2>
                <p className="side-status">{status || 'Chargement…'}</p>
              </div>
            </header>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={showZonesOverlay}
                onChange={() => void toggleZonesOverlay()}
              />
              Afficher zones
            </label>
            {showZonesOverlay ? (
              <div className="zone-legend compact">
                <span>
                  <i style={{ background: zoneColor('interdite') }} /> interdite
                </span>
                <span>
                  <i style={{ background: zoneColor('protegee') }} /> protégée
                </span>
                <span>
                  <i style={{ background: zoneColor('sensible') }} /> sensible
                </span>
              </div>
            ) : null}
            <button
              type="button"
              className={`ghost ${!selectedId && !boatFilter ? 'active-filter' : ''}`}
              onClick={() => {
                setSelectedId(null);
                setBoatFilter('');
              }}
            >
              Toutes
            </button>
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
            <CompactList
              items={
                boatFilter
                  ? segments.filter((s) => s.embarcation_id === boatFilter)
                  : segments
              }
              getKey={(s) => s.id}
              initial={6}
              empty={
                <p className="empty-list">Aucune trajectoire — semis maritime puis recharge.</p>
              }
              renderItem={(s) => {
                const on = selectedId === s.id;
                return (
                  <button
                    type="button"
                    className={`traj-item ${on ? 'on' : ''}`}
                    style={{ borderLeftColor: colorFor(s.id) }}
                    onClick={() => setSelectedId(on ? null : s.id)}
                  >
                    <span className="traj-title">
                      {s.embarcation_nom}
                      <em> · {s.index}</em>
                    </span>
                    <span className="traj-meta">
                      {s.points_count} pts · {new Date(s.debut).toLocaleDateString()}
                    </span>
                  </button>
                );
              }}
            />
          </aside>
          <div className="map-wrap">
            <div ref={mapRef} className="map" />
          </div>
        </section>
      ) : null}

      {page === 'search' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <LicencesPage
            token={token}
            onError={setError}
            colorFor={colorFor}
            onOpenTrajectory={(s) => {
              setSelectedId(s.id);
              setBoatFilter(s.embarcation_id);
              void goMap();
            }}
          />
        </>
      ) : null}

      {page === 'zones' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <ZonesPage token={token} onStatus={setStatus} onError={setError} />
        </>
      ) : null}

      {page === 'captures' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <CapturesPage token={token} onError={setError} />
        </>
      ) : null}

      {page === 'quotas' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <QuotasPage token={token} onError={setError} />
        </>
      ) : null}

      {page === 'dashboard' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <DashboardPage token={token} onError={setError} />
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

      {page === 'demandes' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <DemandesPage token={token} onError={setError} />
        </>
      ) : null}

      {page === 'organisations' ? (
        <>
          {error ? (
            <p className="error pad" style={{ paddingInline: 22, marginBottom: 0 }}>
              {error}
            </p>
          ) : null}
          <OrganisationsPage token={token} onError={setError} />
        </>
      ) : null}

      {page === 'users' && meRole === 'admin' ? (
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
  );
}
