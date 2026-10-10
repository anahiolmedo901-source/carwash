# CarWashNow — Administrator panel

## Objective

Add an administrator-only dashboard and management surfaces for autolavados, services, washing spaces, employees, and reservations, with secure server-side role enforcement.

## Problem

The administrator route is currently a placeholder. Existing customer RPCs cannot be reused for global administration, and the current SQL session boundary does not authenticate or restore administrator roles.

## Why

Administrative reads and CRUD must be authorized by the server from the opaque session, expose only intentional projections, and preserve customer pricing/reservation integrity.

## Scope

- Extend login/session restoration to preserve active `administrador` roles without trusting client input.
- Add an administrator-only session helper and RPC boundary.
- Add dashboard metrics: today’s reservations, collected revenue, completed services, and vehicles currently washing.
- Add read-only autolavado, employee, and reservation administration surfaces.
- Add CRUD for services and washing spaces only.
- Preserve customer, employee, payment, reservation, and Realtime behavior.
- Add a reservation price snapshot so service-price CRUD cannot change an existing reservation’s amount.

## Constraints

- Every admin RPC derives administrator identity from the opaque session token; role, IDs, prices, and statuses are never client authority.
- No direct table access from the app; use explicit security-definer RPCs with empty search paths, RLS deny policies, revoked privileges, and explicit grants.
- Never expose password hashes, session/token fields, QR codes, payment secrets, or unnecessary external references.
- Service/space deletes reject referenced records rather than cascading away history.
- Admin may query employees/reservations but receives no mutation controls for them in this phase.
- Existing employee-auth migration work remains preserved; no employee feature implementation is resumed.
- No hosted Supabase, credentials, installation, commit, push, Git configuration, `.env`, or `.atl/` access outside the explicitly authorized staging verification in ADM-6.
- No `sdd-init/carwash` capability record exists; use ordinary Jest/type/export checks.

## Authorized scope

- Feature: administrator dashboard and service/space management.
- Files: role-aware auth/routing, admin migration/RPC contracts, reservation price snapshot, admin types/service/routes/tests, staging compatibility fixes, and this tracker.
- Route: delegated direct implementation, one writer per bounded work unit.
- Delivery strategy: `ask-on-risk`; no commit without explicit repository-policy authorization.

## Tasks

- [x] ADM-1 — Add administrator session authorization and protected routing.
  - Acceptance: active administrators can log in/restore; customer/employee tokens cannot call admin RPCs; existing customer/employee routing remains intact; no client role input.
  - Checks: auth role/routing and migration security tests.
- [x] ADM-2 — Add secure admin reads/dashboard and reservation price snapshot.
  - Acceptance: metrics and read projections are server-scoped; sensitive fields are omitted; reservation amounts remain stable after service price edits.
  - Checks: dashboard/read/security and price-integrity contract tests.
- [x] ADM-3 — Add service and washing-space CRUD boundary/service.
  - Acceptance: CRUD validates ownership/relationships, price bounds, space status, and referenced-record deletes; all operations require administrator RPC authorization.
  - Checks: CRUD service and migration security tests.
- [x] ADM-4 — Add protected administrator dashboard and management routes.
  - Acceptance: consistent CarWashNow UI shows metrics, autolavados, services, spaces, employees, and reservations; CRUD controls exist only for services/spaces; route guard rejects other roles.
  - Checks: administrator route/component tests.
- [x] ADM-5 — Run complete verification and reconcile evidence.
  - Acceptance: full tests, TypeScript, offline Expo export, diff checks, tracker, and Engram mirror are current; hosted limitations remain explicit.
- [x] ADM-6 — Reconcile staging schema and apply the migration chain.
  - Acceptance: local migrations match staging’s existing `reservaciones.espacio_id`/`hora_inicio` contract and `espacios_lavado` schema; dry-run is clean; all pending migrations apply once without data loss; remote migration history is verified.
  - Checks: local focused/full tests, typecheck, diff check, `supabase db push --dry-run`, one authorized `supabase db push`, and migration/schema verification queries.

## Dashboard metric definitions

- Today’s reservations: non-cancelled reservations whose scheduled date is the database business date.
- Revenue: gross `pagos` with `estado = pagado` and `fecha_pago` on the database business date; label as collected revenue.
- Completed services: scheduled-date reservations with `estado = finalizada`.
- Vehicles currently washing: distinct vehicles with `estado = en_lavado`.

## Acceptance criteria

- Only an authenticated administrator can render the administrator panel or execute its RPCs.
- Services and washing spaces support safe create/read/update/delete operations.
- Employees and reservations are queryable with safe projections only.
- Dashboard metrics are derived from server data and return zero safely when empty.
- Existing customer reservations/payments continue using authoritative amounts and statuses.

## Applicable checks

```text
npm test -- --runInBand
npx tsc --noEmit
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios
git diff --check
```

## Progress

- Status: ADM-1 through ADM-6 complete locally and in staging; work remains uncommitted by explicit repository constraint.
- Verification evidence: ADM-1 writer reported 3 focused suites/25 tests and 42 suites/196 tests passed; `npx tsc --noEmit` and `git diff --check` passed. ADM-1 independent verification reran 1 suite/10 tests successfully. ADM-2 writer reported 9 focused suites/58 tests and 45 suites/206 tests passed; `npx tsc --noEmit` and `git diff --check` passed. An independent verifier found a customer catalog regression, which was corrected with SELECT-only catalog policies/grants; post-correction verification passed 5 suites/28 tests, typecheck, and diff check. ADM-3 writer reported 8 focused suites/47 tests and 47 suites/215 tests passed; `npx tsc --noEmit` and `git diff --check` passed. An independent verifier found cross-autolavado relinking gaps, which were corrected with referenced-record relationship guards; post-correction verification passed 7 suites/45 tests, typecheck, and diff check. ADM-4 writer reported 8 focused suites/38 tests and 50 suites/226 tests passed; `npx tsc --noEmit` and `git diff --check` passed. Independent ADM-4 verification found no functional findings; explicit administrator tests passed 4 suites/12 tests and broader administrator tests 10 suites/50 tests. One named test path did not exist, and unrelated pre-existing auth diffs remain outside this feature. Final ADM-5 checks passed: `npm test -- --runInBand` (50 suites/226 tests), `npx tsc --noEmit`, offline Android/iOS Expo export (`Exported: dist`), and `git diff --check`. ADM-6 reconciliation corrected `espacio_id`/`hora_inicio`/`duracion_minutos`, removed nonexistent `espacios_lavado.servicio_id` assumptions, preserved nullable QR values, added `precio_snapshot` typing, added row-lock/recheck concurrency guards, and removed the owner-only Realtime RLS ALTER. Writer and independent verification passed 50 suites/231 tests, typecheck, and diff check; final offline Android/iOS export and diff check also passed. The authorized staging deployment first applied `20261004000100`, then after fixes applied `20261004000200` through `20261006000400`; migration history now matches all 8 local migrations. Remote metadata verification confirmed the staging columns, `precio_snapshot`, all administrator routines as `SECURITY DEFINER` with empty `search_path`, RLS enabled on protected public tables, SELECT-only public catalog policies, private Realtime policies, and all four Realtime triggers. No user data was queried and no live user-flow credentials were used.
- Next step: no implementation work remains; staging is migrated and verified at metadata/RLS/function level. Delivery follows ordinary repository policy.
