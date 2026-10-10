# CarWashNow — Sistema de reservaciones

## Objective

Implementar el flujo de reservaciones del cliente y las pantallas de administración de reservaciones usando el modelo existente de ownership por sesión personalizada y operaciones respaldadas por Supabase. Prevenir conflictos de espacios de forma atómica, devolver el `codigo_qr` generado por la base de datos y excluir pagos.

## Authorized Scope

- Implementar únicamente la creación, disponibilidad, resumen/confirmación, listado, detalle y cancelación de reservaciones.
- Orden de selección: autolavado, servicio, vehículo, fecha, hora, espacio aplicable opcional, resumen y confirmación.
- Mostrar autolavado, vehículo, servicio, precio, duración, fecha y hora en el resumen y detalle.
- Mantener exactamente los estados `pendiente`, `confirmada`, `cliente_llego`, `en_espera`, `en_lavado`, `finalizada` y `cancelada`.
- Proveer las secciones `Mis reservaciones`: `Próximas`, `Anteriores` y `Canceladas`.
- No implementar pagos reales, GPS, notificaciones ni módulos de producto no relacionados.
- No inspeccionar valores de `.env`, credenciales ni Supabase hospedado; no instalar paquetes, stagear, commitear, hacer push ni modificar `.atl/`.
- Preservar autenticación, vehículos, exploración de autolavados, orden de tabs y cambios previos no relacionados.

## Security and Domain Decisions

- El cliente obtiene el token opaco desde `SESSION_TOKEN_STORAGE_KEY`; nunca envía `usuario_id` como autoridad.
- Las lecturas y mutaciones usan exclusivamente RPCs `SECURITY DEFINER` con `SET search_path = ''`, grants explícitos, ownership validado en servidor, RLS deny restrictivo y privilegios directos de tabla revocados.
- La creación valida autolavado, servicio aplicable, ownership del vehículo, espacio aplicable, fecha/hora y el estado permitido (`pendiente` al crear). Omite `codigo_qr` del `INSERT` y devuelve el valor generado por el default de la base.
- El conflicto se protege con lock transaccional `pg_advisory_xact_lock` sobre autolavado/fecha/hora y, cuando corresponde, espacio; además existe un índice único parcial de slots activos. Los estados activos son `pendiente`, `confirmada`, `cliente_llego`, `en_espera` y `en_lavado`; `finalizada` y `cancelada` no ocupan slots.
- Si existen espacios aplicables para el autolavado/servicio, la creación exige uno disponible; si no existen, el recurso bloqueado es el autolavado/fecha/hora y el espacio debe ser `NULL`.
- La cancelación conserva historial, solo permite `pendiente` o `confirmada`, rechaza estados posteriores y es idempotente para `cancelada`.
- La lectura de estado de cancelación bloquea la fila owned con `FOR UPDATE`; el `UPDATE` condicional verifica `ROW_COUNT` y lanza una excepción explícita si ninguna fila transicionó antes de devolver éxito.
- `Próximas` contiene estados activos no pasados; `Anteriores` contiene `finalizada` y reservaciones no canceladas cuyo `fecha`/`hora` local ya pasó; `Canceladas` contiene exclusivamente `cancelada`.
- Las fechas y horas son strings de negocio local seleccionados por el cliente; no se agrega inferencia de zona horaria, GPS ni conversión remota.

## Assumed Schema Contract

No había un esquema local de reservaciones. La migración `supabase/migrations/20261004000200_reservations.sql` documenta y crea, si falta, `public.reservaciones` con:

- `id`, `usuario_id`, `vehiculo_id`, `autolavado_id`, `servicio_id`, `espacio_lavado_id` nullable, `fecha`, `hora`, `estado`, `codigo_qr` con default generado por la base, `created_at` y `updated_at`.
- Las tablas existentes deben proveer `usuarios.id`, `vehiculos.id/usuario_id/marca/modelo/placas`, `autolavados.id/nombre`, `servicios.id/autolavado_id/nombre/precio/duracion_aproximada` y `espacios_lavado.id/autolavado_id/servicio_id`.
- Los tipos de IDs de las tablas existentes se consultan con `pg_catalog.format_type` para alinear las columnas de la tabla nueva y los inserts dinámicos; las respuestas RPC exponen IDs como `text`.
- No se inventan tablas auxiliares, no se ejecutó PostgreSQL hospedado y la compatibilidad final del esquema real queda pendiente de aplicar la migración en el entorno autorizado.

