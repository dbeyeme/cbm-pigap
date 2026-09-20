import maplibregl from 'maplibre-gl';
import { FormEvent, useEffect, useRef, useState } from 'react';

import {
  DashboardRead,
  DashboardSeries,
  GrainSerie,
  downloadBilanPdf,
  downloadFichePecheurPdf,
  downloadLicencePdf,
  downloadRapport,
  getDashboard,
  getDashboardSeries,
  getPredictions,
  listPecheurs,
  Pecheur,
  PredictionsRead,
} from '../api';
import KpiCard from '../components/KpiCard';
import StatusPill from '../components/StatusPill';
import TrendCharts, { AlertTrendChart } from '../components/TrendCharts';
import { IconDownload, IconRefresh, IconReport, IconUsers } from '../components/Icons';
import { useToast } from '../components/ToastProvider';
import { syncGabonBoundariesOnMap } from '../geo/gabonBoundary';
import { GABON_MAP_VIEW, GABON_SATELLITE_STYLE } from '../geo/mapStyle';
import Illustration from '../components/Illustration';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function defaultPeriod(): { debut: string; fin: string } {
  const fin = new Date();
  const debut = new Date();
  debut.setUTCFullYear(debut.getUTCFullYear() - 1);
  return {
    debut: debut.toISOString().slice(0, 10),
    fin: fin.toISOString().slice(0, 10),
  };
}

function isoBounds(debut: string, fin: string): { debut: string; fin: string } {
  return {
    debut: `${debut}T00:00:00.000Z`,
    fin: `${fin}T23:59:59.999Z`,
  };
}

function risqueTone(r: string): 'danger' | 'warn' | 'ok' | 'info' {
  if (r === 'eleve') return 'danger';
  if (r === 'moyen') return 'warn';
  if (r === 'faible') return 'ok';
  return 'info';
}

