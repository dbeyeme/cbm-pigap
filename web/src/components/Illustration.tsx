/**
 * Illustrations vectorielles PIGAP — scènes maritimes plates, cohérentes avec la
 * palette navy / bleu. Utilisées dans les en-têtes de page, les modales et les
 * états vides pour rendre chaque interface identifiable d'un coup d'œil.
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
  | 'vide';

type Props = {
  name: IllustrationName;
  size?: number;
  className?: string;
};

const NAVY = '#0b1f3a';
const BLUE = '#1b6ca8';
const LIGHT = '#7cc4ff';
const FOAM = '#e0f2fe';
const SAND = '#fde68a';
const GREEN = '#15803d';
const RED = '#c81e1e';
const WOOD = '#9a3412';

function Waves({ y = 96 }: { y?: number }) {
  return (
    <>
      <path
        d={`M0 ${y} Q 15 ${y - 6} 30 ${y} T 60 ${y} T 90 ${y} T 120 ${y} V 128 H 0 Z`}
        fill={BLUE}
        opacity="0.85"
      />
      <path
        d={`M0 ${y + 10} Q 15 ${y + 4} 30 ${y + 10} T 60 ${y + 10} T 90 ${y + 10} T 120 ${y + 10} V 128 H 0 Z`}
        fill={NAVY}
        opacity="0.9"
      />
      <path
        d={`M6 ${y - 2} q 6 -4 12 0 M48 ${y - 3} q 6 -4 12 0 M90 ${y - 1} q 6 -4 12 0`}
        stroke={FOAM}
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />
    </>
  );
}

function Sun({ x = 92, y = 30 }: { x?: number; y?: number }) {
  return (
    <>
      <circle cx={x} cy={y} r="11" fill={SAND} opacity="0.9" />
      <circle cx={x} cy={y} r="17" fill={SAND} opacity="0.18" />
    </>
  );
}

function Pirogue({ x = 40, y = 92 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-24 0 Q -20 8 0 8 Q 20 8 24 0 Q 12 -2 0 -2 Q -12 -2 -24 0 Z" fill={WOOD} />
      <path d="M-18 -1 H 18" stroke="#fed7aa" strokeWidth="1.5" opacity="0.7" />
      <circle cx="4" cy="-8" r="4" fill={FOAM} />
      <path d="M4 -4 v 6 M4 -2 l 10 -10" stroke={FOAM} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Ship({ x = 72, y = 90, scale = 1 }: { x?: number; y?: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-30 0 H 30 L 24 10 H -24 Z" fill={NAVY} />
      <rect x="-18" y="-12" width="30" height="12" rx="1.5" fill={BLUE} />
      <rect x="6" y="-20" width="10" height="8" rx="1" fill={LIGHT} />
      <rect x="-14" y="-9" width="4" height="4" fill={FOAM} />
      <rect x="-7" y="-9" width="4" height="4" fill={FOAM} />
      <rect x="0" y="-9" width="4" height="4" fill={FOAM} />
      <path d="M11 -20 v -8" stroke={FOAM} strokeWidth="2" strokeLinecap="round" />
      <path d="M-30 0 H 30" stroke={FOAM} strokeWidth="1.5" opacity="0.6" />
    </g>
  );
}

function Document({ x = 30, y = 24 }: { x?: number; y?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="0" y="0" width="44" height="56" rx="5" fill="#fff" stroke={BLUE} strokeWidth="2" />
      <path d="M10 14 h 24 M10 24 h 24 M10 34 h 16" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="33" cy="42" r="8" fill={GREEN} />
      <path d="M29 42 l 3 3 l 5 -6" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

export default function Illustration({ name, size = 96, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 120 128',
    className: `pigap-illustration pigap-illustration--${name}${className ? ` ${className}` : ''}`,
    'aria-hidden': true as const,
    role: 'presentation' as const,
  };
  switch (name) {
    case 'acteurs':
      return (
        <svg {...common}>
          <Sun x={96} y={26} />
          <circle cx="44" cy="40" r="14" fill={BLUE} />
          <circle cx="44" cy="34" r="7" fill={FOAM} />
          <path d="M28 66 q 16 -18 32 0" fill={BLUE} />
          <circle cx="78" cy="48" r="10" fill={LIGHT} />
          <circle cx="78" cy="44" r="5" fill={FOAM} />
          <path d="M66 68 q 12 -14 24 0" fill={LIGHT} />
          <Waves y={92} />
        </svg>
      );
    case 'demande':
      return (
        <svg {...common}>
          <Sun x={98} y={26} />
          <Document x={22} y={18} />
          <Pirogue x={80} y={92} />
          <Waves y={100} />
        </svg>
      );
    case 'licence':
      return (
        <svg {...common}>
          <Sun x={20} y={26} />
          <rect x="32" y="26" width="64" height="44" rx="6" fill="#fff" stroke={BLUE} strokeWidth="2" />
          <rect x="38" y="34" width="16" height="16" rx="3" fill={BLUE} />
          <path d="M60 38 h 28 M60 46 h 22 M60 54 h 16" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="84" cy="62" r="7" fill={GREEN} />
          <path d="M80.5 62 l 2.5 2.5 l 4.5 -5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
          <Waves y={98} />
        </svg>
      );
    case 'organisation':
      return (
        <svg {...common}>
          <Sun x={100} y={24} />
          <path d="M22 78 V 42 l 20 -12 v 48" fill={BLUE} />
          <path d="M42 78 V 48 l 22 6 v 24" fill={NAVY} />
          <rect x="28" y="48" width="6" height="6" fill={FOAM} />
          <rect x="28" y="60" width="6" height="6" fill={FOAM} />
          <rect x="50" y="58" width="5" height="5" fill={FOAM} />
          <rect x="50" y="68" width="5" height="5" fill={FOAM} />
          <Ship x={88} y={86} scale={0.55} />
          <Waves y={96} />
        </svg>
      );
    case 'abonnement':
      return (
        <svg {...common}>
          <Sun x={98} y={26} />
          <rect x="18" y="30" width="72" height="44" rx="7" fill={BLUE} />
          <rect x="18" y="42" width="72" height="9" fill={NAVY} />
          <rect x="26" y="58" width="22" height="7" rx="2" fill={FOAM} />
          <circle cx="78" cy="62" r="6" fill={SAND} />
          <circle cx="70" cy="62" r="6" fill={LIGHT} opacity="0.9" />
          <path d="M96 40 l 3 8 l 8 3 l -8 3 l -3 8 l -3 -8 l -8 -3 l 8 -3 Z" fill={SAND} />
          <Waves y={100} />
        </svg>
      );
    case 'navire':
      return (
        <svg {...common}>
          <Sun x={24} y={28} />
          <Ship x={66} y={84} scale={1} />
          <Pirogue x={22} y={98} />
          <Waves y={100} />
        </svg>
      );
    case 'surveillance':
      return (
        <svg {...common}>
          <circle cx="60" cy="56" r="40" fill="none" stroke={LIGHT} strokeWidth="2" opacity="0.5" />
          <circle cx="60" cy="56" r="26" fill="none" stroke={LIGHT} strokeWidth="2" opacity="0.6" />
          <circle cx="60" cy="56" r="12" fill="none" stroke={LIGHT} strokeWidth="2" opacity="0.8" />
          <path d="M60 56 L 60 16 A 40 40 0 0 1 95 38 Z" fill={LIGHT} opacity="0.25" />
          <path d="M60 56 L 95 38" stroke={FOAM} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="60" cy="56" r="4" fill={FOAM} />
          <circle cx="82" cy="70" r="4" fill={RED} />
          <circle cx="40" cy="46" r="3.5" fill={GREEN} />
          <Waves y={104} />
        </svg>
      );
    case 'alertes':
      return (
        <svg {...common}>
          <path d="M60 18 L 100 84 H 20 Z" fill={RED} opacity="0.92" />
          <path d="M60 40 v 22" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
          <circle cx="60" cy="72" r="4" fill="#fff" />
          <Waves y={100} />
        </svg>
      );
    case 'captures':
      return (
        <svg {...common}>
          <Sun x={96} y={24} />
          <path d="M24 60 q 22 -22 44 0 q -22 22 -44 0 Z" fill={BLUE} />
          <path d="M68 60 l 16 -12 v 24 Z" fill={BLUE} />
          <circle cx="36" cy="56" r="3" fill={FOAM} />
          <path d="M40 60 q 12 -10 24 0" stroke={FOAM} strokeWidth="1.5" fill="none" opacity="0.7" />
          <path d="M30 78 q 18 -14 36 0 q -18 14 -36 0 Z" fill={LIGHT} />
          <path d="M66 78 l 12 -9 v 18 Z" fill={LIGHT} />
          <Waves y={104} />
        </svg>
      );
    case 'quotas':
      return (
        <svg {...common}>
          <Sun x={100} y={26} />
          <rect x="22" y="70" width="14" height="24" rx="3" fill={LIGHT} />
          <rect x="42" y="52" width="14" height="42" rx="3" fill={BLUE} />
          <rect x="62" y="38" width="14" height="56" rx="3" fill={NAVY} />
          <rect x="82" y="60" width="14" height="34" rx="3" fill={GREEN} />
          <path d="M18 44 h 84" stroke={RED} strokeWidth="2" strokeDasharray="5 4" />
          <Waves y={108} />
        </svg>
      );
    case 'zones':
      return (
        <svg {...common}>
          <path d="M22 34 L 70 24 L 98 52 L 80 84 L 34 78 Z" fill={LIGHT} opacity="0.35" stroke={BLUE} strokeWidth="2.5" strokeDasharray="6 4" />
          <path d="M40 46 L 66 40 L 78 58 L 60 70 L 44 64 Z" fill={RED} opacity="0.35" stroke={RED} strokeWidth="2" />
          <circle cx="56" cy="56" r="4" fill={NAVY} />
          <Waves y={104} />
        </svg>
      );
    case 'rapports':
      return (
        <svg {...common}>
          <Sun x={22} y={26} />
          <rect x="34" y="20" width="56" height="70" rx="6" fill="#fff" stroke={BLUE} strokeWidth="2" />
          <path d="M44 74 l 10 -14 l 10 6 l 14 -20" stroke={BLUE} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M44 34 h 30 M44 42 h 20" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" />
          <Waves y={104} />
        </svg>
      );
    case 'equipe':
      return (
        <svg {...common}>
          <Sun x={98} y={24} />
          <circle cx="40" cy="44" r="11" fill={BLUE} />
          <circle cx="40" cy="39" r="5.5" fill={FOAM} />
          <path d="M26 66 q 14 -16 28 0" fill={BLUE} />
          <circle cx="70" cy="40" r="12" fill={NAVY} />
          <circle cx="70" cy="34.5" r="6" fill={FOAM} />
          <path d="M55 66 q 15 -18 30 0" fill={NAVY} />
          <path d="M62 26 h 16 v 6 h -16 Z" fill={SAND} />
          <Waves y={96} />
        </svg>
      );
    case 'succes':
      return (
        <svg {...common}>
          <circle cx="60" cy="52" r="30" fill={GREEN} />
          <path d="M44 52 l 10 10 l 22 -24" stroke="#fff" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Waves y={104} />
        </svg>
      );
    case 'vide':
    default:
      return (
        <svg {...common}>
          <Sun x={96} y={26} />
          <path d="M30 70 q 30 -20 60 0" stroke={LIGHT} strokeWidth="2" strokeDasharray="5 4" fill="none" />
          <circle cx="60" cy="60" r="8" fill="none" stroke={LIGHT} strokeWidth="2" />
          <Waves y={100} />
        </svg>
      );
  }
}
