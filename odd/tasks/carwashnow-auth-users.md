# CarWashNow Authentication and Users

## Original Objective (Completed; Now Superseded)

Implement Supabase Auth sign-in, registration, sign-out, persisted global session state, protected role-based routing, and the `public.usuarios` profile lifecycle for CarWashNow.

## Current User-Authorized Mode (2026-10-04; Supersedes Interim Demo Mode)

- Sign-in uses `public.usuarios.telefono` plus password through the custom PostgreSQL RPCs described in `odd/tasks/carwashnow-vehicles.md`; Supabase Auth remains unused.
- `public.usuarios.password_hash` stores bcrypt hashes only. Existing accounts require administrator provisioning out-of-app; no signup, password-reset, or credential-provisioning UI is available.
- The database returns a high-entropy opaque session token; the app stores only that token locally, while the database stores only its SHA-256 digest with a bounded expiry and revocation state.
- The authenticated owner is derived from the valid session and the corresponding `public.usuarios.id`. The former `local-demo-customer` profile is not an identity and must never authorize protected data.
- The earlier Supabase Auth and CWNA-2-C5 demo work remain historical implementation evidence; this custom phone/password contract is active now.

## Problem and Why

The current local `carwash/` tree contains no Expo project or Supabase client, despite the prior setup plan. The user authorized rebuilding only the minimum app/client foundation required for this authentication scope and installing packages from the npm registry without credentials.

## Scope and Constraints

- Authorized project root: this Git repository (`.`); all changes stay inside it.
- Implement only authentication and user-profile behavior. Main tabs and employee/administrator destinations may be minimal placeholders required to route by role; do not build their panels or any booking, payment, sensor, or notification functionality.
- Current runtime override: do not call Supabase Auth or access user/vehicle tables directly from the app; use the phone/password and session RPCs defined under Current User-Authorized Mode. The previous Supabase identity/profile requirements below are historical evidence only.
- Never read, write, log, or authenticate with `password_prueba`; never include a service-role or private key in the client.
- Keep the Expo Router and AsyncStorage foundation. The local demo flow must not require Supabase credentials or network access; retain any Supabase foundation files only for possible future reactivation.
- Do not access or mutate the hosted Supabase project directly during implementation. Verify client workflows with tests/mocks and report that limitation honestly.
- Effective TDD mode: strict, explicitly selected previously by the user. Test runner: Jest with `jest-expo`; exact command: `npm test -- --runInBand`.
- Receipt-driven development status was re-read before post-writer verification: off; no mode setting was changed.
- Delivery strategy: `stacked-to-main` (user-selected); initial forecast was approximately 650 authored changed lines, excluding generated lockfiles. Keep each local work-unit slice at or below 400 authored additions plus deletions; do not code-golf or split tests/docs artificially.

## Tasks

### CWNA-1 — Establish session, auth service, and role boundaries

