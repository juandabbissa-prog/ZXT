# Keyword Seed Strategy

## Scope

Sprint 2.0.5 seeds no business Keywords. It only designs controlled reference data for a future approved implementation.

## Controlled data

- Initial Category: a minimal `UNCLASSIFIED` active category, only if Chief Architect confirms a required default.
- Initial Tag: none by default; tags are optional controlled data.
- Role: fixed enum values are schema data, not seed rows.

## Idempotency

Seed uses stable `code` values and upsert semantics. Re-running it must leave category/tag counts and values unchanged; it must not overwrite operator-maintained names without explicit migration/seed versioning.

## Environment policy

| Environment | Seed behavior |
|---|---|
| Development | May seed only approved controlled defaults. |
| Test | Seeds controlled defaults plus isolated test fixtures owned by tests. |
| Production | No example data, no suggested Keyword, no regional/property keyword list; only explicitly approved controlled reference data. |

No 大连房产关键词库 or production import is included. Real keyword data requires a separate Product Owner-approved task.
