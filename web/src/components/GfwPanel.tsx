import { useMemo } from 'react';

import type { GfwEtat, GfwEvenements } from '../api';
import GfwMention from './GfwMention';
import { IconRadar, IconRefresh } from './Icons';

type Props = {
  etat: GfwEtat | null;
  evenements: GfwEvenements | null;
  erreur: string | null;
  chargement: boolean;
  overlay: boolean;
  onOverlay: (on: boolean) => void;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  selection: string | null;
};

function fmtJour(iso: string | null | undefined): string {
  if (!iso) return 'non renseigné';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Essai Global Fishing Watch : état, couche sur la carte, liste des épisodes.
 * Réservé aux rôles qui peuvent lire `/gfw`. Aucune alerte n'est déclenchée.
 */
export default function GfwPanel({
  etat,
  evenements,
  erreur,
  chargement,
  overlay,
  onOverlay,
  onRefresh,
  onSelect,
  selection,
}: Props) {
  const navires = useMemo(() => {
    const vus = new Map<string, { nom: string; n: number; id: string }>();
    for (const e of evenements?.evenements ?? []) {
      const cle = e.vessel_id || e.mmsi || e.nom || e.id;
      const connu = vus.get(cle);
      if (connu) {
        connu.n += 1;
      } else {
        vus.set(cle, { nom: e.nom || e.mmsi || 'Navire sans nom', n: 1, id: e.id });
      }
    }
    return [...vus.values()].sort((a, b) => b.n - a.n);
  }, [evenements]);

  if (!etat) {
    return chargement ? <p className="empty-list">Lecture de l’essai…</p> : null;
  }

  return (
    <section className="gfw-panel" aria-label="Essai Global Fishing Watch">
      <header className="gfw-panel-head">
        <span className="gfw-panel-icon" aria-hidden>
          <IconRadar size={16} />
        </span>
        <div>
          <strong>Pêche apparente</strong>
          <span>{etat.zone.nom}</span>
        </div>
      </header>

      {etat.active ? (
        <>
          <label className="toggle-row">
            <input type="checkbox" checked={overlay} onChange={(e) => onOverlay(e.target.checked)} />
            Afficher les épisodes sur la carte
          </label>
          {evenements ? (
            <p className="gfw-panel-meta">
              {evenements.nb_affiches} point{evenements.nb_affiches > 1 ? 's' : ''} sur{' '}
              {evenements.total} épisode{evenements.total > 1 ? 's' : ''} · du{' '}
              {fmtJour(evenements.periode.debut)} au {fmtJour(evenements.periode.fin)}
              {evenements.fraicheur.periode_incomplete ? ' · période incomplète' : ''}
              {evenements.fraicheur.resultat_partiel ? ' · liste partielle' : ''}
            </p>
          ) : null}
          {erreur ? <p className="ais-empty">{erreur}</p> : null}
          <p className="gfw-panel-warn">{evenements?.avertissement ?? etat.attribution.mention}</p>
          {navires.length ? (
            <ul className="gfw-panel-navires">
              {navires.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`gfw-navire${selection === n.id ? ' is-on' : ''}`}
                    onClick={() => onSelect(n.id)}
                  >
                    <span>{n.nom}</span>
                    <em>
                      {n.n} épisode{n.n > 1 ? 's' : ''}
                    </em>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {evenements?.evenements.length ? (
            <ul className="ais-list gfw-panel-liste" aria-label="Derniers épisodes">
              {evenements.evenements.slice(0, 8).map((e) => (
                <li
                  key={e.id}
                  className={`ais-row${selection === e.id ? ' is-on' : ''} is-clickable`}
                  onClick={() => onSelect(e.id)}
                >
                  <span className="ais-row-dot" aria-hidden />
                  <span className="ais-row-body">
                    <span className="ais-row-title">{e.nom || e.mmsi || 'Navire sans nom'}</span>
                    <span className="ais-row-meta">
                      {e.pavillon ? `Pavillon ${e.pavillon}` : 'Pavillon indéterminé'}
                      {e.heures > 0 ? ` · ${e.heures.toLocaleString('fr-FR')} h` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <button type="button" className="ghost compact" onClick={onRefresh} disabled={chargement}>
            <IconRefresh size={14} /> Actualiser
          </button>
          {evenements ? <GfwMention attribution={evenements.attribution} /> : <GfwMention attribution={etat.attribution} />}
        </>
      ) : (
        <>
          <p className="gfw-panel-warn">
            L’essai est à l’arrêt sur ce serveur. Les navires industriels vus par satellite ne
            s’affichent pas tant qu’il n’est pas activé.
          </p>
          <GfwMention attribution={etat.attribution} />
        </>
      )}
    </section>
  );
}
