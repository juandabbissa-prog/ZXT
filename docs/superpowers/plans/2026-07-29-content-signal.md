# Sprint 4.0 Content Signal Implementation Plan

> Execute in the isolated `sprint/04-0-content-signal` worktree at baseline
> `868f847433a71abcbe33e7efdaaba6647e25e34d`.

## Success criteria

- Content Signal remains platform-neutral and respects all prohibited scope.
- The dependency direction is Route -> Service -> Repository -> Prisma ->
  PostgreSQL.
- Domain, repository, service, route, integration, build, and Docker smoke
  checks pass in GitHub Actions.

## Task 1: Domain contracts and failing service tests

**Files**

- Create `packages/shared/src/repository/content-signal.repository.ts`
- Update `packages/shared/src/index.ts`
- Create `apps/web/tests/content-signal.service.test.ts`

**Steps**

1. Add service tests for validation, duplicate handling, Anchor/Keyword
   references, list filters, and archive lifecycle.
2. Run the focused test and confirm it fails because the implementation is
   missing.
3. Add only the ORM-neutral domain and repository contracts required by the
   test.

## Task 2: Prisma schema and repository

**Files**

- Update `packages/database/prisma/schema.prisma`
- Create `packages/database/prisma/migrations/20260729010000_add_content_signals/migration.sql`
- Create `apps/web/src/infrastructure/persistence/content-signal.mapper.ts`
- Create `apps/web/src/infrastructure/persistence/content-signal-persistence-error.ts`
- Create `apps/web/src/features/content-signal/content-signal.repository.prisma.ts`
- Create `apps/web/tests/content-signal.repository.integration.test.ts`

**Steps**

1. Add a failing repository integration test.
2. Add platform-neutral Prisma models, foreign keys, indexes, and duplicate
   fingerprint constraint.
3. Implement mapper and Prisma repository through the shared contract.
4. Generate and validate Prisma; run the integration test.

## Task 3: Service

**Files**

- Create `apps/web/src/features/content-signal/content-signal.service.ts`
- Create `apps/web/src/features/content-signal/index.ts`
- Create `apps/web/tests/content-signal.service.integration.test.ts`

**Steps**

1. Implement create, get, list-by-Anchor, and archive operations.
2. Enforce the approved invariants without Prisma imports.
3. Run unit tests.
4. Add and run a database-backed service integration test.

## Task 4: Routes

**Files**

- Create `apps/web/src/features/content-signal/content-signal.runtime.ts`
- Create `apps/web/src/app/api/content-signals/route.ts`
- Create `apps/web/src/app/api/content-signals/[id]/route.ts`
- Create `apps/web/tests/content-signal.route.test.ts`

**Steps**

1. Add failing route tests.
2. Implement thin handlers that parse input and call the Service only.
3. Map application errors to the existing API envelope.
4. Run route and architecture tests.

## Task 5: Regression and delivery

**Files**

- Create `docs/Sprint_04_0_Content_Signal_Delivery_Report.md`

**Steps**

1. Run Prisma generate, format, validate, migration, and seed.
2. Run format, lint, architecture, typecheck, unit/integration tests, and build.
3. Run Docker smoke health checks.
4. Record exact evidence in the Delivery Report.
5. Commit only Sprint 4.0 files, push the branch, and wait for GitHub Actions.
6. Collect the Actions URL and artifacts; stop for review.
