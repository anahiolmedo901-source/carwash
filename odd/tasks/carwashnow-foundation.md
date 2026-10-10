# CarWashNow Mobile Foundation

## Objective

Create a runnable Expo + React Native + TypeScript foundation for CarWashNow with Expo Router tabs, a polished mock-data home screen, and a Supabase client configured for AsyncStorage session persistence.

## Problem and Why

The `carwash/` project directory is empty. Establish the requested application shell and integration boundary now, while intentionally leaving authentication flows, bookings, payments, GPS, camera/QR, push notifications, sensors, realtime, and administration for later work.

## Scope and Constraints

- Authorized project root: this Git repository (`.`).
- Use Expo, React Native, TypeScript, Expo Router, Supabase JS, and AsyncStorage; support Android and iOS.
- Keep client configuration limited to the user-provided Supabase URL and publishable key. Never add a service-role or private key.
- Create the requested `EXPO_PUBLIC_` values in `.env`; keep `.env` out of Git and provide an `.env.example` for setup.
- Create the requested architecture folders: `app/`, `components/`, `constants/`, `hooks/`, `lib/`, `services/`, `types/`, and `utils/`.
- Build only the navigation shell and visual placeholders; do not implement the deferred product capabilities listed above.
- Effective TDD mode: strict, explicitly selected by the user. Test runner: Jest with `jest-expo`; exact runner command: `npm test -- --runInBand`.
- Receipt-driven development status: off (default); do not start native review.
- Delivery strategy: `ask-on-risk`; forecast approximately 380 authored changed lines, excluding generated dependency lockfiles. Revisit if actual work exceeds the forecast.

## Tasks

### CWN-1 — Establish Expo Router shell and visual navigation

- [ ] Add the Expo/TypeScript/Jest project configuration and requested folder structure.
- [ ] Add the five-tab navigation and lightweight placeholder screens.
- [ ] Add centralized design constants and the Home screen mock-data sections, reusable cards, and empty states.
- [ ] Follow strict TDD for the Home screen: observe a failing test before implementation, then make it pass.
- [ ] Run the authorized typecheck, Jest, and Expo startup checks.
- Route: delegated direct — the work spans multiple non-trivial files and includes reading/setup before implementation.
- Commit evidence: pending.

### CWN-2 — Configure the Supabase client boundary

- [ ] Add Expo-public environment variables and an example file using only the supplied URL and publishable key.
- [ ] Add typed environment validation and `lib/supabase.ts` with AsyncStorage-backed auth persistence and the React Native URL polyfill.
- [ ] Follow strict TDD for the environment validation helper: observe a failing test before implementation, then make it pass.
- [ ] Confirm no private key is present and rerun the authorized verification commands.
- Route: delegated direct — client, environment, and tests are a multi-file unit.
- Commit evidence: pending.

## Acceptance Criteria

- Expo Router starts with tabs named Inicio, Autolavados, Reservaciones, Vehículos, and Perfil.
- Home displays “CarWashNow”, “Tu auto limpio, sin esperar.”, Próxima reservación, Autolavados cercanos, and Servicios populares using mock content and an honest empty state.
- Supabase initialization uses only the supplied public configuration and AsyncStorage; no service-role key exists in client code.
- TypeScript, tests, imports, and an Expo startup/bundle check pass, or any unavailable/failed check is recorded accurately.
- No deferred product functionality is implemented.

## Verification

- `npm test -- --runInBand`
- `npx tsc --noEmit`
- `npx expo export --platform android --platform ios`
- Start Expo locally and confirm Metro reaches its ready state; stop the server after confirmation.

## Progress and Evidence

- Repository-relative locator: `odd/tasks/carwashnow-foundation.md`.
- Initial exploration: target directory was empty; no existing package, app code, or TDD configuration was present.
- A local Git repository was initialized on `main`, then work moved to `feat/carwashnow-foundation` before implementation.
- Engram: the initial tracker was saved under project `carwash` after the user resolved the workspace ambiguity; the current revision is pending because subsequent scoped memory updates still resolve the multi-repository workspace ambiguously.
- Completed tasks: none.
- Next step: implement CWN-1 using strict TDD.
