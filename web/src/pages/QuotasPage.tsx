import { FormEvent, useCallback, useEffect, useState } from 'react';

import {
  createQuota,
  deleteQuota,
  getCapturesCatalog,
  graviteLabel,
  listQuotaAlertes,
  listQuotas,
  listZones,
  QuotaAlerte,
  QuotaRead,
  ZoneReglementee,
} from '../api';
import FormPanel from '../components/FormPanel';
import StatusPill from '../components/StatusPill';
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

function graviteTone(g: string): 'danger' | 'warn' {
  return g === 'critique' ? 'danger' : 'warn';
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
      setStatus('Quota créé, consommation recalculée');
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

  function zoneNom(zoneId: string | null): string {
    if (!zoneId) return 'Toutes zones';
    return zones.find((z) => z.id === zoneId)?.nom ?? 'Zone liée';
  }

  const alertes90 = alertes.filter(
    (a) => Number(a.declencheur.seuil) === 0.9 || Number(a.declencheur.seuil) === 1,
  );

  return (
    <section className="stage stage-wide quotas-stage">
      {status ? <p className="status-line">{status}</p> : null}
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
        <FormPanel
          illustration="quotas"
          title="Définir un quota"
          lede="Volume autorisé pour une espèce, une période et éventuellement une zone."
          className="quotas-panel"
        >
          <form className="stack-form" onSubmit={onCreate}>
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
        </FormPanel>

        <FormPanel illustration="quotas" title="Consommation" compact className="quotas-panel">
          {quotas.length === 0 ? (
            <p className="empty-list">Aucun quota. Créez-en un à gauche.</p>
          ) : (
            <div className="table-defile">
            <table className="ds-table empilable">
              <thead>
                <tr>
                  <th scope="col">Espèce</th>
                  <th scope="col">Consommation</th>
                  <th scope="col">Volume</th>
                  <th scope="col">Période</th>
                  <th scope="col">Zone</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {quotas.map((q) => (
                  <tr key={q.id}>
                    <td data-label="Espèce">{q.espece}</td>
                    <td data-label="Consommation">
                      {pct(q)} %
                      <div className={barClass(q)} aria-hidden>
                        <i style={{ width: `${Math.min(100, pct(q))}%` }} />
                      </div>
                    </td>
                    <td data-label="Volume">
                      {q.volume_consomme_kg.toLocaleString('fr-FR')} /{' '}
                      {q.volume_autorise_kg.toLocaleString('fr-FR')} kg
                    </td>
                    <td data-label="Période" className="cellule-serree">
                      du {q.periode_debut} au {q.periode_fin}
                    </td>
                    <td data-label="Zone">{zoneNom(q.zone_id)}</td>
                    <td data-label="Actions">
                      <div className="zone-actions">
                        <button
                          type="button"
                          className="ghost compact danger-ghost"
                          disabled={loading}
                          onClick={() => void onDelete(q.id)}
                        >
                          <IconTrash size={16} /> Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          <h2 style={{ marginTop: 28 }}>Alertes quotas</h2>
          <p className="landing-section-lede" style={{ marginBottom: 12 }}>
            Visible ici en attendant le tableau de bord M6, critère §5.5.
          </p>
          {alertes.length === 0 ? (
            <p className="empty-list">Aucune alerte de dépassement pour l’instant.</p>
          ) : (
            <table className="ds-table empilable">
              <thead>
                <tr>
                  <th scope="col">Espèce</th>
                  <th scope="col">Seuil</th>
                  <th scope="col">Gravité</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Date</th>
                </tr>
              </thead>
              <tbody>
                {alertes.map((a) => (
                  <tr key={a.id}>
                    <td data-label="Espèce">{String(a.declencheur.espece ?? 'Non renseigné')}</td>
                    <td data-label="Seuil">{Math.round(Number(a.declencheur.seuil) * 100)} %</td>
                    <td data-label="Gravité">
                      <StatusPill
                        label={graviteLabel(a.niveau_gravite)}
                        tone={graviteTone(a.niveau_gravite)}
                      />
                    </td>
                    <td data-label="Statut">{a.statut}</td>
                    <td data-label="Date" className="cellule-serree">
                      {new Date(a.horodatage).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </FormPanel>
      </div>
    </section>
  );
}
