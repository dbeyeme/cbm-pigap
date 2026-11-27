/**
 * Illustrations PIGAP — deux registres :
 * - pictogramme (formulaires, modales, ≤ 88 px) : un sujet plein, lisible d'un coup d'œil
 * - scène (en-têtes, états vides, ≥ 90 px) : même sujet, plus d'air, mer gabonaise
 */

export type IllustrationName =
  | 'acteurs'
  | 'demande'
  | 'licence'
  | 'organisation'
  | 'abonnement'
  | 'navire'
  | 'surveillance'
  | 'alertes'
  | 'captures'
  | 'quotas'
  | 'zones'
  | 'rapports'
  | 'equipe'
  | 'succes'
  | 'vide'
  | 'controles'
  | 'redevances';

export type IllustrationVariant = 'auto' | 'pictogram' | 'scene';

type Props = {
  name: IllustrationName;
  size?: number;
  className?: string;
  variant?: IllustrationVariant;
};

const NAVY = '#0b1f3a';
const BLUE = '#1b6ca8';
const LIGHT = '#7cc4ff';
const FOAM = '#e0f2fe';
const SAND = '#fde68a';
const GREEN = '#15803d';
const RED = '#b91c1c';
const WOOD = '#9a3412';
const SKY = '#e8f4fc';

const PICTO_BG: Record<IllustrationName, string> = {
  acteurs: '#1b6ca8',
  demande: '#075985',
  licence: '#15803d',
  organisation: '#1e3a5f',
  abonnement: '#0e4d7a',
  navire: '#0b1f3a',
  surveillance: '#0369a1',
  alertes: '#b91c1c',
  captures: '#0e7490',
  quotas: '#0f766e',
  zones: '#1d4ed8',
  rapports: '#334155',
  equipe: '#1b4f8a',
  succes: '#15803d',
  vide: '#64748b',
  controles: '#115e59',
  redevances: '#a16207',
};

function Sky() {
  return (
    <>
      <rect width="120" height="128" fill={SKY} />
      <circle cx="98" cy="26" r="12" fill={SAND} />
      <circle cx="98" cy="26" r="20" fill={SAND} opacity="0.22" />
    </>
  );
}

function Water({ y = 100 }: { y?: number }) {
  return (
    <>
      <path d={`M0 ${y} Q 20 ${y - 8} 40 ${y} T 80 ${y} T 120 ${y} V 128 H 0 Z`} fill={BLUE} />
      <path d={`M0 ${y + 10} Q 20 ${y + 4} 40 ${y + 10} T 80 ${y + 10} T 120 ${y + 10} V 128 H 0 Z`} fill={NAVY} />
    </>
  );
}

