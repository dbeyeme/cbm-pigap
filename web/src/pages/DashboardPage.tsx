import maplibregl from 'maplibre-gl';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { DashboardRead, getDashboard } from '../api';
import CompactList from '../components/CompactList';
import { GABON_COAST_BOUNDS } from '../geo/gabonMaritimeRoutes';
import { MODULE_VISUALS } from '../media';

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function defaultPeriod(): { debut: string; fin: string } {
  const fin = new Date();
  const debut = new Date();
  debut.setUTCMonth(debut.getUTCMonth() - 1);
  return {
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  };
}

export default function DashboardPage({ token, onError }: Props) {
  const period0 = defaultPeriod();
  const [debut, setDebut] = useState(period0.debut);
  const [fin, setFin] = useState(period0.fin);
  const [data, setData] = useState<DashboardRead | null>(null);
  const [loading, setLoading] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);

  async function load(d = debut, f = fin) {
    setLoading(true);
    onError(null);
    try {
      const dash = await getDashboard(token, {
        debut: `${d}T00:00:00.000Z`,
        fin: `${f}T23:59:59.999Z`,
      });
      setData(dash);
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
    if (!mapRef.current || mapObj.current) return;
    const map = new maplibregl.Map({
      container: mapRef.current,
      style: STYLE,
      bounds: [
        [GABON_COAST_BOUNDS.west, GABON_COAST_BOUNDS.south],
        [GABON_COAST_BOUNDS.east, GABON_COAST_BOUNDS.north],
      ],
      fitBoundsOptions: { padding: 28 },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapObj.current = map;
    return () => {
      map.remove();
      mapObj.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !data) return;

    const draw = () => {
      const src = 'dash-activity';
      const layer = 'dash-activity-circles';
      if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(src)) map.removeSource(src);

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
        id: layer,
        type: 'circle',
        source: src,
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'nb'],
            1,
            10,
            10,
            28,
          ],
          'circle-color': '#c9921a',
          'circle-opacity': 0.78,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#5ee4d4',
        },
      });

      if (features.length) {
        const bounds = new maplibregl.LngLatBounds();
        for (const f of features) {
          const c = f.geometry.coordinates as [number, number];
          bounds.extend(c);
        }
        map.fitBounds(bounds, { padding: 48, maxZoom: 9 });
      }
    };

    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [data]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(debut, fin);
  }

  const maxEspece = data?.repartition_especes[0]?.volume_kg || 1;

  return (
    <section className="stage stage-wide dashboard-stage">
      <div className="stage-head page-head-with-icon">
        <img src={MODULE_VISUALS.dashboard.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Module M6 · Zone pilote Estuaire</p>
          <h1>Tableau de bord</h1>
          <p>
            Vue autorités — pêcheurs actifs, captures, alertes et foyers d’activité sur le
            littoral gabonais.
          </p>
        </div>
      </div>

      <form className="login-form dashboard-filter" onSubmit={onFilter}>
        <label>
          Du
          <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} />
        </label>
        <label>
          Au
          <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Calcul…' : 'Actualiser'}
        </button>
      </form>

      <div className="dashboard-grid">
        <div className="dashboard-stat">
          <span>Pêcheurs actifs</span>
          <strong>{data?.pecheurs_actifs ?? '—'}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Volume capturé (kg)</span>
          <strong>{data ? data.volume_total_kg : '—'}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Alertes actives</span>
          <strong>{data?.alertes_actives.length ?? '—'}</strong>
        </div>
        <div className="dashboard-stat">
          <span>Zones actives</span>
          <strong>{data?.zones_forte_activite.length ?? '—'}</strong>
        </div>
      </div>

      <div className="licences-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)' }}>
        <div className="dashboard-panel">
          <h2>Répartition par espèce</h2>
          {!data?.repartition_especes.length ? (
            <p className="empty-list">Aucune capture sur la période.</p>
          ) : (
            <CompactList
              items={data.repartition_especes}
              getKey={(r) => r.espece}
              initial={8}
              renderItem={(r) => (
                <div className="traj-item" style={{ borderLeftColor: 'var(--okoume, #c4a574)' }}>
                  <span className="traj-title">
                    {r.espece} · {r.volume_kg} kg
                  </span>
                  <div className="quota-bar" aria-hidden>
                    <i style={{ width: `${Math.min(100, (r.volume_kg / maxEspece) * 100)}%` }} />
                  </div>
                </div>
              )}
            />
          )}

          <h2 style={{ marginTop: 24 }}>Alertes actives</h2>
          <div className="dashboard-alerts">
            <CompactList
              items={data?.alertes_actives ?? []}
              getKey={(a) => a.id}
              initial={5}
              empty={<p className="empty-list">Aucune alerte nouvelle.</p>}
              renderItem={(a) => (
                <div
                  className={`dashboard-alert ${a.niveau_gravite === 'critique' ? 'danger' : 'warn'}`}
                >
                  <strong>
                    {a.type.replaceAll('_', ' ')} · {a.niveau_gravite}
                  </strong>
                  <span>
                    {String(a.declencheur.espece ?? a.declencheur.regle ?? '—')} ·{' '}
                    {new Date(a.horodatage).toLocaleString('fr-FR')}
                  </span>
                </div>
              )}
            />
          </div>
        </div>

        <div className="dashboard-panel">
          <h2>Zones à forte activité</h2>
          <p className="landing-section-lede" style={{ marginBottom: 12 }}>
            Captures géolocalisées intersectant les polygones réglementés (Estuaire &amp;
            littoral).
          </p>
          <div className="dashboard-map-slot" ref={mapRef} />
          <CompactList
            items={data?.zones_forte_activite ?? []}
            getKey={(z) => `${z.label}-${z.nb_captures}-${z.volume_kg}`}
            initial={5}
            empty={<p className="empty-list">Pas encore de foyer cartographié sur la période.</p>}
            renderItem={(z) => (
              <div className="traj-item" style={{ borderLeftColor: 'var(--sun)' }}>
                <span className="traj-title">{z.label ?? 'Zone'}</span>
                <span className="traj-meta">
                  {z.nb_captures} capture(s) · {z.volume_kg} kg
                </span>
              </div>
            )}
          />
          {data ? (
            <p className="traj-meta" style={{ marginTop: 12 }}>
              Calculé le {new Date(data.genere_a).toLocaleString('fr-FR')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
