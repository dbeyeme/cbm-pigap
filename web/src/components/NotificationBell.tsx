import { NotificationSummary } from '../api';
import { IconAlert, IconBell, IconUsers } from './Icons';

type Props = {
  summary: NotificationSummary;
  connected: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: (page: 'demandes' | 'alertes') => void;
};

/**
 * Cloche notifications — compteurs demandes / alertes en attente.
 */
export default function NotificationBell({
  summary,
  connected,
  open,
  onToggle,
  onNavigate,
}: Props) {
  const total = summary.total;

  return (
    <div className={`notif-wrap${open ? ' open' : ''}`}>
      <button
        type="button"
        className={`notif-bell${total > 0 ? ' has-unread' : ''}`}
        aria-label={total > 0 ? `${total} notification(s)` : 'Notifications'}
        aria-expanded={open}
        onClick={onToggle}
        title={connected ? 'Notifications temps réel' : 'Notifications (reconnexion…)'}
      >
        <IconBell size={20} />
        {total > 0 ? <span className="notif-badge">{total}</span> : null}
        <span className={`notif-live${connected ? ' on' : ''}`} aria-hidden />
      </button>

      {open ? (
        <div className="notif-panel glass-block" role="dialog" aria-label="Notifications">
          <header className="notif-panel-head">
            <strong>
              <IconBell size={14} /> À traiter
            </strong>
            <span>
              {summary.demandes_en_attente} demande(s) · {summary.alertes_nouvelles} alerte(s)
            </span>
          </header>
          {summary.items.length === 0 ? (
            <p className="empty-list">Rien en attente pour le moment.</p>
          ) : (
            <ul className="notif-list">
              {summary.items.map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={`notif-item notif-${item.kind}`}
                    onClick={() => onNavigate(item.page)}
                  >
                    <span className="notif-item-icon" aria-hidden>
                      {item.kind === 'demande' ? (
                        <IconUsers size={15} />
                      ) : (
                        <IconAlert size={15} />
                      )}
                    </span>
                    <span className="notif-item-kind">
                      {item.kind === 'demande' ? 'Demande' : 'Alerte'}
                    </span>
                    <strong>{item.title}</strong>
                    <span>{item.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <footer className="notif-panel-foot">
            <button type="button" className="ghost" onClick={() => onNavigate('demandes')}>
              <IconUsers size={14} /> Demandes
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate('alertes')}>
              <IconAlert size={14} /> Alertes
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
