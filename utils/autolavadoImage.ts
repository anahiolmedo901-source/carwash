import type { ImageSourcePropType } from 'react-native';
import { LOCAL_AUTOLAVADO_IMAGES } from '../constants/autolavadoImages';

const LOCAL_PREFIX = 'local:';

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result;
}

/**
 * - 'https://…'      -> imagen remota
 * - 'local:lavado-2' -> assets/autolavados/lavado-2.jpg
 * - vacío/no válido  -> imagen de ejemplo estable según el id del autolavado
 */
export function resolveAutolavadoImage(imageUrl: string | null | undefined, id: string): ImageSourcePropType {
  const value = (imageUrl ?? '').trim();
  if (/^https?:\/\//i.test(value)) {
    return { uri: value };
  }
  if (value.toLowerCase().startsWith(LOCAL_PREFIX)) {
    const local = LOCAL_AUTOLAVADO_IMAGES[value.slice(LOCAL_PREFIX.length).trim().toLowerCase()];
    if (local) {
      return local;
    }
  }
  const keys = Object.keys(LOCAL_AUTOLAVADO_IMAGES);
  return LOCAL_AUTOLAVADO_IMAGES[keys[hash(id) % keys.length]];
}
