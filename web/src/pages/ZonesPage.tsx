import maplibregl from 'maplibre-gl';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  bboxToPolygon,
  createZone,
  deleteZone,
  detectZoneIntersection,
  importZonesGeoJSON,
  listZones,
  updateZone,
  ZoneReglementee,
} from '../api';
import { GABON_COAST_BOUNDS } from '../geo/gabonMaritimeRoutes';
import {
  findOverlappingIds,
  fitMapToZone,
  fitMapToZones,
  syncPreviewBbox,
  syncZonesOnMap,
  zoneColor,
} from '../geo/zoneMap';
import CompactList from '../components/CompactList';
import { MODULE_VISUALS } from '../media';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Presets ciblés (alignés seed backend) — pas un pavage côte / intérieur. */
const ZONE_PRESETS: Array<{
  id: string;
  nom: string;
  type: ZoneReglementee['type'];
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  blurb: string;
}> = [
  {
    id: 'mondah',
    nom: 'Zone sensible baie de Mondah (démo)',
    type: 'sensible',
    minLon: 9.3,
    minLat: 0.78,
    maxLon: 9.42,
    maxLat: 0.92,
    blurb: 'Estuaire nord — vigilance',
  },
  {
    id: 'cap_lopez',
    nom: 'Zone interdite rade Cap Lopez (démo)',
    type: 'interdite',
    minLon: 8.55,
    minLat: -0.85,
    maxLon: 8.72,
    maxLat: -0.68,
    blurb: 'Port-Gentil / Cap Lopez',
  },
  {
    id: 'lambarene',
    nom: 'Zone protégée Ogooué — Lambaréné (démo)',
    type: 'protegee',
    minLon: 10.15,
    minLat: -0.82,
    maxLon: 10.35,
    maxLat: -0.62,
    blurb: 'Tronçon fluvial ciblé',
  },
];

/** ~0.8° ≈ 90 km — au-delà = risque de « ruban » côtier / national. */
const MAX_BBOX_SPAN_DEG = 0.8;

const DEMO_GEOJSON = `{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "nom": "Zone sensible baie de Mondah (import)", "type": "sensible" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[[9.30,0.78],[9.42,0.78],[9.42,0.92],[9.30,0.92],[9.30,0.78]]]
      }
    }
  ]
}`;

type Mode = 'voir' | 'dessiner' | 'tester';
type Props = {
  token: string;
  onStatus: (msg: string) => void;
  onError: (msg: string | null) => void;
};

type DraftCorner = { lon: number; lat: number } | null;

