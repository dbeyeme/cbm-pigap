import { NotificationSummary } from '../api';
import { PAGE_TITLES, roleLabelFr, type Page } from '../nav';
import { IconMenu, IconSearch } from './Icons';
import NotificationBell from './NotificationBell';

type Props = {
  page: Page;
  meRole: string | null;
  meNom: string | null;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
  notifSummary: NotificationSummary;
  notifConnected: boolean;
  notifOpen: boolean;
  onNotifToggle: () => void;
  onNotifNavigate: (page: 'demandes' | 'alertes') => void;
  onMenuOpen?: () => void;
};

function formatNow(): { date: string; time: string } {
  const now = new Date();
  return {
    date: now.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
  };
}

export default function AppTopbar({
  page,
  meRole,
  meNom,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  notifSummary,
  notifConnected,
  notifOpen,
  onNotifToggle,
  onNotifNavigate,
  onMenuOpen,
}: Props) {
  const { date, time } = formatNow();
  const title = PAGE_TITLES[page] ?? 'Portail';
  const roleLabel = roleLabelFr(meRole);
  const displayName = meNom?.trim() || 'Utilisateur';

  return (
    <header className="ds-topbar">
      <div className="ds-topbar-lead">
        {onMenuOpen ? (
          <button
            type="button"
            className="ds-menu-toggle"
            aria-label="Ouvrir le menu"
            aria-controls="ds-sidebar-nav"
            onClick={onMenuOpen}
          >
            <IconMenu size={20} />
          </button>
        ) : null}
        <div className="ds-topbar-mobile-title">
          <strong>{title}</strong>
        </div>
      </div>

      <form
        className="ds-topbar-search"
        onSubmit={(e) => {
          e.preventDefault();
          onSearchSubmit();
        }}
      >
        <span className="ds-topbar-search-icon" aria-hidden>
          <IconSearch size={18} />
        </span>
        <input
          type="search"
          placeholder="Rechercher un navire, un acteur, une zone…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Recherche"
        />
      </form>

      <div className="ds-topbar-meta">
        <span
          className="ds-topbar-status-dot"
          title="Système opérationnel"
          aria-label="Système opérationnel"
        />
        <span className="ds-topbar-clock">
          {date} · {time}
        </span>
      </div>

      <div className="ds-topbar-actions">
        <NotificationBell
          summary={notifSummary}
          connected={notifConnected}
          open={notifOpen}
          onToggle={onNotifToggle}
          onNavigate={onNotifNavigate}
        />
        <div className="ds-topbar-user">
          <div className="ds-avatar" aria-hidden>
            {displayName.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <strong>{displayName}</strong>
            <span>{roleLabel}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
