import { Platform, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';

import { PositionPoint } from '../api';
import { isOnWater } from '../geo/gabonMaritimeRoutes';
import { colors, fonts, radii } from '../theme';
import { ShipRadarMarker } from './ShipRadarMarker';
import { TrajectoryMap } from './TrajectoryMap';

type Props = {
  points: PositionPoint[];
};

/**
 * Sur Android, Google Maps exige une clé d'API déclarée dans le manifeste ;
 * sans elle, la création de la vue carte lève une exception et l'application
 * se ferme. La clé est injectée au build par `app.config.js` depuis
 * EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ; en son absence, on affiche le tracé
 * schématique (sans fond de carte), qui ne dépend d'aucun service.
 */
const ANDROID_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '';
export const NATIVE_MAP_AVAILABLE = Platform.OS === 'ios' || ANDROID_MAPS_KEY.length > 0;

export function TrajectoryNativeMap({ points }: Props) {
  if (!NATIVE_MAP_AVAILABLE) {
    return <TrajectoryMap points={points.filter((p) => isOnWater(...p.position.coordinates))} />;
  }
  return <GoogleOrAppleMap points={points} />;
}

function GoogleOrAppleMap({ points }: Props) {
  const local = points.filter((p) => {
    const [lon, lat] = p.position.coordinates;
    return isOnWater(lon, lat);
  });
  const skipped = points.length - local.length;

  if (local.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Aucun parcours en eau gabonaise</Text>
        {skipped > 0 ? (
          <Text style={styles.emptyBody}>{skipped} point(s) hors zone ignoré(s).</Text>
        ) : null}
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
      {skipped > 0 ? (
        <Text style={styles.hint}>{skipped} point(s) hors zone ignoré(s)</Text>
      ) : null}
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
  map: { width: '100%', height: 260 },
  mapPreview: { width: '100%', height: 160, marginTop: 10, borderRadius: radii.sm },
  hint: {
    fontFamily: fonts.bodyMedium,
    color: colors.inkMuted,
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
