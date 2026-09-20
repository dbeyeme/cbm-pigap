import type { PredictionsRead } from '../api';
import type { NavId } from '../nav';
import StatusPill from './StatusPill';
import { IconEye } from './Icons';

type Props = {
  data: PredictionsRead | null;
  onNavigate?: (id: NavId) => void;
};

function risqueTone(r: string): 'danger' | 'warn' | 'ok' | 'info' {
  if (r === 'eleve') return 'danger';
  if (r === 'moyen') return 'warn';
  return 'ok';
}

export default function PredictionStrip({ data, onNavigate }: Props) {
  if (!data) return null;
  const topPenurie = [...data.penuries].sort((a, b) => {
    const rank: Record<'eleve' | 'moyen' | 'faible', number> = {
      eleve: 2,
      moyen: 1,
      faible: 0,
    };
    return rank[b.risque] - rank[a.risque];
  })[0];
  const topIntrusion = data.intrusions[0];
  const topZone = data.zones_incidents[0];
  const items = [
    topPenurie
      ? {
          key: 'penurie',
          title: `Pénurie · ${topPenurie.espece}`,
          detail: `${topPenurie.volume_4sem_kg.toLocaleString('fr-FR')} kg / 4 sem.`,
          tone: risqueTone(topPenurie.risque),
          pill: topPenurie.risque,
        }
      : null,
    topIntrusion
      ? {
          key: 'intrusion',
          title: `Intrusion · ${topIntrusion.zone_nom}`,
          detail: `Score ${Math.round(topIntrusion.score * 100)} % · ${topIntrusion.count_prevu.toLocaleString('fr-FR')} prévu`,
          tone: topIntrusion.score > 0.5 ? ('danger' as const) : ('warn' as const),
          pill: `${Math.round(topIntrusion.score * 100)} %`,
        }
      : null,
    topZone
      ? {
          key: 'zone',
          title: `Zone à risque · ${topZone.zone_nom}`,
          detail: `${topZone.count_intrusions_hist} intrusion(s) · ${topZone.volume_captures_kg.toLocaleString('fr-FR')} kg`,
          tone: topZone.score > 0.4 ? ('danger' as const) : ('info' as const),
          pill: topZone.score.toFixed(2),
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x != null);

  if (!items.length) return null;

  return (
    <div className="pred-strip" aria-label="Risques projetés">
      <div className="pred-strip-head">
        <p className="eyebrow">Risques projetés · {data.horizon_jours} j</p>
        {data.mode === 'insuffisant' ? (
          <span className="pred-mode">Historique court — moyenne récente</span>
        ) : (
          <span className="pred-mode">Modèle sklearn (consultatif)</span>
        )}
        <button type="button" className="ghost" onClick={() =>
              onNavigate?.('rapports')}><IconEye size={16} /> Voir les rapports</button>
      </div>
      <ul className="pred-strip-list">
        {items.slice(0, 3).map((it) => (
          <li key={it.key}>
            <StatusPill label={it.pill} tone={it.tone} />
            <div>
              <strong>{it.title}</strong>
              <span>{it.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
