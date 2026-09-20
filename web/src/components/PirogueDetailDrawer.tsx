import { useEffect, useState } from 'react';

import { alertTypeLabel, getFicheEmbarcation, graviteLabel, type FicheEmbarcation } from '../api';
import { IconClose, IconPirogue, IconShip } from './Icons';

type Props = {
  token: string;
  embarcationId: string | null;
  onClose: () => void;
  onLocate?: (lng: number, lat: number) => void;
  onDetail?: (fiche: FicheEmbarcation | null) => void;
};

const REGULARITE: Record<string, { label: string; tone: string }> = {
  conforme: { label: 'Aucun constat', tone: 'ok' },
  a_verifier: { label: 'À vérifier', tone: 'warn' },
  alerte: { label: 'Alerte', tone: 'danger' },
};

const PRESENCE: Record<string, string> = {
  a_quai: 'À quai',
  en_manoeuvre: 'En manœuvre',
  en_mer: 'En mer',
  sans_signal: 'Sans signal',
};

const SIGNAL: Record<string, string> = {
  actif: 'signal actif',
  recent: 'signal récent',
  silence: 'silence prolongé',
  aucun: 'aucune position',
};

const SECTEUR: Record<string, string> = {
  cote: 'littoral',
  bras_mer: 'bras de mer',
  fleuve: 'fleuve',
};

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtAge(s: number): string {
  if (s < 60) return `${s} s`;
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
}

function fmtCoord(lon: number, lat: number): string {
  return `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'O'}`;
}

