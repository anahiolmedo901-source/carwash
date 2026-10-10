# CarWashNow — Sandbox payments

## Objective

Add a bounded payment module for reservation checkout using an injectable sandbox provider, an owner-scoped payment service, payment screens, and authoritative reservation/payment transitions.

## Problem

Reservation creation currently ends with a confirmation before payment exists. CarWashNow needs a safe payment boundary that supports test/sandbox outcomes without collecting or storing CVV, full card numbers, bank details, or provider secrets.

## Why

Payments must remain replaceable and isolated from reservation UI while successful payment must atomically confirm both the payment and its reservation on the trusted boundary.

## Scope

- Add payment status/method domain contracts and response validation.
- Formalize the existing `pagos` contract with owner-scoped, server-derived RPCs where the local schema is absent.
- Add an injectable sandbox provider boundary; do not integrate a live provider or store sensitive payment data.
- Replace the reservation success confirmation with payment checkout.
- Add purchase summary, payment form/result, confirmation, and payment history screens.
- Preserve existing auth, reservation, Realtime, sensors, navigation tab order, and unrelated dirty/staged work.

## Constraints

- Custom opaque session remains the only client identity input.
- `usuario_id`, `monto`, reservation status, payment status, and provider references are server authoritative.
- Never accept or persist CVV, full PAN, expiry, bank account data, or provider secrets.
- Payment logic stays in `services/paymentService.ts` and provider adapters; routes render state and call services.
- Sandbox-only behavior must be explicit in UI and testable without network access.
- No hosted Supabase, external provider, installation, staging, commit, push, Git configuration, `.env`, credentials, or `.atl/` access.
- TDD mode is unresolved/off for ODD purposes because no `sdd-init/carwash` capability record exists; use ordinary checks with Jest as the runner.

## Authorized scope

- Feature: payment checkout and history for customer reservations.
- Files: payment domain/service/types, payment migration/contracts, checkout/result/history routes and focused tests, plus the reservation checkout handoff and tracker evidence.
- Route: delegated direct implementation, one writer per bounded work unit.
- Delivery strategy: `ask-on-risk`; no commit without explicit repository-policy authorization.

## Tasks

- [x] PAY-1 — Define payment schema, secure RPC boundary, domain types, and sandbox provider contract.
  - Acceptance: exact states/methods are validated; owner and amount are server-derived; successful payment and reservation confirmation are atomic; direct table writes remain unavailable; sensitive fields never enter the contract.
  - Checks: focused payment migration/security and provider contract tests.
- [x] PAY-2 — Add payment service and checkout/purchase-summary flow.
  - Acceptance: reservation creation hands off to payment; checkout reloads authoritative reservation/amount; service handles pending/processing/approved/rejected/cancelled outcomes without client status mutation.
  - Checks: payment service, purchase-summary, payment route, reservation handoff, and Realtime cleanup tests.
- [x] PAY-3 — Add payment result and confirmation flow.
  - Acceptance: result reads authoritative payment/reservation state; confirmation appears only for `pagado` + `confirmada`; retry/error states are explicit.
  - Checks: payment service, result, payment route, reservation handoff, and Realtime compatibility tests.
- [x] PAY-4 — Add owner-scoped payment history.
  - Acceptance: history uses the session-owned service query, displays allowed methods/statuses, and never exposes sensitive payment data.
  - Checks: history service and route tests.
- [x] PAY-5 — Run verification and reconcile evidence.
  - Acceptance: focused/full tests, TypeScript, offline Expo export, and diff checks pass; hosted/provider limitations remain explicit; task and Engram mirror are current.

## Acceptance criteria

- A customer can review a reservation total, select an allowed method, and submit a clearly labelled sandbox payment.
- Approved sandbox payment atomically sets `pagos.estado = pagado` and `reservaciones.estado = confirmada`, then shows confirmation.
- Rejected, pending, processing, cancelled, and refunded states render without false confirmation.
- Payment history is owner-scoped and shows no CVV, full card number, bank data, or secrets.
- Provider logic is replaceable without changing route components.

## Applicable checks

```text
npm test -- --runInBand
npx tsc --noEmit
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios
git diff --check
```

## Progress

