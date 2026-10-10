# CarWashNow Expo SDK 57 Upgrade

## Objective

Upgrade the existing Expo SDK 54 project incrementally through SDK 55 and 56 to SDK 57, ensuring the final dependency resolves to Expo `57.0.9` or newer and the project bundles for Expo Go on the user's iPhone.

## Scope and Constraints

- Authorized project root: this Git repository (`.`); branch: `expo-sdk-57`.
- Preserve the existing authentication, profile, and navigation behavior. Do not refactor UI or add product functionality.
- Follow the user's exact per-hop sequence: `npx expo install expo@^N.0.0 --fix`, `npx expo-doctor`, read that SDK's release notes and apply relevant breaking changes, run `npx expo start -c` and verify bundling, then commit that SDK hop.
- Existing pending tunnel setup was committed first as `6eb474a` (`chore(tunnel): configure Expo tunnel startup`).
- `app.json` has no `newArchEnabled: false` setting; it also has no `notification` or `edgeToEdgeEnabled` setting. Do not add a separate New Architecture change.
- No `android/`, `ios/`, or dynamic `app.config.*` exists. This is an Expo/CNG project; do not run `prebuild --clean` or create native directories during dependency upgrades.
- Strict TDD was previously user-selected. No new product behavior is expected; retain and run the current auth test suite/typecheck as compatibility checks.
- Keep all modifications limited to SDK-compatible dependencies and required breaking-change fixes.

## Upgrade Tasks

### SDK57-1 — Upgrade SDK 54 to 55

- [x] Align dependencies with SDK 55 using the requested command.
- [x] Run `npx expo-doctor`; resolve reported compatibility issues.
- [x] Apply only relevant SDK 55 breaking changes from the official release notes.
- [x] Run `npx expo start -c` and verify the app bundle; run project tests/typecheck as compatibility checks.
- [x] Commit this hop with a Conventional Commit message.
- Resolved versions: Expo `55.0.31` (CLI `55.0.36`), React/React DOM `19.2.0`, React Native `0.83.10`, Expo Router `55.0.18`, `expo-constants` `55.0.17`, `expo-font` `55.0.8`, `expo-linking` `55.0.17`, `expo-status-bar` `55.0.6`, `react-native-screens` `4.23.0`, `jest-expo` `55.0.22`, and `react-test-renderer` `19.2.0`.
- Doctor finding/fix: the first `npx expo-doctor` run failed only the duplicate-native-dependency check because Expo SDK 55 had nested `expo-font@55.0.8` while Expo Router's `expo-symbols` peer resolved top-level `expo-font@57.0.4`. Added the SDK-compatible direct dependency with `npx expo install expo-font`; the final tree deduplicates on `55.0.8`, and Doctor passes 20/20 checks. This indirect peer requirement is separate from adding or migrating an app icon import.
- Test compatibility fix: the first test run confirmed `@testing-library/react-native@13.3.3` rejects `react-test-renderer@19.1.0` with React `19.2.0`. Updated the dev dependency to `19.2.0`; all tests then passed.
- Breaking-change audit: no app source uses `expo-av`, `expo-video`/`expo-audio`, direct React Navigation APIs, `expo-router/server`, `@expo/vector-icons`, or `expo-file-system`. `app.json` has no disabled New Architecture, notification, or edge-to-edge setting; no native project directories exist. No source/config migration or auth behavior change was needed. The `expo-font` plugin auto-added by its installer was removed because this app does not embed custom fonts.
- Verification: `npx expo install expo@^55.0.0 --fix` completed; final `npx expo-doctor` passed 20/20; `npx expo export --platform android --platform ios` compiled Android and iOS bundles (3.4 MB and 3.3 MB); `npm test -- --runInBand` passed 9 suites / 35 tests; `npx tsc --noEmit` passed with no output. `npx expo start -c` found an existing tunnel server on port 8081 (PID 62349), so a temporary server was started on port 8082, reached `http://localhost:8082` with a non-blocking React Native DevTools download warning (fallback used), and was stopped; the port then refused connections.
- npm reported 54 dependency audit findings (10 moderate, 44 high) during install; no audit fix was run because it is outside this SDK hop.
- Commit evidence: `6c3d0f1 chore(expo): upgrade SDK 54 to 55`.

### SDK57-2 — Upgrade SDK 55 to 56

