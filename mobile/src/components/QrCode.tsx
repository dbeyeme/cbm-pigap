import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

type Props = {
  value: string;
  /** Côté du carré, marge blanche comprise. */
  size?: number;
  accessibilityLabel?: string;
};

/** Marge blanche autour du code, en modules : nécessaire à la lecture. */
const QUIET_ZONE = 4;

/**
 * QR code dessiné sur le téléphone, sans réseau : noir sur blanc pour rester
 * lisible en plein soleil.
 */
export function QrCode({ value, size = 220, accessibilityLabel }: Props) {
  const { path, total } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let row = 0; row < count; row += 1) {
      let start = -1;
      for (let col = 0; col <= count; col += 1) {
        const dark = col < count && qr.isDark(row, col);
        if (dark && start < 0) start = col;
        if (!dark && start >= 0) {
          d += `M${start} ${row}h${col - start}v1h-${col - start}z`;
          start = -1;
        }
      }
    }
    return { path: d, total: count + QUIET_ZONE * 2 };
  }, [value]);

  return (
    <Svg
      width={size}
      height={size}
      viewBox={`${-QUIET_ZONE} ${-QUIET_ZONE} ${total} ${total}`}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'QR code'}
    >
      <Rect x={-QUIET_ZONE} y={-QUIET_ZONE} width={total} height={total} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}
