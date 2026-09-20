/** Icônes SVG personnalisées CBM-PIGAP — maritime gabonais (monoline + détail). */

import type { ReactNode } from 'react';

type IconProps = {
  size?: number;
  className?: string;
  title?: string;
};

function Svg({
  size = 20,
  className,
  title,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Tableau de bord — grille + signal radar. */
export function IconDashboard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <circle cx="17" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Acteurs — pêcheur + organisation. */
export function IconUsers(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="7.5" r="2.8" />
      <path d="M3.2 19c.7-3.2 2.8-4.8 5.8-4.8s5.1 1.6 5.8 4.8" />
      <circle cx="17.2" cy="9" r="2.1" />
      <path d="M14.2 19c.35-1.7 1.5-2.7 3.1-2.7 1.1 0 2 .45 2.5 1.3" />
    </Svg>
  );
}

/** Navire / bateau de pêche (distinct de la pirogue). */
export function IconShip(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 15.5h17l-1.6 3.2H5.1L3.5 15.5Z" />
      <path d="M5.5 15.5V11h8.5v4.5" />
      <path d="M14 11h4v3h-4z" />
      <path d="M7 9.2h2.2v2.3H7z" />
      <path d="M10 8.2h2.2v3.3H10z" />
      <path d="M18.2 12h2.2l1 2.2h-3.8l.6-2.2Z" />
      <circle cx="20.2" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Captures / poissons. */
export function IconFish(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 12s3.2-4.8 8.5-4.8S20.5 12 20.5 12s-3.2 4.8-8.5 4.8S3.5 12 3.5 12Z" />
      <circle cx="16.2" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <path d="M3.5 12h3" />
      <path d="M5.8 9.8 3.8 8" />
      <path d="M5.8 14.2 3.8 16" />
    </Svg>
  );
}

/** Surveillance radar. */
export function IconRadar(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.8" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 12 18.2 7.2" />
      <path d="M12 4v2.2" opacity="0.5" />
    </Svg>
  );
}

/** Alerte triangle. */
export function IconAlert(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.8 21 19.2H3L12 3.8Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.6" r="0.85" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Rapport / dossier. */
export function IconReport(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3.8h6.8L18.5 8.5V19.5A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 7 3.8Z" />
      <path d="M13.8 3.8V8.5h4.7" />
      <path d="M8.5 12.2h7" />
      <path d="M8.5 15.5h5" />
    </Svg>
  );
}

/** Cartographie Gabon / zones. */
export function IconMap(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 4.2 3.2 6.4v12.8L9 17.2l6 2.2 5.8-2.2V4.4L15 6.4 9 4.2Z" />
      <path d="M9 4.2v13" />
      <path d="M15 6.4v13" />
      <circle cx="11.5" cy="11" r="1.4" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M12 3.2v2.4M12 18.4v2.4M4.5 6.2l1.7 1.7M17.8 16.1l1.7 1.7M3.2 12h2.4M18.4 12h2.4M4.5 17.8l1.7-1.7M17.8 7.9l1.7-1.7" />
    </Svg>
  );
}

export function IconLogout(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 12h9" />
      <path d="M16.2 8.3 19.8 12l-3.6 3.7" />
      <path d="M13 4.8H7.2A1.8 1.8 0 0 0 5.4 6.6v10.8a1.8 1.8 0 0 0 1.8 1.8H13" />
    </Svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.2 19.2 6.2v5.4c0 4.2-2.9 7.2-7.2 8.6-4.3-1.4-7.2-4.4-7.2-8.6V6.2L12 3.2Z" />
      <path d="M9.2 12.1 11.2 14l3.6-3.8" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.2" />
      <path d="m15.8 15.8 3.6 3.6" />
    </Svg>
  );
}

export function IconMenu(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

export function IconClose(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconRefresh(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.1-5.2" />
      <path d="M19.5 4.5v5h-5" />
    </Svg>
  );
}

export function IconCalendar(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
    </Svg>
  );
}

export function IconBell(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5a5 5 0 0 1 5 5v3.2l1.6 2.4H5.4L7 11.7V8.5a5 5 0 0 1 5-5Z" />
      <path d="M10 18.2a2 2 0 0 0 4 0" />
    </Svg>
  );
}

/** Côte atlantique. */
export function IconCoast(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 16c2.2-1.4 3.8.4 5.8-.6 2-.9 3.2-2.8 5.4-2.4 1.8.3 3.2 1.6 6.8 1.2" />
      <path d="M3 19.2h18" opacity="0.45" />
      <path d="M14 6.5c1.2 1.6 2.4 2.2 4 2.2" />
      <circle cx="8.2" cy="9.2" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Fleuve / corridor. */
export function IconRiver(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4c-1.5 2.5 1.5 3.5 0 6s-1.5 3.5 0 6 1.5 3.5 0 4" />
      <path d="M13 4c-1.5 2.5 1.5 3.5 0 6s-1.5 3.5 0 6 1.5 3.5 0 4" />
      <path d="M18 4c-1.5 2.5 1.5 3.5 0 6s-1.5 3.5 0 6 1.5 3.5 0 4" />
    </Svg>
  );
}

/** Bras de mer / estuaire. */
export function IconEstuary(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 18c3-4 5-7 8-7s5 3 8 7" />
      <path d="M7 12c1.2-2.4 2.6-3.8 5-3.8s3.8 1.4 5 3.8" opacity="0.55" />
      <path d="M12 5v3.2" />
    </Svg>
  );
}

