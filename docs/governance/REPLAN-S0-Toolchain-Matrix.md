# REPLAN-S0 Toolchain Matrix

| Tool             | Governed version                    | Authoritative source                         | Verification                           |
| ---------------- | ----------------------------------- | -------------------------------------------- | -------------------------------------- |
| Node.js          | 22                                  | `.github/workflows/sprint-0-static.yml`      | Static equality check                  |
| Bun              | 1.2.15                              | root `package.json#packageManager`           | Workflow and Dockerfile equality check |
| Docker Engine    | 24.0 or newer                       | REPLAN-S0 minimum compatibility policy       | Static policy check only               |
| Docker Compose   | 2.20 or newer                       | REPLAN-S0 minimum compatibility policy       | Static policy check only               |
| Prisma CLI       | declaration `^6.7.0`; lock `6.19.3` | `packages/database/package.json`, `bun.lock` | Text-only dependency check             |
| `@prisma/client` | declaration `^6.7.0`; lock `6.19.3` | `packages/database/package.json`, `bun.lock` | Must match Prisma CLI                  |

Python is not a current project dependency and is intentionally not introduced.

Docker and Compose versions are compatibility floors, not installation instructions. Version checks must not install, upgrade, build, or start anything.