function Pirogue({ x = 40, y = 96, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <circle cx="-2" cy="-16" r="5" fill={FOAM} />
      <path d="M-2 -11 v 8" stroke={FOAM} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-26 0 Q -18 10 0 10 Q 20 10 26 0 Q 12 -3 0 -3 Q -12 -3 -26 0 Z" fill={WOOD} />
      <path d="M-16 -1 H 16" stroke="#fed7aa" strokeWidth="1.6" opacity="0.75" />
      <path d="M8 -18 L 18 -28" stroke={FOAM} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

function Ship({ x = 64, y = 88, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-34 2 H 34 L 26 16 H -26 Z" fill={NAVY} />
      <rect x="-16" y="-16" width="28" height="18" rx="2" fill={BLUE} />
      <rect x="6" y="-28" width="12" height="12" rx="1.5" fill={LIGHT} />
      <rect x="-10" y="-10" width="5" height="5" fill={FOAM} />
      <rect x="-2" y="-10" width="5" height="5" fill={FOAM} />
      <path d="M12 -28 v -10" stroke={FOAM} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-34 2 H 34" stroke={FOAM} strokeWidth="1.6" opacity="0.55" />
    </g>
  );
}

function Fish({ x = 60, y = 58, scale = 1, fill = BLUE }: { x?: number; y?: number; scale?: number; fill?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path
        d="M-32 0 C-22 -14 -6 -18 10 -8 C20 -3 28 0 32 0 C28 0 20 3 10 8 C-6 18 -22 14 -32 0 Z"
        fill={fill}
      />
      <path d="M26 0 L42 -14 L42 14 Z" fill={fill} />
      <path d="M-6 -12 L4 -26 L8 -8" fill={fill} />
      <circle cx="-18" cy="-4" r="3.2" fill={FOAM} />
      <path d="M-8 0 q 10 -6 18 0" stroke={FOAM} strokeWidth="1.6" fill="none" opacity="0.7" />
    </g>
  );
}

function Pin({ x = 60, y = 58, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 -36 C-16 -36 -28 -24 -28 -8 C-28 12 0 36 0 36 S 28 12 28 -8 C28 -24 16 -36 0 -36 Z" fill={RED} />
      <circle cx="0" cy="-10" r="10" fill="#fff" />
      <path d="M0 -16 v 8" stroke={RED} strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="0" cy="-4" r="2.2" fill={RED} />
    </g>
  );
}

function sceneCommon(name: IllustrationName, size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 120 128',
    className: `pigap-illustration pigap-illustration--scene pigap-illustration--${name}${className ? ` ${className}` : ''}`,
    'aria-hidden': true as const,
    role: 'presentation' as const,
  };
}

function Scene({ name, size, className }: { name: IllustrationName; size: number; className?: string }) {
  const common = sceneCommon(name, size, className);
  switch (name) {
    case 'acteurs':
      return (
        <svg {...common}>
          <Sky />
          <ellipse cx="44" cy="28" rx="16" ry="4.5" fill={SAND} />
          <circle cx="44" cy="40" r="12" fill={BLUE} />
          <circle cx="44" cy="36" r="6" fill={FOAM} />
          <path d="M26 70 q 18 -20 36 0" fill={BLUE} />
          <Pirogue x={78} y={98} scale={0.85} />
          <Water y={102} />
        </svg>
      );
    case 'demande':
      return (
        <svg {...common}>
          <Sky />
          <rect x="22" y="16" width="50" height="64" rx="6" fill="#fff" stroke={BLUE} strokeWidth="2.5" />
          <path d="M48 16 v 16 h 24" fill="none" stroke={BLUE} strokeWidth="2.5" />
          <path d="M32 44 h 28 M32 54 h 22" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
          <circle cx="78" cy="78" r="16" fill={SAND} />
          <path d="M72 78 l 5 5 10 -12" stroke={NAVY} strokeWidth="3" fill="none" strokeLinecap="round" />
          <Water y={104} />
        </svg>
      );
    case 'licence':
      return (
        <svg {...common}>
          <Sky />
          <rect x="18" y="28" width="84" height="52" rx="8" fill="#fff" stroke={GREEN} strokeWidth="2.5" />
          <rect x="28" y="40" width="22" height="22" rx="4" fill={GREEN} />
          <path d="M58 44 h 34 M58 54 h 26 M58 64 h 18" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
          <circle cx="88" cy="70" r="8" fill={GREEN} />
          <path d="M84 70 l 3 3 6 -7" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <Water y={104} />
        </svg>
      );
    case 'organisation':
      return (
        <svg {...common}>
          <Sky />
          <path d="M18 92 V 44 l 28 -16 v 64" fill={BLUE} />
          <path d="M46 92 V 52 l 28 8 v 32" fill={NAVY} />
          <rect x="26" y="52" width="8" height="8" fill={FOAM} />
          <rect x="26" y="66" width="8" height="8" fill={FOAM} />
          <rect x="54" y="64" width="7" height="7" fill={FOAM} />
          <rect x="54" y="76" width="7" height="7" fill={FOAM} />
          <Ship x={96} y={90} scale={0.48} />
          <Water y={100} />
        </svg>
      );
    case 'abonnement':
      return (
        <svg {...common}>
          <Sky />
          <rect x="16" y="32" width="88" height="48" rx="8" fill={BLUE} />
          <rect x="16" y="46" width="88" height="10" fill={NAVY} />
          <rect x="26" y="64" width="24" height="8" rx="2" fill={FOAM} />
          <circle cx="86" cy="68" r="7" fill={SAND} />
          <circle cx="76" cy="68" r="7" fill={LIGHT} />
          <Water y={104} />
        </svg>
      );
    case 'navire':
      return (
        <svg {...common}>
          <Sky />
          <Ship x={64} y={84} />
          <Pirogue x={22} y={100} scale={0.7} />
          <Water y={104} />
        </svg>
      );
    case 'surveillance':
      return (
        <svg {...common}>
          <Sky />
          <circle cx="60" cy="52" r="38" fill="none" stroke={LIGHT} strokeWidth="2.4" opacity="0.45" />
          <circle cx="60" cy="52" r="24" fill="none" stroke={BLUE} strokeWidth="2.4" opacity="0.7" />
          <circle cx="60" cy="52" r="10" fill="none" stroke={NAVY} strokeWidth="2.4" />
          <path d="M60 52 L60 14 A 38 38 0 0 1 92 34 Z" fill={LIGHT} opacity="0.35" />
          <circle cx="60" cy="52" r="4" fill={NAVY} />
          <circle cx="84" cy="70" r="5" fill={RED} />
          <Water y={106} />
        </svg>
      );
    case 'alertes':
      return (
        <svg {...common}>
          <Sky />
          <Pin x={60} y={70} scale={1.05} />
          <Water y={104} />
        </svg>
      );
    case 'captures':
      return (
        <svg {...common}>
          <Sky />
          <Fish x={58} y={54} scale={1.15} fill={BLUE} />
          <Fish x={84} y={78} scale={0.55} fill={LIGHT} />
          <Water y={106} />
        </svg>
      );
    case 'quotas':
      return (
        <svg {...common}>
          <Sky />
          <path d="M24 78 A 36 36 0 1 1 96 78" fill="none" stroke={LIGHT} strokeWidth="10" strokeLinecap="round" />
          <path d="M24 78 A 36 36 0 0 1 86 48" fill="none" stroke={BLUE} strokeWidth="10" strokeLinecap="round" />
          <circle cx="60" cy="78" r="6" fill={NAVY} />
          <path d="M60 78 L 88 46" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
          <path d="M20 44 h 80" stroke={RED} strokeWidth="2.2" strokeDasharray="6 5" />
          <Water y={108} />
        </svg>
      );
    case 'zones':
      return (
        <svg {...common}>
          <Sky />
          <path
            d="M18 36 L 72 22 L 102 52 L 82 88 L 28 82 Z"
            fill={LIGHT}
            opacity="0.45"
            stroke={BLUE}
            strokeWidth="2.8"
          />
          <path d="M38 48 L 68 40 L 78 60 L 58 72 L 40 64 Z" fill={RED} opacity="0.4" stroke={RED} strokeWidth="2.2" />
          <Pin x={56} y={62} scale={0.42} />
          <Water y={106} />
        </svg>
      );
    case 'rapports':
      return (
        <svg {...common}>
          <Sky />
          <rect x="28" y="16" width="64" height="78" rx="7" fill="#fff" stroke={BLUE} strokeWidth="2.5" />
          <path d="M40 36 h 36 M40 46 h 24" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
          <path
            d="M40 82 l 12 -18 l 12 8 l 16 -24"
            stroke={BLUE}
            strokeWidth="3.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Water y={106} />
        </svg>
      );
    case 'equipe':
      return (
        <svg {...common}>
          <Sky />
          <circle cx="36" cy="42" r="11" fill={BLUE} />
          <circle cx="36" cy="38" r="5.5" fill={FOAM} />
          <path d="M22 68 q 14 -16 28 0" fill={BLUE} />
          <rect x="52" y="22" width="22" height="6" rx="1.5" fill={SAND} />
          <circle cx="64" cy="38" r="12" fill={NAVY} />
          <circle cx="64" cy="34" r="6" fill={FOAM} />
          <path d="M48 70 q 16 -18 32 0" fill={NAVY} />
          <Water y={100} />
        </svg>
      );
    case 'succes':
      return (
        <svg {...common}>
          <Sky />
          <circle cx="60" cy="54" r="30" fill={GREEN} />
          <path
            d="M42 54 l 12 12 l 24 -28"
            stroke="#fff"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Water y={106} />
        </svg>
      );
    case 'controles':
      return (
        <svg {...common}>
          <Sky />
          <rect x="16" y="18" width="50" height="58" rx="6" fill="#fff" stroke={NAVY} strokeWidth="2.5" />
          <rect x="28" y="12" width="26" height="12" rx="3" fill={NAVY} />
          <rect x="24" y="36" width="12" height="12" fill={NAVY} />
          <rect x="42" y="36" width="12" height="12" fill={NAVY} />
          <rect x="24" y="52" width="12" height="12" fill={NAVY} />
          <rect x="42" y="54" width="5" height="5" fill={NAVY} />
          <rect x="49" y="52" width="5" height="12" fill={NAVY} />
          <path d="M84 28 l 20 8 v 26 l -20 10 l -20 -10 v -26 Z" fill={BLUE} />
          <path d="M74 50 l 8 8 l 16 -18" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <Water y={104} />
        </svg>
      );
    case 'redevances':
      return (
        <svg {...common}>
          <Sky />
          <path
            d="M28 16 h 48 v 58 l -8 -5 -8 5 -8 -5 -8 5 -8 -5 -8 5 Z"
            fill="#fff"
            stroke={BLUE}
            strokeWidth="2.5"
          />
          <path d="M38 32 h 28 M38 42 h 20 M38 52 h 24" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
          <circle cx="86" cy="78" r="18" fill={SAND} />
          <circle cx="86" cy="78" r="13" fill="none" stroke={NAVY} strokeWidth="2" />
          <path d="M86 68 v 20 M80 72 h 10 M80 78 h 8" stroke={NAVY} strokeWidth="2.4" strokeLinecap="round" />
          <Water y={106} />
        </svg>
      );
    case 'vide':
    default:
      return (
        <svg {...common}>
          <Sky />
          <circle cx="60" cy="54" r="22" fill="none" stroke={LIGHT} strokeWidth="3" strokeDasharray="7 6" />
          <path d="M42 54 q 18 -12 36 0" stroke={BLUE} strokeWidth="2.4" fill="none" />
          <Water y={104} />
        </svg>
      );
  }
}

function pictoCommon(name: IllustrationName, size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    className: `pigap-illustration pigap-illustration--pictogram pigap-illustration--${name}${className ? ` ${className}` : ''}`,
    'aria-hidden': true as const,
    role: 'presentation' as const,
  };
}

