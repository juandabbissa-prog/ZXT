# Operations

## Docker

Start all services with `docker compose up --build`; stop with `docker compose down`. Persistent volumes are `postgres_data` and `redis_data`. Use `docker compose logs -f web` for Web logs.

## Database

Run `bun run db:migrate` to apply migrations, `bun run db:seed` to seed system metadata, and `bun run db:reset` only in a disposable development database.

## Health and diagnosis

- Web: `GET /api/health`
- PostgreSQL: `GET /api/health/database`
- Redis: `GET /api/health/redis`

On failures, first verify `.env.local`, then `docker compose ps`, then service logs. Never place credentials in issue reports or logs.
