# Notificaciones push y APK

La app usa `expo-notifications` dentro de un APK generado con EAS. Expo Go no es suficiente para probar push remoto en este SDK.

La configuracion de cobros Stripe esta en `STRIPE_SETUP.md`.

## Primera configuración

1. Instala dependencias: `npm install`.
2. Inicia sesión en EAS: `npx eas login`.
3. Vincula el proyecto: `npx eas init`. Esto agrega el `projectId` real al proyecto.
4. En el entorno `preview` y `production` de EAS configura `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` con los mismos valores de tu `.env` local. Sin estas variables el APK puede cerrarse al arrancar.
5. Ejecuta `npx supabase db push` para aplicar todas las migraciones, incluidas `20261005000100_payments.sql`, `20261008000300_push_notifications.sql`, `20261008000400_notification_registry.sql` y `20261008000500_stripe_payments.sql`.
6. Define un secreto para el webhook: `npx supabase secrets set CARWASH_PUSH_WEBHOOK_SECRET=un-secreto-largo`.
7. Publica la función: `npx supabase functions deploy carwash-send-push --no-verify-jwt`.
8. En Supabase, crea Database Webhooks para `public.reservaciones` y `public.pagos`, en eventos `INSERT` y `UPDATE`. Crea además webhooks independientes para `public.servicios` y `public.autolavados`, solamente en `INSERT`.
9. Usa como URL `https://TU-PROYECTO.supabase.co/functions/v1/carwash-send-push`.
10. Agrega el header `x-carwash-webhook-secret` con el mismo valor configurado en el paso 6.

El webhook solo envía avisos en `INSERT` o cuando cambia `estado`; los nuevos servicios y autolavados se envían a todos los usuarios con `rol = 'cliente'` y `activo = true`. Registra un evento por cliente en `notificaciones` y consulta todos sus tokens habilitados en `dispositivos`. Los avisos incluyen una vigencia de siete días para que el proveedor pueda entregarlos cuando el teléfono vuelva a conectarse; ningún sistema puede mostrar un aviso mientras el teléfono está completamente apagado. La función usa `service_role` únicamente en Supabase; nunca se incluye en la app.

## Actualizaciones en tiempo real

La pantalla de detalle solicita un token privado para recibir cambios de estado en tiempo real.

1. En Supabase, copia el JWT Secret del proyecto desde **Project Settings > API > JWT Settings**.
2. Guárdalo como secreto de Edge Functions, nunca en `.env` ni en la APK:

```powershell
npx supabase secrets set SUPABASE_JWT_SECRET=el-jwt-secret-del-proyecto
```

3. Publica la funcion de autorizacion realtime:

```powershell
npx supabase functions deploy carwash-realtime-token --no-verify-jwt
```

Sin este secreto, la reservacion puede cargar sus datos, pero la autorizacion de actualizaciones en tiempo real devuelve `Realtime authorization is unavailable`.

## Generar el APK

```powershell
npx eas build --platform android --profile preview
```

El perfil `preview` está configurado en `eas.json` con `buildType: apk`. Para el APK de producción usa:

```powershell
npx eas build --platform android --profile production
```

Durante el primer build EAS solicitará o generará las credenciales Android/FCM necesarias. Instala el APK en un teléfono físico, inicia sesión y acepta el permiso de notificaciones. El token se registra automáticamente en Supabase.

## Prueba rápida

1. Instala el APK en un teléfono físico.
2. Inicia sesión con un cliente.
3. Cambia el estado de una reservación desde el panel administrativo o crea un servicio/autolavado.
4. Comprueba que el aviso llegue aunque CarWashNow esté cerrada y que al pulsarlo abra el detalle correspondiente.

Si se prueba en desarrollo sin `eas init`, define `EXPO_PUBLIC_EAS_PROJECT_ID` en `.env`; para el APK, el `projectId` de EAS queda embebido automáticamente.
