# CarWashNow — Mis vehículos

## Objective

Implement the customer vehicle-management module against `public.vehiculos`, with ownership derived from a trusted, phone-based custom session linked to `public.usuarios.id` and no Supabase Auth dependency.

## Current User-Authorized Contract

- Scope is limited to the prerequisite custom login/session and **Mis vehículos**. Do not implement reservations, payments, sensors, notifications, or other product modules.
- Sign-in identifier: `public.usuarios.telefono`.
- Credential: phone + password. Store only a bcrypt hash in `public.usuarios.password_hash`; never store or return plaintext passwords and never use `password_prueba`.
- Existing users receive password hashes through an administrator-controlled out-of-app process. No signup or password-provisioning UI is part of this task.
- Supabase Auth remains disabled. A database-issued opaque session token is persisted locally; only its hash is stored server-side. The database functions validate the token and derive the owner ID themselves.
- Vehicle CRUD must never accept `usuario_id` as an authoritative client input. Server-side functions scope list/detail/create/update/delete to the owner resolved from the session. Direct client table access is revoked and RLS is enabled.
- Vehicle types: `sedan`, `hatchback`, `suv`, `pickup`, `van`, `deportivo`, `otro`.
- No `.env` or credential access and no hosted Supabase queries, writes, deployment, or configuration changes. Produce local code/migrations only; report required backend provisioning clearly.
- Preserve the existing staged CWNA-2-C5 demo-auth changes as the starting index state; do not touch the pre-existing untracked `.atl/` directory. Git commit identity is unresolved.
- Strict TDD is active from the prior explicit user selection. Test runner: Jest, `npm test -- --runInBand`.
- Existing user-selected chain strategy: `stacked-to-main`; do not create or push PRs. One writer owns all implementation.

## Tasks

### CV-1 — Replace demo access with trusted phone/password sessions

- [x] Add a migration for password hashes, opaque server sessions, and narrowly granted database functions; use bcrypt via `pgcrypto` and a pinned empty `search_path` for `SECURITY DEFINER` routines.
- [x] Revoke direct `anon`/`authenticated` access to credential/session/vehicle tables and enable RLS with restrictive deny policies, so pre-existing permissive policies cannot expose these tables. Expose only the required RPC operations. Every vehicle operation derives `usuario_id` from a valid, unexpired session, not the request body.
- [x] Throttle repeated failed phone/password logins and perform comparable bcrypt work for unknown or ambiguous phone numbers to reduce brute-force and account-enumeration risk.
- [x] Replace the active local-demo login with phone/password login, session restoration, and revoking sign-out. Never call Supabase Auth.
- [x] Add regression tests for credential handling, normalized and ambiguous phone matches, session validation/expiry, and owner scoping. Do not add signup or credential-provisioning flows.

### CV-2 — Implement Mis vehículos

- [x] Replace the customer `Vehículos` placeholder with a “Mis vehículos” screen and cards for make/model, year, color, plates, and type.
- [x] Implement list, detail, create, edit, and delete via owner-scoped server functions. Include loading, error, empty, and success states; add an “Agregar vehículo” action and confirmation before deletion, with a busy guard while deletion runs.
- [x] Validate the seven permitted vehicle types on both client and server; never send an authoritative `usuario_id` from the app.
- [x] Add service, UI, and authorization-boundary tests, then run TypeScript and Android/iOS export.

## Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios`
- No hosted Supabase access is permitted in this task. SQL/backend behavior must be mocked or validated with local tooling if available; unavailable SQL execution must be reported, not represented as proven.

## Progress and Evidence