- [x] Scaffold the minimum Expo Router TypeScript app and public Supabase client with AsyncStorage persistence.
- [x] Add typed user/role models and a global provider that restores the session, listens for auth changes, and retrieves `usuarios` by `auth_id`.
- [x] Add protected route groups for anonymous, cliente, empleado, and administrador states; employee/admin destinations remain informational placeholders only.
- [x] Add tests first and observe RED, then implement to GREEN and refactor.
- [x] Run focused tests and typecheck.
- Route: delegated direct — implementation spans many source/config/test files and requires setup research.
- Commit evidence: local stack slices 1-7 establish the project, service, provider, forms, and protected routing; see the commit map under Progress and Evidence.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/authService.test.ts __tests__/routeForState.test.ts __tests__/AuthProvider.test.tsx` initially failed in all three suites because the implementation modules had not yet been created (0 tests executed).
- GREEN: the same focused command passed all 3 suites / 11 tests after implementation; `npx tsc --noEmit` passed.
- Runtime harness: N/A for this work-unit boundary; the auth route group has no form screens until CWNA-2. The project-wide Metro check is recorded under CWNA-2.
- Rollback boundary: remove the CWNA-1 auth context/service/types/routing and role-route behavior (`context/AuthContext.tsx`, `services/authService.ts`, `types/auth.ts`, `types/database.ts`, `utils/authRouting.ts`, `app/_layout.tsx`, `app/index.tsx`, role route groups, and their tests). Keep shared Expo/Supabase/Jest foundation files and reusable UI components, which CWNA-2 depends on.

### CWNA-2 — Implement sign-in, registration, profile creation, and sign-out UI

- [x] Add login and registration forms with validation for name, surname, email, telephone, password, and confirmation.
- [x] Register with Supabase Auth, persist profile fields and the Auth UUID in `usuarios.auth_id`, and always force `rol: 'cliente'`.
- [x] Handle email-confirmation/no-session outcomes without using privileged credentials; repair a missing profile only after an authenticated session can safely write it.
- [x] Add sign-out navigation on the customer profile and employee/administrator destinations; keep all future features out of scope. Revised by CWNA-2-C1 for sign-out failure feedback and CWNA-2-C3 for the complete customer tab shell with placeholders only.
- [x] Test success and failure paths, including ensuring `password_prueba` is never sent.
- [x] Run Jest, TypeScript, Android/iOS Expo export, and a local Metro startup check.
- Route: delegated direct — forms, services, provider integration, and behavior tests are a multi-file unit.
- Commit evidence: local stack slices 2-9 cover the auth service, UI flows, sign-out corrections, and customer navigation; see the commit map under Progress and Evidence.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/registrationValidation.test.ts __tests__/authService.test.ts __tests__/LoginForm.test.tsx __tests__/RegistrationForm.test.tsx` failed all 4 suites before implementation; the existing auth-service suite executed and failed both new sign-up cases because `signUp` was not implemented, while the other suites could not resolve their not-yet-created modules.
- GREEN: the same focused command passed 4 suites / 14 tests after implementation. Final mocked-flow suite passed 6 suites / 28 tests.
- REFACTOR: simplified the shared error-message export/import after the flows passed; the final full Jest and typecheck runs remained green.
- Verification: `npm test -- --runInBand` — 6 suites / 28 tests passed (Node printed a non-fatal `DEP0040` punycode deprecation warning); `npx tsc --noEmit` — passed; `npx expo export --platform android --platform ios` — passed for Android and iOS and exported `dist`.
- Runtime harness: `CI=1 EXPO_OFFLINE=1 timeout --signal=INT --kill-after=5s 30s ./node_modules/.bin/expo start --localhost --port 8095` reached `Waiting on http://localhost:8095`; the timeout stopped the local server and later process/port checks confirmed it was no longer running. The first shell poller errored because zsh reserves `status`; a separate CLI attempt passed both `--offline` and `--localhost`, which Expo rejected. The corrected command uses only `EXPO_OFFLINE=1`.
- Rollback boundary: remove the login/registration screens and form components (`app/(auth)/login.tsx`, `app/(auth)/register.tsx`, `components/LoginForm.tsx`, `components/RegistrationForm.tsx`), `utils/authValidation.ts`, CWNA-2 sign-up/context/type additions, customer sign-out affordance, and their tests. Keep the CWNA-1 session/profile service, route guards, Expo/Supabase/Jest foundation, and shared UI components.

### CWNA-2-C1 — Handle sign-out failures on every route

