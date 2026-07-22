# Keyword Migration Strategy

## Rules

- Migration names: `YYYYMMDDHHMMSS_keyword_catalog_<change>.sql` through Prisma migration tooling.
- An applied migration is immutable. Fixes always use a new forward migration.
- Seed initializes controlled reference data; Migration creates structure and constraints only.

## Environments

| Environment | Process |
|---|---|
| Development | Generate/review migration from candidate schema only after Sprint 2.1 approval; apply to disposable database. |
| CI | Start empty PostgreSQL, run `prisma migrate deploy`, run seed, verify schema and tests. |
| Test database | Recreate or isolate database, deploy all migrations, run test seed; never reuse production data. |
| Production | Backup, review SQL and lock impact, deploy forward-only migration, observe, then seed only approved reference data. |

## Rollback and repair

Production rollback is application rollback plus a new compensating migration; never edit migration history or blindly down-migrate data. Destructive changes require an approved expand → backfill → dual-read/write (when needed) → contract plan, restoration test, Product Owner and Chief Architect approval.

## Backup

Before production schema change, create verified PostgreSQL backup, record restore owner/window, and verify a restore drill for high-risk migrations. This Sprint executes none of these actions.
