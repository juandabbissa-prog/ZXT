# Keyword Prisma Schema Design

## Scope and mapping

Candidate schema: `prisma/schema.keyword.prisma`. It is isolated from the current runtime schema and must not be merged or migrated during Sprint 2.0.5.

| Domain concept | Prisma / PostgreSQL mapping |
|---|---|
| Identifier | `String @default(uuid()) @db.Uuid`; PostgreSQL `uuid`. |
| Time | `DateTime @db.Timestamptz(3)`; `createdAt @default(now())`, `updatedAt @updatedAt`. |
| State | Prisma enums backed by PostgreSQL enum types. |
| Text | bounded `varchar`; normalized phrase uses `varchar(160)`. |
| Relations | explicit FK, `onDelete: Restrict`, mapped `snake_case` columns. |

## Relationship decisions

- Keyword → Category is required many-to-one.
- Keyword → Role, Tag and Variant are normalized relation tables; no JSON storage.
- Category uses one self-reference (`parent` / `children`). V1 uses recursive SQL only when a future Repository needs ancestor/subtree reads; no materialized path or tree plugin is introduced.
- `KeywordRoleLink` maps `keyword_roles`; its `(keyword_id, role)` composite primary key prevents duplicate roles.
- `KeywordTagLink` maps `keyword_tag_links`; its `(keyword_id, tag_id)` composite primary key prevents duplicate links.

## Soft delete and uniqueness

The candidate keeps `keywords.normalized_phrase` globally unique even after `deleted_at` is populated. Therefore a deleted phrase cannot be recreated; it must be restored by a future explicit workflow or a new phrase must be chosen.

| Option | Benefit | Cost |
|---|---|---|
| Keep global unique key (recommended V1) | Preserves identity/history, avoids ambiguous historical matches, simple Prisma support | Cannot recreate an identical phrase after deletion. |
| Partial unique index for active rows | Allows recreation | Requires custom SQL migration, creates historical ambiguity and is not directly modeled by Prisma `@unique`. |

This is a deliberate recommendation, not a silent rule. Chief Architect must confirm it before Sprint 2.1 schema implementation.

## Query indexes

- `keywords`: status, category, source, descending updated time and exact normalized phrase unique key.
- `keyword_roles.role`: role filtering.
- `keyword_tag_links.tag_id`: tag filtering.
- Category parent/status and Tag status indexes.
- V1 does not support arbitrary substring search. A B-Tree does not efficiently serve `contains` search; a later approved Sprint must choose PostgreSQL trigram/FTS with its own migration and index plan.

## Deletion and time rules

`archivedAt` is populated on archive; `deletedAt` on soft delete. `updatedAt` changes on every persisted mutation. FK deletion is restricted so Keyword history and references cannot be silently orphaned.
