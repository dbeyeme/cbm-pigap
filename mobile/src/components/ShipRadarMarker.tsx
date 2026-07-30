import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { colors } from '../theme';
import { ShipIcon } from './ShipIcon';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = {
  size?: number;
  alert?: boolean;
};

/** Navire + anneaux radar pour marqueur carte / home. */
export function ShipRadarMarker({ size = 44, alert }: Props) {
  const pulse = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 3600, easing: Easing.out(Easing.ease) }),
      -1,
      false,
    );
  }, [pulse]);

  const ringA = useAnimatedProps(() => ({
    r: 8 + pulse.value * 14,
    opacity: 0.7 * (1 - pulse.value),
  }));

  const ringB = useAnimatedProps(() => {
    const t = (pulse.value + 0.5) % 1;
    return {
      r: 8 + t * 14,
      opacity: 0.55 * (1 - t),
    };
  });

  const stroke = alert ? colors.danger : colors.foam;
  const half = size / 2;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <AnimatedCircle
          cx={half}
          cy={half}
          animatedProps={ringA}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
        />
        <AnimatedCircle
          cx={half}
          cy={half}
          animatedProps={ringB}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
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
