# Sprint 3.0 Anchor Center Delivery Report

版本：V1.0
状态：已完成，等待 Chief Architect 审核

## 1. 基线

- 目标分支：`sprint/03-0-anchor-center`
- 冻结主干基线：`main@9fae04d678e1c3bf1139663ca9267cec84810f1b`
- 分支已有文档归档提交：`ed72e1a0dbbdf61cc8765455bba534f71cf63a66`
- Anchor Center 实现提交：`85eece97f6228296c33281a945cf034e5a1a1569`
- Pull Request：`https://github.com/juandabbissa-prog/ZXT/pull/2`

## 2. 交付范围

本次实现：

- Platform Account 领域及 Prisma Model；
- Anchor 领域及生命周期规则；
- Observation Record 领域；
- AnchorService；
- Repository contracts 与 Prisma Repository；
- Prisma migration；
- Unit Test；
- PostgreSQL Integration Test；
- Anchor Center 数据模型说明。

本次未实现：

- 自动采集、平台登录、Cookie 或浏览器自动化；
- 任何绕过平台限制的能力；
- Content Signal；
- Buyer Persona；
- Lead、Lead Scoring；
- AI Sales Agent；
- 云部署；
- 未经任务书定义的 API Route。

## 3. 架构

冻结边界保持为：

```text
Route
  ↓
Service
  ↓
Repository
  ↓
Prisma
  ↓
Database
```

AnchorService 只依赖 Repository contract；Prisma 类型和查询仅存在于基础设施 Mapper
及 Prisma Repository。事务由 Service 边界编排。

## 4. 数据与业务规则

- `platform + accountIdentifier` 唯一标识 Platform Account。
- 一个 Platform Account 最多对应一个 Anchor。
- Anchor 状态为 `ACTIVE`、`PAUSED`、`ARCHIVED`，归档后不可恢复。
- 只有 ACTIVE Anchor 可以新增 Observation Record。
- Observation confidence 为 0–100 整数，应用和 PostgreSQL 均校验。
- 数组字段非空并默认空数组，避免 Prisma contract 与数据库出现空值差异。
- Observation Record 明确不是 Content Signal。

## 5. 测试覆盖

Unit Test 覆盖：

- Platform Account 创建、规范化、重复检查与参数校验；
- Anchor 创建与重复检查；
- 分页及平台、标签、状态过滤；
- 标签、优先级和状态更新；
- Anchor 状态转换；
- Observation Record 创建条件和参数校验。

Integration Test 覆盖：

- Service → Repository → Prisma → PostgreSQL 完整链路；
- Platform Account 与 Anchor 唯一约束；
- Observation Record 持久化；
- 事务失败回滚；
- Anchor Center 表独立清理和串行数据库测试。

## 6. 验收状态

### 6.1 本地验证

2026-07-29 已在隔离工作区执行：

| 验收项             | 本地结果                                      |
| ------------------ | --------------------------------------------- |
| Prisma generate    | PASS                                          |
| Prisma validate    | PASS                                          |
| format             | PASS                                          |
| lint               | PASS                                          |
| architecture check | PASS                                          |
| typecheck          | PASS                                          |
| shared unit test   | PASS（3 files，4 tests）                      |
| web unit test      | PASS（6 files，24 tests；含 Anchor 7 tests）  |
| integration test   | 未执行（本地无 Docker/PostgreSQL，等待 CI）   |
| build              | PASS（Next.js production build，exit code 0） |

数据库集成测试没有用文档或 mock 冒充通过；目标分支 CI 必须在 PostgreSQL 环境运行
Migration、Seed 与 Integration Test。

### 6.2 GitHub Actions

GitHub Actions PR Run：
`https://github.com/juandabbissa-prog/ZXT/actions/runs/30418376575`

| 验收项             | 状态 |
| ------------------ | ---- |
| install            | PASS |
| Prisma generate    | PASS |
| Prisma validate    | PASS |
| migration          | PASS |
| seed               | PASS |
| format             | PASS |
| lint               | PASS |
| architecture check | PASS |
| typecheck          | PASS |
| unit test          | PASS |
| integration test   | PASS |
| build              | PASS |
| docker smoke       | PASS |

Job 结论：

- `verify`：PASS；
- `container-smoke`：PASS。

GitHub Actions 已保存以下真实运行证据：

- `sprint-02-1-ci-logs`（共享 CI 工作流沿用的 artifact 名称）；
- `sprint-02-1-docker-smoke-logs`（共享 CI 工作流沿用的 artifact 名称）。

最终结论：Sprint 3.0 Anchor Center 实现及工程验收均通过，当前停止开发并等待
Chief Architect 审核。本报告不授权进入 Content Signal 或其他后续模块。
