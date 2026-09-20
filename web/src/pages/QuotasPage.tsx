import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createQuota,
  deleteQuota,
  getCapturesCatalog,
  listQuotaAlertes,
  listQuotas,
  listZones,
  QuotaAlerte,
  QuotaRead,
  ZoneReglementee,
} from '../api';
import CompactList from '../components/CompactList';
import { MODULE_VISUALS } from '../media';
import { IconPlus, IconTrash } from '../components/Icons';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

function pct(q: QuotaRead): number {
  return Math.min(999, Math.round(q.taux_consommation * 100));
}

function barClass(q: QuotaRead): string {
  if (q.taux_consommation >= 1) return 'quota-bar danger';
  if (q.taux_consommation >= 0.9) return 'quota-bar warn';
  return 'quota-bar';
}

export default function QuotasPage({ token, onError }: Props) {
  const [quotas, setQuotas] = useState<QuotaRead[]>([]);
  const [alertes, setAlertes] = useState<QuotaAlerte[]>([]);
  const [zones, setZones] = useState<ZoneReglementee[]>([]);
  const [especes, setEspeces] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const [espece, setEspece] = useState('capitaine');
  const [zoneId, setZoneId] = useState('');
  const [debut, setDebut] = useState('2026-01-01');
  const [fin, setFin] = useState('2026-12-31');
  const [volume, setVolume] = useState('100');

  const refresh = useCallback(async () => {
    const [q, a, z, cat] = await Promise.all([
      listQuotas(token),
      listQuotaAlertes(token),
      listZones(token),
      getCapturesCatalog(token),
    ]);
    setQuotas(q);
    setAlertes(a);
    setZones(z);
    setEspeces(cat.especes);
    if (cat.especes.length && !cat.especes.includes(espece)) {
      setEspece(cat.especes[0]);
    }
    const over = q.filter((x) => x.taux_consommation >= 0.9).length;
    setStatus(
      `${q.length} quota(s) · ${a.length} alerte(s) · ${over} au-delà de 90 %`,
    );
  }, [token, espece]);

  useEffect(() => {
    void refresh().catch((err) =>
      onError(err instanceof Error ? err.message : 'Chargement quotas impossible'),
    );
  }, [refresh, onError]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    try {
      await createQuota(token, {
        espece,
        zone_id: zoneId || null,
        periode_debut: debut,
        periode_fin: fin,
        volume_autorise_kg: Number(volume),
      });
      setStatus('Quota créé — consommation recalculée');
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Création impossible');
    } finally {
      setLoading(false);
    }
  }

  async function onDelete(id: string) {
    setLoading(true);
    onError(null);
    try {
      await deleteQuota(token, id);
      setStatus('Quota supprimé');
      await refresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setLoading(false);
    }
  }

  const alertes90 = alertes.filter(
    (a) => Number(a.declencheur.seuil) === 0.9 || Number(a.declencheur.seuil) === 1,
  );

  return (
    <section className="stage stage-wide quotas-stage">
      <div className="stage-head page-head-with-icon">
        <img src={MODULE_VISUALS.quotas.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Pêches et ressources · Gestion des quotas</p>
          <h1>Quotas</h1>
          <p>Seuils par espèce · consommation auto · alertes à 90 % et 100 %.</p>
          <p className="status-line">{status}</p>
        </div>
      </div>

      <div className="quotas-grid">
        <div className="quotas-stat">
          <strong>{quotas.length}</strong>
          <span>Quotas actifs</span>
        </div>
        <div className="quotas-stat">
          <strong>{quotas.filter((q) => q.taux_consommation >= 0.9).length}</strong>
          <span>≥ 90 %</span>
        </div>
        <div className="quotas-stat">
          <strong>{alertes90.length}</strong>
          <span>Alertes seuil</span>
        </div>
      </div>

      <div className="licences-layout" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)' }}>
        <div className="licences-col quotas-panel">
          <h2>Définir un quota</h2>
          <form className="login-form" onSubmit={onCreate}>
            <label>
              Espèce
              <select value={espece} onChange={(e) => setEspece(e.target.value)} required>
                {(especes.length ? especes : ['capitaine']).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Zone (optionnel)
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
                <option value="">Toutes zones</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.nom}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Début
              <input type="date" value={debut} onChange={(e) => setDebut(e.target.value)} required />
            </label>
            <label>
              Fin
              <input type="date" value={fin} onChange={(e) => setFin(e.target.value)} required />
            </label>
            <label>
              Volume autorisé (kg)
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={loading}><IconPlus size={16} /> {loading ? 'Enregistrement…' : 'Créer le quota'}</button>
          </form>
        </div>

        <div className="licences-col quotas-panel">
          <h2>Consommation</h2>
          <CompactList
            items={quotas}
            getKey={(q) => q.id}
            initial={6}
            empty={<p className="empty-list">Aucun quota — créez-en un à gauche.</p>}
            renderItem={(q) => (
              <div className="traj-item" style={{ borderLeftColor: q.taux_consommation >= 0.9 ? 'var(--warn)' : 'var(--foam)' }}>
                <span className="traj-title">
                  {q.espece} · {pct(q)} %
                </span>
                <span className="traj-meta">
                  {q.volume_consomme_kg} / {q.volume_autorise_kg} kg · {q.periode_debut} → {q.periode_fin}
                  {q.zone_id ? ' · zone liée' : ''}
                </span>
                <div className={barClass(q)} aria-hidden>
                  <i style={{ width: `${Math.min(100, pct(q))}%` }} />
                </div>
                <div className="zone-actions" style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="ghost compact danger-ghost"
                    disabled={loading}
                    onClick={() =>
              void onDelete(q.id)}
                  ><IconTrash size={16} /> Supprimer</button>
                </div>
              </div>
            )}
          />

          <h2 style={{ marginTop: 28 }}>Alertes quotas</h2>
          <p className="landing-section-lede" style={{ marginBottom: 12 }}>
            Visible ici en attendant le tableau de bord M6 — critère §5.5.
          </p>
          <CompactList
            items={alertes}
            getKey={(a) => a.id}
            initial={5}
            empty={<p className="empty-list">Aucune alerte de dépassement pour l’instant.</p>}
            renderItem={(a) => (
              <div
                className="traj-item"
                style={{
                  borderLeftColor:
                    a.niveau_gravite === 'critique' ? 'var(--danger)' : 'var(--warn)',
                }}
              >
                <span className="traj-title">
                  {String(a.declencheur.espece ?? '—')} · seuil{' '}
                  {Math.round(Number(a.declencheur.seuil) * 100)} %
                </span>
                <span className="traj-meta">
                  {a.niveau_gravite} · {a.statut} ·{' '}
                  {new Date(a.horodatage).toLocaleString()}
                </span>
              </div>
            )}
          />
        </div>
      </div>
    </section>
  );
}
