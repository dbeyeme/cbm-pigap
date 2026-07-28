import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { PositionPoint } from '../api';
import { colors, fonts, radii } from '../theme';

type Props = {
  points: PositionPoint[];
};

/** Carte schématique de trajectoire (sans tuiles) — lisible en démo terrain. */
export function TrajectoryMap({ points }: Props) {
  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Pas encore de trajectoire</Text>
        <Text style={styles.emptyBody}>
          Simule un trajet sur le littoral gabonais (Estuaire, Port-Gentil ou Mayumba),
          ou envoie ta position réelle en mer.
        </Text>
      </View>
    );
  }

  const coords = points.map((p) => p.position.coordinates);
  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const pad = 0.0008;
  const w = Math.max(maxLon - minLon, pad);
  const h = Math.max(maxLat - minLat, pad);
  const vbW = 320;
  const vbH = 200;
  const margin = 24;

  const toXY = (lon: number, lat: number) => {
    const x = margin + ((lon - minLon) / w) * (vbW - margin * 2);
    const y = margin + ((maxLat - lat) / h) * (vbH - margin * 2);
    return { x, y };
  };

  const xy = coords.map(([lon, lat]) => toXY(lon, lat));
  const poly = xy.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        Trajectoire · {points.length} point{points.length > 1 ? 's' : ''} (ordre chrono)
      </Text>
      <Svg width="100%" height={200} viewBox={`0 0 ${vbW} ${vbH}`}>
        <Polyline
          points={poly}
          fill="none"
          stroke={colors.foam}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.map((p, i) => (
          <Circle
            key={`c-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === 0 || i === xy.length - 1 ? 7 : 5}
            fill={i === 0 ? colors.foam : i === xy.length - 1 ? colors.accent : colors.tide}
            stroke={colors.abyss}
            strokeWidth={1.5}
          />
        ))}
        {xy.length >= 2 ? (
          <Line
            x1={xy[xy.length - 2].x}
            y1={xy[xy.length - 2].y}
            x2={xy[xy.length - 1].x}
            y2={xy[xy.length - 1].y}
            stroke={colors.accent}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ) : null}
      </Svg>
      <View style={styles.legend}>
        <LegendDot color={colors.foam} label="Départ" />
        <LegendDot color={colors.tide} label="Étapes" />
        <LegendDot color={colors.accent} label="Dernier" />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: 'rgba(2, 26, 34, 0.45)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingBottom: 10,
    marginBottom: 12,
  },
  caption: {
    fontFamily: fonts.bodyMedium,
    color: colors.foam,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    marginBottom: 4,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: fonts.body, color: colors.inkMuted, fontSize: 11 },
  empty: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderStyle: 'dashed',
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(2, 26, 34, 0.25)',
  },
  emptyTitle: {
    fontFamily: fonts.bodyBold,
    color: colors.ink,
    marginBottom: 6,
  },
  emptyBody: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    lineHeight: 20,
    fontSize: 13,
  },
});