export default function ZonesPage({ token, onStatus, onError }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const detectMarker = useRef<maplibregl.Marker | null>(null);
  const cornerAMarker = useRef<maplibregl.Marker | null>(null);
  const didFit = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);

  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>('voir');
  const [showImport, setShowImport] = useState(false);
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const [geojsonText, setGeojsonText] = useState(DEMO_GEOJSON);

  const [nom, setNom] = useState('');
  const [typeZone, setTypeZone] = useState<ZoneReglementee['type']>('interdite');
  const [cornerA, setCornerA] = useState<DraftCorner>(null);
  const [cornerB, setCornerB] = useState<DraftCorner>(null);

  const [detectResult, setDetectResult] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const overlapIds = useMemo(() => findOverlappingIds(zones), [zones]);
  const visibleZones = useMemo(
    () => (showOnlyActive ? zones.filter((z) => z.actif) : zones),
    [zones, showOnlyActive],
  );

  const draftBbox = useMemo(() => {
    if (!cornerA || !cornerB) return null;
    return {
      minLon: Math.min(cornerA.lon, cornerB.lon),
      minLat: Math.min(cornerA.lat, cornerB.lat),
      maxLon: Math.max(cornerA.lon, cornerB.lon),
      maxLat: Math.max(cornerA.lat, cornerB.lat),
    };
  }, [cornerA, cornerB]);

  async function loadZones() {
    const list = await listZones(token);
    setZones(list);
    const overlaps = findOverlappingIds(list).size;
    onStatus(
      list.length
        ? `${list.length} zone(s)${overlaps ? ` · ${overlaps} superposée(s) (même emplacement)` : ''}`
        : 'Aucune zone — passe en mode Dessiner et clique deux coins sur la carte',
    );
  }

  useEffect(() => {
    setLoading(true);
    onError(null);
    void loadZones()
      .catch((err) => onError(err instanceof Error ? err.message : 'Chargement zones impossible'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!mapRef.current) return;
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
    popup.current = new maplibregl.Popup({
      closeButton: true,
      maxWidth: '280px',
      className: 'pigap-popup',
      offset: 12,
    });

    map.on('click', (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: ['pigap-zones-fill'].filter((id) => !!map.getLayer(id)),
      });
      const feat = features[0];
      const modeNow = (map.getCanvas().dataset.mode as Mode) || 'voir';

      if (modeNow === 'dessiner') {
        const lon = e.lngLat.lng;
        const lat = e.lngLat.lat;
        const aRaw = map.getCanvas().dataset.cornerA;
        if (!aRaw) {
          map.getCanvas().dataset.cornerA = JSON.stringify({ lon, lat });
          window.dispatchEvent(new CustomEvent('pigap-zone-corner', { detail: { step: 1, lon, lat } }));
        } else {
          window.dispatchEvent(
            new CustomEvent('pigap-zone-corner', { detail: { step: 2, lon, lat } }),
          );
        }
        return;
      }

      if (feat?.properties?.id) {
        window.dispatchEvent(
          new CustomEvent('pigap-zone-select', { detail: { id: String(feat.properties.id) } }),
        );
        popup.current
          ?.setLngLat(e.lngLat)
          .setHTML(
            `<div class="pigap-map-popup">
              <strong class="pigap-map-popup-title">${escapeHtml(String(feat.properties.nom ?? 'Zone'))}</strong>
              <span class="pigap-map-popup-meta">${escapeHtml(String(feat.properties.type))}${
                Number(feat.properties.actif) === 1 ? ' · active' : ' · inactive'
              }</span>
            </div>`,
          )
          .addTo(map);
        return;
      }

      if (modeNow === 'tester') {
        window.dispatchEvent(
          new CustomEvent('pigap-zone-detect', {
            detail: { lon: e.lngLat.lng, lat: e.lngLat.lat },
          }),
        );
      }
    });

    map.on('mouseenter', 'pigap-zones-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'pigap-zones-fill', () => {
      const m = map.getCanvas().dataset.mode;
      map.getCanvas().style.cursor = m === 'dessiner' || m === 'tester' ? 'crosshair' : '';
    });

    return () => {
      detectMarker.current?.remove();
      cornerAMarker.current?.remove();
      popup.current?.remove();
      map.remove();
      mapObj.current = null;
    };
  }, []);

  // Sync mode → canvas cursor + dataset attribute for click handler
  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    map.getCanvas().dataset.mode = mode;
    if (mode !== 'dessiner') delete map.getCanvas().dataset.cornerA;
    map.getCanvas().style.cursor = mode === 'voir' ? '' : 'crosshair';
    if (mode !== 'dessiner') {
      setCornerA(null);
      setCornerB(null);
      cornerAMarker.current?.remove();
      cornerAMarker.current = null;
    }
  }, [mode]);

  useEffect(() => {
    const onCorner = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as { step: number; lon: number; lat: number };
      if (detail.step === 1) {
        setCornerA({ lon: detail.lon, lat: detail.lat });
        setCornerB(null);
        const map = mapObj.current;
        if (map) {
          cornerAMarker.current?.remove();
          cornerAMarker.current = new maplibregl.Marker({ color: '#7FE0D3' })
            .setLngLat([detail.lon, detail.lat])
            .addTo(map);
        }
        setFlash('Coin A posé — clique le coin opposé');
      } else {
        setCornerB({ lon: detail.lon, lat: detail.lat });
        setFlash('Zone dessinée — donne un nom et valide');
      }
    };
    const onSelect = (ev: Event) => {
      const id = (ev as CustomEvent).detail?.id as string;
      setSelectedId(id);
      setMode('voir');
    };
    const onDetect = (ev: Event) => {
      const { lon, lat } = (ev as CustomEvent).detail as { lon: number; lat: number };
      void runDetect(lon, lat);
    };
    window.addEventListener('pigap-zone-corner', onCorner);
    window.addEventListener('pigap-zone-select', onSelect);
    window.addEventListener('pigap-zone-detect', onDetect);
    return () => {
      window.removeEventListener('pigap-zone-corner', onCorner);
      window.removeEventListener('pigap-zone-select', onSelect);
      window.removeEventListener('pigap-zone-detect', onDetect);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const draw = () => {
      syncZonesOnMap(map, visibleZones, { selectedId, visible: true });
      syncPreviewBbox(map, draftBbox);
      if (!didFit.current && visibleZones.length) {
        fitMapToZones(map, visibleZones);
        didFit.current = true;
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [visibleZones, selectedId, draftBbox]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !selectedId) return;
    const z = zones.find((x) => x.id === selectedId);
    if (z) fitMapToZone(map, z);
  }, [selectedId, zones]);

  function placeDetectMarker(lon: number, lat: number) {
    const map = mapObj.current;
    if (!map) return;
    if (detectMarker.current) detectMarker.current.setLngLat([lon, lat]);
    else {
      detectMarker.current = new maplibregl.Marker({ color: '#f0c75e' })
        .setLngLat([lon, lat])
        .addTo(map);
    }
  }

  async function runDetect(lon: number, lat: number) {
    setLoading(true);
    onError(null);
    setDetectResult(null);
    placeDetectMarker(lon, lat);
    try {
      const res = await detectZoneIntersection(token, [lon, lat]);
      setDetectResult(
        res.intersects
          ? `Dans : ${res.zones.map((z) => `${z.nom} (${z.type})`).join(', ')}`
          : 'Hors zone active — OK',
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Détection impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmDraw(e: FormEvent) {
    e.preventDefault();
    if (!draftBbox) {
      onError('Clique deux coins sur la carte pour dessiner la zone');
      return;
    }
    if (!nom.trim()) {
      onError('Donne un nom à la zone');
      return;
    }
    const w = draftBbox.maxLon - draftBbox.minLon;
    const h = draftBbox.maxLat - draftBbox.minLat;
    if (w < 0.005 || h < 0.005) {
      onError('Zone trop petite — élargis le rectangle');
      return;
    }
    if (w > MAX_BBOX_SPAN_DEG || h > MAX_BBOX_SPAN_DEG) {
      onError(
        'Zone trop vaste (≥ ~90 km). Une zone réglementée = un secteur ciblé, pas toute la côte ni l’intérieur du pays.',
      );
      return;
    }
    setLoading(true);
    onError(null);
    try {
      const created = await createZone(token, {
        nom: nom.trim(),
        type: typeZone,
        geometrie: bboxToPolygon(
          draftBbox.minLon,
          draftBbox.minLat,
          draftBbox.maxLon,
          draftBbox.maxLat,
        ),
        actif: true,
      });
      setNom('');
      setCornerA(null);
      setCornerB(null);
      mapObj.current && delete mapObj.current.getCanvas().dataset.cornerA;
      cornerAMarker.current?.remove();
      cornerAMarker.current = null;
      setFlash(`« ${created.nom} » créée`);
      setSelectedId(created.id);
      setMode('voir');
      onStatus('Zone créée');
      await loadZones();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onImportGeoJSON(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      const fc = JSON.parse(geojsonText) as object;
      const res = await importZonesGeoJSON(token, fc);
      onStatus(`${res.imported} zone(s) importée(s)`);
      didFit.current = false;
      await loadZones();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Import GeoJSON impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onToggleActif(z: ZoneReglementee) {
    setLoading(true);
    onError(null);
    try {
      await updateZone(token, z.id, { actif: !z.actif });
      await loadZones();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mise à jour impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteZone(id: string) {
    if (!window.confirm('Supprimer cette zone ?')) return;
    setLoading(true);
    onError(null);
    try {
      await deleteZone(token, id);
      if (selectedId === id) setSelectedId(null);
      await loadZones();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  function resetDraw() {
    setCornerA(null);
    setCornerB(null);
    cornerAMarker.current?.remove();
    cornerAMarker.current = null;
    if (mapObj.current) delete mapObj.current.getCanvas().dataset.cornerA;
    setFlash('Clique le premier coin sur la carte');
  }

  function applyPreset(preset: (typeof ZONE_PRESETS)[number]) {
    setMode('dessiner');
    setNom(preset.nom);
    setTypeZone(preset.type);
    setCornerA({ lon: preset.minLon, lat: preset.minLat });
    setCornerB({ lon: preset.maxLon, lat: preset.maxLat });
    cornerAMarker.current?.remove();
    const map = mapObj.current;
    if (map) {
      cornerAMarker.current = new maplibregl.Marker({ color: '#7FE0D3' })
        .setLngLat([preset.minLon, preset.minLat])
        .addTo(map);
      map.fitBounds(
        [
          [preset.minLon, preset.minLat],
          [preset.maxLon, preset.maxLat],
        ],
        { padding: 80, maxZoom: 11, duration: 500 },
      );
    }
    setFlash(`Preset « ${preset.blurb} » — valide pour enregistrer`);
  }

  async function loadDemoPresets() {
    setLoading(true);
    onError(null);
    try {
      let created = 0;
      for (const p of ZONE_PRESETS) {
        if (zones.some((z) => z.nom === p.nom)) continue;
        await createZone(token, {
          nom: p.nom,
          type: p.type,
          geometrie: bboxToPolygon(p.minLon, p.minLat, p.maxLon, p.maxLat),
          actif: true,
        });
        created += 1;
      }
      didFit.current = false;
      await loadZones();
      setFlash(
        created
          ? `${created} zone(s) démo ciblée(s) ajoutée(s)`
          : 'Les 3 presets démo sont déjà présents',
      );
      setMode('voir');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Chargement presets impossible');
    } finally {
      setLoading(false);
    }
  }

  async function purgeOverlapsKeepOne() {
    const groups = new Map<string, ZoneReglementee[]>();
    for (const z of zones) {
      const key = `${z.geometrie.coordinates[0]?.map((c) => c.join(',')).join('|')}`;
      const list = groups.get(key) ?? [];
      list.push(z);
      groups.set(key, list);
    }
    const toDelete: string[] = [];
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      // garde la plus récente (fin de liste API) — ou la première
      list.slice(1).forEach((z) => toDelete.push(z.id));
    }
    if (!toDelete.length) {
      setFlash('Aucun doublon géométrique à purger');
      return;
    }
    if (!window.confirm(`Supprimer ${toDelete.length} zone(s) superposée(s) (garder 1 par emplacement) ?`)) {
      return;
    }
    setLoading(true);
    onError(null);
    try {
      for (const id of toDelete) await deleteZone(token, id);
      await loadZones();
      setFlash(`${toDelete.length} doublon(s) supprimé(s)`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Purge impossible');
    } finally {
      setLoading(false);
    }
  }

  const hint =
    mode === 'dessiner'
      ? cornerA && !cornerB
        ? 'Étape 2/2 — clique le coin opposé'
        : cornerA && cornerB
          ? 'Rectangle prêt — nomme et valide à gauche'
          : 'Étape 1/2 — clique un premier coin'
      : mode === 'tester'
        ? 'Clique n’importe où pour tester une intrusion'
        : 'Clique une zone pour la sélectionner · pastilles = libellés';

  return (
    <section className="map-stage">
      <aside className="side side-scroll zones-side">
        <header className="zones-head page-head-with-icon zones-head-icon">
          <img src={MODULE_VISUALS.zones.src} alt="" className="page-module-icon sm" />
          <div>
            <p className="eyebrow">Module M3</p>
            <h2>Zones</h2>
            <p className="side-status">Secteurs ciblés — pas toute la côte.</p>
          </div>
        </header>

        <div className="preset-row">
          <button type="button" className="ghost compact" disabled={loading} onClick={() => void loadDemoPresets()}>
            Charger 3 presets démo
          </button>
          <button
            type="button"
            className="ghost compact"
            disabled={loading || overlapIds.size === 0}
            onClick={() => void purgeOverlapsKeepOne()}
          >
            Purger doublons
          </button>
        </div>
        <div className="preset-chips">
          {ZONE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="preset-chip"
              style={{ borderColor: zoneColor(p.type) }}
              onClick={() => applyPreset(p)}
              title={p.nom}
            >
              {p.blurb}
            </button>
          ))}
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Mode zones">
          {(
            [
              ['voir', 'Voir'],
              ['dessiner', 'Dessiner'],
              ['tester', 'Tester'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={mode === id ? 'mode-on' : ''}
              onClick={() => {
                setMode(id);
                setDetectResult(null);
                setFlash(null);
                if (id === 'dessiner') resetDraw();
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="zone-legend">
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

        {flash ? <p className="zones-flash">{flash}</p> : null}

        {mode === 'dessiner' ? (
          <form className="login-form compact-form zones-panel" onSubmit={onConfirmDraw}>
            <p className="step-chip">
              {draftBbox ? 'Rectangle prêt' : cornerA ? '1 coin · encore 1 clic' : '2 clics sur la carte'}
            </p>
            <label>
              Nom de la zone
              <input
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Ex. Interdiction Estuaire nord"
                required
              />
            </label>
            <label>
              Type
              <select
                value={typeZone}
                onChange={(e) => setTypeZone(e.target.value as ZoneReglementee['type'])}
              >
                <option value="interdite">Interdite</option>
                <option value="protegee">Protégée</option>
                <option value="sensible">Sensible</option>
              </select>
            </label>
            <div className="zone-actions">
              <button type="submit" disabled={loading || !draftBbox}>
                {loading ? 'Création…' : 'Enregistrer la zone'}
              </button>
              <button type="button" className="ghost compact" onClick={resetDraw}>
                Recommencer
              </button>
            </div>
          </form>
        ) : null}

        {mode === 'tester' ? (
          <div className="zones-panel">
            <p className="side-meta">
              Clique sur la carte (dans ou hors d’un polygone). La détection utilise PostGIS
              ST_Intersects.
            </p>
            {detectResult ? (
              <p
                className={`detect-feedback ${
                  detectResult.startsWith('Dans') ? 'hit' : 'miss'
                }`}
              >
                {detectResult}
              </p>
            ) : (
              <p className="side-meta">En attente d’un clic…</p>
            )}
          </div>
        ) : null}

        <div className="zones-panel">
          <div className="zones-list-head">
            <h3 className="side-sub" style={{ margin: 0 }}>
              Liste ({visibleZones.length}/{zones.length})
            </h3>
            <label className="toggle-row compact-toggle">
              <input
                type="checkbox"
                checked={showOnlyActive}
                onChange={(e) => setShowOnlyActive(e.target.checked)}
              />
              Actives seulem.
            </label>
          </div>

          <CompactList
            items={visibleZones}
            getKey={(z) => z.id}
            initial={5}
            empty={
              zones.length === 0 ? (
                <p className="empty-zones">
                  Aucune zone. Passe en <strong>Dessiner</strong>, clique deux coins, enregistre.
                </p>
              ) : null
            }
            renderItem={(z) => {
              const on = selectedId === z.id;
              const stacked = overlapIds.has(z.id);
              return (
                <div
                  className={`traj-item zone-card ${on ? 'on' : ''} ${!z.actif ? 'inactive' : ''}`}
                  style={{ borderLeftColor: zoneColor(z.type) }}
                >
                  <button
                    type="button"
                    className="zone-select"
                    onClick={() => {
                      setSelectedId(on ? null : z.id);
                      setMode('voir');
                    }}
                  >
                    <span className="traj-title">{z.nom}</span>
                    <span className="traj-meta">
                      <span className="type-pill" style={{ background: zoneColor(z.type) }}>
                        {z.type}
                      </span>
                      {z.actif ? 'active' : 'inactive'}
                      {stacked ? ' · superposée' : ''}
                    </span>
                  </button>
                  <div className="zone-actions">
                    <button
                      type="button"
                      className="ghost compact"
                      onClick={() => {
                        setSelectedId(z.id);
                        const map = mapObj.current;
                        if (map) fitMapToZone(map, z);
                      }}
                    >
                      Centrer
                    </button>
                    <button
                      type="button"
                      className="ghost compact"
                      onClick={() => void onToggleActif(z)}
                      disabled={loading}
                    >
                      {z.actif ? 'Off' : 'On'}
                    </button>
                    <button
                      type="button"
                      className="ghost compact danger-ghost"
                      onClick={() => void onDeleteZone(z.id)}
                      disabled={loading}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            }}
          />
        </div>

        <button type="button" className="ghost" onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'Masquer import GeoJSON' : 'Import GeoJSON (avancé)'}
        </button>
        {showImport ? (
          <form className="login-form compact-form" onSubmit={onImportGeoJSON}>
            <label>
              FeatureCollection
              <textarea
                rows={6}
                value={geojsonText}
                onChange={(e) => setGeojsonText(e.target.value)}
                style={{ fontFamily: 'ui-monospace, monospace', fontSize: '0.75rem' }}
              />
            </label>
            <button type="submit" disabled={loading}>
              Importer
            </button>
          </form>
        ) : null}
      </aside>

      <div className="map-wrap">
        <div ref={mapRef} className="map" />
        <p className={`map-hint mode-${mode}`}>{hint}</p>
      </div>
    </section>
  );
}
