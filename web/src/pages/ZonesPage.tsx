import maplibregl from 'maplibre-gl';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  bboxToPolygon,
  createZone,
  deleteZone,
  detectZoneIntersection,
  importZonesGeoJSON,
  listZones,
  updateZone,
  ZoneReglementee,
  type MaillesActivite,
} from '../api';
import ActiviteHeuresPanel from '../components/ActiviteHeuresPanel';
import MapToolbar, { MapPanel } from '../components/MapToolbar';
import Modal from '../components/Modal';
import { COUCHE_ACTIVITE, syncActiviteOnMap, type ClasseActivite } from '../geo/activiteLayer';
import { syncGabonBoundariesOnMap } from '../geo/gabonBoundary';
import { GABON_MAP_VIEW, GABON_SATELLITE_STYLE } from '../geo/mapStyle';
import {
  findOverlappingIds,
  fitMapToZone,
  fitMapToZones,
  syncPreviewBbox,
  syncZonesOnMap,
  zoneColor,
  zonesExtent,
} from '../geo/zoneMap';
import { useMapStage } from '../hooks/useMapStage';
import {
  IconDownload,
  IconEdit,
  IconEye,
  IconHotspot,
  IconMap,
  IconRadar,
  IconRefresh,
  IconSave,
  IconTrash,
  IconUpload,
  IconXCircle,
} from '../components/Icons';

const ZONE_TYPE_LABEL: Record<ZoneReglementee['type'], string> = {
  interdite: 'Interdite',
  protegee: 'Protégée',
  sensible: 'Sensible',
  autorisee: 'Autorisée',
};

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
  /** Zone à sélectionner et à cadrer à l'arrivée (recherche globale). */
  initialZoneId?: string | null;
};

type DraftCorner = { lon: number; lat: number } | null;

