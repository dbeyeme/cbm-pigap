/** Identité CBM-PIGAP — maritime claire, public terrain peu digital. */
export const colors = {
  abyss: '#0B1F3A',
  deep: '#14365C',
  tide: '#1E4D7B',
  lagoon: '#2563A8',
  foam: '#2563A8',
  mist: '#EEF3F8',
  glass: 'rgba(255, 255, 255, 0.82)',
  glassBorder: 'rgba(15, 40, 70, 0.14)',
  glassStrong: 'rgba(255, 255, 255, 0.94)',
  ink: '#0F172A',
  inkMuted: '#475569',
  inkSoft: '#64748B',
  accent: '#1E4D7B',
  accentDeep: '#0B1F3A',
  accentGlow: 'rgba(37, 99, 168, 0.18)',
  commandGlass: 'rgba(255, 255, 255, 0.9)',
  danger: '#B91C1C',
  success: '#047857',
  warn: '#B45309',
  overlay: 'rgba(238, 243, 248, 0.94)',
  card: '#FFFFFF',
  surface: '#EEF3F8',
  shine: 'rgba(255, 255, 255, 0.95)',
} as const;

export const space = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_600SemiBold_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

/** Durées calmes — éviter le “gadget”. */
export const motion = {
  fast: 180,
  base: 320,
  slow: 480,
} as const;

export const gradients = {
  ocean: ['#F7FAFC', '#EEF3F8', '#E0EAF3'] as const,
  dawn: ['#14365C', '#1E4D7B', '#2563A8'] as const,
  button: ['#1E4D7B', '#0B1F3A'] as const,
  accent: ['#2563A8', '#1E4D7B'] as const,
  glass: ['rgba(255,255,255,0.92)', 'rgba(248,250,252,0.78)'] as const,
};
