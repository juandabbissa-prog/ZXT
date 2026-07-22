# RE-Agent

RE-Agent 是房地产主动获客自动化系统。当前为 Sprint 1：仅提供工程基础设施，不包含任何业务采集、客户识别或线索功能。

## 技术栈

Next.js、TypeScript、Bun Workspace、PostgreSQL、Prisma、Redis、Pino、Vitest、Docker Compose 与 GitHub Actions。

## 目录

- `apps/web`：Web 页面与健康检查 API
- `apps/crawler`：采集服务边界（Sprint 1 为空壳）
- `packages/shared`：配置、日志、错误和 API 类型
- `packages/database`：Prisma schema、迁移和 seed
- `packages/sdk`：未来 SDK 边界
- `workers`：未来后台任务边界

## 本地启动

本地运行是可选的开发方式。若开发机具备 Bun 与 Docker，可复制 `.env.example` 为 `.env.local` 后按以下顺序运行：`bun install`、`docker compose up -d postgres redis`、`bun run db:generate && bun run db:migrate && bun run db:seed`、`bun run dev`。

默认验收不要求安装本地开发软件：推送到 GitHub 远程仓库后，GitHub Actions 将在托管 runner 中完成依赖安装、PostgreSQL/Redis、迁移、Seed、测试和构建。

## Docker 启动

如本机有 Docker，可执行 `docker compose up --build`。服务健康后可访问 `/api/health`、`/api/health/database` 和 `/api/health/redis`；没有 Docker 时，以 GitHub Actions 作为等效验收路径。

### Docker 操作脚本

| 操作 | POSIX Shell | PowerShell |
|---|---|---|
| 启动 | `./scripts/docker.sh up` | `./scripts/docker.ps1 up` |
| 停止 | `./scripts/docker.sh down` | `./scripts/docker.ps1 down` |
| 无缓存重建 | `./scripts/docker.sh rebuild` | `./scripts/docker.ps1 rebuild` |
| 重置开发数据库 | `./scripts/docker.sh reset-db` | `./scripts/docker.ps1 reset-db` |
| 容器内测试 | `./scripts/docker.sh test` | `./scripts/docker.ps1 test` |

重置数据库会删除 Docker volumes，仅限开发环境。

## 一键验收

默认验收方式是推送到 GitHub 后自动运行 Actions；无需本地安装 Bun、数据库或 Redis。若可用 Docker，可运行 `./scripts/verify.sh`（PowerShell：`./scripts/verify.ps1`），它会启动容器、检查三条健康接口、执行容器内测试并输出容器状态。

## 校验

执行 `bun run format:check`、`bun run lint`、`bun run typecheck`、`bun run test`、`bun run build`。

## Sprint 管理

每个 Sprint 必须遵循 `docs/Sprint_XX_Development_Task.md` → `docs/Sprint_XX_Delivery_Report.md` → `docs/Sprint_XX_Review_Report.md`。只有 Chief Architect 的审核报告为 `PASS`，才允许进入下一 Sprint。

## 常见问题

- 缺少配置：检查 `.env.local` 是否包含 `DATABASE_URL` 与 `REDIS_URL`。
- 数据库连接失败：确认 `docker compose ps` 中 postgres 为 healthy。
- Prisma Client 缺失：执行 `bun run db:generate`。