- Status: PAY-4 complete; PAY-1 compatibility-hardening correction preserved; PAY-5 complete for offline verification.
- Verification evidence:
  - RED before implementation: `npm test -- --runInBand __tests__/paymentDomain.test.ts __tests__/paymentProvider.test.ts __tests__/paymentMigrationSecurity.test.ts` — 3 suites failed to run with the intentional missing payment types/provider/migration files; 0 tests ran.
  - GREEN: `npm test -- --runInBand __tests__/paymentDomain.test.ts __tests__/paymentProvider.test.ts __tests__/paymentMigrationSecurity.test.ts __tests__/reservationMigrationSecurity.test.ts __tests__/rpcSecurityContract.test.ts` — 5 suites passed, 31 tests passed.
  - Correction RED: `npm test -- --runInBand __tests__/paymentMigrationSecurity.test.ts` — 1 suite failed, 2 tests failed, 8 tests passed; the new compatibility-hardening assertions exposed missing NOT NULL/default enforcement and NOT VALID constraints.
  - Correction GREEN: `npm test -- --runInBand __tests__/paymentDomain.test.ts __tests__/paymentProvider.test.ts __tests__/paymentMigrationSecurity.test.ts __tests__/reservationMigrationSecurity.test.ts __tests__/rpcSecurityContract.test.ts` — 5 suites passed, 33 tests passed.
  - TypeScript: `npx tsc --noEmit` — passed.
  - Diff hygiene: focused `git diff --check` — passed.
  - Hosted Supabase/provider execution and full app/export checks were not run; PAY-1 remains offline and sandbox-only.
- PAY-2 verification evidence:
  - RED before implementation: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/PaymentSummaryRoute.test.tsx __tests__/PaymentRoute.test.tsx __tests__/ReservationRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx` — 5 suites failed; the new service and two route suites failed to run because their implementation modules were intentionally absent, while the two updated reservation handoff suites each failed their expected navigation assertion; 2 tests failed, 6 tests passed, 8 tests ran.
  - GREEN focused: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/PaymentSummaryRoute.test.tsx __tests__/PaymentRoute.test.tsx __tests__/ReservationRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx __tests__/PreparedReservationRoute.test.tsx __tests__/ReservationDetailRoute.test.tsx __tests__/ReservationsRoute.test.tsx __tests__/RealtimeReservationsRoute.test.tsx __tests__/RealtimeReservationDetailRoute.test.tsx __tests__/ReservationProgress.test.tsx` — 11 suites passed, 28 tests passed.
  - GREEN payment/reservation regression: `npm test -- --runInBand __tests__/paymentDomain.test.ts __tests__/paymentProvider.test.ts __tests__/paymentMigrationSecurity.test.ts __tests__/paymentService.test.ts __tests__/PaymentSummaryRoute.test.tsx __tests__/PaymentRoute.test.tsx __tests__/ReservationRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx __tests__/PreparedReservationRoute.test.tsx __tests__/ReservationDetailRoute.test.tsx __tests__/ReservationsRoute.test.tsx __tests__/RealtimeReservationsRoute.test.tsx __tests__/RealtimeReservationDetailRoute.test.tsx __tests__/ReservationProgress.test.tsx` — 14 suites passed, 44 tests passed.
  - TypeScript: `npx tsc --noEmit` — passed.
  - Diff hygiene: `git diff --check` — passed.
  - Implementation boundary: `services/paymentService.ts` reads the opaque session token, calls only `carwash_begin_payment` and `carwash_process_sandbox_payment`, validates mapped payment rows, injects the RPC client/provider, and sends only the normalized provider outcome to the trusted process RPC; the routes send only reservation IDs and allowed methods.
  - Checkout boundary: `app/(customer)/pago/resumen/[id].tsx` and `app/(customer)/pago/[id].tsx` reload the authoritative reservation through `reservationService.getReservation`, display service/vehicle/date/time/amount, expose exactly the five allowed methods, and visibly identify sandbox/test behavior without collecting sensitive payment data.
  - Reservation handoff: `app/(customer)/reservar.tsx` navigates to `/pago/resumen/[id]` after creation without rendering the former confirmation card; existing Realtime subscriptions still return cleanup functions and the handoff test verifies unmount cleanup.
