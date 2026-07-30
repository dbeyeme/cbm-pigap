import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

import { PositionPoint } from '../api';
import { GABON_COAST_BOUNDS, isOnWater } from '../geo/gabonMaritimeRoutes';
import { colors, fonts, radii } from '../theme';
import { ShipRadarMarker } from './ShipRadarMarker';

type Props = {
  points: PositionPoint[];
};

export function TrajectoryNativeMap({ points }: Props) {
  const local = points.filter((p) => {
    const [lon, lat] = p.position.coordinates;
    return isOnWater(lon, lat);
  });
  const skipped = points.length - local.length;

  if (local.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Carte Gabon</Text>
        <Text style={styles.emptyBody}>
          Aucun point en mer / fleuve gabonais. Simule un corridor (Estuaire, Ogooué,
          Ntem…) pour afficher la trajectoire ici.
          {skipped > 0
            ? ` ${skipped} point(s) hors zone (ex. GPS simulateur) ignoré(s).`
            : ''}
        </Text>
        <MapView
          style={styles.mapPreview}
          provider={PROVIDER_DEFAULT}
          initialRegion={{
            latitude: 0.2,
            longitude: 9.2,
            latitudeDelta: 4.5,
            longitudeDelta: 3.5,
          }}
          mapType="standard"
        />
      </View>
    );
  }

  const coords = local.map((p) => ({
    latitude: p.position.coordinates[1],
    longitude: p.position.coordinates[0],
  }));
  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2;
  const midLon = (minLon + maxLon) / 2;
  const latDelta = Math.max((maxLat - minLat) * 1.8, 0.08);
  const lonDelta = Math.max((maxLon - minLon) * 1.8, 0.08);
  const last = coords[coords.length - 1];

  return (
    <View style={styles.wrap}>
      <Text style={styles.caption}>
        Parcours · {local.length} point{local.length > 1 ? 's' : ''}
        {skipped > 0 ? ` · ${skipped} hors zone ignoré(s)` : ''}
      </Text>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        region={{
          latitude: midLat,
          longitude: midLon,
          latitudeDelta: latDelta,
          longitudeDelta: lonDelta,
        }}
        mapType="standard"
      >
        {coords.length >= 2 ? (
          <>
            <Polyline
              coordinates={coords}
              strokeColor="rgba(43, 140, 222, 0.28)"
              strokeWidth={10}
              lineCap="round"
              lineJoin="round"
            />
            <Polyline
              coordinates={coords}
              strokeColor={colors.foam}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
              lineDashPattern={[8, 10]}
            />
          </>
        ) : null}
        <Marker coordinate={last} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <ShipRadarMarker size={48} />
        </Marker>
      </MapView>
      <Text style={styles.hint}>
        Emprise : lon {GABON_COAST_BOUNDS.west}–{GABON_COAST_BOUNDS.east} · lat{' '}
        {GABON_COAST_BOUNDS.south}–{GABON_COAST_BOUNDS.north}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 12,
    backgroundColor: colors.card,
  },
  caption: {
    fontFamily: fonts.bodyMedium,
    color: colors.tide,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  map: { width: '100%', height: 240 },
  mapPreview: { width: '100%', height: 160, marginTop: 10, borderRadius: radii.sm },
  hint: {
    fontFamily: fonts.body,
    color: colors.inkMuted,
    fontSize: 10,
    padding: 8,
  },
  empty: {
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.card,
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
