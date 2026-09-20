import { useMemo, useState } from 'react';

import type { BulletinMeteoMarine, SecteurBulletin } from '../api';
import HelpTip from './HelpTip';
import { IconCoast, IconRefresh, IconRiver } from './Icons';

type Props = {
  bulletin: BulletinMeteoMarine | null;
  loading?: boolean;
  onRefresh: () => void;
  onLocate?: (lng: number, lat: number) => void;
};

const CLASSE_LABELS: Record<string, string> = {
  danger: 'Danger',
  prudence: 'Prudence',
  favorable: 'Favorable',
  surexploitee: 'Surexploitée',
  neutre: 'Ordinaire',
};

const NIVEAU_LABELS: Record<string, string> = {
  vert: 'Mer praticable',
  orange: 'Prudence',
  rouge: 'Sortie déconseillée',
};

function deg(d: number | null | undefined): string {
  if (d == null) return '';
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round((d % 360) / 45) % 8];
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function shortName(nom: string): string {
  return nom.split(' (')[0].split(' et ')[0];
}

/**
 * État de la mer par secteur et niveaux des fleuves, avec l'avis calculé
 * (risque pour les pirogues, opportunité de pêche, surexploitation).
 */
export default function SeaStatePanel({ bulletin, loading, onRefresh, onLocate }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const secteurs = bulletin?.secteurs ?? [];
  const fleuves = bulletin?.fleuves ?? [];
  const current: SecteurBulletin | null = useMemo(
    () => secteurs.find((s) => s.id === selected) ?? secteurs[0] ?? null,
    [secteurs, selected],
  );

  const counts = useMemo(
    () => ({
      rouge: secteurs.filter((s) => s.risque.niveau_pirogue === 'rouge').length,
      favorable: secteurs.filter((s) => s.opportunite.classe === 'favorable').length,
      surex: secteurs.filter((s) => s.opportunite.classe === 'surexploitee').length,
    }),
    [secteurs],
  );

  return (
    <section className="ais-panel sea-panel" aria-label="État de la mer et des fleuves">
      <header className="ais-panel-head">
        <span className="ais-panel-icon sea-panel-icon" aria-hidden>
          <IconCoast size={16} />
        </span>
        <div className="ais-panel-title">
          <strong>
            État de la mer et des fleuves
            <HelpTip title="Comment lire ce panneau" side="bottom">
              Chaque secteur du littoral reçoit une couleur : vert, mer praticable pour les
              pirogues ; orange, sortie possible avec prudence ; rouge, sortie déconseillée. Les
              conditions viennent des modèles océaniques ouverts et sont croisées avec les captures
              déclarées, les quotas et les zones réglementées pour signaler les opportunités et les
              secteurs surexploités. Les pêcheurs reçoivent le même avis sur l'application mobile.
            </HelpTip>
          </strong>
          <span>
            {bulletin?.disponible
              ? `${counts.rouge} secteur${counts.rouge > 1 ? 's' : ''} en alerte · ${counts.favorable} favorable${counts.favorable > 1 ? 's' : ''} · ${counts.surex} surexploité${counts.surex > 1 ? 's' : ''} · ${fmtTime(bulletin.genere_a)}`
              : bulletin?.note || 'Bulletin en préparation'}
          </span>
        </div>
        <button
          type="button"
          className={`ds-icon-btn${loading ? ' is-loading' : ''}`}
          onClick={onRefresh}
          aria-label="Actualiser le bulletin"
          title="Actualiser"
        >
          <IconRefresh size={15} />
        </button>
      </header>

      {bulletin?.synthese ? <p className="sea-synthese">{bulletin.synthese}</p> : null}

      {secteurs.length > 0 ? (
        <div className="ais-ports" role="tablist" aria-label="Secteurs">
          {secteurs.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={current?.id === s.id}
              className={`sea-chip sea-chip--${s.risque.niveau_pirogue}${current?.id === s.id ? ' is-on' : ''}`}
              onClick={() => {
                setSelected(s.id);
                onLocate?.(s.lon, s.lat);
              }}
              title={`${s.nom} · ${NIVEAU_LABELS[s.risque.niveau_pirogue]} · ${CLASSE_LABELS[s.opportunite.classe]}`}
            >
              <i aria-hidden />
              <span>{shortName(s.nom)}</span>
            </button>
          ))}
        </div>
      ) : null}

      {current ? (
        <article className={`sea-card sea-card--${current.risque.niveau_pirogue}`}>
          <header>
            <strong>{current.nom}</strong>
            <span className={`sea-badge sea-badge--${current.opportunite.classe}`}>
              {CLASSE_LABELS[current.opportunite.classe] ?? current.opportunite.classe}
            </span>
          </header>
          <p className="sea-conseil">{current.conseil}</p>
          <dl className="sea-grid">
            <div>
              <dt>
                Mer
                <HelpTip title="État de la mer" side="right">
                  Hauteur significative des vagues sur l'échelle de Douglas. Au-delà de 1,8 m la
                  sortie devient délicate pour une pirogue ; au-delà de 2,5 m elle est déconseillée.
                </HelpTip>
              </dt>
              <dd>
                {current.conditions.etat_mer}
                {current.conditions.houle_m != null ? ` · ${current.conditions.houle_m.toFixed(1)} m` : ''}
                {current.conditions.houle_max_24h_m != null
                  ? ` (max ${current.conditions.houle_max_24h_m.toFixed(1)} m sur 24 h)`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Vent</dt>
              <dd>
                {current.conditions.vent_noeuds != null ? `${Math.round(current.conditions.vent_noeuds)} nd` : '—'}
                {current.conditions.vent_direction_deg != null ? ` ${deg(current.conditions.vent_direction_deg)}` : ''}
                {current.conditions.rafales_max_24h_noeuds != null
                  ? ` · rafales ${Math.round(current.conditions.rafales_max_24h_noeuds)} nd`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>
                Courant
                <HelpTip title="Courant de surface" side="right">
                  Vitesse et direction du courant en surface. Un courant supérieur à un nœud fait
                  dériver une pirogue à l'arrêt de plus de deux kilomètres par heure.
                </HelpTip>
              </dt>
              <dd>
                {current.conditions.courant_noeuds != null
                  ? `${current.conditions.courant_noeuds.toFixed(1)} nd vers ${deg(current.conditions.courant_direction_deg)}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt>Marée</dt>
              <dd>
                {current.conditions.maree ?? '—'}
                {current.conditions.niveau_mer_m != null
                  ? ` · ${current.conditions.niveau_mer_m >= 0 ? '+' : ''}${current.conditions.niveau_mer_m.toFixed(2)} m`
                  : ''}
                {current.conditions.prochaine_pleine_mer
                  ? ` · pleine mer ${fmtTime(current.conditions.prochaine_pleine_mer)}`
                  : ''}
                {current.conditions.prochaine_basse_mer
                  ? ` · basse mer ${fmtTime(current.conditions.prochaine_basse_mer)}`
                  : ''}
              </dd>
            </div>
            <div>
              <dt>Eau</dt>
              <dd>
                {current.conditions.temperature_mer_c != null
                  ? `${current.conditions.temperature_mer_c.toFixed(1)} °C`
                  : '—'}
                {current.conditions.visibilite_km != null ? ` · visibilité ${current.conditions.visibilite_km} km` : ''}
              </dd>
            </div>
            <div>
              <dt>
                Activité
                <HelpTip title="Activité et ressource" side="right">
                  Captures déclarées dans le secteur sur trente jours et taux de consommation du
                  quota le plus avancé. Un quota consommé à 90 % classe le secteur « surexploité ».
                </HelpTip>
              </dt>
              <dd>
                {current.opportunite.sorties_30j} déclaration{current.opportunite.sorties_30j > 1 ? 's' : ''} ·{' '}
                {Math.round(current.opportunite.captures_30j_kg)} kg
                {current.opportunite.quota_max_taux != null
                  ? ` · quota ${Math.round(current.opportunite.quota_max_taux * 100)} %`
                  : ''}
              </dd>
            </div>
          </dl>
          <ul className="sea-motifs">
            {current.opportunite.motifs.slice(0, 4).map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </article>
      ) : null}

      {fleuves.length > 0 ? (
        <div className="sea-rivers">
          <h4>
            <IconRiver size={14} /> Fleuves
            <HelpTip title="Niveaux des fleuves" side="bottom">
              Débit journalier prévu par le modèle hydrologique européen GloFAS à des stations de
              référence. Une hausse rapide annonce une crue : courants forts et bois flottants sur
              les bras ; une décrue découvre les bancs.
            </HelpTip>
          </h4>
          <ul className="ais-list">
            {fleuves.map((f) => (
              <li key={f.id} className={`ais-row sea-river sea-river--${f.niveau}`}>
                <span className="ais-row-dot" aria-hidden />
                <span className="ais-row-body">
                  <span className="ais-row-title">{f.nom}</span>
                  <span className="ais-row-meta">
                    {f.debit_m3s != null ? `${Math.round(f.debit_m3s).toLocaleString('fr-FR')} m³/s` : 'débit indisponible'}
                    {f.variation_pct != null ? ` · ${f.variation_pct >= 0 ? '+' : ''}${f.variation_pct.toFixed(0)} % sous 3 jours` : ''}
                    {` · ${f.niveau === 'crue' ? 'crue annoncée' : f.niveau === 'haut' ? 'niveau haut' : f.niveau === 'bas' ? 'niveau bas' : 'niveau normal'}`}
                  </span>
                </span>
                <span className="ais-row-mmsi">{f.tendance}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bulletin ? (
        <p className="ais-note">
          Source : {bulletin.source}. Aide à la décision : le pêcheur reste responsable de sa sortie.
        </p>
      ) : null}
    </section>
  );
}
