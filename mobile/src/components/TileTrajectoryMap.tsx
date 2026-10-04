import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { PositionPoint } from '../api';
import { colors, fonts, radii } from '../theme';
import { ShipRadarMarker } from './ShipRadarMarker';
import { TrajectoryMap } from './TrajectoryMap';

type Props = {
  points: PositionPoint[];
  height?: number;
};

const TILE = 256;
const MIN_ZOOM = 5;
const MAX_ZOOM = 16;
/** Vue d'ensemble du littoral gabonais quand aucun point n'est disponible. */
const GABON_CENTER = { lon: 9.6, lat: -0.6 };
const GABON_ZOOM = 6;
const USER_AGENT = 'CBM-PIGAP/0.1 (application mobile pilote, Gabon)';
/**
 * Fournisseur de tuiles raster : configurable au build. Par défaut, le fond
 * routier Esri (ArcGIS Online), servi sans clé avec attribution. Les serveurs
 * publics d'openstreetmap.org et de CARTO refusent les applications sans clé.
 */
const TILE_URL_TEMPLATE =
  process.env.EXPO_PUBLIC_TILE_URL_TEMPLATE ??
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIBUTION =
  process.env.EXPO_PUBLIC_TILE_ATTRIBUTION ?? 'Esri, HERE, Garmin, © OpenStreetMap';
const SUBDOMAINS = ['a', 'b', 'c', 'd'];

function tileUrl(z: number, x: number, y: number): string {
  return TILE_URL_TEMPLATE.replace('{s}', SUBDOMAINS[(x + y) % SUBDOMAINS.length])
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/** Projection Web Mercator : degrés vers pixels monde au zoom donné. */
function project(lon: number, lat: number, zoom: number) {
  const world = TILE * 2 ** zoom;
  const x = ((lon + 180) / 360) * world;
  const rad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * world;
  return { x, y };
}

/**
 * Fond de carte assemblé à partir de tuiles raster (fond Esri par défaut),
 * sans clé ni SDK natif : chaque tuile est une image, le parcours est dessiné par-dessus
 * dans la même projection. Hors réseau, le tracé schématique prend le relais.
 */
export function TileTrajectoryMap({ points, height = 260 }: Props) {
  const [width, setWidth] = useState(0);
  const [failed, setFailed] = useState<Record<string, true>>({});

  const coords = points.map((p) => p.position.coordinates);

  const view = useMemo(() => {
    if (width === 0) return null;
    let center = GABON_CENTER;
    let zoom = GABON_ZOOM;
    if (coords.length > 0) {
      const lons = coords.map((c) => c[0]);
      const lats = coords.map((c) => c[1]);
      const minLon = Math.min(...lons);
      const maxLon = Math.max(...lons);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      center = { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2 };
      // Zoom le plus serré qui garde tout le parcours avec une marge
      zoom = MIN_ZOOM;
      for (let z = MAX_ZOOM; z >= MIN_ZOOM; z -= 1) {
        const a = project(minLon, maxLat, z);
        const b = project(maxLon, minLat, z);
        if (b.x - a.x <= width * 0.7 && b.y - a.y <= height * 0.7) {
          zoom = z;
          break;
        }
      }
    }
    const c = project(center.lon, center.lat, zoom);
    const originX = c.x - width / 2;
    const originY = c.y - height / 2;
    const tiles: Array<{ key: string; uri: string; left: number; top: number }> = [];
    const n = 2 ** zoom;
    for (let tx = Math.floor(originX / TILE); tx * TILE < originX + width; tx += 1) {
      for (let ty = Math.floor(originY / TILE); ty * TILE < originY + height; ty += 1) {
        if (ty < 0 || ty >= n) continue;
        const wrapped = ((tx % n) + n) % n;
        tiles.push({
          key: `${zoom}/${tx}/${ty}`,
          uri: tileUrl(zoom, wrapped, ty),
          left: tx * TILE - originX,
          top: ty * TILE - originY,
        });
      }
    }
    const px = coords.map(([lon, lat]) => {
      const p = project(lon, lat, zoom);
      return { x: p.x - originX, y: p.y - originY };
    });
    return { tiles, px };
  }, [coords, width, height]);

  function onLayout(e: LayoutChangeEvent) {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== width) setWidth(w);
  }

  const offline =
    view !== null && view.tiles.length > 0 && view.tiles.every((t) => failed[t.key]);

  if (offline) {
    return (
      <View>
        <TrajectoryMap points={points} />
        <Text style={styles.offline}>Fond de carte indisponible sans réseau</Text>
      </View>
    );
  }

  const last = view && view.px.length > 0 ? view.px[view.px.length - 1] : null;

  return (
    <View style={[styles.wrap, { height }]} onLayout={onLayout}>
      {view
        ? view.tiles.map((t) => (
            <Image
              key={t.key}
              source={{ uri: t.uri, headers: { 'User-Agent': USER_AGENT } }}
              style={[styles.tile, { left: t.left, top: t.top }]}
              onError={() => setFailed((f) => (f[t.key] ? f : { ...f, [t.key]: true }))}
              fadeDuration={0}
            />
          ))
        : null}
      {view && view.px.length > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          {view.px.length >= 2 ? (
            <>
              <Polyline
                points={view.px.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={7}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <Polyline
                points={view.px.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={colors.lagoon}
                strokeWidth={3.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          ) : null}
          {view.px.map((p, i) =>
            i === view.px.length - 1 ? null : (
              <Circle
                key={`p-${i}`}
                cx={p.x}
                cy={p.y}
                r={i === 0 ? 6 : 3.5}
                fill={i === 0 ? colors.success : colors.lagoon}
                stroke="#FFFFFF"
                strokeWidth={1.5}
              />
            ),
          )}
        </Svg>
      ) : null}
      {last ? (
        <View style={[styles.ship, { left: last.x - 22, top: last.y - 22 }]} pointerEvents="none">
          <ShipRadarMarker size={44} />
        </View>
      ) : null}
      <Text style={styles.credit}>{TILE_ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    borderRadius: radii.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 12,
    backgroundColor: '#DCE7F0',
  },
  tile: { position: 'absolute', width: TILE, height: TILE },
  ship: { position: 'absolute', width: 44, height: 44 },
  credit: {
    position: 'absolute',
    right: 6,
    bottom: 4,
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.inkMuted,
    backgroundColor: 'rgba(255,255,255,0.75)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  offline: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.inkSoft,
    textAlign: 'center',
    marginTop: -6,
    marginBottom: 10,
  },
});
