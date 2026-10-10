# CarWashNow — Supabase Realtime

## Objective

Add real-time status synchronization for customer reservations and washing spaces using Supabase Broadcast with a server-side session-to-Realtime authorization bridge. Update reservation progress and space availability without manual refresh, with deterministic subscription cleanup and duplicate prevention.

## Authorized Scope

- Listen only to `reservaciones.estado`/`updated_at` and `espacios_lavado.estado` changes.
- Show reservation progress: `confirmada` → `cliente_llego` → `en_espera` → `en_lavado` → `finalizada`, with `pendiente` and `cancelada` handled separately.
- Reflect space states exactly: `disponible`, `reservado`, `ocupado`, `mantenimiento`.
- Update existing reservation list/detail/confirmation and reservation-flow space UI only as required for synchronization.
- Do not add payments, GPS, notifications, new business actions, or unrelated modules.
- Preserve current custom opaque-session auth, reservation semantics, autolavado exploration, vehicles, and staged/dirty worktree state.
- Do not inspect `.env` values/credentials, access hosted Supabase, install packages, stage, commit, push, change Git config, or modify `.atl/`.

## Architecture Decision

- Direct mobile `postgres_changes` is not safe or functional here: the app uses an opaque custom session token, while Realtime authorization requires a Supabase JWT and evaluates RLS; reservation tables currently deny direct client table access.
- Use server-side Broadcast: database triggers emit minimal status-only payloads to private customer/autolavado topics, and a Supabase Edge Function validates the opaque session through the existing server RPC before minting a short-lived Realtime JWT with `sub` plus the bounded union of requested autolavado claims.
- The client calls the token function, sets the one global Realtime auth token, subscribes to private Broadcast topics, and never signs or fabricates JWTs.
- Stable topics: `carwash:reservaciones:customer:{usuarioId}` and `carwash:espacios_lavado:autolavado:{autolavadoId}`. One reference-counted channel exists per topic; each consumer receives an independent unsubscribe function.
- Broadcast payloads contain only the relevant entity ID, status, and `updated_at`; no QR, price, vehicle, credentials, or unrelated row data is broadcast.
- Database triggers fire only for reservation inserts/status changes and space inserts/status changes. The reservation RPC remains authoritative: applicable spaces count toward capacity regardless of state, only `estado = 'disponible'` rows are selectable, and Realtime is a UI invalidation/update signal, never the booking safety check.

## Security and Runtime Contract

- Add private `realtime.messages` read policies keyed to JWT `sub`/`autolavado_ids` array claims and exact topic prefixes; do not weaken reservation table RLS or direct table privileges.
- Establish `espacios_lavado.estado` with `disponible` as the default, `NOT NULL`, and exactly the four allowed values before reservation RPC definitions. Reassert the default/`NOT NULL` contract for existing columns, replace only the app-owned named check, and never drop unrelated constraints; keep the later migration idempotent.
- Register the trigger functions and Broadcast contract in a new migration; hosted publication/Realtime configuration remains unverified locally.
- The Edge Function requires hosted `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_JWT_SECRET` environment configuration; no secrets belong in the repository.
- If token acquisition or channel authorization fails, existing RPC-loaded data remains visible and the UI reports a non-fatal real-time warning; never invent a state.

## Tasks

### RT-1 — Establish server-side Broadcast authorization

- [x] Add the short-lived token Edge Function validating the opaque session and bounded autolavado scope union.
- [x] Add the database Broadcast triggers, minimal payloads, private topic policies, and exact space-status contract.
- [x] Add static SQL/function contract tests without claiming hosted execution.

### RT-2 — Add lifecycle-safe subscription service

- [x] Add an injectable Realtime service using stable topic identities, reference-counted channels, and one monotonically broadened global auth scope union.
- [x] Prevent duplicate underlying subscriptions and remove each channel exactly when its last consumer unsubscribes.
- [x] Expose subscription errors without breaking existing RPC loading; never call `removeAllChannels()` from a component.
- [x] Add service tests for token setup, topics, duplicate subscribers, callback delivery, cleanup, and channel errors.

