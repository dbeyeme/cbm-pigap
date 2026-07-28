/** Identité visuelle CBM-PIGAP — « Marée » (Atlantique gabonais). */
export const colors = {
  abyss: '#021A22',
  deep: '#043544',
  tide: '#0A5C6E',
  lagoon: '#1A8A9A',
  foam: '#7FE0D3',
  mist: 'rgba(232, 244, 242, 0.92)',
  glass: 'rgba(255, 255, 255, 0.12)',
  glassBorder: 'rgba(255, 255, 255, 0.28)',
  glassStrong: 'rgba(255, 255, 255, 0.18)',
  ink: '#E8F4F2',
  inkMuted: 'rgba(232, 244, 242, 0.65)',
  inkSoft: 'rgba(232, 244, 242, 0.45)',
  accent: '#F0C75E',
  accentDeep: '#D4A017',
  accentGlow: 'rgba(240, 199, 94, 0.28)',
  commandGlass: 'rgba(8, 14, 20, 0.82)',
  danger: '#FF8A7A',
  success: '#5EEAD4',
  overlay: 'rgba(2, 26, 34, 0.45)',
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
  md: 18,
  lg: 28,
  pill: 999,
} as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_600SemiBold_Italic',
  body: 'DMSans_400Regular',
  bodyMedium: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
} as const;

export const gradients = {
  ocean: ['#021A22', '#043544', '#0A5C6E', '#126B7A'] as const,
  dawn: ['#043544', '#0A5C6E', '#1A8A9A'] as const,
  button: ['#1A8A9A', '#0A5C6E'] as const,
  accent: ['#F0C75E', '#D4A017'] as const,
};