- Residual hosted assumptions and cleanup limitation: the migration expects the existing `usuarios`, `reservaciones`, `vehiculos`, `autolavados`, `servicios`, `espacios_lavado`, custom opaque-session RPC, and `extensions.pgcrypto` contracts; it has not been applied to hosted Supabase. Existing `pagos` NULL/invalid values, incompatible relationship types, or conflicting app-owned constraints now intentionally fail migration and require operator cleanup/alignment; legacy data is not silently rewritten or validated with `NOT VALID`.
- PAY-3 verification evidence:
  - RED before implementation: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/PaymentResultRoute.test.tsx __tests__/PaymentRoute.test.tsx` — 3 suites failed; 3 tests failed and 4 tests passed; the result route module was absent, `getPayment` was absent, and the payment route did not navigate after checkout. The retry assertion was aligned to the existing reservation-reload retry behavior before implementation.
  - GREEN focused: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/PaymentResultRoute.test.tsx __tests__/PaymentRoute.test.tsx` — 3 suites passed, 15 tests passed.
  - GREEN payment/reservation/Realtime compatibility: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/PaymentResultRoute.test.tsx __tests__/PaymentRoute.test.tsx __tests__/PaymentSummaryRoute.test.tsx __tests__/ReservationRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx` — 6 suites passed, 25 tests passed; Jest emitted the existing Node `punycode` deprecation warning.
  - TypeScript: `npx tsc --noEmit` — passed.
  - Result boundary: `services/paymentService.ts` now reads the existing opaque session token, calls only owner-scoped `carwash_get_payment`, and validates the returned payment before the result route asks `reservationService.getReservation` for the linked authoritative reservation.
  - Confirmation boundary: `app/(customer)/pago/resultado/[paymentId].tsx` accepts only the payment ID, confirms only the exact `pagado` + `confirmada` pair, renders explicit pending/processing/rejected/cancelled/refunded/inconsistent/error states, exposes retry/navigation actions, and omits external references and sensitive payment fields.
  - Checkout handoff: `app/(customer)/pago/[id].tsx` now navigates after the sandbox RPC returns with only `paymentId`; it does not render a local payment result or confirmation and preserves the existing loading/retry flow.
- Realtime compatibility: existing reservation/space Realtime services and route subscriptions were not changed; the result screen reloads server-backed state rather than deriving success from navigation or provider output.
- PAY-4 verification evidence:
  - RED before implementation: `npm test -- --runInBand __tests__/paymentHistoryService.test.ts __tests__/PaymentHistoryRoute.test.tsx __tests__/CustomerProfilePaymentHistoryLink.test.tsx` — 3 suites failed, 3 tests failed; the history route module and `listPayments` were intentionally absent, and the profile history link was not yet present.
  - GREEN focused: `npm test -- --runInBand __tests__/paymentHistoryService.test.ts __tests__/PaymentHistoryRoute.test.tsx __tests__/CustomerProfilePaymentHistoryLink.test.tsx` — 3 suites passed, 6 tests passed.
  - GREEN payment/history/reservation regression: `npm test -- --runInBand __tests__/paymentService.test.ts __tests__/paymentHistoryService.test.ts __tests__/PaymentHistoryRoute.test.tsx __tests__/CustomerProfilePaymentHistoryLink.test.tsx __tests__/PaymentResultRoute.test.tsx __tests__/PaymentRoute.test.tsx __tests__/PaymentSummaryRoute.test.tsx __tests__/ReservationRoute.test.tsx __tests__/RealtimeReservationFlow.test.tsx` — 9 suites passed, 31 tests passed; Jest emitted the existing Node `punycode` deprecation warning.
  - TypeScript: `npx tsc --noEmit` — passed.
  - History service boundary: `services/paymentService.ts` reads the existing opaque session token, calls only `carwash_list_payments`, maps every returned row to `PaymentHistoryItem`, and rejects invalid payment or reservation status/method/summary data through the existing runtime guards.
  - History route boundary: `app/(customer)/pagos.tsx` is a customer-stack route outside the five-tab order, reloads only through `paymentService.listPayments()`, supports initial load/retry/refresh, renders Spanish labels for all allowed payment statuses and methods, and omits external references and sensitive payment fields. `app/(customer)/(tabs)/profile.tsx` provides the navigation link.
- PAY-5 verification evidence:
  - Full Jest: `npm test -- --runInBand` — 39 suites passed, 171 tests passed; Jest emitted the existing Node `punycode` deprecation warning.
  - TypeScript: `npx tsc --noEmit` — passed.
  - Offline Expo export: `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed; Android and iOS bundles were generated in ignored `dist/` output.
  - Diff hygiene: `git diff --check` — passed.
  - Independent offline verification passed for PAY-1, PAY-2, PAY-3, and PAY-4; no files were staged or committed.
- Final hosted limitation: the migration has not been applied to Supabase, the sandbox RPC/provider has not run against a hosted database, and existing invalid `pagos` rows may require authorized cleanup. No live Mercado Pago/card provider integration exists in this sandbox slice.
- Next step: optional hosted migration/provider validation under explicit remote authorization; no additional product phase was started.