- [x] Revise CWNA-2 sign-out behavior for the customer profile, profile-issue screen, employee placeholder, and administrator placeholder.
- [x] Catch a rejected sign-out in shared UI handling and display neutral Spanish feedback. CWNA-2-C4 moves this feedback to a persistent auth-level notice so SDK `SIGNED_OUT` route transitions do not lose it.
- [x] Add regression coverage exercising the four screens through `AuthProvider` with a rejected service sign-out.
- Route: bounded correction to CWNA-2 following independent candidate verification; `services/authService.ts`, `context/AuthContext.tsx`, and role routing remain unchanged.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/SignOutScreens.test.tsx` — 1 suite / 4 tests failed; each flow surfaced an unhandled `Sign-out failed` rejection and lacked the expected visible feedback.
- GREEN: the same focused command passed 1 suite / 4 tests after the fix. These component tests use an `AuthService` mock that rejects without emitting an auth-state event; they assert visible feedback and no direct login navigation, not SDK session retention on server errors (see CWNA-2-C2).
- REFACTOR: consolidated the four duplicated route handlers in `hooks/useSignOutFeedback.ts` and the shared accessible message in `components/SignOutErrorMessage.tsx`; the focused suite remained green.
- Verification: `npm test -- --runInBand` — 7 suites / 32 tests passed (Node emitted the existing non-fatal `DEP0040` punycode deprecation warning); `npx tsc --noEmit` — passed with no output.
- Runtime harness: N/A — this UI failure path is verified with React Native component tests and a mocked `AuthService`; no device run or live Supabase access was authorized.
- Rollback boundary: revert this correction's four route updates, `components/RolePlaceholder.tsx`, `components/SignOutErrorMessage.tsx`, `hooks/useSignOutFeedback.ts`, `__tests__/SignOutScreens.test.tsx`, and this correction entry. Keep the existing auth service behavior and all other CWNA-1/CWNA-2 behavior.
- Commit evidence: integrated across local slices 4, 7, and 8 (provider notice, route handlers/screens, and regression tests); see the commit map under Progress and Evidence.

### CWNA-2-C2 — Limit sign-out to the current device

- [x] Call Supabase Auth with the exact `{ scope: 'local' }` option for the app's sign-out action.
- Decision: “Cerrar sesión” logs out only the current session to avoid the default global scope's remote revocation of the user's other sessions.
- Pinned SDK evidence: `package-lock.json` resolves `@supabase/supabase-js` and `@supabase/auth-js` to 2.117.2. The installed Auth SDK defines `local` as the current session and defaults `signOut()` to `global`. Its `_signOut` implementation can still remove the current local session and emit `SIGNED_OUT` for some non-ignored server errors when scope is `local`; this correction does not fake or restore session state.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/authService.test.ts -t "signs out only the current Supabase Auth session"` — 1 suite / 1 test failed (8 skipped); expected `{ scope: 'local' }`, but the service called `signOut` with no arguments.
- GREEN: the same focused command passed 1 suite / 1 test (8 skipped) after the service change. The error-path test also asserts that the local scope is used while the service continues to reject with the original sign-out error.
- REFACTOR: revised the CWNA-2-C1 screen test so it checks visible feedback and absence of direct UI navigation without asserting that every SDK-reported error preserves the current route/session.
- Verification: `npm test -- --runInBand --runTestsByPath __tests__/authService.test.ts __tests__/SignOutScreens.test.tsx` — 2 suites / 13 tests passed; `npm test -- --runInBand` — 7 suites / 33 tests passed (Node emitted the existing non-fatal `DEP0040` punycode deprecation warning); `npx tsc --noEmit` — passed with no output.
- Runtime harness: N/A — scope forwarding is covered by a mocked service test; hosted Supabase behavior was not exercised.
- Rollback boundary: revert the local-scope argument in `services/authService.ts`, the scope assertions/test in `__tests__/authService.test.ts`, the outdated route/state-retention assertions revised in `__tests__/SignOutScreens.test.tsx`, and this CWNA-2-C2 entry. Keep CWNA-2-C1's UI error handling.
- Commit evidence: local slice 2 contains the local-scope service call and exact scope/error-path tests; see the commit map under Progress and Evidence.

### CWNA-2-C3 — Complete the customer tab navigation shell

