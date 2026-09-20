import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme';
import { ShipIcon } from './ShipIcon';

type Props = {
  size?: number;
  alert?: boolean;
};

/** Marqueur navire statique (sans Reanimated — stable Expo Go). */
export function ShipRadarMarker({ size = 44, alert }: Props) {
  const stroke = alert ? colors.danger : colors.foam;
  const half = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={half}
          cy={half}
          r={half * 0.72}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          opacity={0.35}
        />
        <Circle
          cx={half}
          cy={half}
          r={half * 0.45}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          opacity={0.55}
        />
      </Svg>
      <ShipIcon size={Math.round(size * 0.62)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
