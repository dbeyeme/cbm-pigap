import { useEffect, useState } from 'react';

import { aisStatutLabel, getAisVessel, type AisVesselDetail } from '../api';
import { IconClose, IconShip } from './Icons';

type Props = {
  token: string;
  mmsi: string | null;
  onClose: () => void;
  onLocate?: (lng: number, lat: number) => void;
  onDetail?: (detail: AisVesselDetail | null) => void;
};

const REGULARITE: Record<string, { label: string; tone: string }> = {
  conforme: { label: 'Aucun constat', tone: 'ok' },
  a_verifier: { label: 'À vérifier', tone: 'warn' },
  alerte: { label: 'Alerte', tone: 'danger' },
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtAge(s: number): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

function fmtCoord(lon: number, lat: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'O';
  return `${Math.abs(lat).toFixed(4)}° ${ns} · ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm ? `${hh} h ${String(mm).padStart(2, '0')}` : `${hh} h`;
}

/**
 * Fiche navire AIS : identification, régularité, localisation.
 * S'ouvre au clic sur un navire de la carte ou d'une liste.
 */
export default function VesselDetailDrawer({ token, mmsi, onClose, onLocate, onDetail }: Props) {
  const [detail, setDetail] = useState<AisVesselDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!mmsi) {
      setDetail(null);
      onDetail?.(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAisVessel(token, mmsi)
      .then((d) => {
        if (!cancelled) {
          setDetail(d);
          onDetail?.(d);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Fiche indisponible');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    const id = window.setInterval(() => {
      getAisVessel(token, mmsi)
        .then((d) => {
          if (!cancelled) {
            setDetail(d);
            onDetail?.(d);
          }
        })
        .catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, mmsi]);

  useEffect(() => {
    if (!mmsi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mmsi, onClose]);

  if (!mmsi) return null;
  const v = detail?.vessel;
  const reg = REGULARITE[detail?.regularite ?? 'conforme'] ?? REGULARITE.conforme;
  const [lon, lat] = v?.position.coordinates ?? [0, 0];

  return (
    <aside className="vessel-drawer ds-fade-slide" aria-label="Fiche navire" role="dialog">
      <header className="vessel-drawer-head">
        <span className="vessel-drawer-icon" aria-hidden>
          <IconShip size={18} />
        </span>
        <div className="vessel-drawer-title">
          <strong>{v?.nom ?? `MMSI ${mmsi}`}</strong>
          <span>
            {v?.type_label ?? 'Type inconnu'}
            {v?.pavillon ? ` · pavillon ${v.pavillon}` : ''}
          </span>
        </div>
        {detail ? (
          <span className={`vessel-reg vessel-reg--${reg.tone}`}>{reg.label}</span>
        ) : null}
        <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Fermer la fiche">
          <IconClose size={14} />
        </button>
      </header>

      {loading && !detail ? <p className="ais-empty">Chargement de la fiche…</p> : null}
      {error ? <p className="ais-empty">{error}</p> : null}

      {detail && v ? (
        <div className="vessel-drawer-body">
          {detail.motifs.length > 0 ? (
            <ul className={`vessel-motifs vessel-motifs--${reg.tone}`}>
              {detail.motifs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}

          <section className="vessel-section">
            <h4>Identification</h4>
            <dl>
              <div>
                <dt>MMSI</dt>
                <dd>{v.mmsi}</dd>
              </div>
              <div>
                <dt>Pavillon</dt>
                <dd>
                  {v.pavillon ?? 'Indéterminé'}
                  {v.pavillon_code ? ` (${v.pavillon_code})` : ''}
                  {detail.libre_immatriculation ? ' · libre immatriculation' : ''}
                </dd>
              </div>
              <div>
                <dt>IMO</dt>
                <dd>{v.imo ?? '—'}</dd>
              </div>
              <div>
                <dt>Indicatif</dt>
                <dd>{v.callsign ?? '—'}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>{v.type_label ?? '—'}</dd>
              </div>
              <div>
                <dt>Longueur</dt>
                <dd>{v.longueur_m ? `${v.longueur_m} m` : '—'}</dd>
              </div>
              <div>
                <dt>Destination déclarée</dt>
                <dd>{v.destination ?? '—'}</dd>
              </div>
            </dl>
          </section>

          <section className="vessel-section">
            <h4>Régularité</h4>
            <dl>
              <div>
                <dt>Registre PIGAP</dt>
                <dd>
                  {detail.registre ? (
                    <>
                      {detail.registre.embarcation_nom} · {detail.registre.immatriculation}
                      <br />
                      Licence {detail.registre.numero_licence ?? '—'} ·{' '}
                      {detail.registre.pecheur_nom ?? ''}
                      {detail.registre.statut_pecheur ? ` (${detail.registre.statut_pecheur})` : ''}
                      {detail.registre.organisation ? ` · ${detail.registre.organisation}` : ''}
                    </>
                  ) : (
                    'Aucune correspondance dans le registre'
                  )}
                </dd>
              </div>
              <div>
                <dt>Zones réglementées</dt>
                <dd>
                  {detail.zones_reglementees.length === 0
                    ? 'Aucune zone touchée'
                    : detail.zones_reglementees.map((z) => `${z.nom} (${z.type})`).join(' · ')}
                </dd>
              </div>
              <div>
                <dt>Statut AIS</dt>
                <dd>{aisStatutLabel(v.statut_nav)}</dd>
              </div>
            </dl>
          </section>

          <section className="vessel-section">
            <h4>Localisation</h4>
            <dl>
              <div>
                <dt>Position</dt>
                <dd>
                  <button
                    type="button"
                    className="linkish"
                    onClick={() => onLocate?.(lon, lat)}
                    title="Centrer la carte"
                  >
                    {fmtCoord(lon, lat)}
                  </button>
                </dd>
              </div>
              <div>
                <dt>Situation</dt>
                <dd>
                  {v.dans_eaux_gabon
                    ? v.port_proche
                      ? `Eaux gabonaises · ${v.port_proche} (${v.distance_port_km ?? '—'} km)`
                      : 'Eaux gabonaises · au large'
                    : v.entree_prevue_h != null
                      ? `Hors eaux gabonaises · entrée prévue dans ${fmtHours(v.entree_prevue_h)} (route extrapolée)`
                      : 'Hors eaux gabonaises · ne fait pas route vers le Gabon'}
                </dd>
              </div>
              <div>
                <dt>Vitesse et route</dt>
                <dd>
                  {v.sog_kn != null ? `${v.sog_kn.toFixed(1)} nd` : '—'}
                  {v.cog_deg != null ? ` · route ${Math.round(v.cog_deg)}°` : ''}
                  {v.heading_deg != null ? ` · cap ${Math.round(v.heading_deg)}°` : ''}
                </dd>
              </div>
              <div>
                <dt>Dernier message</dt>
                <dd>
                  {fmtTime(v.horodatage)} · il y a {fmtAge(v.age_s)}
                </dd>
              </div>
              {v.position_estimee ? (
                <div>
                  <dt>Position estimée</dt>
                  <dd>
                    {fmtCoord(v.position_estimee.coordinates[0], v.position_estimee.coordinates[1])}
                    <small> · extrapolation à l’estime, non mesurée</small>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Route récente</dt>
                <dd>
                  {detail.track.length} position{detail.track.length > 1 ? 's' : ''} reçue
                  {detail.track.length > 1 ? 's' : ''}
                  {detail.track.length > 1
                    ? ` · depuis ${fmtTime(detail.track[0].horodatage)}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>
                  {v.provider.startsWith('local')
                    ? `Récepteur local ${v.provider.split(':')[1] ?? ''}`
                    : v.provider === 'aisstream'
                      ? 'Flux AIS communautaire'
                      : v.provider}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
