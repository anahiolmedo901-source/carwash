# CarWashNow — Spanish user interface

## Objective

Translate all user-visible screen copy to neutral Spanish without changing database scripts, API/RPC names, route names, stored enum values, service contracts, or technical identifiers.

## Scope

- Auth and registration screens, validation, success/error feedback, and accessibility labels.
- Customer catalog, vehicles, reservations, payments, profile, and status presentation.
- Administrator dashboard, service management, and washing-space management.
- Employee placeholder and any remaining navigation/loading/empty/error copy.
- Tests that assert translated UI copy.

## Constraints

- Do not edit SQL migrations, database objects, RPC names, table/column names, route names, or stored values.
- Preserve provider/brand names such as CarWashNow and Mercado Pago.
- Preserve dynamic business data; translate only labels around it.
- Use neutral, consistent Spanish in visible UI strings.
- Do not add new product functionality or alter behavior.

## Tasks

- [x] UI-1 — Inventory English and mixed-language screen copy and text assertions.
- [ ] UI-2 — Translate visible UI strings and localize raw status/type labels at the presentation boundary.
- [ ] UI-3 — Update focused UI tests for translated copy without changing behavior.
- [ ] UI-4 — Run focused tests, full tests, typecheck, Expo export, and diff checks.

## Intentionally unchanged

- Database migrations and SQL comments/messages.
- API/service contracts, RPC names, route names, enum values, IDs, QR contents, and accessibility metadata values that are technical.
- Dynamic catalog names, descriptions, addresses, user names, vehicle details, and provider names.

## Applicable checks

```text
npm test -- --runInBand
npm run typecheck
EXPO_NO_DOTENV=1 EXPO_OFFLINE=1 ./node_modules/.bin/expo export --platform android --platform ios
git diff --check
```

## Progress

- Status: inventory complete; translation not started.
- Next step: UI-2.
