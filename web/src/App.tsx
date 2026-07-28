import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  listTrajectories,
  listZones,
  login,
  TrajectorySegment,
  ZoneReglementee,
} from './api';
import { GABON_COAST_BOUNDS } from './geo/gabonMaritimeRoutes';
import { removeZonesFromMap, syncZonesOnMap, zoneColor } from './geo/zoneMap';
import CompactList from './components/CompactList';
import AlertesPage from './pages/AlertesPage';
import CapturesPage from './pages/CapturesPage';
import DashboardPage from './pages/DashboardPage';
import LandingPage from './pages/LandingPage';
import LicencesPage from './pages/LicencesPage';
import QuotasPage from './pages/QuotasPage';
import ZonesPage from './pages/ZonesPage';
import { MODULE_VISUALS } from './media';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

const PALETTE = [
  '#7FE0D3',
  '#F0C75E',
  '#7EB6FF',
  '#FF9B7A',
  '#C5A3FF',
  '#9BE15D',
  '#FFB4E0',
  '#5EEAD4',
];

type Page =
  | 'home'
  | 'map'
  | 'search'
  | 'zones'
  | 'captures'
  | 'quotas'
  | 'dashboard'
  | 'alertes';

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % PALETTE.length;
  return PALETTE[h];
}

export default function App() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const [email, setEmail] = useState('agent@example.com');
  const [password, setPassword] = useState('AgentPass123!');
  const [token, setToken] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('home');
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
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapObj.current = map;
    return () => {
      map.remove();
      mapObj.current = null;
    };
  }, [page]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || page !== 'map') return;

    const draw = () => {
      const sourceId = 'all-trajectories';
      const lineId = 'all-traj-lines';
      const pointsId = 'all-traj-points';
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
            features.push({
              type: 'Feature',
              properties: {
                id: seg.id,
                color,
                isEnd: i === 0 || i === coords.length - 1,
              },
              geometry: { type: 'Point', coordinates: c },
            });
          });
        }

        map.addSource(sourceId, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features },
        });
        map.addLayer({
          id: lineId,
          type: 'line',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: {
            'line-color': ['get', 'color'],
            'line-width': selectedId ? 6 : 4,
            'line-opacity': 0.92,
          },
        });
        map.addLayer({
          id: pointsId,
          type: 'circle',
          source: sourceId,
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-radius': ['case', ['get', 'isEnd'], 7, 4],
            'circle-color': ['get', 'color'],
            'circle-stroke-width': 1.5,
            'circle-stroke-color': '#021A22',
          },
        });

        if (allCoords.length) {
          const bounds = allCoords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
          );
          map.fitBounds(bounds, { padding: 56, maxZoom: selectedId ? 12 : 8 });
        }
      }

      // Zones overlay au-dessus des trajectoires
      removeZonesFromMap(map);
      if (showZonesOverlay) {
        syncZonesOnMap(map, zones, { visible: true });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
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
      setPage('home');
      await loadTrajectories(res.access_token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible');
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
      <aside className="icon-rail" aria-label="Navigation modules">
        <button
          type="button"
          className={`rail-btn ${page === 'home' ? 'rail-on' : ''}`}
          title="Accueil"
          onClick={() => setPage('home')}
        >
          <span className="rail-glyph">⌂</span>
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'dashboard' ? 'rail-on' : ''}`}
          title="Pilotage"
          onClick={() => {
            setPage('dashboard');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.dashboard.src} alt="" />
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'map' ? 'rail-on' : ''}`}
          title="Trajectoires"
          onClick={() => void goMap()}
        >
          <img src={MODULE_VISUALS.trajectories.src} alt="" />
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
        </button>
        <button
          type="button"
          className={`rail-btn ${page === 'alertes' ? 'rail-on' : ''}`}
          title="Alertes"
          onClick={() => {
            setPage('alertes');
            setError(null);
          }}
        >
          <img src={MODULE_VISUALS.alertes.src} alt="" />
        </button>
        <button type="button" className="rail-btn rail-logout" title="Déconnexion" onClick={logout}>
          ⎋
        </button>
      </aside>

      <div className="cmd-main">
        <header className="cmd-top">
          <div className="brand">
            <strong>CBM-PIGAP</strong>
            <span>Portail des autorités · Gabon</span>
          </div>
          <button type="button" className="ghost logout cmd-logout-wide" onClick={logout}>
            Déconnexion
          </button>
        </header>

        <div className="cmd-content">
      {error &&
      page !== 'search' &&
      page !== 'zones' &&
      page !== 'captures' &&
      page !== 'quotas' &&
      page !== 'dashboard' &&
      page !== 'alertes' ? (
        <p className="error pad" style={{ paddingInline: 22 }}>
          {error}
        </p>
      ) : null}

      {page === 'home' ? (
        <section className="stage home-stage">
          <div className="home-intro stage-head">
            <p className="eyebrow">Zone pilote · Estuaire / Gabon</p>
            <h1>Portail des autorités</h1>
            <p>
              Modules pour le contrôle de la pêche artisanale — licences,
              trajectoires, zones, captures et quotas. Listes courtes, actions
              claires.
            </p>
            <p className="status-line">
              {status || 'Ouvrez Trajectoires pour charger le résumé des sorties.'}
            </p>
          </div>
          <div className="home-module-grid" role="list">
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => setPage('search')}
            >
              <img src={MODULE_VISUALS.licences.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M1 · Livré</span>
              <strong>Licences</strong>
              <span>{MODULE_VISUALS.licences.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => void goMap()}
            >
              <img src={MODULE_VISUALS.trajectories.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M2 · Livré</span>
              <strong>Trajectoires</strong>
              <span>{MODULE_VISUALS.trajectories.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => {
                setPage('zones');
                setError(null);
              }}
            >
              <img src={MODULE_VISUALS.zones.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M3 · Livré</span>
              <strong>Zones</strong>
              <span>{MODULE_VISUALS.zones.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => {
                setPage('captures');
                setError(null);
              }}
            >
              <img src={MODULE_VISUALS.captures.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M4 · Livré</span>
              <strong>Captures</strong>
              <span>{MODULE_VISUALS.captures.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => {
                setPage('quotas');
                setError(null);
              }}
            >
              <img src={MODULE_VISUALS.quotas.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M5 · Livré</span>
              <strong>Quotas</strong>
              <span>{MODULE_VISUALS.quotas.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => {
                setPage('dashboard');
                setError(null);
              }}
            >
              <img src={MODULE_VISUALS.dashboard.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M6 · Livré</span>
              <strong>Pilotage</strong>
              <span>{MODULE_VISUALS.dashboard.short}</span>
            </button>
            <button
              type="button"
              className="home-module-card"
              role="listitem"
              onClick={() => {
                setPage('alertes');
                setError(null);
              }}
            >
              <img src={MODULE_VISUALS.alertes.src} alt="" className="home-module-icon" />
              <span className="mod-kicker">M7 · Livré</span>
              <strong>Alertes</strong>
              <span>{MODULE_VISUALS.alertes.short}</span>
            </button>
          </div>
          <p className="home-next">
            <span className="mod-kicker">Phase 2</span> Prototype M1–M7 — zone pilote Estuaire
          </p>
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
        </div>
      </div>
    </div>
  );
}
