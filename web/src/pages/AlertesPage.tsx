import { useCallback, useEffect, useState } from 'react';

import { listAlertes, patchAlerteStatut, QuotaAlerte, refreshNotifications } from '../api';
import CompactList from '../components/CompactList';
import { useToast } from '../components/ToastProvider';
import { friendlyApiError } from '../lib/apiErrors';
import { MODULE_VISUALS } from '../media';
import { IconCheckCircle, IconXCircle } from '../components/Icons';

const TYPE_LABELS: Record<string, string> = {
  zone_interdite: 'Intrusion en zone interdite',
  depassement_quota: 'Dépassement de quota',
  anomalie: 'Activité inhabituelle',
};

const GRAVITE_LABELS: Record<string, string> = {
  info: 'Information',
  attention: 'Attention',
  critique: 'Critique',
};

const REGLE_LABELS: Record<string, string> = {
  intrusion_zone_interdite: 'Position relevée à l’intérieur d’une zone interdite',
  depassement_quota: 'Volume déclaré supérieur au quota autorisé',
  activite_inhabituelle: 'Activité inhabituelle détectée',
  silence_gps: 'Absence de signal GPS prolongée',
  meteo_marine: 'Conditions de mer dangereuses pour les pirogues',
  crue_fleuve: 'Crue annoncée sur le fleuve',
};

function humanize(code: unknown): string {
  if (code === null || code === undefined) return '—';
  const text = String(code);
  return REGLE_LABELS[text] ?? text.replaceAll('_', ' ').replace(/^\w/u, (c) => c.toUpperCase());
}

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
    setStatus(
      list.length === 0
        ? 'Aucune alerte en attente de traitement'
        : `${list.length} alerte${list.length > 1 ? 's' : ''} en attente de traitement`,
    );
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
          <p className="eyebrow">Opérations · Événements à traiter</p>
          <h1>Alertes</h1>
          <p>
            Intrusions en zone interdite, dépassements de quota et activités inhabituelles.
            Chaque alerte indique la règle qui l’a déclenchée.
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
              {TYPE_LABELS[a.type] ?? humanize(a.type)}
              <span className={`alert-level alert-level--${a.niveau_gravite}`}>
                {GRAVITE_LABELS[a.niveau_gravite] ?? a.niveau_gravite}
              </span>
            </strong>
            <span>
              {humanize(a.declencheur.regle ?? a.declencheur.espece ?? a.declencheur.zone_nom)}
              {a.declencheur.secteur ? ` · ${String(a.declencheur.secteur)}` : ''}
              {a.declencheur.station ? ` · ${String(a.declencheur.station)}` : ''}
              {' · '}
              {new Date(a.horodatage).toLocaleString('fr-FR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <div className="zone-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="ghost compact"
                disabled={loading}
                onClick={() =>
              void setStatut(a.id, 'traitee')}
              ><IconCheckCircle size={16} /> Marquer comme traitée</button>
              <button
                type="button"
                className="ghost compact"
                disabled={loading}
                onClick={() =>
              void setStatut(a.id, 'ignoree')}
              ><IconXCircle size={16} /> Ignorer</button>
            </div>
          </div>
        )}
      />
    </section>
  );
}
