import maplibregl from 'maplibre-gl';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  DashboardRead,
  DashboardSeries,
  getDashboard,
  getDashboardSeries,
  getPredictions,
  listLiveVessels,
  LiveVessel,
  PredictionsRead,
  alertTypeLabel,
  alertRuleLabel,
  graviteLabel,
  getBulletinMeteo,
  type BulletinMeteoMarine,
} from '../api';
import KpiCard from '../components/KpiCard';
import PageBanner from '../components/PageBanner';
import PredictionStrip from '../components/PredictionStrip';
import StatusPill from '../components/StatusPill';
import TrendCharts from '../components/TrendCharts';
import {
  IconAlert,
  IconCalendar,
  IconCard,
  IconCoast,
  IconEstuary,
  IconFish,
  IconHotspot,
  IconPirogue,
  IconRadar,
  IconReceipt,
  IconRefresh,
  IconRiver,
  IconShield,
  IconShip,
  IconUsers,
} from '../components/Icons';
import { syncGabonBoundariesOnMap } from '../geo/gabonBoundary';
import {
  clearMarkers,
  coordsFromDeclencheur,
  placeAlertMarkers,
  placeShipMarkers,
  VesselKind,
} from '../geo/mapEffects';
import { GABON_MAP_VIEW, GABON_SATELLITE_STYLE } from '../geo/mapStyle';
import {
  classePastilleRegularite,
  libelleRegularite,
} from '../lib/regularite';
import type { NavId } from '../nav';
import BulletinStrip from '../components/BulletinStrip';
import HelpTip from '../components/HelpTip';

type Sector = 'cotes' | 'fleuves' | 'bras';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
  onNavigate?: (id: NavId) => void;
};

const LIVE_POLL_MS = 20_000;

const SECTOR_META: Record<
  Sector,
  { label: string; Icon: typeof IconCoast }
> = {
  cotes: { label: 'Côtes', Icon: IconCoast },
  fleuves: { label: 'Fleuves', Icon: IconRiver },
  bras: { label: 'Bras de mer', Icon: IconEstuary },
};

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

function matchesSector(v: LiveVessel, sector: Sector): boolean {
  if (sector === 'cotes') return v.secteur === 'cote';
  if (sector === 'bras') return v.secteur === 'bras_mer';
  return v.secteur === 'fleuve';
}

function defaultPeriod(): { debut: string; fin: string } {
  const fin = new Date();
  const debut = new Date();
  debut.setUTCMonth(debut.getUTCMonth() - 1);
  return {
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  };
}

function graviteTone(g: string): 'danger' | 'warn' | 'info' | 'ok' {
  if (g === 'critique') return 'danger';
  if (g === 'elevee' || g === 'élevée') return 'warn';
  if (g === 'faible') return 'ok';
  return 'info';
}

function formatAge(sec: number): string {
  if (sec < 60) return `${sec} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${Math.round(sec / 3600)} h`;
}

const SIGNAL_LABEL: Record<string, string> = {
  actif: 'Actif',
  recent: 'Récent',
  silence: 'Sans signal',
};

const KIND_LABEL: Record<VesselKind, string> = {
  pirogue: 'Pirogue',
  navire: 'Navire',
};

