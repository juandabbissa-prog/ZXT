# Sprint 5.0 Buyer Persona Engine Implementation Plan

**Baseline:** `main@1ee01fd0d6d3bb258230d0448834be31c12c438b`

**Branch:** `sprint/05-0-buyer-persona-engine`

**Goal:** Implement the platform-neutral Buyer Persona Engine foundation while preserving `Route -> Service -> Repository -> Prisma -> Database`.

## Scope guardrails

- Implement only Buyer Persona, Dimension Assessment, Evidence Link, and Snapshot.
- Cognitive states are limited to `FACT`, `INFERENCE`, and `UNKNOWN`.
- Evidence may reference existing Content Signal and Signal Evidence records.
- Do not implement Lead, Lead Scoring, Intent Score, AI Sales Agent, CRM, collection, login, browser automation, cookies, or platform bypass.

## Execution

1. Freeze terminology and domain rules in project documentation.
   - Verify: terms and invariants are explicit and platform neutral.
2. Add failing Buyer Persona domain unit tests.
   - Verify: targeted test fails because the domain implementation is absent.
3. Implement the minimum shared domain model.
   - Verify: targeted domain tests pass.
4. Add Prisma enums/models and a forward migration.
   - Verify: `prisma format`, `prisma validate`, and `prisma generate` pass.
5. Add failing repository integration tests.
   - Verify: tests fail because the repository implementation is absent.
6. Implement repository contract, mapper, Prisma repository, and transaction support.
   - Verify: repository integration tests pass against PostgreSQL.
7. Add failing service unit tests.
   - Verify: tests fail because Buyer Persona service behavior is absent.
8. Implement Buyer Persona service and stable error mapping.
   - Verify: service tests pass without direct Prisma imports.
9. Add failing route tests.
   - Verify: route tests fail because API handlers are absent.
10. Implement runtime wiring and platform-neutral routes.
    - Verify: route tests pass and architecture check passes.
11. Add seed coverage and delivery documentation.
    - Verify: seed remains idempotent and docs match implementation.
12. Run the complete local validation pipeline.
    - Verify: install, Prisma generate/validate/migration/seed, format, lint,
      architecture, typecheck, unit/integration tests, build, and Docker smoke pass.
13. Commit and push the Sprint branch, then run GitHub Actions.
    - Verify: `verify` and `container-smoke` jobs succeed.
14. Download CI artifacts and package the complete evidence directory.
    - Verify: ZIP contains job logs, artifacts, run metadata, and Delivery Report.