- Repository-relative locator: `odd/tasks/carwashnow-vehicles.md`.
- Baseline: `app/(customer)/(tabs)/vehiculos.tsx` is an informational placeholder. `types/database.ts` contains only `usuarios`; the repository has no local SQL schema, Supabase functions, migrations, or vehicle service.
- Baseline auth: staged CWNA-2-C5 currently signs in with fixed local ID `local-demo-customer`; it cannot authorize database access. This task replaces that runtime only after the custom server session is implemented.
- Route: delegated direct — secure custom auth, SQL RPCs, types, service, forms, screen states, and tests span multiple non-trivial files. One writer; no SDD artifacts.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/authService.test.ts __tests__/LoginForm.test.tsx __tests__/registrationValidation.test.ts __tests__/AuthProvider.test.tsx __tests__/SignOutScreens.test.tsx __tests__/AuthSignOutNotice.test.tsx __tests__/RegistrationUnavailableRoute.test.tsx __tests__/vehicleService.test.ts __tests__/VehiclesRoute.test.tsx __tests__/rpcSecurityContract.test.ts` — 10 suites failed; 20 tests failed and 3 passed (23 total). The failures showed the fixed demo sign-in, missing vehicle service/route, missing migration, and old email-form validation.
- GREEN: the same focused Jest command — 10 suites / 48 tests passed. A subsequent refactor removed fixed credential fixtures in favor of ephemeral generated test credentials and wrapped delete-confirmation callbacks in `act`; the focused command passed again at 10 suites / 48 tests.
- REFACTOR: auth storage now contains only the custom session token; SQL contract assertions check definer/search-path, session expiry/revocation, generic credential failures, and owner scoping. Vehicle RPC DTOs omit `usuario_id`, and service tests verify that no owner id is sent.
- Verification: `npm test -- --runInBand` — 13 suites / 54 tests passed; Node emitted the existing non-fatal `[DEP0040]` `punycode` deprecation warning. `npx tsc --noEmit` — passed with no output. `EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed; iOS bundled 1,201 modules (3.1 MB), Android bundled 1,336 modules (3.5 MB), and Expo exported `dist`. The Expo CLI printed `env: load .env` and public variable names while running the required export; `.env` contents and values were not inspected. No hosted Supabase access occurred. `git diff --check` — passed.
- Independent-review correction RED: `npm test -- --runInBand --runTestsByPath __tests__/rpcSecurityContract.test.ts __tests__/authService.test.ts __tests__/VehiclesRoute.test.tsx` — 3 suites failed; 5 tests failed and 18 passed (23 total), exposing the missing restrictive policies/throttle/dummy bcrypt path/phone normalization/delete busy guard.
- Independent-review correction GREEN: the same focused command — 3 suites / 24 tests passed after correction.
- Earlier independent-review correction baseline (superseded by the final CV-1 correction below): static contracts asserted a five-failure/15-minute per-normalized-phone lock. That lock could deny service to a known phone and is no longer the current behavior. Other verified properties at that point included bcrypt cost-12 work for invalid account/hash paths, digest-only attempt keys, no password writes/logs, restrictive deny policies, pinned function search paths, and Spanish vehicle column names.
- Verification before the final CV-1 follow-up: `npm test -- --runInBand` — 13 suites / 59 tests passed (non-fatal existing `[DEP0040]` `punycode` warning); `npx tsc --noEmit` — passed with no output; offline Android/iOS export passed. This earlier verification is superseded by the exact results below.
- Verification limit: SQL migration behavior was not executed in PostgreSQL and no hosted Supabase operation/query occurred. The SQL evidence is static contract coverage only; database runtime behavior and provisioned backend policy state remain unverified.
- Process boundary: Expo's one-shot export/bundling command completed. The post-check also showed a separate `node ... expo start --tunnel` process (PID 22180); this task did not start or stop it and left it untouched because it is outside this task's process ownership. It remains an unrelated/unresolved local process; no remote interaction was performed.
- Runtime limitation: no local PostgreSQL tools/runtime are installed (`psql`, `pg_isready`, `postgres`, `pg_ctl`, and `docker` unavailable). Jest checks the migration text only; SQL functions were not executed or connected to a hosted project. Deno/Edge Functions were intentionally not used.
- Required provisioning: before login works for an existing customer, an administrator must set `public.usuarios.password_hash` out-of-app using `extensions.crypt(<password supplied securely>, extensions.gen_salt('bf', 12))`. No password or test credential is stored in the repository.
- Rollback boundary: remove `supabase/migrations/20261004000100_custom_auth_and_vehicles.sql`, `services/vehicleService.ts`, the CV-1/CV-2 worktree changes to `services/authService.ts`, `context/AuthContext.tsx`, `types/auth.ts`, `types/database.ts`, `utils/authValidation.ts`, `components/LoginForm.tsx`, `components/TextField.tsx`, `app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `app/index.tsx`, `lib/supabase.ts`, and `app/(customer)/(tabs)/vehiculos.tsx`, plus the new/updated tests and these tracker entries. For files already staged from CWNA-2-C5, revert only this task's working-tree overlay; preserve the original index exactly. Leave `.atl/` and unrelated placeholders untouched.
- Commit identity and commit: pending; the previous attempt failed with `fatal: empty ident name` and no Git configuration was changed. The earlier CWNA-2-C5 changes remain staged; CV-1/CV-2 work remains uncommitted. The writer did not stage or commit.
- Runtime limitation: existing users need an administrator-provisioned `password_hash` before phone/password sign-in can succeed. No account passwords or test values may be placed in the repository.
- Commit note: parent owns any local commit; repository Git author identity must be supplied/configured before commit. No remote delivery is authorized.

## Final CV-1 Security Correction — 2026-10-04

- Strict TDD RED: after adding the focused SQL contract tests first, `npm test -- --runInBand --runTestsByPath __tests__/rpcSecurityContract.test.ts` failed as expected: 1 suite, 4 failed / 5 passed (9 total). Failures identified missing `extensions`/pgcrypto setup, missing normalized-phone expression index, the five-failure lock, and a return before password verification when locked.
- Focused GREEN: after the migration correction and whitespace-insensitive expression-index assertion, the same focused command passed: 1 suite / 9 tests. The test statically asserts a valid credential reaches bcrypt verification without a return based on the stored failure count; cooldown and return are confined to the failed-credential branch.
- Migration evidence: `CREATE SCHEMA IF NOT EXISTS extensions` and `CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions` now precede crypto-function references. An expression index matches the normalized `telefono` lookup. Failures receive a bounded per-phone progressive delay (0.25, 0.5, 1, 2, 4, then at most 8 seconds); the counter caps at five and resets after 15 minutes. A valid password is not rejected because the counter is high; successful login clears its attempt row. Unknown/ambiguous paths retain dummy bcrypt cost-12 work and the generic failure response; old attempt rows are still cleaned after one day.
- Retained boundaries: static SQL assertions still verify restrictive deny RLS policies for `anon`/`authenticated` on `usuarios`, `carwash_sessions`, `carwash_login_attempts`, and `vehiculos`, with no unrelated policy drops. Spanish vehicle fields remain `usuario_id`, `marca`, `modelo`, `anio`, and `placas`. The existing route test still proves duplicate delete callbacks make one request and show disabled pending feedback; UI code was not changed.
- Final verification: `npm test -- --runInBand` — 13 suites / 62 tests passed (non-fatal `[DEP0040]` `punycode` deprecation warning); `npx tsc --noEmit` — passed with no output; `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed, bundling 1,176 iOS and 1,336 Android modules and exporting `dist`. `EXPO_NO_DOTENV=1` prevented dotenv loading; no `.env` content or credentials were inspected.
- Verification limits and remaining risks: SQL was not executed because a local PostgreSQL runtime is unavailable, and no hosted Supabase access occurred; migration coverage is static contract evidence only. Throttling is per phone only: no IP-based or global rate limit is implemented, so distributed or multi-phone abuse is not addressed. A backend administrator must still provision existing users' bcrypt `password_hash` values out of app.
