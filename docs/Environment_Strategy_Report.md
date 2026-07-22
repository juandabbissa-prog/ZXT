# Environment Strategy Report

**版本：** V1.0  
**状态：** Frozen  
**适用范围：** RE-Agent 全生命周期开发

## 1. 原则

RE-Agent 遵循以下两项原则：

1. **环境自解决原则**：Engineering Team 必须先用工程方案解决依赖、数据库、缓存、构建和验证问题；未穷尽合理方案不得要求 Product Owner 安装开发软件。
2. **最小宿主机依赖原则**：Product Owner 的设备仅承担 Git、与 AI 协作及查看交付结果。开发运行时、数据库、Redis、测试和构建应优先由 Docker、脚本和 CI 承担。

## 2. 当前宿主机依赖分析

| 能力 | 当前状态 | 可移除性 | 工程化方案 |
|---|---|---|---|
| Bun | 本机不可用 | 可移除 | 使用 `oven/bun` Docker 镜像；GitHub Actions 使用 `oven-sh/setup-bun`。 |
| Node.js | 无项目直接依赖 | 可移除 | 由 Bun 镜像或 GitHub Actions 托管。 |
| Docker Desktop | 本机不可用 | 可移除为本地验收前提 | 本地 Docker 仅为可选开发体验；完整验收改由 GitHub Actions 执行。 |
| PostgreSQL | 本机不需要 | 已移除 | Docker Compose 的 postgres 服务及 GitHub Actions service container。 |
| Redis | 本机不需要 | 已移除 | Docker Compose 的 redis 服务及 GitHub Actions service container。 |
| Git | 项目已使用 | 最小保留 | 用于版本控制和推送到 CI 远程仓库。 |
| GitHub 远程仓库 | 尚未配置 | 必要的外部协作条件 | GitHub Actions 需要可推送的远程仓库；不要求安装软件。 |

## 3. Docker 化方案

项目保留以下容器化资产：

- `docker-compose.yml`：postgres:16、redis:7、web、crawler。
- `docker/web.Dockerfile`：以 Bun 运行时构建/运行 Web。
- `docker/crawler.Dockerfile`：以 Bun 运行时运行 Crawler 空壳。

Docker 仍是可复现本地开发的首选，但不是 Product Owner 必须安装的软件。无法在本机运行 Docker 时，CI 是验收替代方案。

## 4. CI 替代方案

`.github/workflows/ci.yml` 是 Sprint 1 的标准验证路径。推送到 GitHub 后，它将在托管 Linux runner 中：

1. 安装固定 Bun 版本；
2. 启动 PostgreSQL 与 Redis service containers；
3. 安装依赖并生成 Prisma Client；
4. 执行 migration、seed、format、lint、typecheck、test、build；
5. 以失败状态阻止错误变更合并。

## 5. 自动化方案

根目录 scripts 与 package scripts 是唯一的开发入口。后续可增加一个 CI 触发后的结果归档脚本，但不得把业务逻辑放入环境脚本。

## 6. 无法完全消除的依赖及依据

| 依赖 | 是否要求 Product Owner 安装 | 技术依据 |
|---|---|---|
| GitHub 远程仓库的访问权 | 否，属于账号/协作授权 | GitHub Actions 必须由远程仓库事件触发；这不是本地软件安装。 |
| Git | 最小保留 | 需要向远程仓库推送提交以触发 CI；当前 Codex 环境已提供内置 Git。 |

没有要求 Product Owner 安装 Bun、Node.js、Docker、PostgreSQL 或 Redis。

## 7. Sprint 1 验收路径

1. 将本地 Git 仓库关联到 GitHub 远程仓库。
2. 推送 `main` 分支，触发 CI。
3. 用 CI 真实日志取得 install、migration、seed、format、lint、typecheck、test、build 的结果。
4. 仅在 CI 全绿、无 P0 问题后，由 Chief Architect 审核 Sprint 1。
