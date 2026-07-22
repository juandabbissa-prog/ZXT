# Keyword Repository Compliance Report

| Requirement | Static result |
|---|---|
| No Route / Service / UI added | PASS |
| Repository has no `$transaction` | PASS |
| Shared contract has no Prisma import/type | PASS |
| Repository returns domain records, not Prisma payloads | PASS via mapper boundary |
| Role/Tag/Variant use relational writes | PASS |
| Keyword delete is soft delete only | PASS: update status/deletedAt; no repository delete call |
| Deleted phrase remains unique | PASS: `normalizedPhrase @unique`; lookup includes Deleted |
| List excludes Deleted by default | PASS |
| Stable list sort | PASS: updatedAt/id fallback |
| Migration is new | PASS: new `20260722000100_add_keyword_catalog` only |

`architecture:check` now scans `.repository.*` files for `$transaction`, Repository imports and Route Prisma access. Actual Bun execution and database tests remain required CI evidence.
