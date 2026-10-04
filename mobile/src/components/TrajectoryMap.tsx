import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { PositionPoint } from '../api';
import { colors, fonts, radii } from '../theme';

type Props = {
  points: PositionPoint[];
};

/** Tracé schématique de la sortie (sans fond de carte) : aucun service externe requis. */
export function TrajectoryMap({ points }: Props) {
  if (points.length === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="navigate-outline" size={28} color={colors.tide} />
        <Text style={styles.emptyTitle}>Aucun parcours enregistré</Text>
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
      <View style={styles.captionRow}>
        <Ionicons name="git-branch-outline" size={14} color={colors.tide} />
        <Text style={styles.caption}>Tracé schématique de la sortie</Text>
      </View>
      <Svg width="100%" height={220} viewBox={`0 0 ${vbW} ${vbH}`}>
        <Polyline
          points={poly}
          fill="none"
          stroke={colors.tide}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {xy.map((p, i) => (
          <Circle
            key={`c-${i}`}
            cx={p.x}
            cy={p.y}
            r={i === 0 || i === xy.length - 1 ? 8 : 5}
            fill={i === 0 ? colors.success : i === xy.length - 1 ? colors.warn : colors.tide}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        ))}
        {xy.length >= 2 ? (
          <Line
            x1={xy[xy.length - 2].x}
            y1={xy[xy.length - 2].y}
            x2={xy[xy.length - 1].x}
            y2={xy[xy.length - 1].y}
            stroke={colors.warn}
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ) : null}
      </Svg>
      <View style={styles.legend}>
        <LegendDot color={colors.success} label="Départ" />
        <LegendDot color={colors.tide} label="Étapes" />
        <LegendDot color={colors.warn} label="Dernière position" />
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
    backgroundColor: '#E6EEF6',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingBottom: 10,
    marginBottom: 12,
  },
  captionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    marginBottom: 2,
  },
  caption: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    fontSize: 12,
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
    padding: 20,
    marginBottom: 12,
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6EEF6',
  },
  emptyTitle: {
    fontFamily: fonts.bodyMedium,
    color: colors.inkMuted,
    fontSize: 14,
  },
});
