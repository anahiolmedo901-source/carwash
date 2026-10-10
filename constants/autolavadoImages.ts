import type { ImageSourcePropType } from 'react-native';

/**
 * Imágenes locales de ejemplo. Para agregar una nueva, copia el .jpg a
 * assets/autolavados/ y regístrala aquí (require debe ser estático).
 */
export const LOCAL_AUTOLAVADO_IMAGES: Record<string, ImageSourcePropType> = {
  'lavado-1': require('../assets/autolavados/premiu.jpg'),
  'lavado-2': require('../assets/autolavados/centro.jpg'),
  'lavado-3': require('../assets/autolavados/prron.jpg'),
};
