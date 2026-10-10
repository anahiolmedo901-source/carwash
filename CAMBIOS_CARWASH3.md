# CarWash 3.0 — cambios (sensores)

## Pasos obligatorios después de descomprimir
1. `npm install`
2. `npx expo install expo-camera expo-location expo-sensors`  (fija las versiones exactas del SDK 57)
3. Abre Supabase > SQL Editor, pega TODO `supabase/APLICAR_EN_SQL_EDITOR.sql` y dale Run (incluye la recarga de caché). Alternativa: `npx supabase db push`  (aplica `20261008000100_arrival_and_coordinates.sql` y `20261008000200_reservation_photos_and_catalog_access.sql`)
4. En Supabase, asigna coordenadas a tus autolavados:
   `update autolavados set latitud = 32.6245, longitud = -115.4523 where id = '...';`
5. `npx expo start -c` y prueba en un teléfono físico (Expo Go).
6. Verifica: `npm run typecheck` y `npm test`.

## Qué se agregó
- GPS: `services/locationService.ts`, `utils/geo.ts` (distancia Haversine, radio 150 m).
- Cámara QR: `components/QrScanner.tsx`. Fotos antes/después: `components/PhotoCapture.tsx`.
- Acelerómetro y giroscopio: `services/motionService.ts`, `utils/motion.ts`.
- Pantallas: `llegada/[id]`, `fotos/[id]`, `diagnostico` (Perfil → Diagnóstico de sensores).
- Backend: RPC `carwash_get_arrival_context` y `carwash_confirm_arrival` (valida GPS o QR en el servidor).
- `app.json`: plugins y permisos de ubicación, cámara y movimiento.

## Fotos antes/después
Se guardan en Supabase (tabla `carwash_fotos_reservacion`, solo accesible por RPC con tu sesión),
una foto "antes" y una "después" por reservación. Se ven en Reservación → Fotografías del vehículo.

## Autolavados
La lista ya no falla si a un autolavado le falta imagen/horario/calificación (usa valores por defecto),
y si `vista_autolavados` falla o viene vacía, lee la tabla `autolavados`. La migración también
da permiso de lectura del catálogo a los clientes.

## Pendiente respecto al documento del profesor
Panel de empleado (hoy es placeholder), subir fotos a Supabase Storage
(hoy se guardan en la base de datos), calificación por el cliente en la app, y login con Supabase Auth
(el proyecto usa sesiones propias por RPC).

## Notificaciones push y APK
- `services/pushNotificationService.ts` registra el token del dispositivo y configura el canal Android.
- `supabase/migrations/20261008000300_push_notifications.sql` protege el registro de tokens con RPC.
- `supabase/functions/carwash-send-push/index.ts` envía avisos por webhook cuando cambia el estado de una reservación.
- `eas.json` genera APK con `npx eas build --platform android --profile preview`.
- Configuración detallada: `PUSH_SETUP.md`.

## Imágenes de autolavados
Carpeta `assets/autolavados/` (hay 3 de ejemplo). En la tabla `autolavados`, columna `imagen_url`:
`local:lavado-2` usa esa imagen; vacío = asigna una de ejemplo; `https://...` usa la de internet.
