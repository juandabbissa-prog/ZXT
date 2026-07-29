# Anchor Center 数据模型说明

版本：V1.0
Sprint：3.0 Anchor Center

## 1. 定位

Anchor Center 管理“值得持续观察的信息源”。它位于 Keyword 与未来的 Content Signal
之间，但本 Sprint 只管理观察对象及人工观察记录：

```text
Keyword
  ↓
Anchor Center
  ↓
Content Signal（后续 Sprint）
```

Anchor 是观察节点，不是客户、Lead 或业务主体。Platform Account 是平台账号抽象，
也不等同于账号背后的自然人或机构。

## 2. 分层边界

```text
Route（未来接口入口）
  ↓
AnchorService
  ↓
Repository contracts
  ↓
Prisma repositories
  ↓
PostgreSQL
```

- Route 只能调用 Service，不得接触 Repository 或 Prisma。
- Service 只依赖共享 Repository contract 和不透明事务上下文。
- Prisma 查询只存在于 Repository 实现。
- Repository 不创建事务；事务由 Service 边界通过 transaction runner 统一编排。
- 本 Sprint 任务范围未要求新增 API Route，因此没有提前定义接口契约。

## 3. Platform Account

Platform Account 是平台中立的平台账号记录。

| 字段                      | 含义               | 约束                               |
| ------------------------- | ------------------ | ---------------------------------- |
| `platform`                | 平台类型代码       | 平台中立字符串，不包含平台专有字段 |
| `accountName`             | 展示名称           | 必填                               |
| `accountIdentifier`       | 平台内账号唯一标识 | 与 `platform` 组成唯一键           |
| `profileUrl`              | 主页地址           | 仅允许 HTTP/HTTPS                  |
| `followerCount`           | 当前已知粉丝数     | 非负整数，默认 0                   |
| `contentDomains`          | 内容领域标签       | 非空数组，默认空数组               |
| `regionTags`              | 区域标签           | 非空数组，默认空数组               |
| `status`                  | 活跃状态           | `ACTIVE`、`INACTIVE`、`ARCHIVED`   |
| `createdAt` / `updatedAt` | 审计时间           | 数据库维护                         |

模型不包含 Cookie、登录凭据、平台会话、采集策略或平台风控规避信息。

## 4. Anchor

Anchor 表示一个值得持续观察的信息源。每个 Platform Account 在当前模型中最多对应
一个 Anchor，避免同一账号被重复登记为多个观察节点。

| 字段                | 含义              | 约束                                |
| ------------------- | ----------------- | ----------------------------------- |
| `name`              | Anchor 名称       | 必填                                |
| `platformAccountId` | 关联平台账号      | 唯一外键，删除受限                  |
| `observationReason` | 观察原因          | 必填、可解释                        |
| `tags`              | 管理标签          | 非空数组，默认空数组                |
| `priority`          | 观察优先级        | `LOW`、`NORMAL`、`HIGH`、`CRITICAL` |
| `status`            | 生命周期状态      | `ACTIVE`、`PAUSED`、`ARCHIVED`      |
| `riskLevel`         | 平台/来源风险等级 | `UNKNOWN`、`LOW`、`MEDIUM`、`HIGH`  |
| `archivedAt`        | 归档时间          | 进入 `ARCHIVED` 时写入              |

### 状态变化

| 当前状态   | 允许目标状态         |
| ---------- | -------------------- |
| `ACTIVE`   | `PAUSED`、`ARCHIVED` |
| `PAUSED`   | `ACTIVE`、`ARCHIVED` |
| `ARCHIVED` | 无                   |

相同状态的重复变化不是有效状态转换。只有 `ACTIVE` Anchor 可以新增观察记录。

## 5. Observation Record

Observation Record 是对 Anchor 的一次事实性观察记录。

| 字段         | 含义         | 约束                             |
| ------------ | ------------ | -------------------------------- |
| `anchorId`   | 观察对象     | Anchor 外键，删除受限            |
| `observedAt` | 实际观察时间 | 有效时间                         |
| `source`     | 记录来源代码 | 平台中立，例如 `MANUAL_REVIEW`   |
| `result`     | 观察结果     | 必填                             |
| `notes`      | 备注         | 可选                             |
| `confidence` | 数据可信度   | 0–100 整数，应用与数据库双重约束 |
| `createdAt`  | 创建时间     | 数据库维护                       |

Observation Record 不是 Content Signal。它不执行语义提取、信号生成、客户画像、Lead
评分或销售动作。

## 6. Anchor Quality Score 方向

本 Sprint 不实现评分算法。未来如经独立任务授权，可从以下方向评估“观察价值”：

- 房产相关度；
- 区域相关度；
- 活跃程度；
- 内容价值；
- 观察优先级；
- 来源稳定性和合规风险；
- 观察记录可信度。

该评分只代表信息源观察价值，不代表客户购买概率，不属于 Buyer Persona 或 Lead
Scoring。

## 7. ADR 约束

- ADR-0007：只建设平台适配边界内的领域能力，不包含自动采集、登录、Cookie、浏览器
  自动化或绕过平台限制。
- ADR-0008：模型和 Repository 面向 PostgreSQL 与容器化运行，不依赖个人电脑或本地
  文件数据库。
- ADR-0009：Anchor 不生成客户画像；Observation Record 不触发 Buyer Persona
  Engine。