## Tasks

### RS-1 — Establish the secure reservation database boundary

- [x] Agregar los estados, el modelo `types/reservation.ts` y los contratos RPC tipados sin autoridad `usuario_id` ni input `codigo_qr`.
- [x] Agregar la migración/RPC para disponibilidad, creación atómica, listado, detalle y cancelación; preservar el `codigo_qr` generado por la base.
- [x] Validar ownership, relaciones, estados permitidos, fecha/hora, espacios aplicables, conflicto activo y transición de cancelación en servidor.
- [x] Agregar pruebas estáticas de SQL/security/conflicto sin afirmar ejecución hospedada.

### RS-2 — Implement reservation creation flow

- [x] Reemplazar el destino informativo `/reservar` por el wizard con contexto de autolavado/servicio.
- [x] Cargar vehículos por la ruta owner-scoped existente y permitir vehículo, fecha, hora y espacio aplicable.
- [x] Consultar disponibilidad para cada fecha/hora válida y mostrar estados de carga, error, reintento, vacío, ocupado, validación y busy.
- [x] Mostrar resumen y confirmar únicamente por la RPC atómica.
- [x] Mostrar estado y `codigo_qr` devuelto por la base, sin generar ni enviar QR desde el cliente.

### RS-3 — Implement reservation management

- [x] Reemplazar el placeholder de la tab por `Mis reservaciones` con `Próximas`, `Anteriores` y `Canceladas`.
- [x] Agregar `app/(customer)/reservacion/[id].tsx` con detalle, estado, QR, loading/error/empty y navegación de regreso.
- [x] Agregar confirmación de cancelación, guard de duplicados, estado busy, transición server-side y refresco visual.
- [x] Agregar pruebas de servicio, migración, wizard, disponibilidad/conflicto, secciones, detalle y cancelación.

## TDD Evidence

- **RED** — `npx jest __tests__/reservationService.test.ts __tests__/reservationMigrationSecurity.test.ts __tests__/ReservationRoute.test.tsx __tests__/ReservationsRoute.test.tsx __tests__/ReservationDetailRoute.test.tsx --runInBand`: 5 suites failed before implementation because the reservation service, migration and routes did not exist.
- **GREEN focused** — `npx jest __tests__/reservationService.test.ts __tests__/reservationMigrationSecurity.test.ts __tests__/ReservationRoute.test.tsx __tests__/ReservationsRoute.test.tsx __tests__/ReservationDetailRoute.test.tsx __tests__/PreparedReservationRoute.test.tsx --runInBand`: 6 suites passed, 28 tests passed.
- **GREEN full** — `npm test -- --runInBand`: 22 suites passed, 108 tests passed.

### Corrective TDD Evidence — cancellation TOCTOU

- **RED** — `npx jest __tests__/reservationMigrationSecurity.test.ts --runInBand`: 1 test failed and 5 tests passed because the cancellation status read had no owned-row lock and the conditional update had no success check.
- **GREEN focused** — `npx jest __tests__/reservationMigrationSecurity.test.ts --runInBand`: 1 suite passed, 6 tests passed.
- **Correction** — The cancellation status `SELECT` now uses `FOR UPDATE`; the conditional update is followed by `GET DIAGNOSTICS ... ROW_COUNT` and an explicit exception when no row transitioned, before returning the reservation.

### Corrective TDD Evidence — conflicto wildcard de espacio NULL

