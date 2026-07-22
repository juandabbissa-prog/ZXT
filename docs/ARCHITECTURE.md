# Architecture

## Sprint 1 boundary

```text
Browser → Next.js Web → Shared config/logger/errors
                    ├→ Prisma → PostgreSQL
                    └→ Redis client → Redis
Crawler / Workers (reserved; no business behavior)
```

`apps/web` owns HTTP; `packages/shared` owns cross-cutting code; `packages/database` owns persistence; `apps/crawler` and `workers` are explicit future boundaries. No business tables, collection logic, scoring or agent orchestration are included.

## Data flow

Health endpoint → dependency check → standard JSON response. Database only contains `SystemConfig` and `SystemEvent`, proving migration/seed connectivity.

## Extension boundary

New approved business modules must live in their owning package/app, expose typed contracts, add migration and tests, and must not duplicate database/Redis clients.
