import { NotificationSummary } from '../api';

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
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
          <path
            fill="currentColor"
            d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"
          />
        </svg>
        {total > 0 ? <span className="notif-badge">{total}</span> : null}
        <span className={`notif-live${connected ? ' on' : ''}`} aria-hidden />
      </button>

      {open ? (
        <div className="notif-panel glass-block" role="dialog" aria-label="Notifications">
          <header className="notif-panel-head">
            <strong>À traiter</strong>
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
              Demandes
            </button>
            <button type="button" className="ghost" onClick={() => onNavigate('alertes')}>
              Alertes
            </button>
          </footer>
        </div>
      ) : null}
    </div>
  );
}

/** Badge compact pour le rail — compteur exact. */
export function RailBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="rail-badge">{count}</span>;
}
