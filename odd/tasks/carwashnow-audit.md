# CarWashNow — Complete audit and corrections

## Objective

Audit the existing CarWashNow implementation and correct confirmed defects without adding unrelated product functionality or changing the established visual design.

## Scope

- Verify TypeScript, imports, navigation, Supabase/custom sessions, environment configuration, errors, loading/empty states, Realtime, payments, Storage, roles, forms, and duplication.
- Restore the expected existing customer registration flow using the current opaque-session authentication model.
- Correct confirmed Realtime ordering/request-race and catalog-read defects only where evidence supports them.
- Report camera, location, accelerometer, gyroscope, push, Storage, and other absent/deferred capabilities without implementing them.

## Constraints

- No new camera, location, sensor, push, photo, rating, payment, or unrelated product functionality.
- Do not replace custom opaque sessions with Supabase Auth.
- Do not change the established visual design unnecessarily.
- Preserve existing customer, employee, administrator, reservation, payment, and Realtime contracts.
- No credentials, `.env`, `.atl/`, remote mutation, staging deployment, commit, or push without explicit authorization for that operation.
- Lint is not available in the current package; do not install a lint tool as part of this audit.

## Tasks

- [x] AUD-1 — Run the audit baseline and document confirmed findings.
  - Evidence: typecheck, Jest, Expo export, diff check passed; no lint script/tool exists.
- [x] AUD-2 — Restore customer registration through custom opaque-session auth.
  - Acceptance: signed-out users can reach registration, submit validated fields, create an active `cliente` through a secure RPC, and then log in; no client role/password hash authority; duplicate phone and invalid input errors are safe.
- [x] AUD-3 — Correct confirmed Realtime/list/detail and dynamic-route stale-state races.
  - Acceptance: subscriptions cannot overwrite newer fetched state; listeners clean up; latest request wins; existing route behavior remains intact.
- [x] AUD-4 — Correct confirmed catalog/profile audit defects.
  - Acceptance: detail catalog rows are scoped to the selected autolavado; stale local-demo profile copy is removed; catalog view access is explicitly represented without weakening sensitive-table security.
- [x] AUD-5 — Re-run all available checks and produce the final audit report.
  - Acceptance: corrected behavior has focused coverage, full tests/typecheck/export/diff checks are reported, unsupported capabilities and remaining risks are listed, and no further changes are made.

## Intentionally not implemented

- Camera/location/accelerometer/gyroscope permissions or capture.
- Push notifications.
- New vehicle photography, ratings, Storage bucket, or rating schema functionality.
- New payment behavior.

## Applicable checks

```text
npm run typecheck
npm test -- --runInBand
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios
```

## Progress

- Status: audit and confirmed corrections complete.
- Validation: `npm run typecheck`, 63 Jest suites / 288 tests, and Expo export for Android and iOS passed.
- Remaining validation requires remote Supabase/EAS access and is listed in the final audit report.
