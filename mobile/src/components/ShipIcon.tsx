import Svg, { Circle, Path } from 'react-native-svg';

type Props = {
  size?: number;
  color?: string;
  accent?: string;
};

/** Icône navire simplifiée — reconnaissance immédiate terrain. */
export function ShipIcon({
  size = 40,
  color = '#0B1F3A',
  accent = '#2B8CDE',
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <Path
        d="M8 30.5h32l-3.2 6.2c-.4.8-1.2 1.3-2.1 1.3H13.3c-.9 0-1.7-.5-2.1-1.3L8 30.5Z"
        fill={color}
      />
      <Path
        d="M14 30.5V16.8c0-1 .7-1.9 1.7-2.1l9.8-2.2c1.4-.3 2.7.7 2.7 2.1v15.9"
        stroke="#F8FAFC"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
      <Path d="M24 12.8V8.5" stroke={accent} strokeWidth={2.2} strokeLinecap="round" />
      <Circle cx={24} cy={7.2} r={2.2} fill={accent} />
      <Path d="M10 30.5h28" stroke={accent} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
