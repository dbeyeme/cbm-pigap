import { useEffect, useState, type CSSProperties } from 'react';

import GabonMotif from './GabonMotif';
import { IconClose, IconCollapse, IconExpand, IconLogout, NAV_ICONS } from './Icons';
import {
  NAV_SECTIONS,
  isNavActive,
  navItemsForRole,
  type NavId,
  type NavItem,
  type Page,
} from '../nav';

export type SidebarSystemStatus = {
  /** false tant que l'état du flux n'a pas été reçu du serveur */
  aisKnown: boolean;
  aisConfigured: boolean;
  aisConnected: boolean;
  aisVessels: number;
  liveVessels: number;
  receivers: number;
};

type Props = {
  page: Page;
  alertesBadge: number;
  demandesBadge: number;
  meRole: string | null;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onNavigate: (id: NavId) => void;
  onLogout: () => void;
  systemStatus?: SidebarSystemStatus;
};

function formatBadge(n: number): string {
  if (n > 999) return '999+';
  return String(n);
}

export default function AppSidebar({
  page,
  alertesBadge,
  demandesBadge,
  meRole,
  mobileOpen,
  onMobileClose,
  onNavigate,
  onLogout,
  systemStatus,
}: Props) {
  const items = navItemsForRole(meRole);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pigap.sidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('pigap.sidebar.collapsed', collapsed ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
    document.documentElement.classList.toggle('sidebar-collapsed', collapsed);
  }, [collapsed]);

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

  const grouped = NAV_SECTIONS.map((section) => ({
    ...section,
    items: items.filter((item) => item.section === section.id),
  })).filter((section) => section.items.length > 0);

  const aisTone = !systemStatus?.aisKnown
    ? 'wait'
    : systemStatus.aisConnected
      ? 'ok'
      : systemStatus.aisConfigured
        ? 'warn'
        : 'off';
  const aisLabel = !systemStatus?.aisKnown
    ? 'Flux AIS · état en attente'
    : systemStatus.aisConnected
      ? 'Flux AIS connecté'
      : systemStatus.aisConfigured
        ? 'Flux AIS en reconnexion'
        : 'Flux AIS non configuré';

  function renderItem(item: NavItem, index: number) {
    const on = isNavActive(page, item.id);
    const badge = badgeFor(item.id);
    const Icon = NAV_ICONS[item.id];
    return (
      <button
        key={item.id}
        type="button"
        className={`ds-nav-item${on ? ' ds-nav-on' : ''}${badge > 0 ? ' ds-nav-attention' : ''}`}
        style={{ '--i': index } as CSSProperties}
        onClick={() => go(item.id)}
        aria-current={on ? 'page' : undefined}
        title={item.label}
      >
        <span className="ds-nav-glyph" aria-hidden>
          <Icon size={18} />
        </span>
        <span className="ds-nav-text">
          <span className="ds-nav-label">{item.label}</span>
          <span className="ds-nav-hint">{item.hint}</span>
        </span>
        {badge > 0 ? (
          <span className="ds-nav-badge" aria-label={`${badge} à traiter`}>
            {formatBadge(badge)}
          </span>
        ) : (
          <span className="ds-nav-chevron" aria-hidden>
            ›
          </span>
        )}
      </button>
    );
  }

  let running = 0;

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
        className={`ds-sidebar${mobileOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
        aria-label="Navigation principale"
        id="ds-sidebar-nav"
      >
        <button
          type="button"
          className="ds-sidebar-collapse"
          onClick={() => setCollapsed((c) => !c)}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
        >
          {collapsed ? <IconExpand size={16} /> : <IconCollapse size={16} />}
        </button>
        <div className="ds-sidebar-brand">
          <span className="ds-sidebar-logo-ring" aria-hidden>
            <img src="/logo-cbm-pigap.png" alt="" className="ds-sidebar-logo" />
          </span>
          <div>
            <strong>CBM-PIGAP</strong>
            <span>Contrôle du secteur halieutique · Gabon</span>
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
          {grouped.map((section) => (
            <div key={section.id} className="ds-nav-section">
              <span className="ds-nav-section-label">{section.label}</span>
              {section.items.map((item) => renderItem(item, running++))}
            </div>
          ))}
        </nav>

        <div className="ds-sidebar-foot">
          <GabonMotif className="ds-sidebar-gabon" />
          {systemStatus ? (
            <div className="ds-sys-status" aria-live="polite">
              <div className={`ds-sys-line ds-sys-${aisTone}`}>
                <i aria-hidden />
                <span>{aisLabel}</span>
              </div>
              <div className="ds-sys-grid">
                <span>
                  <b>{systemStatus.liveVessels}</b> GPS PIGAP
                </span>
                <span>
                  <b>{systemStatus.aisVessels}</b> navires AIS
                </span>
                <span>
                  <b>{systemStatus.receivers}</b> récepteur{systemStatus.receivers > 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ) : null}
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
            <span className="ds-nav-text">
              <span className="ds-nav-label">Déconnexion</span>
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