/** Foyer d’activité / hotspot. */
export function IconHotspot(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="8.2" opacity="0.55" />
    </Svg>
  );
}

export function IconPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Pirogue artisanale (distinct du navire). */
export function IconPirogue(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 14.5c1.8-.9 5.2-1.5 8.5-1.5s6.7.6 8.5 1.5c-.7 1.5-3.2 2.8-8.5 2.8s-7.8-1.3-8.5-2.8Z" />
      <path d="M12 13.2V7.2" />
      <path d="M12 7.5c1.8 0 3.2.6 4.2 1.5" />
      <path d="M6 16.8c2 .5 4 .7 6 .7s4-.2 6-.7" opacity="0.45" />
    </Svg>
  );
}

export const NAV_ICONS = {
  dashboard: IconDashboard,
  acteurs: IconUsers,
  navires: IconShip,
  peches: IconFish,
  surveillance: IconRadar,
  alertes: IconAlert,
  rapports: IconReport,
  cartographie: IconMap,
  admin: IconSettings,
} as const;

/* ——— Icônes d'action (boutons, onglets) ——— */

export function IconCheck(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12.5l4.5 4.5L19.5 6.5" />
    </Svg>
  );
}

export function IconCheckCircle(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.2 12.2l2.5 2.5 5-5.4" />
    </Svg>
  );
}

export function IconXCircle(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </Svg>
  );
}

export function IconTrash(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l.8 12.2a1.3 1.3 0 001.3 1.3h6.8a1.3 1.3 0 001.3-1.3L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  );
}

export function IconFilter(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5.5h16L14 13v5.5l-4 2V13L4 5.5Z" />
    </Svg>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M4.5 18.5h15" />
    </Svg>
  );
}

export function IconUpload(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4.5 18.5h15" />
    </Svg>
  );
}

export function IconEdit(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 19.5h4l10-10a2.1 2.1 0 00-3-3l-10 10v3Z" />
      <path d="M13.5 8.5l2 2" />
    </Svg>
  );
}

export function IconEye(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.6" />
    </Svg>
  );
}

export function IconSave(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 4.5h11l3 3v12H5v-15Z" />
      <path d="M8 4.5v5h7v-5M8.5 19.5v-5.5h7v5.5" />
    </Svg>
  );
}

export function IconUserPlus(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 19.5c0-3.3 2.9-5.5 6.5-5.5 1.3 0 2.5.3 3.5.8M18 13v6M15 16h6" />
    </Svg>
  );
}

export function IconBuilding(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20.5V5.5l8-2.5v17.5M12 9.5l8 2v9" />
      <path d="M7 8.5h2M7 12h2M7 15.5h2M15.5 14h2M15.5 17h2M4 20.5h16" />
    </Svg>
  );
}

export function IconCard(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="6" width="18" height="12" rx="2.2" />
      <path d="M3 10.5h18M7 14.5h4" />
    </Svg>
  );
}

export function IconReceipt(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5v-17Z" />
      <path d="M9 8.5h6M9 12h6M9 15.5h4" />
    </Svg>
  );
}

export function IconPuzzle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 4.5a2 2 0 014 0V6h3.5v3.5h1.5a2 2 0 010 4H17V17h-3.5v1.5a2 2 0 01-4 0V17H6v-3.5H4.5a2 2 0 010-4H6V6h3.5V4.5Z" />
    </Svg>
  );
}

export function IconLogin(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 4.5H5.5v15H10M9 12h11M16.5 8.5L20 12l-3.5 3.5" />
    </Svg>
  );
}

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12h15M13.5 6l6 6-6 6" />
    </Svg>
  );
}

export function IconArrowLeft(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19.5 12h-15M10.5 6l-6 6 6 6" />
    </Svg>
  );
}

export function IconFileText(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3.5h7l4 4v13H7v-17Z" />
      <path d="M14 3.5v4h4M9.5 12h5M9.5 15.5h5" />
    </Svg>
  );
}

export function IconInbox(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 13.5l2-8h12l2 8v6H4v-6Z" />
      <path d="M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20" />
    </Svg>
  );
}

export function IconBadge(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l2.4 1.7 2.9-.3 1 2.8 2.6 1.4-.9 2.8.9 2.8-2.6 1.4-1 2.8-2.9-.3L12 19.5l-2.4-1.7-2.9.3-1-2.8-2.6-1.4.9-2.8-.9-2.8 2.6-1.4 1-2.8 2.9.3L12 3Z" />
      <path d="M9.5 11.5l1.8 1.8 3.4-3.6" />
    </Svg>
  );
}

export function IconSparkle(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8L12 3.5Z" />
      <path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" />
    </Svg>
  );
}

export function IconCollapse(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 5.5v13M20 12H9M13 8l-4 4 4 4" />
    </Svg>
  );
}

export function IconExpand(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 5.5v13M9 12h11M16 8l4 4-4 4" />
    </Svg>
  );
}

export function IconAnchor(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="5.5" r="2" />
      <path d="M12 7.5v13M5 12.5c0 4.4 3.1 8 7 8s7-3.6 7-8M4 11.5l1 1 1-1M18 11.5l1 1 1-1M8.5 10.5h7" />
    </Svg>
  );
}

export function IconGlobe(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.8 2.6 4 5.4 4 8.5s-1.2 5.9-4 8.5c-2.8-2.6-4-5.4-4-8.5s1.2-5.9 4-8.5Z" />
    </Svg>
  );
}