- **RED** — `npx jest __tests__/reservationMigrationSecurity.test.ts --runInBand`: 1 test failed and 6 tests passed because an active reservation with `espacio_lavado_id IS NULL` was not matched by the concrete-space conflict predicates.
- **GREEN focused** — `npx jest __tests__/reservationMigrationSecurity.test.ts --runInBand`: 1 suite passed, 7 tests passed.
- **Correction** — `carwash_create_reservation` now treats an active reservation as conflicting when the requested space is concrete and the existing space is `NULL` or equal; when the requested space is `NULL`, the existing `v_requested_space_id IS NULL` branch continues to block any active reservation at the autolavado/date/hour. `carwash_available_spaces` applies the same `NULL`-or-equal wildcard rule to every concrete applicable space. Advisory locks, the partial unique index, statuses, and client authority remain unchanged.

## Progress and Evidence

- `services/reservationService.ts` usa `SESSION_TOKEN_STORAGE_KEY`, mapea DTOs RPC a `Reservation`, no acepta `usuario_id` ni `codigo_qr` y cubre availability/create/list/get/cancel.
- `app/(customer)/reservar.tsx` carga autolavado/servicio y vehículos, impone el orden de selección, consulta espacios, confirma y muestra el QR/status retornado.
- `app/(customer)/(tabs)/reservaciones.tsx` clasifica con strings locales `fecha`/`hora` según los estados exactos del tracker y navega al detalle.
- `app/(customer)/reservacion/[id].tsx` muestra los campos solicitados y usa `Alert` + un guard `useRef` para impedir cancelaciones duplicadas.
- `__tests__/reservationMigrationSecurity.test.ts` prueba search path vacío, SECURITY DEFINER, grants/revokes, RLS deny, ownership/relaciones, estados, QR omitido, índice/lock de conflicto, el wildcard de espacio `NULL` y la corrección TOCTOU de cancelación.
- No se modificaron auth, vehículos, exploración de autolavados ni el orden de tabs.

## Verification

- [x] `npx jest __tests__/reservationMigrationSecurity.test.ts --runInBand` — PASS: 1 suite, 7 tests.
- [x] `npm test -- --runInBand` — PASS: 22 suites, 109 tests. Se mantiene únicamente el warning existente de Node sobre `punycode` deprecated (`DEP0040`).
- [x] `npx tsc --noEmit` — PASS, sin salida.
- [x] `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — PASS: bundles iOS y Android exportados a `dist`.
- [x] `git diff --check` — PASS, sin salida.
- PostgreSQL/Supabase hospedado — **no ejecutado**; no se afirma compatibilidad runtime contra el esquema remoto.

## Residual Hosted-Schema Limitations

- Debe aplicarse la migración en un entorno autorizado y verificarse que las columnas/ tipos asumidos (`servicios.autolavado_id`, `espacios_lavado.servicio_id`, nombres, precio, duración y timestamps) coincidan con el esquema real.
- Debe verificarse que `codigo_qr` existente tenga default/trigger generador si `reservaciones` ya existe, porque la migración no reemplaza una tabla remota preexistente.
- El índice único parcial, los advisory locks y el lock `FOR UPDATE` de cancelación fueron verificados estáticamente, no mediante concurrencia PostgreSQL hospedada; tampoco se ejecutó la migración contra Supabase hospedado.
- La regla wildcard de reservaciones activas con `espacio_lavado_id IS NULL` fue verificada únicamente mediante el contrato estático y deberá confirmarse al aplicar la migración en un entorno PostgreSQL autorizado, especialmente contra filas legacy/inconsistentes y cambios futuros del modo de capacidad.

## Rollback Boundary

La reversión acotada elimina la nueva migración/RPC de reservaciones, `types/reservation.ts`, `services/reservationService.ts`, las rutas `reservar.tsx` y `reservacion/[id].tsx`, la implementación de la tab, sus pruebas y los contratos agregados a `types/database.ts`; no revierte archivos de auth, vehículos, exploración, tabs ni `.atl/` preexistentes.

## Delivery Boundary

- No se instaló ningún paquete.
- No se stageó, commiteó ni publicó ningún cambio.
- Los artefactos generados por la verificación permanecen bajo las reglas de ignore existentes; no se modificó `.atl/`.