export default function DashboardPage({ token, onError, onNavigate }: Props) {
  const period0 = defaultPeriod();
  const [debut, setDebut] = useState(period0.debut);
  const [fin, setFin] = useState(period0.fin);
  const [data, setData] = useState<DashboardRead | null>(null);
  const [series, setSeries] = useState<DashboardSeries | null>(null);
  const [preds, setPreds] = useState<PredictionsRead | null>(null);
  const [live, setLive] = useState<LiveVessel[]>([]);
  const [loading, setLoading] = useState(false);
  const [bulletin, setBulletin] = useState<BulletinMeteoMarine | null>(null);
  useEffect(() => {
    let cancelled = false;
    getBulletinMeteo(token)
      .then((b) => {
        if (!cancelled) setBulletin(b);
      })
      .catch(() => undefined);
    const id = window.setInterval(() => {
      getBulletinMeteo(token)
        .then((b) => {
          if (!cancelled) setBulletin(b);
        })
        .catch(() => undefined);
    }, 10 * 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);
  const [sector, setSector] = useState<Sector>('cotes');
  const [recordsTab, setRecordsTab] = useState<'foyers' | 'especes' | 'alertes'>('foyers');
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);
  const shipMarkers = useRef<maplibregl.Marker[]>([]);
  const alertMarkers = useRef<maplibregl.Marker[]>([]);
  const fittedLive = useRef(false);

  async function load(d = debut, f = fin) {
    setLoading(true);
    onError(null);
    try {
      const [dash, serie, pred] = await Promise.all([
        getDashboard(token, {
          debut: `${d}T00:00:00.000Z`,
          fin: `${f}T23:59:59.999Z`,
        }),
        getDashboardSeries(token, {
          debut: `${d}T00:00:00.000Z`,
          fin: `${f}T23:59:59.999Z`,
          grain: 'semaine',
        }),
        getPredictions(token, 30).catch(() => null),
      ]);
      setData(dash);
      setSeries(serie);
      setPreds(pred);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Dashboard indisponible');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const fleet = await listLiveVessels(token, 360);
        if (!cancelled) setLive(fleet);
      } catch {
        /* soft */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [token]);

  useEffect(() => {
    if (!mapRef.current || mapObj.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: GABON_SATELLITE_STYLE,
      center: GABON_MAP_VIEW.center,
      zoom: GABON_MAP_VIEW.zoom,
      maxBounds: GABON_MAP_VIEW.maxBounds,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      void syncGabonBoundariesOnMap(map);
      requestAnimationFrame(() => map.resize());
    });
    mapObj.current = map;
    return () => {
      clearMarkers(shipMarkers.current);
      clearMarkers(alertMarkers.current);
      map.remove();
      mapObj.current = null;
    };
  }, []);

  const liveFiltered = useMemo(
    () => live.filter((v) => matchesSector(v, sector)),
    [live, sector],
  );

  useEffect(() => {
    const map = mapObj.current;
    if (!map) return;

    const place = () => {
      placeShipMarkers(
        map,
        liveFiltered.map((v) => ({
          lng: v.position.coordinates[0],
          lat: v.position.coordinates[1],
          kind: vesselKind(v.type),
          label: v.nom,
          statut: v.statut,
          alert: v.statut === 'silence',
          regularite: v.regularite ?? undefined,
          regulariteLibelle: v.regularite_libelle,
          ageLibelle: v.age_libelle,
          perimee: v.perimee,
        })),
        shipMarkers.current,
      );

      if (!fittedLive.current && liveFiltered.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        liveFiltered.forEach((v) => bounds.extend(v.position.coordinates));
        map.fitBounds(bounds, { padding: 56, maxZoom: 9.5, duration: 700 });
        fittedLive.current = true;
      }
      requestAnimationFrame(() => map.resize());
    };

    if (map.isStyleLoaded()) place();
    else map.once('load', place);
  }, [liveFiltered]);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !data) return;

    const draw = () => {
      const src = 'dash-activity';
      const layer = 'dash-activity-circles';
      const glow = 'dash-activity-glow';
      if (map.getLayer(glow)) map.removeLayer(glow);
      if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(src)) map.removeSource(src);
      void syncGabonBoundariesOnMap(map);

      const features = data.zones_forte_activite.map((z) => ({
        type: 'Feature' as const,
        properties: {
          label: z.label ?? 'Zone',
          nb: z.nb_captures,
          vol: z.volume_kg,
        },
        geometry: z.centre,
      }));

      map.addSource(src, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      });
      map.addLayer({
        id: glow,
        type: 'circle',
        source: src,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'nb'], 1, 14, 10, 32],
          'circle-color': '#38bdf8',
          'circle-opacity': 0.14,
          'circle-blur': 0.55,
        },
      });
      map.addLayer({
        id: layer,
        type: 'circle',
        source: src,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'nb'], 1, 5, 10, 14],
          'circle-color': '#0ea5e9',
          'circle-opacity': 0.35,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      const alertPts = data.alertes_actives
        .map((a) => {
          const c = coordsFromDeclencheur(a.declencheur);
          if (!c) return null;
          return {
            lng: c[0],
            lat: c[1],
            label: `${alertTypeLabel(a.type)} · ${graviteLabel(a.niveau_gravite)}`,
          };
        })
        .filter((p): p is { lng: number; lat: number; label: string } => p != null);
      placeAlertMarkers(map, alertPts, alertMarkers.current, { max: 35 });
      requestAnimationFrame(() => map.resize());
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [data]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(debut, fin);
  }

  const alertCount = data?.alertes_actives.length ?? 0;
  const geoAlertCount = (data?.alertes_actives ?? []).filter((a) =>
    coordsFromDeclencheur(a.declencheur),
  ).length;

  const maxEspece = Math.max(1, ...(data?.repartition_especes.map((r) => r.volume_kg) ?? [1]));

  const especeSlices = useMemo(() => {
    const rows = data?.repartition_especes.slice(0, 4) ?? [];
    const total = rows.reduce((s, r) => s + r.volume_kg, 0) || 1;
    return rows.map((r) => ({
      label: r.espece,
      pct: Math.round((r.volume_kg / total) * 100),
      kg: r.volume_kg,
    }));
  }, [data]);

  const sectorHint =
    sector === 'cotes'
      ? `Littoral atlantique · ${liveFiltered.length} position${liveFiltered.length > 1 ? 's' : ''} GPS récente${liveFiltered.length > 1 ? 's' : ''}`
      : sector === 'fleuves'
        ? `Corridors fluviaux · ${liveFiltered.length} position${liveFiltered.length > 1 ? 's' : ''} GPS récente${liveFiltered.length > 1 ? 's' : ''}`
        : `Bras de mer et estuaires · ${liveFiltered.length} position${liveFiltered.length > 1 ? 's' : ''} GPS récente${liveFiltered.length > 1 ? 's' : ''}`;

  return (
    <section className="dash dash-dense dash-scenic">
      <PageBanner
        photo="filiere"
        eyebrow="Pilotage · temps réel"
        title="Tableau de bord"
        actions={
        <form className="dash-period-bar" onSubmit={onFilter} aria-label="Période des indicateurs">
          <span className="dash-period-label">
            <IconCalendar size={14} /> Période
          </span>
          <label className="dash-period-field">
            <span className="sr-only">Du</span>
            <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
          </label>
          <span className="dash-period-sep" aria-hidden>
            →
          </span>
          <label className="dash-period-field">
            <span className="sr-only">Au</span>
            <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </label>
          <button type="submit" disabled={loading} className="dash-btn-refresh">
            <IconRefresh size={16} />
            {loading ? 'Calcul…' : 'Actualiser'}
          </button>
        </form>
        }
      />

      <div className="ds-kpi-row ds-rise-in">
        <KpiCard
          label="Acteurs enregistrés"
          value={data?.pecheurs_actifs ?? '—'}
          icon={<IconUsers size={22} />}
        />
        <KpiCard
          label="Foyers d’activité"
          value={data?.zones_forte_activite.length ?? '—'}
          hint="Zones à forte capture"
          icon={<IconHotspot size={22} />}
        />
        <KpiCard
          label="Captures déclarées (kg)"
          value={data ? data.volume_total_kg.toLocaleString('fr-FR') : '—'}
          icon={<IconFish size={22} />}
        />
        <KpiCard
          label="Alertes en cours"
          value={alertCount || '—'}
          tone={alertCount > 0 ? 'danger' : 'ok'}
          hint={alertCount > 0 ? 'À traiter en priorité' : 'Situation calme'}
          icon={<IconAlert size={22} />}
        />
      </div>

      <div className="ds-kpi-row ds-rise-in dash-kpi-effort">
        <KpiCard
          label="Débarquements"
          value={data?.nb_debarquements ?? '—'}
          hint={data ? `${data.jours_de_peche ?? 0} jour(s) de pêche · ${Math.round(data.kg_par_jour_de_peche ?? 0)} kg par jour` : undefined}
          icon={<IconPirogue size={22} />}
        />
        <KpiCard
          label="Valeur estimée"
          value={data ? `${Math.round(data.valeur_estimee_fcfa ?? 0).toLocaleString('fr-FR')} FCFA` : '—'}
          hint={
            data
              ? `Prix déclaré, sinon référence 2024 · ${data.valeur_estimee_couverture_pct ?? 0} % du volume couvert`
              : undefined
          }
          icon={<IconCard size={22} />}
        />
        <KpiCard
          label="Taxe à la production"
          value={data ? `${Math.round(data.taxe_due_fcfa ?? 0).toLocaleString('fr-FR')} FCFA dus` : '—'}
          hint={data ? `${Math.round(data.taxe_payee_fcfa ?? 0).toLocaleString('fr-FR')} FCFA encaissés` : undefined}
          tone={data && (data.taxe_due_fcfa ?? 0) > 0 ? 'warn' : 'default'}
          icon={<IconReceipt size={22} />}
        />
        <KpiCard
          label="Licences expirées"
          value={data?.licences_expirees ?? '—'}
          hint={data ? `${data.licences_valides ?? 0} licences valides · ${data.controles_periode ?? 0} contrôle(s), ${data.infractions_periode ?? 0} infraction(s)` : undefined}
          tone={data && (data.licences_expirees ?? 0) > 0 ? 'danger' : 'ok'}
          icon={<IconShield size={22} />}
        />
      </div>

      <BulletinStrip bulletin={bulletin} onNavigate={onNavigate} />

      <HelpTip title="Comment exploiter le tableau de bord" variant="encart" className="dash-guide">
        <ul>
          <li>
            <strong>Indicateurs</strong> : effectifs, foyers d'activité, volumes déclarés et alertes
            sur la période choisie en haut à droite.
          </li>
          <li>
            <strong>Bulletin de mer</strong> : secteurs à risque, favorables ou surexploités,
            recalculés toutes les trente minutes ; les pêcheurs reçoivent le même avis sur mobile.
          </li>
          <li>
            <strong>Carte</strong> : basculez côtes, fleuves et bras de mer ; cliquez un navire pour
            sa fiche complète dans la vue Navires.
          </li>
          <li>
            <strong>Alertes</strong> : traitez-les depuis la colonne de droite ou la page Alertes ;
            chaque alerte indique la règle qui l'a déclenchée.
          </li>
        </ul>
      </HelpTip>

      <div className="dash-main-grid dash-main-grid-hero">
        <div className="ds-panel dash-map-panel dash-map-panel-v2 dash-map-hero">
          <div className="dash-map-toolbar dash-map-toolbar-compact">
            <div className="dash-map-title-row">
              <span className="dash-panel-icon" aria-hidden>
                <IconRadar size={18} />
              </span>
              <div>
                <p className="dash-map-kicker">Surveillance live</p>
                <h2>Suivi des navires</h2>
              </div>
            </div>
            <div className="dash-map-sectors" role="tablist" aria-label="Secteur">
              {(Object.keys(SECTOR_META) as Sector[]).map((id) => {
                const { label, Icon } = SECTOR_META[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    className={`dash-sector-btn${sector === id ? ' on' : ''}`}
                    aria-selected={sector === id}
                    onClick={() => {
                      fittedLive.current = false;
                      setSector(id);
                    }}
                  >
                    <Icon size={15} />
                    {label}
                    <span>{live.filter((v) => matchesSector(v, id)).length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="dashboard-map-slot dash-map-viewport dash-map-viewport-hero" ref={mapRef} />

          <div className="dash-map-foot">
            <span className="dash-map-key">
              <i className="lg-ok" /> Actifs {live.filter((v) => v.statut === 'actif').length}
            </span>
            <span className="dash-map-key">
              <IconPirogue size={14} /> Pirogue
            </span>
            <span className="dash-map-key">
              <IconShip size={14} /> Chaloupe / navire
            </span>
            <span className="dash-map-key">
              <IconAlert size={14} /> Alertes géoloc. {geoAlertCount}
            </span>
            <span className="dash-map-key muted">{sectorHint}</span>
          </div>
        </div>

        <aside className="dash-side-rail">
          <div className="ds-panel">
            <div className="dash-panel-head">
              <h2>
                <IconShip size={16} /> Signaux
              </h2>
            </div>
            {liveFiltered.length === 0 ? (
              <p className="empty-list">Aucun signal live sur ce secteur.</p>
            ) : (
              <table className="ds-table empilable">
                <thead>
                  <tr>
                    <th scope="col">Embarcation</th>
                    <th scope="col">Type</th>
                    <th scope="col">État</th>
                    <th scope="col">Régularité</th>
                    <th scope="col">Âge</th>
                  </tr>
                </thead>
                <tbody>
                  {liveFiltered.slice(0, 12).map((v) => {
                    const kind = vesselKind(v.type);
                    return (
                      <tr
                        key={v.embarcation_id}
                        className="is-clickable"
                        onClick={() => {
                          const map = mapObj.current;
                          if (map) {
                            map.flyTo({ center: v.position.coordinates, zoom: 10 });
                          }
                        }}
                      >
                        <td data-label="Embarcation">
                          <button type="button" className="ligne-bouton">
                            {v.nom}
                          </button>
                        </td>
                        <td data-label="Type">{KIND_LABEL[kind]}</td>
                        <td data-label="État">
                          <StatusPill
                            label={SIGNAL_LABEL[v.statut] ?? v.statut}
                            tone={v.statut === 'actif' ? 'ok' : v.statut === 'silence' ? 'warn' : 'info'}
                          />
                        </td>
                        <td data-label="Régularité">
                          <span className={classePastilleRegularite(v.regularite)}>
                            {libelleRegularite(v.regularite, v.regularite_libelle)}
                          </span>
                        </td>
                        <td data-label="Âge">{v.age_libelle ?? formatAge(v.age_seconds)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="ds-panel">
            <div className="dash-panel-head">
              <h2>
                <IconAlert size={16} /> Alertes
              </h2>
            </div>
            {(data?.alertes_actives ?? []).length === 0 ? (
              <p className="empty-list">Aucune alerte — situation calme.</p>
            ) : (
              <table className="ds-table empilable">
                <thead>
                  <tr>
                    <th scope="col">Type</th>
                    <th scope="col">Gravité</th>
                    <th scope="col">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.alertes_actives ?? []).slice(0, 8).map((a) => (
                    <tr
                      key={a.id}
                      className="is-clickable"
                      onClick={() => onNavigate?.('alertes')}
                    >
                      <td data-label="Type">
                        <button type="button" className="ligne-bouton">
                          {alertTypeLabel(a.type)}
                        </button>
                      </td>
                      <td data-label="Gravité">
                        <StatusPill
                          label={graviteLabel(a.niveau_gravite)}
                          tone={graviteTone(a.niveau_gravite)}
                        />
                      </td>
                      <td data-label="Date">{new Date(a.horodatage).toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </aside>
      </div>

      <div className="dash-analyse">
        <PredictionStrip data={preds} onNavigate={onNavigate} />

        <div className="ds-panel dash-charts-panel">
          <div className="dash-panel-head">
            <h2>
              <IconFish size={16} /> Tendances
            </h2>
          </div>
          <TrendCharts series={series} compact />
        </div>

        {(especeSlices.length > 0 || (data?.zones_forte_activite.length ?? 0) > 0) && (
          <div className="ds-panel">
            <div className="dash-panel-head">
              <h2>
                <IconFish size={16} /> Répartition par espèce
              </h2>
            </div>
            {!especeSlices.length ? (
              <p className="empty-list">Pas encore de volumes à répartir.</p>
            ) : (
              <ul className="dash-donut-legend">
                {especeSlices.map((s) => (
                  <li key={s.label}>
                    <span>{s.label}</span>
                    <strong>{s.pct}%</strong>
                    <div className="quota-bar" aria-hidden>
                      <i style={{ width: `${Math.min(100, (s.kg / maxEspece) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ds-panel dash-records">
        <div className="ds-hub-tabs" role="tablist">
          {(
            [
              ['foyers', 'Foyers', IconHotspot],
              ['especes', 'Espèces', IconFish],
              ['alertes', 'Journal alertes', IconAlert],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`ds-hub-tab${recordsTab === id ? ' ds-hub-tab-on' : ''}`}
              aria-selected={recordsTab === id}
              onClick={() => setRecordsTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        {recordsTab === 'alertes' ? (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Gravité</th>
                <th>Détail</th>
              </tr>
            </thead>
            <tbody>
              {(data?.alertes_actives ?? []).slice(0, 8).map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.horodatage).toLocaleString('fr-FR')}</td>
                  <td>{alertTypeLabel(a.type)}</td>
                  <td>
                    <StatusPill label={graviteLabel(a.niveau_gravite)} tone={graviteTone(a.niveau_gravite)} />
                  </td>
                  <td>{alertRuleLabel(a.declencheur.espece ?? a.declencheur.regle)}</td>
                </tr>
              ))}
              {!data?.alertes_actives.length ? (
                <tr>
                  <td colSpan={4}>Aucune alerte</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
        {recordsTab === 'foyers' ? (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Captures</th>
                <th>Volume (kg)</th>
              </tr>
            </thead>
            <tbody>
              {(data?.zones_forte_activite ?? []).map((z, i) => (
                <tr key={`${z.label}-${i}`}>
                  <td>{z.label ?? 'Zone'}</td>
                  <td>{z.nb_captures}</td>
                  <td>{z.volume_kg}</td>
                </tr>
              ))}
              {!data?.zones_forte_activite.length ? (
                <tr>
                  <td colSpan={3}>Aucun foyer</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
        {recordsTab === 'especes' ? (
          <table className="ds-table">
            <thead>
              <tr>
                <th>Espèce</th>
                <th>Volume (kg)</th>
              </tr>
            </thead>
            <tbody>
              {(data?.repartition_especes ?? []).map((r) => (
                <tr key={r.espece}>
                  <td>{r.espece}</td>
                  <td>{r.volume_kg}</td>
                </tr>
              ))}
              {!data?.repartition_especes.length ? (
                <tr>
                  <td colSpan={2}>Aucune espèce</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : null}
        {data ? (
          <p className="traj-meta" style={{ marginTop: 12 }}>
            Calculé le {new Date(data.genere_a).toLocaleString('fr-FR')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