- [x] Expose the five customer tabs in order: Inicio, Autolavados, Reservaciones, Vehículos, Perfil.
- [x] Add minimal informational placeholder routes for Autolavados, Reservaciones, and Vehículos using the existing screen and theme styles; do not implement search, bookings, vehicle management, payments, or other product behavior.
- User-scope rationale: after authentication, `getRouteForAuthState` directs a cliente to `/(customer)/(tabs)`, and the existing foundation task already specifies these five tab labels. This correction completes that requested customer destination without expanding into the underlying product features.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/CustomerTabsLayout.test.tsx` — 1 suite / 1 test failed because the layout exposed only `index:Inicio` and `profile:Perfil`, not the three intermediate destinations.
- GREEN: the same focused command passed 1 suite / 1 test after adding the route entries and placeholder screens.
- REFACTOR: shared the repeated card, title, and informational copy layout in `components/InformationalPlaceholder.tsx`, reusing `Screen`, theme colors, and spacing.
- Verification: focused Jest — 1 suite / 1 test passed; `npm test -- --runInBand` — 8 suites / 34 tests passed (Node emitted the existing non-fatal `DEP0040` punycode deprecation warning); `npx tsc --noEmit` — passed with no output; `EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed for Android and iOS and exported `dist`.
- Runtime harness: Android/iOS Expo export validated route bundling offline; no hosted Supabase access occurred.
- Rollback boundary: remove the three placeholder routes, `components/InformationalPlaceholder.tsx`, the three added tab entries in `app/(customer)/(tabs)/_layout.tsx`, `__tests__/CustomerTabsLayout.test.tsx`, and this CWNA-2-C3 entry. Keep existing login routing, Inicio/Perfil, authentication, and all other CWNA-2 behavior.
- Commit evidence: `348d69e4fde9100464f53e15216476059a4742d7` — local slice 9, 334 authored lines including this tracker; generated outputs are excluded.

### CWNA-2-C4 — Keep sign-out failure feedback across route changes

- [x] Store sign-out failure notice state in `AuthContext` and render it in the provider-level `AuthNotice`, which remains mounted while protected routes change.
- [x] Keep the screen sign-out handler catching the rejection; show `No se pudo confirmar el cierre de sesión. Es posible que la sesión local ya haya finalizado.` at the root without restoring session state or changing Supabase's local sign-out semantics.
- Rationale: with the pinned Supabase Auth SDK, a local-scope sign-out API error can still clear the local session and emit `SIGNED_OUT`. That event changes protected routing and unmounts route-local error UI; the persistent notice must survive that transition.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/AuthSignOutNotice.test.tsx` — 1 suite / 1 test failed. The integration test emitted `SIGNED_OUT`, the protected customer screen unmounted, and the expected sign-out notice was absent.
- GREEN: the same command passed 1 suite / 1 test after the provider-level notice was added. It uses the real `AuthProvider` and customer profile route, an `AuthService` mock that emits the signed-out event and then rejects, and asserts the protected screen is unmounted while the global notice remains visible.
- REFACTOR: replaced duplicate route-local sign-out messages with the single dismissible `AuthNotice`; `useSignOutFeedback` still catches the rejection and navigates only on success.
- Verification: `npm test -- --runInBand --runTestsByPath __tests__/AuthSignOutNotice.test.tsx __tests__/SignOutScreens.test.tsx` — 2 suites / 5 tests passed; `npm test -- --runInBand` — 9 suites / 35 tests passed (Node emitted the existing non-fatal `DEP0040` punycode deprecation warning); `npx tsc --noEmit` — passed with no output; `EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed for both platforms and exported `dist` (Android bundle 3.12 MB, iOS bundle 3.13 MB).
- Runtime harness: the integration test exercises the provider event and protected-screen unmount; offline Android/iOS export validates bundling. No hosted Supabase access occurred.
- Rollback boundary: revert `context/AuthContext.tsx`, `components/AuthNotice.tsx`, `hooks/useSignOutFeedback.ts`, the four affected sign-out screens, `components/RolePlaceholder.tsx`, the removal of `components/SignOutErrorMessage.tsx`, `__tests__/AuthSignOutNotice.test.tsx`, the related assertions in `__tests__/SignOutScreens.test.tsx`, and this CWNA-2-C4 entry. Keep the local-only scope in `services/authService.ts` and do not add session restoration.
- Commit evidence: integrated across local slices 1, 4, 7, and 8 (notice component/provider state, catching route handler, and event-transition tests); see the commit map under Progress and Evidence.

### CWNA-2-C5 — Interim local demo access (historical; superseded by CV-1)