/** Fiche d'une embarcation PIGAP : identification, régularité, localisation. */
export default function PirogueDetailDrawer({ token, embarcationId, onClose, onLocate, onDetail }: Props) {
  const [fiche, setFiche] = useState<FicheEmbarcation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!embarcationId) {
      setFiche(null);
      onDetail?.(null);
      return;
    }
    let cancelled = false;
    const load = () =>
      getFicheEmbarcation(token, embarcationId)
        .then((f) => {
          if (!cancelled) {
            setFiche(f);
            setError(null);
            onDetail?.(f);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Fiche indisponible');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    setLoading(true);
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, embarcationId]);

  useEffect(() => {
    if (!embarcationId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [embarcationId, onClose]);

  if (!embarcationId) return null;
  const reg = REGULARITE[fiche?.regularite ?? 'conforme'] ?? REGULARITE.conforme;
  const isNavire = (fiche?.type ?? '').toLowerCase().includes('navire');
  const pos = fiche?.derniere_position?.coordinates ?? null;

  return (
    <aside className="vessel-drawer ds-fade-slide" aria-label="Fiche embarcation" role="dialog">
      <header className="vessel-drawer-head">
        <span className="vessel-drawer-icon vessel-drawer-icon--pigap" aria-hidden>
          {isNavire ? <IconShip size={18} /> : <IconPirogue size={18} />}
        </span>
        <div className="vessel-drawer-title">
          <strong>{fiche?.nom ?? 'Embarcation'}</strong>
          <span>
            {fiche ? `${fiche.type ?? 'Embarcation'} · ${fiche.immatriculation}` : 'Flotte PIGAP'}
          </span>
        </div>
        {fiche ? <span className={`vessel-reg vessel-reg--${reg.tone}`}>{reg.label}</span> : null}
        <button type="button" className="ds-icon-btn" onClick={onClose} aria-label="Fermer la fiche">
          <IconClose size={14} />
        </button>
      </header>

      {loading && !fiche ? <p className="ais-empty">Chargement de la fiche…</p> : null}
      {error ? <p className="ais-empty">{error}</p> : null}

      {fiche ? (
        <div className="vessel-drawer-body">
          {fiche.motifs.length > 0 ? (
            <ul className={`vessel-motifs vessel-motifs--${reg.tone}`}>
              {fiche.motifs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}

          <section className="vessel-section">
            <h4>Identification</h4>
            <dl>
              <div>
                <dt>Titulaire</dt>
                <dd>{fiche.pecheur_nom}{fiche.organisation ? ` · ${fiche.organisation}` : ''}</dd>
              </div>
              <div>
                <dt>Licence</dt>
                <dd>
                  {fiche.numero_licence} · {fiche.statut_pecheur}
                  {fiche.date_delivrance_licence
                    ? ` · délivrée le ${new Date(fiche.date_delivrance_licence).toLocaleDateString('fr-FR')}`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Immatriculation</dt>
                <dd>{fiche.immatriculation}</dd>
              </div>
              <div>
                <dt>Type</dt>
                <dd>
                  {fiche.type ?? '—'}
                  {fiche.longueur_m ? ` · ${fiche.longueur_m} m` : ''}
                </dd>
              </div>
            </dl>
          </section>

          <section className="vessel-section">
            <h4>Régularité</h4>
            <dl>
              <div>
                <dt>Abonnement</dt>
                <dd>
                  {fiche.couverture_ok ? 'Couverture en règle' : 'Non couvert'}
                  {fiche.couverture_motif ? ` · ${fiche.couverture_motif}` : ''}
                </dd>
              </div>
              <div>
                <dt>Zones réglementées</dt>
                <dd>
                  {fiche.zones_reglementees.length === 0
                    ? 'Aucune zone touchée'
                    : fiche.zones_reglementees.map((z) => `${z.nom} (${z.type})`).join(' · ')}
                </dd>
              </div>
              <div>
                <dt>Alertes récentes</dt>
                <dd>
                  {fiche.alertes.length === 0
                    ? 'Aucune'
                    : fiche.alertes
                        .slice(0, 3)
                        .map((a) => `${alertTypeLabel(a.type)} · ${graviteLabel(a.niveau_gravite)} · ${a.statut}`)
                        .join(' ; ')}
                </dd>
              </div>
              <div>
                <dt>Captures 30 jours</dt>
                <dd>
                  {fiche.captures_30j} déclaration{fiche.captures_30j > 1 ? 's' : ''} ·{' '}
                  {Math.round(fiche.captures_30j_kg)} kg
                </dd>
              </div>
            </dl>
          </section>

          <section className="vessel-section">
            <h4>Localisation</h4>
            <dl>
              <div>
                <dt>Position</dt>
                <dd>
                  {pos ? (
                    <button type="button" className="linkish" onClick={() => onLocate?.(pos[0], pos[1])} title="Centrer la carte">
                      {fmtCoord(pos[0], pos[1])}
                    </button>
                  ) : (
                    'Aucune position enregistrée'
                  )}
                </dd>
              </div>
              <div>
                <dt>Situation</dt>
                <dd>
                  {PRESENCE[fiche.statut_presence] ?? fiche.statut_presence}
                  {fiche.port_nom ? ` · ${fiche.port_nom}` : ''}
                  {fiche.depuis ? ` · depuis ${fmtTime(fiche.depuis)}` : ''}
                  {fiche.statut_presence === 'en_mer' && fiche.dernier_port_nom
                    ? ` · parti de ${fiche.dernier_port_nom}${fiche.dernier_depart ? ` à ${fmtTime(fiche.dernier_depart)}` : ''}`
                    : ''}
                  {fiche.secteur ? ` · ${SECTEUR[fiche.secteur] ?? fiche.secteur}` : ''}
                </dd>
              </div>
              <div>
                <dt>Dernier relevé</dt>
                <dd>
                  {fiche.derniere_horodatage ? `${fmtTime(fiche.derniere_horodatage)} · il y a ${fmtAge(fiche.age_s ?? 0)}` : '—'}
                  {` · ${SIGNAL[fiche.statut_signal] ?? fiche.statut_signal}`}
                </dd>
              </div>
              <div>
                <dt>Trajectoire 24 h</dt>
                <dd>
                  {fiche.trajectoire.length} position{fiche.trajectoire.length > 1 ? 's' : ''}
                  {fiche.trajectoire.length > 1 ? ` · depuis ${fmtTime(fiche.trajectoire[0].horodatage)}` : ''}
                </dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{fiche.trajectoire.length ? (fiche.trajectoire[fiche.trajectoire.length - 1].source === 'mobile' ? 'Application mobile' : fiche.trajectoire[fiche.trajectoire.length - 1].source) : '—'}</dd>
              </div>
            </dl>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
