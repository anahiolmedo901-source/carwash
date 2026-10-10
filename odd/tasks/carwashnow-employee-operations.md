# CarWashNow — Employee operations

## Objective

Add an employee-only reservation operations module for assigned car washes: dashboard counts, safe reservation detail, exact forward-only status transitions, server-owned history, and persisted customer notifications.

## Problem

The current application authenticates and routes only customer sessions. Employee routes are placeholders, reservation RPCs are customer-owned, and there is no server contract for employee assignment, operational history, or notification creation.

## Why

Operational state changes must be authorized by the employee's server-side car-wash assignment, atomically recorded, and observed by the customer through the existing Realtime reservation broadcast without exposing administrative data.

## Scope

- Preserve the server-returned role through login/session restoration and route employees to the employee area.
- Add server-managed active employee-to-autolavado assignments.
- Add employee dashboard/list/advance RPCs and an employee service/UI.
- Permit only `confirmada → cliente_llego → en_espera → en_lavado → finalizada`.
- Record state history and create server-owned notification rows in the same transition transaction.
- Preserve the existing reservation Realtime trigger so customer screens update automatically.
- Show only customer, vehicle, service, time, space, and operational status data.

## Constraints

- Employee authorization is derived from the opaque session and `usuarios.rol = 'empleado'`; the client cannot provide role or autolavado ID as authority.
- Employee assignments support multiple active autolavados; reads and mutations are scoped to those assignments.
- Dashboard “waiting” means `en_espera`; “today” uses the database business date.
- Employee transitions update only reservation operational status and `updated_at`.
- History actor, previous/next status, notification recipient/type/message, and timestamps are server-derived.
- Persisted notification rows are created here; push delivery/provider integration remains outside this phase.
- No employee access to passwords, auth/session fields, QR, price/payment data, customer contact details, or administrative mutation controls.
- Preserve customer auth/vehicles/payments/Realtime behavior and unrelated dirty/staged work.
- No hosted Supabase, credentials, installation, staging, commit, push, Git configuration, `.env`, or `.atl/` access.
- No `sdd-init/carwash` capability record exists; use ordinary Jest/type/export checks rather than strict TDD claims.

## Authorized scope

- Feature: employee reservation operations for assigned autolavados.
- Files: role-preserving auth/routing, employee types/service/routes, employee migration/RPC contracts, history/notification contracts, focused tests, and this tracker.
- Route: delegated direct implementation, one writer per bounded work unit.
- Delivery strategy: `ask-on-risk`; no commit without explicit repository-policy authorization.

## Tasks

- [x] EMP-1 — Preserve employee roles and add secure employee routing/assignment contract.
  - Acceptance: login/restore preserves `empleado`; customer/admin tokens cannot enter employee RPCs; employees route to the employee area; assignment ownership is server-derived.
  - Checks: auth role/routing and migration security tests.
  - Evidence: test-first RED baseline recorded; employee auth/routing and migration contract GREEN with 15 tests passed; focused auth regression set GREEN with 30 tests passed; TypeScript check passed.
- [ ] EMP-2 — Add dashboard/list/transition/history/notification database boundary.
  - Acceptance: dashboard and list are assignment-scoped; exact transitions are locked and forward-only; history and notification rows are atomic/server-derived; direct table access remains denied.
  - Checks: static migration security/transition contract tests.
- [ ] EMP-3 — Add employee service and dashboard UI.
  - Acceptance: dashboard shows today/waiting/washing/finished counts and safe reservation details; only the next legal transition is actionable; sensitive fields are absent.
  - Checks: employee service and dashboard route tests.
- [ ] EMP-4 — Verify customer Realtime and notification behavior.
  - Acceptance: employee transitions reuse existing reservation broadcasts; notification rows use the correct type/recipient; customer tests remain green.
  - Checks: focused/full tests, TypeScript, offline Expo export, and diff checks.

## Allowed status transitions

```text
confirmada    -> cliente_llego
cliente_llego -> en_espera
en_espera     -> en_lavado
en_lavado     -> finalizada
```

## Acceptance criteria

- An authenticated employee can see only reservations belonging to assigned autolavados.
- Dashboard counts and reservation cards expose only operational fields.
- Every legal transition updates Supabase, writes history, creates a customer notification, and triggers existing Realtime customer updates atomically.
- Invalid, skipped, backward, cancelled, finalised, foreign-autolavado, customer, and administrator transitions are rejected.
- No administrative sensitive data can be read or modified through employee flows.

## Applicable checks

```text
npm test -- --runInBand
npx tsc --noEmit
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios
```

## Progress

- Status: EMP-1 complete; EMP-2, EMP-3, and EMP-4 remain not started.
- Verification evidence:
  - RED: `./node_modules/.bin/jest __tests__/employeeAuthRouting.test.ts __tests__/employeeMigrationSecurity.test.ts --runInBand` failed before implementation with the missing migration and role/routing assertions.
  - GREEN: `./node_modules/.bin/jest __tests__/employeeAuthRouting.test.ts __tests__/employeeMigrationSecurity.test.ts --runInBand` — 2 suites, 15 tests passed.
  - GREEN regression: `./node_modules/.bin/jest __tests__/authService.test.ts __tests__/AuthProvider.test.tsx __tests__/routeForState.test.ts __tests__/employeeAuthRouting.test.ts __tests__/employeeMigrationSecurity.test.ts --runInBand` — 5 suites, 30 tests passed.
  - GREEN type check: `npx --no-install tsc --noEmit` — passed with no output.
  - Full Expo export was not run by the authorized verification scope.
- Residual hosted-schema assumptions: the migration requires existing `public.usuarios`, `public.autolavados`, `public.carwash_sessions`, the documented auth columns, and the `extensions`/`pgcrypto` setup from the existing custom-auth migration; hosted execution was not performed.
- Next step: EMP-2, after explicit authorization for that bounded work unit.
