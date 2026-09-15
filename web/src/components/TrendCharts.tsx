import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { DashboardSeries } from '../api';

export const ESPECE_COLORS: Record<string, string> = {
  capitaine: '#1B6CA8',
  merou: '#0F766E',
  crevette: '#D97706',
  thon: '#7C3AED',
  barracuda: '#0EA5E9',
  sardine: '#CA8A04',
  autre: '#64748B',
};

const FALLBACK = ['#1B6CA8', '#0F766E', '#D97706', '#7C3AED', '#0EA5E9', '#CA8A04'];

function colorFor(espece: string, i: number): string {
  return ESPECE_COLORS[espece] ?? FALLBACK[i % FALLBACK.length];
}

function saisonLabel(s: string): string {
  return s === 'saison_seche' ? 'Saison sèche' : 'Saison des pluies';
}

type VolumePoint = {
  periode: string;
  volume_kg: number;
  saison: string;
  seche: number | null;
  pluies: number | null;
};

function volumePoints(series: DashboardSeries): VolumePoint[] {
  const saisonMap = Object.fromEntries(series.saisons.map((s) => [s.periode, s.saison]));
  return series.volume_par_periode.map((p) => {
    const saison = saisonMap[p.periode] ?? '';
    return {
      periode: p.periode.slice(0, 10),
      volume_kg: p.volume_kg,
      saison,
      seche: saison === 'saison_seche' ? p.volume_kg : null,
      pluies: saison === 'saison_pluies' ? p.volume_kg : null,
    };
  });
}

function stackedEspeces(series: DashboardSeries): Array<Record<string, string | number>> {
  const especes = [...new Set(series.especes_par_periode.map((r) => r.espece))];
  const byPeriod = new Map<string, Record<string, string | number>>();
  for (const p of series.volume_par_periode) {
    byPeriod.set(p.periode, { periode: p.periode.slice(0, 10) });
  }
  for (const row of series.especes_par_periode) {
    const rec = byPeriod.get(row.periode) ?? { periode: row.periode.slice(0, 10) };
    rec[row.espece] = row.volume_kg;
    byPeriod.set(row.periode, rec);
  }
  const rows = [...byPeriod.values()];
  for (const rec of rows) {
    for (const e of especes) {
      if (rec[e] === undefined) rec[e] = 0;
    }
  }
  return rows;
}

type Props = {
  series: DashboardSeries | null;
  compact?: boolean;
  showSeasonSplit?: boolean;
};

export default function TrendCharts({ series, compact = false, showSeasonSplit = false }: Props) {
  const volume = useMemo(() => (series ? volumePoints(series) : []), [series]);
  const stacked = useMemo(() => (series ? stackedEspeces(series) : []), [series]);
  const especes = useMemo(
    () => [...new Set(series?.especes_par_periode.map((r) => r.espece) ?? [])],
    [series],
  );
  const height = compact ? 220 : 300;

  if (!series || !volume.length) {
    return <p className="empty-list">Pas encore de série à tracer sur cette période.</p>;
  }

  return (
    <div className={`trend-charts${compact ? ' trend-charts-compact' : ''}`}>
      <div className="chart-card" aria-label="Volume déclaré dans le temps">
        <h3>Volume déclaré</h3>
        <p className="chart-legend-text">
          Total kg par {series.grain}
          {showSeasonSplit ? ' — orange : saison sèche, bleu : saison des pluies' : ''}.
        </p>
        <ResponsiveContainer width="100%" height={height}>
          {showSeasonSplit ? (
            <LineChart data={volume} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 40, 70, 0.12)" />
              <XAxis dataKey="periode" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="seche"
                name={saisonLabel('saison_seche')}
                stroke="#D97706"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="pluies"
                name={saisonLabel('saison_pluies')}
                stroke="#2563EB"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          ) : (
            <AreaChart data={volume} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 40, 70, 0.12)" />
              <XAxis dataKey="periode" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Area
                type="monotone"
                dataKey="volume_kg"
                name="kg"
                stroke="#1B6CA8"
                fill="rgba(27, 108, 168, 0.28)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="chart-card" aria-label="Répartition des espèces dans le temps">
        <h3>Espèces</h3>
        <p className="chart-legend-text">
          {especes.length ? especes.join(', ') : 'Aucune espèce'} — barres empilées (kg).
        </p>
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={stacked} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 40, 70, 0.12)" />
            <XAxis dataKey="periode" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {especes.map((e, i) => (
              <Bar key={e} dataKey={e} stackId="esp" fill={colorFor(e, i)} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type AlertChartProps = {
  series: DashboardSeries | null;
};

export function AlertTrendChart({ series }: AlertChartProps) {
  const rows = useMemo(() => {
    if (!series) return { rows: [] as Record<string, string | number>[], types: [] as string[] };
    const types = [...new Set(series.alertes_par_periode.map((a) => a.type))];
    const byP = new Map<string, Record<string, string | number>>();
    for (const a of series.alertes_par_periode) {
      const rec = byP.get(a.periode) ?? { periode: a.periode.slice(0, 10) };
      rec[a.type] = a.count;
      byP.set(a.periode, rec);
    }
    const out = [...byP.values()];
    for (const rec of out) {
      for (const t of types) {
        if (rec[t] === undefined) rec[t] = 0;
      }
    }
    return { rows: out, types };
  }, [series]);

  if (!series || !rows.rows.length) {
    return <p className="empty-list">Aucune alerte sur la période.</p>;
  }

  return (
    <div className="chart-card" aria-label="Alertes dans le temps">
      <h3>Alertes</h3>
      <p className="chart-legend-text">Comptes par type et par {series.grain}.</p>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={rows.rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 40, 70, 0.12)" />
          <XAxis dataKey="periode" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {rows.types.map((t, i) => (
            <Bar key={t} dataKey={t} fill={FALLBACK[i % FALLBACK.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
