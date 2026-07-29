# Sprint 6.0 Lead Scoring Delivery Report

## 1. 交付概况

- Sprint：6.0 Lead Scoring
- 开发基线：`main@e3ce23865f051058e8f14b2b4a2cd4b6acea123c`
- 开发分支：`sprint/06-0-lead-scoring`
- 当前状态：实现完成，等待 GitHub Actions 最终验收

本次交付仅实现 Lead Scoring 基础能力。评分表示基于证据的模型判断，不表示客户事实或确定购买行为。

## 2. 领域边界

已冻结并实现以下术语：

- Lead Score Assessment
- Purchase Stage
- Lead Grade
- Score Basis
- Evidence Link
- Confidence
- Explanation
- Scoring Policy Version
- Assessment Snapshot

输入仅来自 Buyer Persona、Persona Snapshot、Content Signal 与 Evidence。实现未包含收入推断、付款能力推断、自动联系、自动销售决策、CRM、自动采集或平台绕过能力。

## 3. 架构与实现

保持以下依赖方向：

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

主要交付：

- Domain：评分聚合、依据、证据链接、快照、等级、购买阶段和领域校验。
- Policy：版本化、确定性评分策略及稳定阈值映射。
- Prisma：Lead Score Assessment、Basis、Evidence Link 模型及 Migration。
- Repository：接口、Mapper、Prisma 实现、事务写入和历史查询。
- Service：输入解析、评分、幂等指纹、持久化、最新记录和历史查询。
- Route/API：创建评分、查询详情、查询最新评分和分页历史。

## 4. 测试覆盖

- Domain Unit Tests：领域不变量、分数与置信度边界、证据可追溯性、过期状态。
- Policy Unit Tests：确定性、空输入、评分与等级/阶段映射。
- Service Unit Tests：创建、幂等复用、输入缺失、分页校验。
- Repository Integration Tests：事务持久化、详情、指纹、最新记录和历史查询。
- Route Tests：四类 API 路径、参数传递和统一错误映射。
- Regression：既有 Keyword、Anchor、Content Signal 与 Buyer Persona 测试保持在完整 CI 范围。

## 5. 本地验证结果

已通过：

- Prisma generate
- Prisma validate
- Format check
- Lint
- Architecture check
- Typecheck
- Lead Scoring Domain / Policy / Service / Route 定向测试
- Production build
- `git diff --check`

数据库集成测试、Migration deploy、Seed、完整回归和 Docker Smoke Test 由 GitHub Actions 隔离 Runner 作为最终权威验收。

## 6. CI 验收

GitHub Actions 必须完成：

- `verify`：待运行
- `container-smoke`：待运行
- CI artifacts：待下载并压缩

CI 通过后补充 Commit SHA、Actions Run URL、两个 Job 结果和压缩证据包路径。

## 7. 范围确认

未实现或修改：

- AI Sales Agent
- CRM
- 自动联系或自动发送消息
- 自动销售决策
- 自动采集、Cookie、登录或浏览器自动化
- 平台绕过
- 收入或付款能力推断
- ADR-0007、ADR-0008、ADR-0009

## 8. 结论

Sprint 6.0 的代码与测试已完成本地静态和定向验证。当前尚不声明 PASS；必须等待 GitHub Actions 的 `verify` 与 `container-smoke` 全部成功，并交付压缩后的 CI 证据包后进入审核。