- [x] Align dependencies with SDK 56 using the requested command.
- [x] Run `npx expo-doctor`; resolve actionable SDK56 version/peer findings. The known Hermes V1 regression remains intentionally deferred to SDK57-3.
- [x] Apply relevant SDK 56 breaking changes; check Expo Router direct imports, `@expo/vector-icons` usage/dependency, file-system calls, and iOS deployment requirements without unrelated refactors.
- [x] Run `npx expo start -c` and verify the app bundle; run project tests/typecheck as compatibility checks.
- [x] Commit this hop with a Conventional Commit message.
- Resolved versions: Expo `56.0.23` (CLI `56.1.26`), React/React DOM `19.2.3`, React Native `0.85.3`, Expo Router `56.2.21`, TypeScript `6.0.3`, `expo-constants` `56.0.27`, `expo-font` `56.0.7`, `expo-linking` `56.0.18`, `expo-status-bar` `56.0.4`, `react-native-safe-area-context` `5.7.0`, `react-native-screens` `4.26.2`, `jest-expo` `56.0.5`, and `react-test-renderer` `19.2.3`.
- Installer peer-resolution finding/fix: the first `npx expo install expo@^56.0.0 --fix` attempt updated the SDK packages but failed its final npm install with `ERESOLVE`: Expo Router 56 pulls `react-native-drawer-layout`, whose peer graph caused npm to select Reanimated `4.7.1` (requires RN `0.86`–`0.88`) and Worklets `0.13.0` (incompatible with Expo Modules Core's `^0.7.4 || ^0.8.0` peer range). Added npm overrides matching this SDK's `bundledNativeModules.json`: Gesture Handler `~2.31.1` (resolved `2.31.2`), Reanimated `4.3.1`, and Worklets `0.8.3`. These remain transitive peer modules, not direct app dependencies or source usages. Re-running the exact installer command then completed with `Dependencies are up to date`.
- Doctor: the failed install initially left `jest-expo` and TypeScript out of sync. After reinstalling, the final `npx expo-doctor` result was 21/22 checks passed; the sole remaining failure is the documented Hermes V1 memory regression: RN Hermes `250829098.0.10` (affected through `.15`), which Expo says is fixed in SDK57 / RN `0.86.2+`. It is intentionally not changed in this SDK56-only hop.
- Test compatibility fix: React Native Testing Library rejected `react-test-renderer@19.2.0` with SDK56 React `19.2.3`; updated and pinned the dev dependency to `19.2.3`, after which all existing tests passed.
- Breaking-change audit: no app source imports direct `@react-navigation/*`, `expo-router/server`, `@expo/vector-icons`, or `expo-file-system`; no deprecated headless-tabs `reset` prop, custom `expo/fetch` implementation, status-bar/blur props, or Reanimated/worklets/gesture-handler usage was found. Supabase continues using default fetch. No source/config migration or auth behavior change was needed; iOS 16.4 is the SDK56 managed minimum, and there are no native folders or explicit deployment-target config to migrate. The installer-added `expo-font` and `expo-status-bar` config plugin entries were removed because the app configures neither embedded fonts nor static status-bar behavior; `app.json` has no net change. No Expo Go iPhone launch was attempted.
- Verification: the default `npx expo start -c` found the existing port-8081 process (PID `62349`) and skipped startup in non-interactive mode. A temporary `npx expo start -c --port 8082` reached `http://localhost:8082`, was stopped, and a subsequent localhost status request confirmed it was no longer listening. `npx expo export --platform android --platform ios` compiled Android (1313 modules, 3.6 MB) and iOS (1187 modules, 3.3 MB), with 34 assets. Final `npm test -- --runInBand` passed 9 suites / 35 tests; `npx tsc --noEmit` passed with no output. Jest emitted the non-blocking Node `punycode` deprecation warning.
- Commit evidence: `8f41c1e chore(expo): upgrade SDK 55 to 56`.

### SDK57-3 — Upgrade SDK 56 to 57

- [x] Align dependencies with SDK 57 using the requested command; resolved Expo is `57.0.26` (above the required `57.0.9` and startup-fix `57.0.17`).
- [x] Run `npx expo-doctor`; resolve SDK57 version, peer, and duplicate-package findings.
- [x] Apply relevant SDK 57 release-note changes; no application source/config migration was required.
- [x] Run `npx expo start -c` and verify the app bundle; run project tests/typecheck and Android/iOS export.
- [x] Commit this hop with a Conventional Commit message.
- Resolved versions: Expo `57.0.26` (CLI `57.0.27`), React/React DOM `19.2.3`, React Native `0.86.3`, Expo Router `57.0.24`, TypeScript `6.0.3`, `expo-constants` `57.0.20`, `expo-font` `57.0.4`, `expo-linking` `57.0.11`, `expo-status-bar` `57.0.1`, `react-native-safe-area-context` `5.7.0`, `react-native-screens` `4.26.2`, `jest-expo` `57.0.5`, `react-test-renderer` `19.2.3`, and `@react-native/jest-preset` `0.86.3`.
- Override reconciliation: updated the SDK56 transitive-peer overrides to match SDK57 `bundledNativeModules.json`: Gesture Handler `~2.32.0` (resolved `2.32.0`), Reanimated `4.5.1`, and Worklets `0.10.1`. These remain transitive under Expo Router/Expo, with no app-source usage. Added the Jest preset at `0.86.3` as a dev dependency to align the RN/Jest peer and unblock npm resolution; retained `jest-expo` `~57.0.5`.
- Installer/doctor findings: the first exact `npx expo install expo@^57.0.0 --fix` attempt hit npm `ERESOLVE` while the SDK56 lock/tree and overrides still contained RN `0.85.3`, Jest Expo `56.0.5`, and older peer versions. The initial doctor run was 18/21: duplicate SDK56/57 Expo modules, the Hermes V1 finding on stale RN, and SDK package-version mismatches. After updating the SDK57 peer overrides and Jest preset, npm installation succeeded; rerunning the exact installer command completed with `Dependencies are up to date`. Final `npx expo-doctor` passed 21/21 with no issues; no Hermes regression remained.
- Final manifest cleanup after parent review: removed the duplicate `jest-expo` production dependency, retained it only in `devDependencies`, and regenerated the lockfile. `npm ls jest-expo --depth=0` confirms the SDK57 version `57.0.5`.
- Breaking-change audit: no app source uses the SDK57-affected APIs or deprecated packages identified in the release notes, including direct React Navigation, `expo-router/server`, icon, file-system, `expo/fetch`, Reanimated/worklets, or gesture-handler APIs. No New Architecture config migration, prebuild, native-project creation, auth/profile/navigation code change, or iPhone Expo Go launch was needed. `app.json` remains unchanged.
- Verification: the default `npx expo start -c` found existing port-8081 PID `62349` and skipped startup in non-interactive mode; it was left untouched. Temporary `npx expo start -c --port 8082` reached `http://localhost:8082`, was stopped, and a later localhost status request confirmed it was no longer listening. `npx expo export --platform android --platform ios` compiled Android (1336 modules, 3.4 MB) and iOS (1197 modules, 3.1 MB), with 34 assets. `npm test -- --runInBand` passed 9 suites / 35 tests; `npx tsc --noEmit` passed with no output. Jest emitted the non-blocking Node `punycode` deprecation warning.
- Final parent checks after manifest cleanup: `npx expo-doctor` passed 21/21, `npm test -- --runInBand` passed 9 suites / 35 tests, `npx tsc --noEmit` passed, and Android/iOS export succeeded. Native risk assessment was medium for dependency configuration; RDD remains off.
- npm reported 64 audit advisories (10 moderate, 54 high) after SDK57 installation; no `npm audit fix` was run because it is outside this upgrade scope.
- Commit evidence: `7e479c5 chore(expo): upgrade SDK 56 to 57`.

## Baseline Evidence

- Initial `package.json`: Expo `~54.0.0`, Expo Router `~6.0.0`, React `19.1.0`, React Native `0.81.5`, TypeScript `~5.9.2`.
- `app.json` is static; no `app.config.*` exists.
- No `android/` or `ios/` directories exist, so the Expo native project upgrade helper is not applicable.
- Expo SDK 55 release notes: React Native 0.83 / React 19.2; Legacy Architecture removed; `expo-av` removed from Expo Go and unmaintained; SDK 55 Expo Go had an App Store transition. No current source usage requiring an `expo-av` migration was found.
- Expo SDK 56 release notes: React Native 0.85 / React 19.2; SDK 56 no longer relies on direct React Navigation imports through Expo Router; minimum iOS 16.4; Hermes V1 memory regression with worklets/Reanimated is resolved in SDK 57. No current direct imports from the affected APIs were found.
- Expo SDK 57 release notes: React Native 0.86 / React 19.2; `expo@57.0.9` fixes the Hermes memory regression, while `57.0.17` also fixes development startup time.

## Verification

For each hop:

- `npx expo install expo@^N.0.0 --fix` (with N = 55, 56, 57)
- `npx expo-doctor`
- `npx expo start -c` — confirm Metro reaches ready state and the app bundle compiles; stop any temporary server after verification.
- `npm test -- --runInBand`
- `npx tsc --noEmit`

Final checks additionally include `npx expo export --platform android --platform ios` and a clean Git status.

## Progress

- Repository-relative locator: `odd/tasks/carwashnow-sdk57-upgrade.md`.
- Branch `expo-sdk-57` was created after checking status; pending tunnel configuration was committed before upgrade work.
- Engram mirror: synchronized under project `carwash` at topic `odd/carwashnow-sdk57-upgrade/tasks`.
- Current SDK: 57.0.26. All three requested hops are committed: SDK55 `6c3d0f1`, SDK56 `8f41c1e`, SDK57 `7e479c5`.
- Next step: manually open CarWashNow in the user's SDK57 Expo Go on the iPhone; no physical iPhone launch was available during this upgrade.