This was the interim user-selected navigation/testing mode at the time of implementation. The later user decision authorizing custom phone/password sessions supersedes it as the active runtime contract. The RED/GREEN/REFACTOR, verification, rollback, and commit-identity evidence below is retained unchanged as historical evidence.

- [x] Replace active Supabase Auth/session/profile operations with a local demo customer profile and locally persisted auth state.
- [x] Keep basic login-form validation, but never verify, send, log, or store the entered password.
- [x] Disable backend-backed registration while local demo mode is active; local sign-out clears the demo session.
- [x] Add tests proving local sign-in, restoration, sign-out, and the absence of Supabase Auth/profile calls.
- [x] Follow strict TDD (RED, GREEN, REFACTOR) and run `npm test -- --runInBand`, `npx tsc --noEmit`, and Android/iOS export.
- Route: delegated direct — the change crosses auth state, service, forms/routes, and tests; one bounded writer owns the implementation.
- Historical scope decision: the user selected local/demo bypass for UI and navigation testing; it was never real credential verification and did not authorize protected backend access. That interim choice is superseded by the current custom-auth decision above.
- RED: `npm test -- --runInBand --runTestsByPath __tests__/authService.test.ts __tests__/AuthProvider.test.tsx __tests__/LoginForm.test.tsx __tests__/RegistrationUnavailableRoute.test.tsx __tests__/routeForState.test.ts __tests__/SignOutScreens.test.tsx __tests__/AuthSignOutNotice.test.tsx` — 6 suites failed / 1 passed; 9 tests failed / 4 passed / 13 total. The provider still required Supabase auth subscriptions, the auth service imported the Supabase client, the login forwarded both credentials, and the registration route still rendered the old form.
- GREEN: the same focused command passed 7 suites / 17 tests after implementation.
- REFACTOR: local profile restoration now accepts only the exact fixed demo profile and clears malformed or non-customer data; login clears both fields and invokes sign-in with no arguments. The route-selection fixture uses the canonical `LOCAL_DEMO_PROFILE` type.
- Verification: `npm test -- --runInBand` — 10 suites / 25 tests passed; `npx tsc --noEmit` — passed with no output; `EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed for iOS (2.4 MB bundle) and Android (2.7 MB bundle), exported `dist`. Expo CLI reported `env: load .env` and listed the configured variable names; the file contents were not inspected.
- Runtime harness: no interactive device run or hosted backend harness was used. The offline Android/iOS export succeeded; `ps -C node -o pid=,args=` returned no processes after verification, so no Metro/Node server remained running.
- Rollback boundary: revert this correction's changes to `services/authService.ts`, `context/AuthContext.tsx`, `types/auth.ts`, `utils/authRouting.ts`, `app/_layout.tsx`, `app/index.tsx`, `app/(auth)/register.tsx`, `app/(customer)/(tabs)/profile.tsx`, and `__tests__/authService.test.ts`, `__tests__/AuthProvider.test.tsx`, `__tests__/LoginForm.test.tsx`, `__tests__/RegistrationUnavailableRoute.test.tsx`, `__tests__/routeForState.test.ts`, `__tests__/SignOutScreens.test.tsx`, `__tests__/AuthSignOutNotice.test.tsx`; restore the deleted `app/profile-issue.tsx` and revert only this CWNA-2-C5 tracker section/progress line. Keep the Supabase foundation, package configuration, customer tabs, and unrelated work.
- Commit identity: user input required. `git commit -m "feat(auth): switch to local demo sign-in"` was refused with `fatal: empty ident name`; no Git configuration was changed and no commit was created.

## Acceptance Criteria

- The current login form validates and submits a phone/password pair to the custom database RPC; it makes no Supabase Auth calls.
- The app persists only the opaque custom-session token locally, restores the real customer profile through a server-validated session RPC, and revokes the session on sign-out.
- Vehicle ownership comes from the valid custom session and `public.usuarios.id`; the client never sends an authoritative owner id or accesses credential/session/vehicle tables directly.
- Credential errors for absent, ambiguous, and invalid phone/password cases are generic. Password hashes are never returned; registration, password reset, and in-app credential provisioning remain unavailable.
- `password_prueba` is never used or sent; private/service-role credentials never appear in client code.
- Existing dismissible sign-out feedback and protected-route behavior remain correct for custom-session revocation failures.
- After customer authentication, the main tab group exposes Inicio, Autolavados, Reservaciones, Vehículos, and Perfil in that order; the three added destinations remain informational placeholders only.
- Anonymous users cannot enter authenticated routes; successful custom login routes only to the cliente destination. Employee/admin destinations remain placeholders and are not selectable through this customer login.
- Tests, imports, TypeScript, and Expo startup/export checks pass, or failures and environment limits are recorded accurately.
- No non-auth product functionality is implemented.

## Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npx expo export --platform android --platform ios`
- Start Metro locally, observe its ready state, then stop it.
- Supabase backend behavior is mocked in automated tests; no live project mutation or test account is authorized.