### RT-3 — Connect live reservation and space state

- [x] Subscribe reservation list/detail/confirmation views to customer reservation events and merge only status/updated timestamp.
- [x] Render the ordered progress component and reclassify list sections automatically on status events.
- [x] Subscribe the reservation flow to autolavado space events, show the four space states, clear newly unavailable selections, and re-query authoritative availability.
- [x] Add route tests proving one subscription per mounted identity, live state updates, identity changes, and unmount cleanup.

## Acceptance Criteria

- A server-side status event updates the mounted customer reservation UI without refresh.
- Reservation progression is visually ordered and handles `pendiente`/`cancelada` separately.
- Space status changes update visible state and invalidate selected availability; reservation RPCs remain authoritative.
- Duplicate renders do not create duplicate channels; unmount/identity changes remove subscriptions and listeners.
- No direct anonymous table subscription bypasses RLS; no status/QR/user data is fabricated or generated client-side.
- Existing reservation behavior/tests remain intact.

## Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios`
- `git diff --check`
- Hosted Edge Function, Supabase Realtime authorization, trigger execution, and leak/concurrency behavior remain explicitly unverified locally.

## Progress and Evidence

- Repository-relative locator: `odd/tasks/carwashnow-realtime.md`.
- Baseline: reservation UI loads via RPC once; no Realtime/channel/cleanup implementation exists. `espacios_lavado` lacks a local `estado` contract.
- Mapping finding: direct `postgres_changes` conflicts with the custom opaque-session/RLS boundary; user selected the server-side Broadcast bridge.
- TDD RED: `npx jest __tests__/realtimeService.test.ts __tests__/realtimeMigrationContract.test.ts __tests__/realtimeTokenContract.test.ts __tests__/ReservationProgress.test.tsx __tests__/RealtimeReservationsRoute.test.tsx __tests__/RealtimeReservationDetailRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx --runInBand` failed before implementation with missing service, migration, token function, and progress component modules; route assertions also failed because no subscription or live merge existed.
- TDD GREEN: the initial focused command passed with 7 suites and 18 tests; after adding confirmation-progress coverage, the final focused command passed with 7 suites and 19 tests.
- Correction TDD RED: `npx jest __tests__/realtimeService.test.ts __tests__/realtimeMigrationContract.test.ts __tests__/realtimeTokenContract.test.ts __tests__/reservationMigrationSecurity.test.ts --runInBand` failed as intended after adding the tests first: 4 suites failed, 7 tests failed, and 15 tests passed. Failures covered missing `estado = 'disponible'` guards, singular token/RLS scope claims, null-body handling, and global scope union behavior.
- Correction TDD GREEN: the same focused command passed with 4 suites and 22 tests after implementation.
- Migration-order TDD RED: `npx jest __tests__/realtimeMigrationContract.test.ts --runInBand` failed as intended after adding the migration-order assertion first; 1 of 5 tests failed because the reservation migration had no pre-RPC four-state constraint.
- Migration-order TDD GREEN: the same focused command passed with 1 suite and 5 tests after moving the complete space-state contract into `20261004000200_reservations.sql` before the first reservation RPC reference.
- Existing-column hardening TDD RED: `./node_modules/.bin/jest __tests__/realtimeMigrationContract.test.ts --runInBand` failed intentionally after adding the hardening assertions first; 1 suite failed with 1 failed and 4 passed because the reservation migration did not explicitly reset the existing column default/`NOT NULL` contract or replace the named check.
- Existing-column hardening TDD GREEN: `./node_modules/.bin/jest __tests__/realtimeMigrationContract.test.ts __tests__/reservationMigrationSecurity.test.ts --runInBand` passed with 2 suites and 13 tests after adding explicit default/`NOT NULL` repair and replacement of only `carwash_espacios_lavado_estado_check`.
- Full verification: `npm test -- --runInBand` passed with 29 suites and 132 tests. Jest emitted the existing Node `[DEP0040] DeprecationWarning: The punycode module is deprecated` warning.
- Type verification: `npx tsc --noEmit` passed. The Expo TypeScript boundary explicitly excludes `supabase/functions/**/*.ts`; Deno `npm:` imports and `Deno` globals are verified by static contract tests instead of being hidden in app code.
- Bundle verification: `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` passed and produced iOS and Android bundles in ignored `dist/` output.
- Diff verification: `git diff --check` passed.
- Authoritative space-state guard: `20261004000200_reservations.sql` establishes and reasserts `espacios_lavado.estado` with default `disponible`, `NOT NULL`, and the exact `disponible`/`reservado`/`ocupado`/`mantenimiento` check before defining the RPCs. It replaces only the app-owned named check and leaves unrelated constraints untouched. It counts every applicable space for capacity, filters availability rows to `disponible`, and rejects selected non-disponible spaces; all-unavailable capacity returns `has_spaces=true, available=false` and cannot fall back to NULL-space mode.
- Migration-order correction: the static Realtime migration contract now reads both migrations and proves that the complete space-state contract, including existing-column hardening, precedes the first reservation RPC `.estado` reference. The later `20261004000300_realtime_broadcast.sql` retains its idempotent `IF NOT EXISTS` setup and its security policies remain unchanged.
- Union JWT scope contract: the Edge Function accepts at most 32 `autolavadoIds`, validates every requested ID through the service-role query, and signs `sub`, `role`, and `autolavado_ids`. The private RLS policy matches exact space-topic suffixes against that array. The client keeps one monotonically broadened scope union, refreshes the global `setAuth` token only to add scopes, retains prior scopes while any channel remains active, and resets after the final channel is removed; customer topics continue using the same token subject.
- Malformed-body correction: the Edge Function rejects JSON `null`, arrays, and primitives with the malformed-request 400 response before accessing `sessionToken`.
- Cleanup/leak evidence: `realtimeService.test.ts` proves duplicate consumers share one private channel, the first unsubscribe leaves it alive, the last unsubscribe calls `removeChannel` once, invalid payloads never reach listeners, and channel/token failures use non-fatal error callbacks. Route tests prove changed customer identity and unmount invoke the prior unsubscribe. No component calls `removeAllChannels()`.
- Schema/hosted prerequisites: hosted Realtime must provide `realtime.send(jsonb, text, text, boolean)`, the migrations must run in timestamp order, private Broadcast authorization must evaluate the customer and array-based `realtime.messages` policies, the Edge Function must receive hosted `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_JWT_SECRET` environment values, and deployed clients/functions must use the new `autolavadoIds`/`autolavado_ids` contract. Hosted migration execution, Edge Function execution, JWT verification, trigger delivery, RLS authorization, and leak/concurrency behavior remain unverified locally.
- Hosted data-cleanup limitation: the explicit `SET NOT NULL`/exact four-state contract can fail on an already populated hosted `espacios_lavado` table containing NULL or unsupported `estado` values; the migration does not rewrite those rows. No hosted project was contacted and no cleanup was performed; an authorized operator must inspect and clean those rows before applying the migration if they exist.
- Security boundary: no reservation table RLS or direct table privilege was relaxed; the app never signs a JWT, reads direct reservation rows, or subscribes anonymously to `postgres_changes`.
- Migration-order correction rollback: remove only the pre-RPC `espacios_lavado.estado` hardening/constraint block from `20261004000200_reservations.sql`, its static assertions, and the corresponding tracker/memory evidence; retain the existing reservation RPCs and Realtime feature.
- Rollback boundary: remove `20261004000300_realtime_broadcast.sql`, `supabase/functions/carwash-realtime-token/index.ts`, `services/realtimeService.ts`, `types/realtime.ts`, `components/ReservationProgress.tsx`, the optional auth hook, the three customer reservation route integrations, their focused tests, and this tracker evidence. Existing auth, reservation RPCs, exploration, vehicles, navigation, `.atl/`, and prior dirty/staged work remain outside the feature boundary.
- Delivery state: nothing was staged or committed, per task constraint.
