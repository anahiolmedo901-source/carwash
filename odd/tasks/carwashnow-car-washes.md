# CarWashNow — Exploración de autolavados y servicios

## Objective

Implement the customer autolavado exploration module using Supabase read queries against `vista_autolavados`, `autolavados`, `servicios`, and `espacios_lavado`. Provide list/detail screens and a reservation-ready navigation target without implementing reservation logic.

## Authorized Scope

- Implement only autolavado/service exploration, its detail route, and the prepared reservation destination.
- Show image, name, address, hours, rating, review count, description, and services with name, description, price, and approximate duration.
- Include loading, error, and empty states.
- Use the existing Supabase client and real public reads; do not add mock production data, GPS, filters, booking mutations, payments, or notifications.
- Do not inspect `.env` values, access hosted Supabase, deploy SQL, stage, commit, push, or modify the pre-existing `.atl/` directory.
- Preserve the existing custom-session/auth and vehicle worktree/index state.
- Handle the absent local schema honestly: define a typed read boundary and document any required column contract instead of claiming remote schema validation.

## Constraints and Decisions

- Existing customer navigation already exposes `autolavados`; replace only its placeholder behavior.
- Existing customer stack hides headers; new routes must provide their own back/navigation affordance where needed.
- The service boundary must be injectable for Jest tests, like `vehicleService.ts`.
- Prefer the consolidated `vista_autolavados` for list cards, then load detail data from `autolavados`, `servicios`, and `espacios_lavado` through read-only queries.
- Since no local schema exists, keep backend field mapping isolated and fail with a useful error when required fields are absent; do not silently display fabricated values.
- Route: delegated direct — multiple non-trivial source/test files require one writer. No SDD artifacts.
- TDD: strict mode active; test runner `npm test -- --runInBand`.
- Delivery: existing `stacked-to-main`; no PR or remote delivery.

## Tasks

### CW-1 — Define the Supabase exploration read contract

- [x] Add typed autolavado, service, space, and view-row models plus isolated normalization/mapping for the known display fields.
- [x] Add an injectable service that reads the list view and detail tables without mutations or GPS assumptions.
- [x] Add service tests for successful reads, empty results, query errors, malformed required fields, and service association.

### CW-2 — Implement exploration and reservation-ready navigation

- [x] Replace the `Autolavados` placeholder with list cards showing image, name, address, hours, rating, and review count.
- [x] Add an autolavado detail route showing description, address, hours, rating, and service cards with price/duration.
- [x] Add a `Reservar` action that navigates to a prepared reservation screen carrying the selected autolavado/service context, with no booking logic.
- [x] Add loading, error, empty, retry/back, and navigation tests.

## Acceptance Criteria

- [x] Production code reads Supabase view/table responses for the list and detail screens; no hardcoded autolavado/service records are used by production code.
- [x] Missing data produces an explicit error/empty state rather than misleading placeholder content.
- [x] The reservation button navigates successfully and performs no create/update/delete operation.
- [x] GPS is not imported, requested, or used.
- [x] Existing auth, vehicles, customer tab order, and unrelated staged changes remain intact.

## Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios`
- `git diff --check`
- SQL/hosted Supabase runtime validation is unavailable and must remain explicitly unclaimed.

## Progress and Evidence

- Repository-relative locator: `odd/tasks/carwashnow-car-washes.md`.
- Baseline: `app/(customer)/(tabs)/autolavados.tsx` renders `InformationalPlaceholder`; no local definitions mention the requested tables/view.
- Existing reusable seams: `lib/supabase.ts`, `services/vehicleService.ts`, `components/Screen.tsx`, `components/PrimaryButton.tsx`, `constants/theme.ts`, and injected service route tests.
- Implementation: `types/autolavado.ts` defines raw-row/read-only client contracts and normalized display models. `services/autolavadoService.ts` performs `select('*')` reads against the exact requested objects, normalizes supported aliases, and throws explicit schema-contract errors rather than fabricating display data.
- Implementation: `app/(customer)/(tabs)/autolavados.tsx` now renders view-backed cards; `app/(customer)/autolavado/[id].tsx` reads all three detail objects and renders services; `app/(customer)/reservar.tsx` is an informational, no-write destination carrying the selected context.
- TDD RED: `npm test -- --runInBand __tests__/autolavadoService.test.ts __tests__/AutolavadosRoute.test.tsx __tests__/AutolavadoDetailRoute.test.tsx __tests__/PreparedReservationRoute.test.tsx` — failed before implementation with 4 suites failed, 0 tests executed, due to the new service/route modules not existing.
- TDD GREEN: the same focused command after implementation — 4 suites passed, 19 tests passed.
- Required verification evidence: `npm test -- --runInBand` — 17 suites passed, 81 tests passed; `npx tsc --noEmit` — passed with no output; `EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios` — passed and exported Android/iOS bundles to `dist`; `git diff --check` — passed with no output.
- Association contract: a service is associated directly through `autolavado_id`, `id_autolavado`, `carwash_id`, `wash_id`, or `lavado_id`, or indirectly through a service identity plus matching `espacios_lavado` `autolavado_id` and `servicio_id`/`service_id`. These aliases are isolated in `services/autolavadoService.ts`; an unrecognized remote relation remains an explicit schema-contract error/empty result, not a fabricated association.
- Schema limitation: no local schema, hosted Supabase access, SQL migration, or remote response validation was available or performed. The read boundary intentionally uses `select('*')`; runtime data must satisfy the documented aliases for the UI to render.
- Runtime limitation: offline Expo export verifies bundling/navigation resolution only. It does not prove hosted Supabase table permissions, columns, row-level security, view definitions, image URLs, or production data availability.
- Rollback boundary: remove `types/autolavado.ts`, `services/autolavadoService.ts`, the three new customer route files, the four focused exploration tests, and the scoped replacement of `app/(customer)/(tabs)/autolavados.tsx`; do not revert or alter the pre-existing auth/vehicle changes, staged index, or `.atl/` directory.
- Delivery boundary: this delegated-direct work remains unstaged and uncommitted by instruction; no PR, push, Git configuration change, package installation, credential inspection, hosted access, or `.atl/` modification was performed.
