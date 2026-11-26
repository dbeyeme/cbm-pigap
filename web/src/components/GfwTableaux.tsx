import { useCallback, useEffect, useState } from 'react';

import {
  ApiError,
  getGfwDetections,
  getGfwEtat,
  getGfwNavires,
  getGfwPecheApparente,
  type GfwDetections,
  type GfwEtat,
  type GfwNavires,
  type GfwPecheApparente,
} from '../api';
import GfwMention from './GfwMention';
import { IconRadar, IconRefresh } from './Icons';

type Onglet = 'heures' | 'navires' | 'radar';

function pavillon(code: string | null): string {
  return code ? code : 'Non rapproché';
}

function mois(iso: string): string {
  const [y, m] = iso.split('-');
  if (!y || !m) return iso;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

/**
 * Tableaux d'essai Global Fishing Watch (heures, navires, radar), hors carte.
 * Réservés aux rôles qui peuvent lire `/gfw`. Aucune alerte n'est déclenchée.
 */
export default function GfwTableaux({
  token,
  onError,
}: {
  token: string;
  onError?: (msg: string | null) => void;
}) {
  const [etat, setEtat] = useState<GfwEtat | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('heures');
  const [heures, setHeures] = useState<GfwPecheApparente | null>(null);
  const [navires, setNavires] = useState<GfwNavires | null>(null);
  const [radar, setRadar] = useState<GfwDetections | null>(null);
  const [chargement, setChargement] = useState(false);
  const [interdit, setInterdit] = useState(false);

  const chargerEtat = useCallback(async () => {
    try {
      setEtat(await getGfwEtat(token));
      setInterdit(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setInterdit(true);
        setEtat(null);
        return;
      }
      onError?.(err instanceof Error ? err.message : 'Essai Global Fishing Watch indisponible');
    }
  }, [token, onError]);

  useEffect(() => {
    void chargerEtat();
  }, [chargerEtat]);

  const chargerOnglet = useCallback(async () => {
    if (!etat?.active) return;
    setChargement(true);
    onError?.(null);
    try {
      if (onglet === 'heures') setHeures(await getGfwPecheApparente(token));
      else if (onglet === 'navires') setNavires(await getGfwNavires(token));
      else setRadar(await getGfwDetections(token));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Lecture de l’essai impossible');
    } finally {
      setChargement(false);
    }
  }, [etat?.active, onglet, token, onError]);

  useEffect(() => {
    void chargerOnglet();
  }, [chargerOnglet]);

  if (interdit || !etat) return null;

  const commun = onglet === 'heures' ? heures : onglet === 'navires' ? navires : radar;

  return (
    <section className="gfw-tableaux ds-panel" aria-label="Essai Global Fishing Watch">
      <header className="gfw-panel-head">
        <span className="gfw-panel-icon" aria-hidden>
          <IconRadar size={16} />
        </span>
        <div>
          <strong>Pêche apparente (essai)</strong>
          <span>{etat.zone.nom} · hors service tant que l’éditeur n’a pas donné son accord écrit</span>
        </div>
      </header>

      {!etat.active ? (
        <p className="gfw-panel-warn">
          L’essai est à l’arrêt sur ce serveur. Les totaux d’heures, de navires et de détections radar ne
          s’affichent pas tant qu’il n’est pas activé.
        </p>
      ) : (
        <>
          <div className="mode-tabs" role="tablist" aria-label="Tableaux de l’essai">
            {(
              [
                ['heures', 'Heures'],
                ['navires', 'Navires'],
                ['radar', 'Radar'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={onglet === id}
                className={onglet === id ? 'mode-on' : ''}
                onClick={() => setOnglet(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {commun ? (
            <p className="gfw-panel-warn">{commun.avertissement}</p>
          ) : (
            <p className="empty-list">{chargement ? 'Lecture de l’essai…' : null}</p>
          )}

          {onglet === 'heures' && heures ? (
            <>
              <p className="gfw-panel-meta">
                {heures.total_heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h de pêche apparente · du{' '}
                {heures.periode.debut} au {heures.periode.fin}
                {heures.fraicheur.periode_incomplete ? ' · période incomplète' : ''}
              </p>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {heures.par_mois.map((l) => (
                    <tr key={l.mois}>
                      <td>{mois(l.mois)}</td>
                      <td>{l.heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Pavillon</th>
                    <th>Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {heures.par_pavillon.map((l) => (
                    <tr key={l.pavillon ?? 'nr'}>
                      <td>{pavillon(l.pavillon)}</td>
                      <td>{l.heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {onglet === 'navires' && navires ? (
            <>
              <p className="gfw-panel-meta">
                {navires.nb_navires} navire{navires.nb_navires > 1 ? 's' : ''} ·{' '}
                {navires.total_heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h
              </p>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Pavillon</th>
                    <th>MMSI</th>
                    <th>Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {navires.navires.map((n) => (
                    <tr key={n.vessel_id}>
                      <td>{n.nom || 'Sans nom'}</td>
                      <td>{pavillon(n.pavillon)}</td>
                      <td>{n.mmsi ?? '—'}</td>
                      <td>{n.heures.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          {onglet === 'radar' && radar ? (
            <>
              <p className="gfw-panel-meta">
                {radar.total_detections.toLocaleString('fr-FR')} détection
                {radar.total_detections > 1 ? 's' : ''} radar
              </p>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Mois</th>
                    <th>Détections</th>
                  </tr>
                </thead>
                <tbody>
                  {radar.par_mois.map((l) => (
                    <tr key={l.mois}>
                      <td>{mois(l.mois)}</td>
                      <td>{l.detections.toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th>Pavillon</th>
                    <th>Détections</th>
                  </tr>
                </thead>
                <tbody>
                  {radar.par_pavillon.map((l) => (
                    <tr key={l.pavillon ?? 'nr'}>
                      <td>{pavillon(l.pavillon)}</td>
                      <td>{l.detections.toLocaleString('fr-FR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}

          <button type="button" className="ghost compact" onClick={() => void chargerOnglet()} disabled={chargement}>
            <IconRefresh size={14} /> {chargement ? 'Lecture…' : 'Actualiser'}
          </button>
          {commun ? <GfwMention attribution={commun.attribution} /> : <GfwMention attribution={etat.attribution} />}
        </>
      )}
    </section>
  );
}