## Progress and Evidence

- Current authorized correction: CV-1/CV-2 supersede CWNA-2-C5's interim demo runtime with custom phone/password sessions and owner-scoped vehicle RPCs; implementation and local verification are recorded in `odd/tasks/carwashnow-vehicles.md`. CWNA-2-C5's original staged files remain the intentional starting index state; this task did not stage or commit. Git author identity remains unavailable, and the pre-existing `.atl/` directory was not touched.
- The pre-existing untracked `.atl/` directory is unrelated to this change and must remain untouched.

- Repository-relative locator: `odd/tasks/carwashnow-auth-users.md`.
- Initial inspection found only `.git/` and `odd/`; there is no local `package.json`, `app/`, or `lib/supabase.ts`.
- The user explicitly authorized creating the minimum Expo/Supabase foundation inside this repository and installing dependencies from `https://registry.npmjs.org` with unauthenticated npm and no credentials.
- Engram mirror: synchronized under project `carwash` after the user's explicit project authorization.
- Selected delivery strategy: `stacked-to-main`. The local commits are planned as one dependency-ordered stack; no PR, push, remote access, merge, or deployment is authorized.
- Planned local slice boundaries:
  1. Expo/Supabase project foundation — package/configuration, environment/client foundation, shared primitives, and `odd/tasks/carwashnow-foundation.md`.
  2. Auth service/profile lifecycle — `services/authService.ts` and `__tests__/authService.test.ts`.
  3. Registration validation domain — `utils/authValidation.ts` and `__tests__/registrationValidation.test.ts`.
  4. Persistent auth provider — `context/AuthContext.tsx` and `__tests__/AuthProvider.test.tsx`.
  5. Login flow — login form/route, shared input/button components, auth layout, and login tests.
  6. Registration flow — registration form/route and registration form tests.
  7. Protected role routing — root/auth-state routing, employee/administrator placeholders, profile-issue route, route test, and sign-out handler hook.
  8. Persistent sign-out feedback — customer profile sign-out route and the route-transition/screen tests.
  9. Customer navigation completion — ordered tabs, informational placeholder pages, tab contract test, and this task tracker.
- Local commit map (authored additions plus deletions; generated `package-lock.json` is excluded from the budget):
  1. `424124384f2981035cb91d82197b345dca05963e` — `chore(auth): add Expo and Supabase foundation`; 381 lines. Includes project configuration, public client/types, shared screen/notice primitives, and the foundation task.
  2. `16626a4db9f6c1cff3f15e170eebd2c9701dddb3` — `feat(auth): add auth service and profile lifecycle`; 387 lines. Includes `services/authService.ts` and its service tests.
  3. `569a6ce06e5eb0fd671adf07f8525a0c40fdcac8` — `feat(auth): add registration validation rules`; 132 lines. Includes validation logic and its tests.
  4. `2efa467f583192c9ea8d71b17e29a5e09fb305c4` — `feat(auth): add persisted session provider`; 368 lines. Includes `context/AuthContext.tsx` and provider tests.
  5. `a579c8701e56899c1849adf4c8e3d227b8d629cb` — `feat(auth): add validated login flow`; 342 lines. Includes login route/form, shared fields/buttons, and login tests.
  6. `415b3562f8b5b7727b9ca2ab6aadc724ae740207` — `feat(auth): add registration flow`; 282 lines. Includes registration route/form and registration tests.
  7. `744adeaf747a212ef8ff60e036c3d3a3f93ccb40` — `feat(auth): add protected role routing`; 291 lines. Includes root/role routing, role placeholders, route selection tests, and the sign-out handler hook.
  8. `ebe92eab2b4c67b6eca022c5931eb17f17db04b1` — `fix(auth): keep sign-out errors visible across routes`; 268 lines. Includes customer profile sign-out and screen/integration tests.
  9. `348d69e4fde9100464f53e15216476059a4742d7` — `feat(auth): complete customer tab navigation`; 334 lines. Includes the ordered tab layout, Inicio and three informational routes, shared placeholder, tab contract test, and this task tracker.
