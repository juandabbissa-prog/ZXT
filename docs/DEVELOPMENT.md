# Development

## Git and commits

Use `main`, `develop`, `feature/*`, and `fix/*`. Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`.

## Code rules

TypeScript strict mode is required. Do not use explicit `any`, unhandled promises, hard-coded infrastructure secrets, or ad-hoc database/Redis clients. Run format, lint, typecheck and tests before review.

## Adding a module

1. Confirm the Sprint permits it.
2. Select the responsible package/app boundary.
3. Add typed API, tests, logs and safe errors.
4. Add migration only when a schema change is approved.
5. Update docs and run the root verification commands.