function Pictogram({ name, size, className }: { name: IllustrationName; size: number; className?: string }) {
  const common = pictoCommon(name, size, className);
  const bg = PICTO_BG[name];
  return (
    <svg {...common}>
      <rect width="64" height="64" rx="16" fill={bg} />
      {pictoGlyph(name)}
    </svg>
  );
}

function pictoGlyph(name: IllustrationName) {
  switch (name) {
    case 'captures':
      return (
        <>
          <path
            fill="#fff"
            d="M8 33c4-11 16-16 28-11 6 2.5 11 7 14 11-3 4-8 8.5-14 11C24 49 12 44 8 33Z"
          />
          <path fill="#fff" d="M46 33l14-11v22Z" />
          <path fill="#fff" d="M22 20l8-10 3 10" />
          <circle cx="18" cy="30" r="2.6" fill="#0e7490" />
        </>
      );
    case 'quotas':
      return (
        <>
          <path
            d="M14 42a18 18 0 1 1 36 0"
            fill="none"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M14 42a18 18 0 0 1 28-16"
            fill="none"
            stroke={SAND}
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="32" cy="42" r="3.4" fill="#fff" />
          <path d="M32 42 44 26" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        </>
      );
    case 'controles':
      return (
        <>
          <rect x="14" y="12" width="28" height="38" rx="4" fill="#fff" />
          <rect x="22" y="8" width="12" height="8" rx="2" fill="#fff" />
          <rect x="19" y="24" width="8" height="8" fill="#115e59" />
          <rect x="30" y="24" width="8" height="8" fill="#115e59" />
          <rect x="19" y="35" width="8" height="8" fill="#115e59" />
          <rect x="30" y="37" width="3" height="3" fill="#115e59" />
          <rect x="35" y="35" width="3" height="8" fill="#115e59" />
          <circle cx="46" cy="46" r="10" fill={SAND} />
          <path d="M41 46l4 4 8-9" stroke="#115e59" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      );
    case 'redevances':
      return (
        <>
          <path fill="#fff" d="M14 8h28v36l-5-3-5 3-4-3-5 3-4-3-5 3Z" />
          <path d="M20 18h16M20 26h12M20 34h14" stroke="#a16207" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="44" cy="46" r="13" fill={SAND} />
          <circle cx="44" cy="46" r="9" fill="none" stroke="#a16207" strokeWidth="2" />
          <path d="M44 39v14M39 42h8M39 46h6" stroke="#a16207" strokeWidth="2" strokeLinecap="round" />
        </>
      );
    case 'alertes':
      return (
        <>
          <path
            fill="#fff"
            d="M32 6c-9.2 0-16.5 7.2-16.5 16.2 0 12.2 16.5 31.8 16.5 31.8S48.5 34.4 48.5 22.2C48.5 13.2 41.2 6 32 6Z"
          />
          <circle cx="32" cy="22" r="7" fill="#b91c1c" />
          <path d="M32 17.5v6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="32" cy="27" r="1.5" fill="#fff" />
        </>
      );
    case 'equipe':
      return (
        <>
          <circle cx="18" cy="24" r="7" fill="#fff" />
          <path d="M8 46c1-8 4.5-12 10-12s9 4 10 12" fill="#fff" />
          <rect x="23" y="10" width="18" height="5" rx="1.4" fill={SAND} />
          <circle cx="32" cy="22" r="8" fill="#fff" />
          <path d="M20 48c1.5-10 6-14 12-14s10.5 4 12 14" fill="#fff" />
          <circle cx="46" cy="26" r="6.5" fill="#fff" opacity="0.9" />
          <path d="M38 46c1-7 4-10 8-10s7 3 8 10" fill="#fff" opacity="0.9" />
        </>
      );
    case 'acteurs':
      return (
        <>
          <ellipse cx="32" cy="14" rx="14" ry="4" fill={SAND} />
          <circle cx="32" cy="24" r="8" fill="#fff" />
          <path d="M16 48c2-12 8-16 16-16s14 4 16 16" fill="#fff" />
          <path fill={SAND} d="M10 54c6 6 38 6 44-2-8 4-36 4-44 2Z" />
        </>
      );
    case 'demande':
      return (
        <>
          <rect x="14" y="8" width="28" height="36" rx="3" fill="#fff" />
          <path d="M30 8v12h12" fill="none" stroke="#075985" strokeWidth="2.4" />
          <path d="M20 26h16M20 33h12" stroke="#075985" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="42" cy="44" r="13" fill={SAND} />
          <path d="M36 44l4.5 4.5 9-11" stroke="#075985" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        </>
      );
    case 'licence':
      return (
        <>
          <rect x="8" y="16" width="48" height="32" rx="5" fill="#fff" />
          <rect x="14" y="22" width="14" height="14" rx="3" fill="#15803d" />
          <path d="M32 24h16M32 31h12M32 38h8" stroke="#15803d" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="48" cy="40" r="6" fill="#15803d" />
          <path d="M45 40l2.2 2.2 5-6" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        </>
      );
    case 'organisation':
      return (
        <>
          <path fill="#fff" d="M12 50V22l18-12v40" />
          <path fill="#fff" fillOpacity="0.88" d="M30 50V28l20 6v16" />
          <rect x="18" y="26" width="6" height="6" fill="#1e3a5f" />
          <rect x="18" y="36" width="6" height="6" fill="#1e3a5f" />
          <rect x="36" y="34" width="5" height="5" fill="#1e3a5f" />
          <rect x="36" y="42" width="5" height="5" fill="#1e3a5f" />
          <circle cx="20" cy="54" r="3.2" fill="#fff" />
          <circle cx="32" cy="54" r="3.2" fill="#fff" />
          <circle cx="44" cy="54" r="3.2" fill="#fff" />
        </>
      );
    case 'abonnement':
      return (
        <>
          <rect x="8" y="18" width="48" height="30" rx="6" fill="#fff" />
          <rect x="8" y="26" width="48" height="8" fill="#0b1f3a" opacity="0.85" />
          <rect x="14" y="38" width="14" height="5" rx="1.4" fill="#0e4d7a" />
          <circle cx="48" cy="40" r="4" fill={SAND} />
          <circle cx="42" cy="40" r="4" fill={LIGHT} />
        </>
      );
    case 'navire':
      return (
        <>
          <path fill="#fff" d="M6 36h52l-8 14H14Z" />
          <rect x="18" y="20" width="22" height="16" rx="2" fill="#fff" />
          <rect x="34" y="10" width="10" height="10" rx="1.5" fill="#fff" />
          <path d="M39 10V4" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="22" y="24" width="5" height="5" fill="#0b1f3a" />
          <rect x="30" y="24" width="5" height="5" fill="#0b1f3a" />
        </>
      );
    case 'surveillance':
      return (
        <>
          <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeWidth="2.4" opacity="0.4" />
          <circle cx="32" cy="32" r="13" fill="none" stroke="#fff" strokeWidth="2.4" opacity="0.75" />
          <circle cx="32" cy="32" r="6" fill="none" stroke="#fff" strokeWidth="2.4" />
          <path d="M32 32 32 12A20 20 0 0 1 49 22Z" fill="#fff" opacity="0.35" />
          <circle cx="32" cy="32" r="3" fill="#fff" />
          <circle cx="44" cy="40" r="3.2" fill={SAND} />
        </>
      );
    case 'zones':
      return (
        <>
          <path
            d="M12 18 42 12 54 30 44 50 16 46Z"
            fill="#fff"
            fillOpacity="0.28"
            stroke="#fff"
            strokeWidth="2.4"
          />
          <path d="M22 26 38 22 44 34 32 42 22 36Z" fill={SAND} stroke="#fff" strokeWidth="1.8" />
          <circle cx="32" cy="32" r="3.2" fill="#fff" />
        </>
      );
    case 'rapports':
      return (
        <>
          <rect x="14" y="8" width="36" height="48" rx="4" fill="#fff" />
          <path d="M22 18h18M22 26h12" stroke="#334155" strokeWidth="2.4" strokeLinecap="round" />
          <path
            d="M22 46 30 34l8 6 10-16"
            stroke="#334155"
            strokeWidth="2.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'succes':
      return (
        <>
          <circle cx="32" cy="32" r="18" fill="#fff" />
          <path
            d="M22 33l7 8 16-18"
            stroke="#15803d"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      );
    case 'vide':
      return (
        <>
          <circle
            cx="32"
            cy="32"
            r="16"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeDasharray="5 4"
          />
          <path d="M20 34c4-5 8-5 12 0s8 5 12 0" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
}

export default function Illustration({ name, size = 96, className, variant = 'auto' }: Props) {
  const mode = variant === 'auto' ? (size < 90 ? 'pictogram' : 'scene') : variant;
  if (mode === 'pictogram') {
    return <Pictogram name={name} size={size} className={className} />;
  }
  return <Scene name={name} size={size} className={className} />;
}
