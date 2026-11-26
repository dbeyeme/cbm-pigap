import { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  CarnetRead,
  CourbesPrixRead,
  GrainPrix,
  getCarnetDeclarations,
  getCourbesPrix,
} from '../api';
import { ESPECE_COLORS } from './TrendCharts';

type Props = {
  token: string;
  debut: string;
  fin: string;
  grain: GrainPrix;
  pecheurId: string;
  onError: (msg: string | null) => void;
};

const FALLBACK = ['#1B6CA8', '#0F766E', '#D97706', '#7C3AED', '#0EA5E9', '#CA8A04'];

function colorFor(code: string, i: number): string {
  return ESPECE_COLORS[code] ?? FALLBACK[i % FALLBACK.length];
}

function fcfa(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function jourFr(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export default function PrixMarchePanel({
  token,
  debut,
  fin,
  grain,
  pecheurId,
  onError,
}: Props) {
  const [courbes, setCourbes] = useState<CourbesPrixRead | null>(null);
  const [carnet, setCarnet] = useState<CarnetRead | null>(null);
  const [especeFiltre, setEspeceFiltre] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      onError(null);
      try {
        const [c, k] = await Promise.all([
          getCourbesPrix(token, {
            debut,
            fin,
            grain,
            espece: especeFiltre || undefined,
          }),
          pecheurId
            ? getCarnetDeclarations(token, { pecheur_id: pecheurId, debut, fin })
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setCourbes(c);
        setCarnet(k);
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : 'Prix et carnet indisponibles');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, debut, fin, grain, pecheurId, especeFiltre, onError]);

  const especes = useMemo(() => {
    const codes = new Set<string>();
    for (const p of courbes?.points ?? []) {
      if (p.espece) codes.add(p.espece);
    }
    return [...codes].sort();
  }, [courbes]);

  const series = useMemo(() => {
    const byPeriod = new Map<string, Record<string, string | number | null>>();
    for (const p of courbes?.points ?? []) {
      const rec = byPeriod.get(p.periode) ?? { periode: p.periode.slice(0, 10) };
      const key = p.espece ?? 'toutes';
      rec[key] = p.prix_moyen_fcfa_kg;
      byPeriod.set(p.periode, rec);
    }
    return [...byPeriod.values()];
  }, [courbes]);

  const cles = useMemo(() => {
    if (especeFiltre) return [especeFiltre];
    return ['toutes', ...especes];
  }, [especeFiltre, especes]);

  return (
    <div className="ds-panel">
      <h2>Prix de vente</h2>
      <p className="chart-legend-text">
        Moyenne des prix déclarés au kilo, affichée seulement si au moins{' '}
        {courbes?.anonymat_min_declarations ?? '—'} déclarations et{' '}
        {courbes?.anonymat_min_pecheurs ?? '—'} pêcheurs (paramétrage proposé). Un trou sur la courbe
        signifie que le seuil n’est pas atteint. La référence 2024 reste un rappel, pas un prix
        observé.
        {courbes?.statut_regles === 'Proposé' ? ' Statut : Proposé.' : ''}
      </p>
      <label className="dash-period-field dash-period-field--wide">
        Espèce
        <select
          value={especeFiltre}
          onChange={(e) => setEspeceFiltre(e.target.value)}
          aria-label="Espèce des courbes de prix"
        >
          <option value="">Toutes (moyenne pondérée)</option>
          {especes.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </label>

      {loading && !courbes ? (
        <p className="empty-list">Chargement des prix…</p>
      ) : !series.length ? (
        <p className="empty-list">Aucun prix déclaré sur cette période.</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 40, 70, 0.12)" />
            <XAxis dataKey="periode" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {cles.map((code, i) => (
              <Line
                key={code}
                type="monotone"
                dataKey={code}
                name={code === 'toutes' ? 'Toutes espèces' : code}
                stroke={colorFor(code, i)}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <h3>Carnet des déclarations</h3>
      <p className="chart-legend-text">
        Une ligne par embarcation et par jour. Ce n’est pas un carnet de sortie avec départ et
        retour. Les charges et le seuil de rentabilité ne sont pas calculés.
      </p>
      {!pecheurId ? (
        <p className="empty-list">Choisissez un pêcheur dans la barre de période.</p>
      ) : !carnet || carnet.jours.length === 0 ? (
        <p className="empty-list">Aucune déclaration pour ce pêcheur sur la période.</p>
      ) : (
        <>
          <p className="chart-legend-text">
            {carnet.pecheur_nom} · {carnet.volume_kg.toLocaleString('fr-FR')} kg · valeur estimée{' '}
            {fcfa(carnet.valeur_estimee_fcfa)} · {carnet.note_rentabilite}
          </p>
          <table className="ds-table empilable">
            <thead>
              <tr>
                <th scope="col">Jour</th>
                <th scope="col">Embarcation</th>
                <th scope="col">Rendement</th>
                <th scope="col">Valeur estimée</th>
                <th scope="col">Charges</th>
              </tr>
            </thead>
            <tbody>
              {carnet.jours.map((j) => (
                <tr key={`${j.jour}-${j.embarcation_id}`}>
                  <td data-label="Jour">{jourFr(j.jour)}</td>
                  <td data-label="Embarcation">
                    {j.embarcation_nom} · {j.immatriculation}
                  </td>
                  <td data-label="Rendement">{j.rendement_kg.toLocaleString('fr-FR')} kg</td>
                  <td data-label="Valeur estimée">{fcfa(j.valeur_estimee_fcfa)}</td>
                  <td data-label="Charges">Non renseigné</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
