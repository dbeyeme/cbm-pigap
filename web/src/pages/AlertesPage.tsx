import { useCallback, useEffect, useState } from 'react';

import { listAlertes, patchAlerteStatut, QuotaAlerte, refreshNotifications } from '../api';
import CompactList from '../components/CompactList';
import { useToast } from '../components/ToastProvider';
import { friendlyApiError } from '../lib/apiErrors';
import { MODULE_VISUALS } from '../media';

type Props = {
  token: string;
  onError: (msg: string | null) => void;
};

export default function AlertesPage({ token, onError }: Props) {
  const toast = useToast();
  const [rows, setRows] = useState<QuotaAlerte[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const fail = useCallback(
    (err: unknown, title: string) => {
      const msg = friendlyApiError(err);
      onError(msg);
      toast.error(title, msg);
    },
    [onError, toast],
  );

  const refresh = useCallback(async () => {
    const list = await listAlertes(token, { statut: 'nouvelle' });
    setRows(list);
    setStatus(`${list.length} alerte(s) nouvelle(s)`);
  }, [token]);

  useEffect(() => {
    void refresh().catch((err) => fail(err, 'Chargement des alertes impossible'));
  }, [refresh, fail]);

  async function setStatut(id: string, statut: 'traitee' | 'ignoree') {
    setLoading(true);
    onError(null);
    try {
      await patchAlerteStatut(token, id, statut);
      await refresh();
      refreshNotifications();
      toast.success(
        statut === 'traitee' ? 'Alerte traitée' : 'Alerte ignorée',
        'Le compteur de notifications a été mis à jour.',
      );
    } catch (err) {
      fail(err, 'Mise à jour de l’alerte impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="stage stage-wide cmd-overlay-panel">
      <div className="stage-head page-head-with-icon">
        <img src={MODULE_VISUALS.alertes.src} alt="" className="page-module-icon" />
        <div>
          <p className="eyebrow">Module M7 · Règles explicites</p>
          <h1>Alertes</h1>
          <p>
            Zone interdite · dépassement quota · activité inhabituelle — chaque alerte porte son
            déclencheur.
          </p>
          <p className="status-line">{status}</p>
        </div>
      </div>

      <CompactList
        items={rows}
        getKey={(a) => a.id}
        initial={8}
        empty={<p className="empty-list">Aucune alerte nouvelle.</p>}
        renderItem={(a) => (
          <div
            className={`dashboard-alert pending-pulse ${a.niveau_gravite === 'critique' ? 'danger' : 'warn'}`}
          >
            <strong>
              {a.type.replaceAll('_', ' ')} · {a.niveau_gravite}
            </strong>
            <span>
              {String(
                a.declencheur.regle ??
                  a.declencheur.espece ??
                  a.declencheur.zone_nom ??
                  '—',
              )}{' '}
              · {new Date(a.horodatage).toLocaleString('fr-FR')}
            </span>
            <div className="zone-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="ghost compact"
                disabled={loading}
                onClick={() => void setStatut(a.id, 'traitee')}
              >
                Traiter
              </button>
              <button
                type="button"
                className="ghost compact"
                disabled={loading}
                onClick={() => void setStatut(a.id, 'ignoree')}
              >
                Ignorer
              </button>
            </div>
          </div>
        )}
      />
    </section>
  );
}
