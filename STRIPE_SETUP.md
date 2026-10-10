# Stripe

CarWashNow usa PaymentSheet en el cliente, PaymentIntent en una Edge Function y un webhook firmado para cambiar el estado final. La app no recibe `STRIPE_SECRET_KEY` ni escribe directamente en `pagos`.

## Variables

En EAS configura `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` en los entornos `preview` y `production`:

- `preview`: una llave `pk_test_...`.
- `production`: una llave `pk_live_...`.

En Supabase configura los secretos del proyecto:

```powershell
npx supabase secrets set STRIPE_SECRET_KEY=sk_test_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
```

Nunca pongas esas dos variables en `.env`, `app.json`, EAS o el APK.

Si la app muestra `Invalid API Key provided`, revisa que `STRIPE_SECRET_KEY`
sea una clave secreta activa del mismo proyecto Stripe y del mismo modo que la
APK: `sk_test_...` junto con `pk_test_...` en `preview`, o `sk_live_...` junto
con `pk_live_...` en `production`. Una clave `pk_...` nunca debe configurarse
como `STRIPE_SECRET_KEY`.

## Base de datos y funciones

Con el proyecto Supabase vinculado, aplica las migraciones y publica ambas funciones:

```powershell
npx supabase db push --linked --password "TU_PASSWORD_DE_BASE_DE_DATOS"
npx supabase functions deploy stripe-create-payment-intent --no-verify-jwt
npx supabase functions deploy stripe-webhook --no-verify-jwt
```

El `db push --dry-run` debe incluir, como mínimo, `20261008000500` y
`20261009000100`. Si esas migraciones no están en el historial remoto,
Stripe falla al intentar enlazar el PaymentIntent y las reservas pueden fallar
al actualizar o cancelar por falta de `historial_reservacion`.

`stripe-create-payment-intent` valida la sesion custom, obtiene `precio_snapshot` mediante `carwash_begin_payment`, crea un PaymentIntent en MXN y enlaza su id con `pagos`.

`stripe-webhook` valida `stripe-signature` con `STRIPE_WEBHOOK_SECRET` y aplica los eventos mediante `carwash_apply_stripe_payment_event`. La RPC es idempotente por `event_id`.

## Webhook de Stripe

En Stripe Dashboard agrega:

```text
https://TU-PROYECTO.supabase.co/functions/v1/stripe-webhook
```

Selecciona estos eventos:

- `payment_intent.succeeded`
- `payment_intent.processing`
- `payment_intent.requires_action`
- `payment_intent.payment_failed`
- `payment_intent.canceled`
- `charge.refunded`

Guarda el signing secret que Stripe genera (`whsec_...`) en `STRIPE_WEBHOOK_SECRET`.

## Prueba

En modo test usa una tarjeta de Stripe como `4242 4242 4242 4242`, una fecha futura y cualquier CVC. El APK debe construirse con el perfil correspondiente para que el modulo nativo Stripe este incluido; Expo Go no es suficiente.

```powershell
npx eas build --platform android --profile preview
```

El plugin requiere `merchant.com.carwashnow` para generar la configuracion nativa. Si se habilita Apple Pay, reemplazalo por un Merchant ID registrado en Apple y Stripe.
