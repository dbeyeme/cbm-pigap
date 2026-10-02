import { FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { StyleProp, TextStyle } from 'react-native';

type IonName = keyof typeof Ionicons.glyphMap & string;
type MciName = keyof typeof MaterialCommunityIcons.glyphMap & string;
type Fa6Name = keyof typeof FontAwesome6.glyphMap & string;

/**
 * Nom d'icône unifié : Ionicons par défaut, `mci:` pour Material Community,
 * `fa6:` pour FontAwesome 6 (poisson, crevette, voilier…).
 */
export type IconName = IonName | `mci:${MciName}` | `fa6:${Fa6Name}`;

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
};

export function AppIcon({ name, size = 20, color, style }: Props) {
  if (name.startsWith('mci:')) {
    return (
      <MaterialCommunityIcons
        name={name.slice(4) as MciName}
        size={size}
        color={color}
        style={style}
      />
    );
  }
  if (name.startsWith('fa6:')) {
    return (
      <FontAwesome6 name={name.slice(4) as Fa6Name} size={size * 0.9} color={color} style={style} />
    );
  }
  return <Ionicons name={name as IonName} size={size} color={color} style={style} />;
}