export default function ZonesPage({ token, onStatus, onError, initialZoneId = null }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const detectMarker = useRef<maplibregl.Marker | null>(null);
  const cornerAMarker = useRef<maplibregl.Marker | null>(null);
  const didFit = useRef(false);
  const popup = useRef<maplibregl.Popup | null>(null);

  const mapStage = useMapStage<HTMLElement>();
  /** Panneau : ouvert à l'arrivée (outils de dessin), refermable pour dégager la carte. */
  const [panel, setPanel] = useState<'zones' | 'heures' | null>('zones');
  const [heuresOverlay, setHeuresOverlay] = useState(false);
  const [mailles, setMailles] = useState<MaillesActivite | null>(null);
  const [classesHeures, setClassesHeures] = useState<ClasseActivite[]>([]);
  const [mailleId, setMailleId] = useState<string | null>(null);

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
  const [zoneModalOpen, setZoneModalOpen] = useState(false);

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

  useEffect(() => {
    if (draftBbox && mode === 'dessiner') setZoneModalOpen(true);
  }, [draftBbox, mode]);

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
      style: GABON_SATELLITE_STYLE,
      center: GABON_MAP_VIEW.center,
      zoom: GABON_MAP_VIEW.zoom,
      maxBounds: GABON_MAP_VIEW.maxBounds,
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapObj.current = map;
    map.once('load', () => {
      map.fitBounds(GABON_MAP_VIEW.fitBounds, { padding: 40, maxZoom: 7.2 });
      // Contour terre discret seulement : la ZEE pleine brouille les secteurs ciblés.
      void syncGabonBoundariesOnMap(map, { mode: 'context' });
    });
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
      const heuresOn = map.getCanvas().dataset.heures === '1';

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

      if (heuresOn && map.getLayer(COUCHE_ACTIVITE)) {
        const maille = map.queryRenderedFeatures(e.point, { layers: [COUCHE_ACTIVITE] })[0];
        const mid = maille?.properties?.id;
        if (mid) {
          window.dispatchEvent(new CustomEvent('pigap-maille-select', { detail: { id: String(mid) } }));
          return;
        }
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
    const onMaille = (ev: Event) => {
      const id = (ev as CustomEvent).detail?.id as string;
      setMailleId(id);
      setPanel('heures');
    };
    window.addEventListener('pigap-zone-corner', onCorner);
    window.addEventListener('pigap-zone-select', onSelect);
    window.addEventListener('pigap-zone-detect', onDetect);
    window.addEventListener('pigap-maille-select', onMaille);
    return () => {
      window.removeEventListener('pigap-zone-corner', onCorner);
      window.removeEventListener('pigap-zone-select', onSelect);
      window.removeEventListener('pigap-zone-detect', onDetect);
      window.removeEventListener('pigap-maille-select', onMaille);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    const draw = () => {
      syncZonesOnMap(map, visibleZones, { selectedId, visible: true });
      syncPreviewBbox(map, draftBbox);
      // Cadrage auto seulement si les zones forment un secteur lisible
      // (évite un zoom national qui rend les polygones invisibles).
      if (!didFit.current && visibleZones.length) {
        const ext = zonesExtent(visibleZones);
        const spanOk =
          ext != null && ext.maxLon - ext.minLon <= 1.6 && ext.maxLat - ext.minLat <= 1.6;
        if (spanOk) fitMapToZones(map, visibleZones);
        didFit.current = true;
      }
    };
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [visibleZones, selectedId, draftBbox]);

  const onCarteHeures = useCallback((data: MaillesActivite | null, classes: ClasseActivite[]) => {
    setMailles(data);
    setClassesHeures(classes);
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;
    map.getCanvas().dataset.heures = heuresOverlay ? '1' : '';
    const draw = () => syncActiviteOnMap(map, heuresOverlay ? mailles : null, classesHeures, mailleId);
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [heuresOverlay, mailles, classesHeures, mailleId]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !heuresOverlay || !map.getLayer(COUCHE_ACTIVITE)) return;
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const leave = () => {
      const m = map.getCanvas().dataset.mode;
      map.getCanvas().style.cursor = m === 'dessiner' || m === 'tester' ? 'crosshair' : '';
    };
    map.on('mouseenter', COUCHE_ACTIVITE, enter);
    map.on('mouseleave', COUCHE_ACTIVITE, leave);
    return () => {
      map.off('mouseenter', COUCHE_ACTIVITE, enter);
      map.off('mouseleave', COUCHE_ACTIVITE, leave);
    };
  }, [heuresOverlay, mailles]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !selectedId) return;
    const z = zones.find((x) => x.id === selectedId);
    if (z) fitMapToZone(map, z);
  }, [selectedId, zones]);

  // Zone choisie dans la recherche globale : sélectionnée ici, cadrée par l'effet ci-dessus.
  useEffect(() => {
    if (initialZoneId) setSelectedId(initialZoneId);
  }, [initialZoneId]);

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
      onError('Cliquez deux coins sur la carte pour dessiner la zone');
      return;
    }
    if (!nom.trim()) {
      onError('Donnez un nom à la zone');
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
      setZoneModalOpen(false);
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
    setZoneModalOpen(false);
    setFlash('Cliquez le premier coin sur la carte');
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
          : 'Les 3 zones d’exemple sont déjà présentes',
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
        ? 'Étape 2 sur 2 : cliquez le coin opposé'
        : cornerA && cornerB
          ? 'Rectangle prêt : nommez-le et validez dans le panneau Zones'
          : 'Étape 1 sur 2 : cliquez un premier coin'
      : mode === 'tester'
        ? 'Cliquez un point de la carte pour tester une intrusion'
        : 'Cliquez une zone pour la sélectionner';

  return (
    <section ref={mapStage.stageRef} className="map-stage">
      <div className="map-wrap">
        <div ref={mapRef} className="map" />
        <p className={`map-hint mode-${mode}`}>{hint}</p>
        <aside className="zones-map-key" aria-label="Légende de la carte">
          <span>
            <i className="zones-map-key-swatch" style={{ background: '#059669' }} /> Zone réglementée
          </span>
          <span>
            <i className="zones-map-key-line" /> Contour Gabon (repère)
          </span>
        </aside>
      </div>

      <MapToolbar
        items={[
          {
            id: 'zones',
            label: 'Zones',
            icon: IconMap,
            count: zones.length,
            hint: 'Liste, dessin et test des zones réglementées',
          },
          {
            id: 'heures',
            label: 'Heures',
            icon: IconHotspot,
            hint: 'Heures d’activité par maille, captures et rapport de zone',
          },
        ]}
        active={panel}
        onToggle={(id) => {
          setPanel(id);
          if (id === 'heures') setHeuresOverlay(true);
        }}
        fullscreen={mapStage.fullscreen}
        canFullscreen={mapStage.canFullscreen}
        onFullscreen={mapStage.toggleFullscreen}
      />

      {panel === 'zones' ? (
      <MapPanel
        title="Zones réglementées"
        subtitle="Secteurs ciblés, pas toute la côte."
        onClose={() => setPanel(null)}
      >
        <div className="zones-side">
        <div className="preset-row">
          <button type="button" className="ghost compact" disabled={loading} onClick={() =>
              void loadDemoPresets()}><IconDownload size={16} /> Charger 3 zones d’exemple</button>
          <button
            type="button"
            className="ghost compact"
            disabled={loading || overlapIds.size === 0}
            onClick={() =>
              void purgeOverlapsKeepOne()}
          ><IconTrash size={16} /> Supprimer les doublons</button>
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
              ['voir', 'Voir', IconEye],
              ['dessiner', 'Dessiner', IconEdit],
              ['tester', 'Tester', IconRadar],
            ] as const
          ).map(([id, label, ModeIcon]) => (
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
              <ModeIcon size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="zone-legend zone-legend-rich">
          <span>
            <img src="/icons/zone-interdite.svg" alt="" width="18" height="18" /> interdite
          </span>
          <span>
            <img src="/icons/zone-protegee.svg" alt="" width="18" height="18" /> protégée
          </span>
          <span>
            <img src="/icons/zone-sensible.svg" alt="" width="18" height="18" /> sensible
          </span>
          <span>
            <img src="/icons/zone-autorisee.svg" alt="" width="18" height="18" /> autorisée
          </span>
        </div>

        {flash ? <p className="zones-flash">{flash}</p> : null}

        {mode === 'dessiner' ? (
          <div className="zones-panel">
            <p className="step-chip">
              {draftBbox
                ? 'Rectangle prêt — renseignez le nom et le type'
                : cornerA
                  ? 'Premier coin posé · encore un clic'
                  : 'Deux clics sur la carte pour tracer le rectangle'}
            </p>
            <div className="zone-actions">
              <button
                type="button"
                className="btn-primary"
                disabled={!draftBbox}
                onClick={() => setZoneModalOpen(true)}
              >
                <IconSave size={16} /> Renseigner la zone
              </button>
              <button type="button" className="ghost compact" onClick={resetDraw}>
                <IconRefresh size={16} /> Recommencer
              </button>
            </div>
          </div>
        ) : null}

        {mode === 'tester' ? (
          <div className="zones-panel">
            <p className="side-meta">
              Cliquez sur la carte (dans ou hors d’un polygone). La détection utilise PostGIS
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
              Actives seulement
            </label>
          </div>

          {visibleZones.length === 0 ? (
            <p className="empty-zones">
              Aucune zone. Passez en <strong>Dessiner</strong>, cliquez deux coins, enregistrez.
            </p>
          ) : (
            <table className="ds-table empilable">
              <thead>
                <tr>
                  <th scope="col">Zone</th>
                  <th scope="col">Type</th>
                  <th scope="col">État</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleZones.map((z) => {
                  const on = selectedId === z.id;
                  const stacked = overlapIds.has(z.id);
                  return (
                    <tr
                      key={z.id}
                      className={`is-clickable${on ? ' is-selected' : ''}${!z.actif ? ' is-inactive' : ''}`}
                      onClick={() => {
                        setSelectedId(on ? null : z.id);
                        setMode('voir');
                      }}
                    >
                      <td data-label="Zone">
                        <button type="button" className="ligne-bouton">
                          {z.nom}
                          {stacked ? ' · superposée' : ''}
                        </button>
                      </td>
                      <td data-label="Type">
                        <span className="zone-type-cell">
                          <i
                            className="zone-type-swatch"
                            style={{ background: zoneColor(z.type) }}
                            aria-hidden
                          />
                          {ZONE_TYPE_LABEL[z.type]}
                        </span>
                      </td>
                      <td data-label="État">{z.actif ? 'Active' : 'Inactive'}</td>
                      <td data-label="Actions">
                        <div className="zone-actions" onClick={(e) => e.stopPropagation()}>
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
                            {z.actif ? 'Désactiver' : 'Activer'}
                          </button>
                          <button
                            type="button"
                            className="ghost compact danger-ghost"
                            aria-label={`Supprimer ${z.nom}`}
                            onClick={() => void onDeleteZone(z.id)}
                            disabled={loading}
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
            <button type="submit" disabled={loading}><IconUpload size={16} /> Importer</button>
          </form>
        ) : null}
        </div>
      </MapPanel>
      ) : null}

      {panel === 'heures' ? (
        <MapPanel
          title="Heures d’activité"
          subtitle="Temps passé en mer, hors des ports, à partir des positions suivies."
          onClose={() => setPanel(null)}
        >
          <ActiviteHeuresPanel
            token={token}
            overlay={heuresOverlay}
            onOverlay={setHeuresOverlay}
            zoneId={selectedId}
            zoneNom={zones.find((z) => z.id === selectedId)?.nom ?? null}
            selectionMaille={mailleId}
            onSelectionMaille={setMailleId}
            onCarte={onCarteHeures}
            onError={onError}
          />
        </MapPanel>
      ) : null}

      <Modal
        open={zoneModalOpen}
        title="Enregistrer la zone"
        onClose={() => setZoneModalOpen(false)}
        illustration="zones"
        footer={
          <div className="row-actions">
            <button type="button" className="ghost" onClick={() => setZoneModalOpen(false)}>
              <IconXCircle size={16} /> Annuler
            </button>
            <button type="submit" form="form-zone" className="btn-primary" disabled={loading || !draftBbox}>
              <IconSave size={16} /> {loading ? 'Création…' : 'Enregistrer la zone'}
            </button>
          </div>
        }
      >
        <p className="form-hint">
          Le rectangle est posé sur la carte. Nommez la zone et choisissez son type réglementaire.
        </p>
        <form id="form-zone" className="stack-form form-grille" onSubmit={onConfirmDraw}>
          <label className="form-grille-large">
            Nom de la zone
            <input
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex. Interdiction Estuaire nord"
              required
            />
          </label>
          <label className="form-grille-large">
            Type
            <select
              value={typeZone}
              onChange={(e) => setTypeZone(e.target.value as ZoneReglementee['type'])}
            >
              <option value="interdite">Interdite</option>
              <option value="protegee">Protégée</option>
              <option value="sensible">Sensible</option>
              <option value="autorisee">Autorisée (limite de pêche)</option>
            </select>
          </label>
        </form>
      </Modal>
    </section>
  );
}
