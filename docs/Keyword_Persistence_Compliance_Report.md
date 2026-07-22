# Keyword Persistence Compliance Report

## Baseline consistency

| Baseline | Result | Evidence |
|---|---|---|
| Keyword Domain Model | PASS | Keyword root, Category/Tag/Variant/Role and frozen enums retained. |
| Keyword Data Model | PASS | Candidate schema maps all specified tables, fields, indexes, FK and composite keys. |
| Keyword API Contract | PASS | Repository filters/statuses support planned API without adding Route. |
| Service/Repository Standard | PASS | Interface exposes no Prisma types; transaction context is opaque; no implementation or transaction call exists. |

## Prohibited-pattern check

| Check | Result |
|---|---|
| Prisma type leakage to Service/Route | PASS: no Route/Service was added; candidate interface imports no Prisma package. |
| Repository-owned transaction | PASS: no `$transaction` or repository implementation added. |
| JSON relation replacement | PASS: Role Link, Tag Link and Variant are relational candidate models. |
| Implicit business decision change | PASS: no frozen domain decisions changed. |
| Premature later functionality | PASS: no Migration execution, Repository implementation, Service, Route, collection, AI or Lead code. |
| Unmigratable design | PASS: explicit maps, UUIDs, relation names, indexes and forward-only migration plan provided. |
| Naming | PASS: tables snake_case, Prisma models PascalCase, fields camelCase, mapped DB columns snake_case. |

## Chief Architect decision required

Confirm the recommended soft-delete uniqueness policy: retain global uniqueness of `normalized_phrase`, so deleted phrases are restored rather than recreated. This is documented in the schema design and must be accepted before Sprint 2.1.