export default function RapportsPage({ token, onError }: Props) {
  const toast = useToast();
  const period0 = defaultPeriod();
  const [debut, setDebut] = useState(period0.debut);
  const [fin, setFin] = useState(period0.fin);
  const [grain, setGrain] = useState<GrainSerie>('semaine');
  const [data, setData] = useState<DashboardRead | null>(null);
  const [series, setSeries] = useState<DashboardSeries | null>(null);
  const [preds, setPreds] = useState<PredictionsRead | null>(null);
  const [pecheurs, setPecheurs] = useState<Pecheur[]>([]);
  const [pecheurId, setPecheurId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapObj = useRef<maplibregl.Map | null>(null);

  async function load(d = debut, f = fin, g = grain) {
    setLoading(true);
    onError(null);
    try {
      const bounds = isoBounds(d, f);
      const [dash, list, serie, pred] = await Promise.all([
        getDashboard(token, bounds),
        listPecheurs(token),
        getDashboardSeries(token, { ...bounds, grain: g }),
        getPredictions(token, 30),
      ]);
      setData(dash);
      setSeries(serie);
      setPreds(pred);
      setPecheurs(list);
      setPecheurId((prev) => prev || list[0]?.id || '');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Rapports indisponibles');
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
      map.remove();
      mapObj.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapObj.current;
    if (!map || !preds) return;
    const draw = () => {
      const src = 'rapports-risk';
      const glow = 'rapports-risk-glow';
      const layer = 'rapports-risk-circles';
      if (map.getLayer(glow)) map.removeLayer(glow);
      if (map.getLayer(layer)) map.removeLayer(layer);
      if (map.getSource(src)) map.removeSource(src);
      const features = preds.zones_incidents
        .filter((z) => z.centre)
        .map((z) => ({
          type: 'Feature' as const,
          properties: { label: z.zone_nom, score: z.score },
          geometry: z.centre!,
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
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 0, 10, 1, 34],
          'circle-color': '#ef4444',
          'circle-opacity': 0.16,
          'circle-blur': 0.5,
        },
      });
      map.addLayer({
        id: layer,
        type: 'circle',
        source: src,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'score'], 0, 5, 1, 16],
          'circle-color': '#dc2626',
          'circle-opacity': 0.45,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });
      requestAnimationFrame(() => map.resize());
    };
    if (map.isStyleLoaded()) draw();
    else map.once('load', draw);
  }, [preds]);

  function onFilter(e: FormEvent) {
    e.preventDefault();
    void load(debut, fin, grain);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    onError(null);
    try {
      await action();
      toast.success('Document généré', label);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Génération impossible';
      onError(msg);
      toast.error('Génération impossible', msg);
    } finally {
      setBusy(null);
    }
  }

  const bounds = isoBounds(debut, fin);
  const pecheurOk = Boolean(pecheurId);

  return (
    <section className="stage stage-wide">
      <div className="stage-head page-head-with-icon page-head-illustrated">
        <Illustration name="rapports" size={104} className="page-illustration" />
        <div>
          <p className="eyebrow">Pilotage · Rapports</p>
          <h1>Rapports et documents</h1>
          <p>
            Tendances saisonnières, prévisions consultatives et pièces officielles : licence,
            fiche, bilan, rapport.
          </p>
        </div>
      </div>

      <form className="dash-period-bar dash-period-bar--rapports" onSubmit={onFilter} aria-label="Période et grain">
        <span className="dash-period-label">Période</span>
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
        <label className="dash-period-field">
          <span className="sr-only">Grain</span>
          <select
            value={grain}
            onChange={(e) => setGrain(e.target.value as GrainSerie)}
            aria-label="Grain d’agrégation"
          >
            <option value="jour">Jour</option>
            <option value="semaine">Semaine</option>
            <option value="mois">Mois</option>
          </select>
        </label>
        <label className="dash-period-field dash-period-field--wide">
          <span className="sr-only">Pêcheur</span>
          <select
            value={pecheurId}
            onChange={(e) => setPecheurId(e.target.value)}
            aria-label="Pêcheur pour licence, fiche, bilan"
          >
            {pecheurs.length === 0 ? <option value="">Aucun pêcheur</option> : null}
            {pecheurs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.prenom} {p.nom} · {p.numero_licence}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={loading} className="dash-btn-refresh"><IconRefresh size={16} /> {loading ? 'Calcul…' : 'Actualiser'}</button>
      </form>

      <div className="docs-grid">
        <article className="doc-card">
          <div className="doc-card-icon" aria-hidden>
            <IconReport />
          </div>
          <h3>Rapport de pilotage</h3>
          <p>
            Indicateurs M6 sur la période : pêcheurs actifs, volumes, espèces, alertes,
            foyers d’activité.
          </p>
          <div className="doc-card-actions">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() =>
                void run('Rapport PDF', () =>
                  downloadRapport(token, { ...bounds, format: 'pdf' }),
                )
              }
            ><IconDownload size={16} /> {busy === 'Rapport PDF' ? 'Génération…' : 'Télécharger PDF'}</button>
            <button
              type="button"
              className="ghost"
              disabled={busy !== null}
              onClick={() =>
                void run('Rapport CSV', () =>
                  downloadRapport(token, { ...bounds, format: 'csv' }),
                )
              }
            >
              {busy === 'Rapport CSV' ? 'Génération…' : 'Export CSV'}
            </button>
          </div>
        </article>

        <article className="doc-card">
          <div className="doc-card-icon" aria-hidden>
            <IconUsers />
          </div>
          <h3>Bilan d’activité</h3>
          <p>
            Captures, quotas concernés et alertes du pêcheur sélectionné, sur la même
            période.
          </p>
          <div className="doc-card-actions">
            <button
              type="button"
              disabled={busy !== null || !pecheurOk}
              onClick={() =>
                void run('Bilan PDF', () => downloadBilanPdf(token, pecheurId, bounds))
              }
            ><IconDownload size={16} /> {busy === 'Bilan PDF' ? 'Génération…' : 'Télécharger PDF'}</button>
          </div>
        </article>

        <article className="doc-card">
          <div className="doc-card-icon" aria-hidden>
            <IconReport />
          </div>
          <h3>Licence de pêche</h3>
          <p>
            Document titulaire + embarcations (registre M1). Aussi disponible depuis
            Acteurs → Licences.
          </p>
          <div className="doc-card-actions">
            <button
              type="button"
              disabled={busy !== null || !pecheurOk}
              onClick={() =>
                void run('Licence PDF', () => downloadLicencePdf(token, pecheurId))
              }
            ><IconDownload size={16} /> {busy === 'Licence PDF' ? 'Génération…' : 'Télécharger PDF'}</button>
          </div>
        </article>

        <article className="doc-card">
          <div className="doc-card-icon" aria-hidden>
            <IconUsers />
          </div>
          <h3>Fiche d’enregistrement</h3>
          <p>
            Identité, contact, organisation et embarcations. Pour une demande FO, ouvrez
            Acteurs → Demandes.
          </p>
          <div className="doc-card-actions">
            <button
              type="button"
              disabled={busy !== null || !pecheurOk}
              onClick={() =>
                void run('Fiche PDF', () => downloadFichePecheurPdf(token, pecheurId))
              }
            ><IconDownload size={16} /> {busy === 'Fiche PDF' ? 'Génération…' : 'Télécharger PDF'}</button>
          </div>
        </article>
      </div>

      <div className="ds-kpi-row">
        <KpiCard label="Acteurs actifs" value={data?.pecheurs_actifs ?? '—'} />
        <KpiCard
          label="Volume déclaré (kg)"
          value={data ? data.volume_total_kg.toLocaleString('fr-FR') : '—'}
        />
        <KpiCard
          label="Alertes actives"
          value={data?.alertes_actives.length ?? '—'}
          tone={(data?.alertes_actives.length ?? 0) > 0 ? 'danger' : 'default'}
        />
        <KpiCard
          label="Foyers d’activité"
          value={data?.zones_forte_activite.length ?? '—'}
        />
      </div>

      <TrendCharts series={series} showSeasonSplit />
      <AlertTrendChart series={series} />

      <div className="rapports-pred-grid">
        <div className="ds-panel">
          <h2>Prévisions de pêche</h2>
          <p className="chart-legend-text">
            Horizon {preds?.horizon_jours ?? 30} jours
            {preds?.mode === 'insuffisant' ? ' · historique insuffisant (moyenne récente)' : ''}.
          </p>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Espèce</th>
                <th>Prévu (kg)</th>
                <th>Intervalle</th>
                <th>Modèle</th>
              </tr>
            </thead>
            <tbody>
              {(preds?.peches ?? []).map((p) => (
                <tr key={p.espece}>
                  <td>{p.espece}</td>
                  <td>{p.volume_prevu_kg.toLocaleString('fr-FR')}</td>
                  <td>
                    {p.intervalle_bas_kg.toLocaleString('fr-FR')} –{' '}
                    {p.intervalle_haut_kg.toLocaleString('fr-FR')}
                  </td>
                  <td>{String(p.justification.modele ?? '—')}</td>
                </tr>
              ))}
              {!preds?.peches.length ? (
                <tr>
                  <td colSpan={4}>Aucune prévision</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="ds-panel">
          <h2>Pénuries d’espèces</h2>
          <p className="chart-legend-text">
            Risque élevé si 4 semaines et prévision 30 j &lt; 50 % de la moyenne saisonnière.
          </p>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Espèce</th>
                <th>Risque</th>
                <th>4 sem. (kg)</th>
                <th>Baseline</th>
              </tr>
            </thead>
            <tbody>
              {(preds?.penuries ?? []).map((p) => (
                <tr key={p.espece}>
                  <td>{p.espece}</td>
                  <td>
                    <StatusPill label={p.risque} tone={risqueTone(p.risque)} />
                  </td>
                  <td>{p.volume_4sem_kg.toLocaleString('fr-FR')}</td>
                  <td>{p.baseline_saison_kg.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
              {!preds?.penuries.length ? (
                <tr>
                  <td colSpan={4}>Aucune espèce</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rapports-pred-grid">
        <div className="ds-panel">
          <h2>Intrusions et zones d’incidents</h2>
          <table className="ds-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Score</th>
                <th>Intrusions hist.</th>
                <th>Volume (kg)</th>
              </tr>
            </thead>
            <tbody>
              {(preds?.zones_incidents ?? []).slice(0, 8).map((z) => (
                <tr key={z.zone_id ?? z.zone_nom}>
                  <td>{z.zone_nom}</td>
                  <td>{z.score.toFixed(2)}</td>
                  <td>{z.count_intrusions_hist}</td>
                  <td>{z.volume_captures_kg.toLocaleString('fr-FR')}</td>
                </tr>
              ))}
              {!preds?.zones_incidents.length ? (
                <tr>
                  <td colSpan={4}>Aucune zone à risque</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="ds-panel">
          <h2>Carte des zones à risque</h2>
          <p className="chart-legend-text">Cercle proportionnel au score projeté.</p>
          <div className="rapports-map" ref={mapRef} aria-label="Carte des zones à risque" />
        </div>
      </div>
    </section>
  );
}