- These form one local `stacked-to-main` dependency order; no PRs have been created. The local tracker and its Engram mirror are synchronized under project `carwash`.
- Completed tasks: CWNA-1, CWNA-2, and bounded corrections CWNA-2-C1, CWNA-2-C2, CWNA-2-C3, and CWNA-2-C4.
- Original CWNA-1/CWNA-2 authored changed-line count before CWNA-2-C1: 2,020 (1,969 new authored source/config/test/example lines, 49 task-tracker changed lines counting additions plus deletions, and 2 ignored local `.env` lines). Generated `package-lock.json`, `dist/`, `node_modules/`, and Expo cache outputs are excluded. CWNA-2-C1, CWNA-2-C2, CWNA-2-C3, and CWNA-2-C4 add separate bounded corrections; aggregate work remains above the 400-line review heuristic.
- Work-unit candidates: CWNA-1 (persisted session, profile lifecycle, protected role routing, and placeholders), CWNA-2 (validated login/registration, confirmation handling, profile creation, and sign-out UI), correction CWNA-2-C1 (visible sign-out failure handling), correction CWNA-2-C2 (current-device-only sign-out), correction CWNA-2-C3 (complete customer tab shell), and correction CWNA-2-C4 (persistent sign-out failure notice). All nine slices are committed locally in dependency order.
- Expo SDK 54 Metro startup normalized `tsconfig.json`'s `include` globs; the post-start typecheck passed with the generated Expo-compatible setting.
- Backend assumptions remain unverified: no live Supabase API/schema access occurred; table defaults, RLS select/insert policies, role constraints, and email-confirmation settings are unknown. The app expects authenticated self-profile reads/inserts to be permitted and relies on Auth metadata for missing profile completion. `activo` is set explicitly to `true`; behavior of defaults for `id`, `foto_url`, and timestamps was not tested.
- No real sign-in, registration, hosted RLS behavior, or test-account creation was exercised. Automated auth flows use mocks only.
- Final parent spot check: `npm test -- --runInBand` — 9 suites / 35 tests passed (non-fatal Node `DEP0040` punycode warning).
- Final independent verification: complete read-only review returned `pass` with no actionable product/security findings. It confirmed the persistent sign-out notice survives the SDK `SIGNED_OUT` transition and the five customer tabs are placeholders in the required order.
- Before the work-unit commits, native risk assessment was attempted and refused because all candidate files were untracked and an explicit inventory was required. No review status or native review was started because RDD is off.
- Aggregate authored changes exceed 400 lines, so the user-selected `stacked-to-main` strategy is represented by nine dependency-ordered local slices, each within the 400-line authored budget; generated `package-lock.json`, `dist/`, `node_modules/`, and ignored `.env` are excluded from that budget.
- PR budget caveat: foundation commit `4241243` also contains 13,497 generated `package-lock.json` additions. Its raw PR diff would exceed 400 changed lines; because no `size:exception` was approved, do not create that PR unless a maintainer first approves the exception. No PR has been created.
- Next step: the parent may create/review the planned stacked PRs after a separate authorization. No PR, push, remote operation, merge, or deployment was performed in this delegation.
