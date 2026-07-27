# Keyword Service Design

**Sprint:** 2.2
**Status:** Implemented — pending CI and Chief Architect review

## Responsibility and boundary

`KeywordService` is the Keyword Catalog use-case boundary. It owns input validation, phrase normalization, reference validation, duplicate detection, allowed status transitions, optimistic-concurrency outcome mapping and transaction orchestration.

```text
Future Route → KeywordService → KeywordRepository / CategoryRepository / TagRepository → Prisma
```

The Service does not import Prisma, hold a Prisma Client or issue database queries. It receives only frozen repository interfaces and an opaque transaction runner. Concrete Prisma transaction wiring stays in the infrastructure composition layer.

## Architecture constraints

This Sprint implements only the Keyword Catalog business capability. It does not introduce data acquisition, platform adapters, browser automation, AI processing, Lead or CRM behavior (ADR-0007), nor deployment or production-runtime work (ADR-0008). The implementation remains deployable through the existing Docker and GitHub Actions boundaries without adding infrastructure responsibilities to the Service.

## Implemented operations

- Create Keyword, including role, active category/tag and variant validation.
- Get and list Keyword with bounded pagination, status and category filters.
- Update basic fields: phrase, category, match mode and note.
- Change status using an explicit state machine.
- Soft delete only; no physical delete is exposed.

## Rules

1. Phrase is trimmed, 1–120 characters, NFKC-normalized, whitespace-collapsed and lowercased for duplicate detection.
2. A Keyword has at least one distinct valid role.
3. Category and tags must exist and be `ACTIVE`.
4. Normalized phrase is checked before create/update; the database unique constraint remains the final concurrency safeguard.
5. Variants cannot repeat the primary phrase or one another after normalization.
6. Valid status edges are `DRAFT → ACTIVE|PAUSED|ARCHIVED`, `ACTIVE → PAUSED|ARCHIVED`, and `PAUSED → ACTIVE|ARCHIVED`.
7. `DELETED` can only be reached by `softDelete`; it is never a normal status transition.

## Error strategy

Validation errors return the existing `VALIDATION_ERROR` contract. Missing records map to `NOT_FOUND`; phrase uniqueness maps to `KEYWORD_DUPLICATE`; rejected edges map to `INVALID_STATE_TRANSITION`; optimistic update races map to `VERSION_CONFLICT`.

`KeywordPersistenceError` is mapped before leaving Service. Prisma error objects and database details are never returned to future Routes.

## Compatibility note

Sprint 2.1's `UpdateKeywordInput` has a backwards-compatible Sprint 2.2 extension: optional `status` and `archivedAt`. No prior property, method signature, repository name or persistence behavior was removed or changed. This is required so the Service can meet the approved state-management requirement while continuing to reuse the frozen Repository boundary.
