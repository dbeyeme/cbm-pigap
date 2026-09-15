import { useEffect } from 'react';

import GabonMotif from './GabonMotif';
import { IconClose, IconLogout, NAV_ICONS } from './Icons';
import { BO_NAV, isNavActive, type NavId, type Page } from '../nav';

type Props = {
  page: Page;
  alertesBadge: number;
  demandesBadge: number;
  showAdmin: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onNavigate: (id: NavId) => void;
  onLogout: () => void;
};

function formatBadge(n: number): string {
  if (n > 999) return '999+';
  return String(n);
}

export default function AppSidebar({
  page,
  alertesBadge,
  demandesBadge,
  showAdmin,
  mobileOpen,
  onMobileClose,
  onNavigate,
  onLogout,
}: Props) {
  const items = BO_NAV.filter((item) => item.id !== 'admin' || showAdmin);

  function badgeFor(id: NavId): number {
    if (id === 'alertes') return alertesBadge;
    if (id === 'acteurs') return demandesBadge;
    return 0;
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen, onMobileClose]);

  function go(id: NavId) {
    onNavigate(id);
    onMobileClose();
  }

  return (
    <>
      <button
        type="button"
        className={`ds-sidebar-scrim${mobileOpen ? ' is-open' : ''}`}
        aria-label="Fermer le menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={onMobileClose}
      />

      <aside
        className={`ds-sidebar${mobileOpen ? ' is-open' : ''}`}
        aria-label="Navigation principale"
        id="ds-sidebar-nav"
      >
        <div className="ds-sidebar-brand">
          <img src="/logo-cbm-pigap.png" alt="" className="ds-sidebar-logo" />
          <div>
            <strong>CBM-PIGAP</strong>
            <span>Contrôle du Secteur Halieutique du Gabon</span>
          </div>
          <button
            type="button"
            className="ds-sidebar-close"
            aria-label="Fermer le menu"
            onClick={onMobileClose}
          >
            <IconClose size={18} />
          </button>
        </div>

        <nav className="ds-sidebar-nav">
          {items.map((item) => {
            const on = isNavActive(page, item.id);
            const badge = badgeFor(item.id);
            const Icon = NAV_ICONS[item.id];
            return (
              <button
                key={item.id}
                type="button"
                className={`ds-nav-item${on ? ' ds-nav-on' : ''}${badge > 0 ? ' ds-nav-attention' : ''}`}
                onClick={() => go(item.id)}
              >
                <span className="ds-nav-glyph" aria-hidden>
                  <Icon size={18} />
                </span>
                <span className="ds-nav-label">{item.label}</span>
                {badge > 0 ? <span className="ds-nav-badge">{formatBadge(badge)}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="ds-sidebar-foot">
          <GabonMotif className="ds-sidebar-gabon" />
          <button
            type="button"
            className="ds-nav-item ds-nav-logout"
            onClick={() => {
              onMobileClose();
              onLogout();
            }}
          >
            <span className="ds-nav-glyph" aria-hidden>
              <IconLogout size={18} />
            </span>
            <span className="ds-nav-label">Déconnexion</span>
          </button>
        </div>
      </aside>
    </>
  );
}
