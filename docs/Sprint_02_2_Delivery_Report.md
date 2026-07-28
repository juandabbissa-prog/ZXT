# Sprint 2.2 Keyword Service Delivery Report

**Status:** Implementation complete; CI verification pending publication to the authorized repository.

## Delivered scope

- `KeywordService` implements Keyword create, get, list, base-field update, explicit status transition and soft delete use cases.
- The boundary remains `Route -> Service -> Repository -> Prisma`; `KeywordService` has no Prisma import or Prisma Client dependency.
- Keyword rules are centralized in Service: input validation, NFKC phrase normalization, duplicate protection, active category/tag reference checks, bounded pagination, state transitions and optimistic-concurrency outcomes.
- Persistence errors are mapped to safe application contracts; Prisma details do not leave the Service boundary.
- Unit tests cover happy paths, validation, duplicate mapping, filters, state transitions, concurrency and soft delete.
- An opt-in database integration suite covers Service plus Prisma Repository behavior when `RUN_DATABASE_INTEGRATION_TESTS=true`.

## Compatibility decision

To support the approved status-management use case without bypassing the frozen Repository boundary, `UpdateKeywordInput` receives two optional, backwards-compatible fields: `status` (excluding `DELETED`) and `archivedAt`. No existing Repository method or field was removed or redefined.

## Architecture and scope compliance

- No Route directly accesses Prisma.
- No Service accesses Prisma or a Prisma Client.
- No physical Keyword delete is introduced.
- No Anchor, Platform, Content Signal, Lead, collection, browser automation, AI or deployment implementation is included.
- ADR-0007 and ADR-0008 constraints are recorded in `docs/domain/Keyword_Service_Design.md`.

## Verification status

`git diff --check` is clean in the isolated Sprint worktree. This local Codex workspace does not have Bun, Node package tooling or installed dependencies, so compilation and tests have not been represented as passed locally. The following acceptance commands must run in the authorized GitHub/Codespaces environment before review:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run db:validate
bun run format:check
bun run lint
bun run architecture:check
bun run typecheck
bun run test
RUN_DATABASE_INTEGRATION_TESTS=true bun run test
bun run build
docker compose up --build -d
```

The final GitHub Actions run URL, test logs and commit SHA must be appended after publication. Sprint 2.2 must not advance until Chief Architect review is complete.
