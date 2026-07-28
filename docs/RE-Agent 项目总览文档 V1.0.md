# RE-Agent 项目总览文档 V1.0

> 文档用途：用于当前长期开发对话中的上下文压缩。
> 文档性质：项目状态总览，不是新项目交接文档，不是新对话启动包，不授权任何代码或架构变更。
> 当前冻结基线：`main@9fae04d678e1c3bf1139663ca9267cec84810f1b`

## 1. 项目定位

RE-Agent 是面向房地产业务的 AI 主动获客 Agent。系统围绕市场需求语义、观察节点、内容信号和客户意图，逐步识别潜在购房需求，并为线索排序、销售辅助和 CRM 跟进提供可解释的信息基础。

RE-Agent 主要解决以下问题：

- 房产市场信息来源分散，难以形成统一、持续的观察体系；
- 潜在购房意图隐藏在内容、行为和业务互动中，人工发现效率低；
- 平台账号、市场信号、客户画像和可运营线索容易被错误混为一体；
- 传统获客流程缺少从市场观察到销售跟进的结构化业务链路；
- 临时脚本和单平台方案难以长期运行、扩展和合规维护。

RE-Agent **不是简单数据采集工具，也不是单一平台爬虫**。平台数据接入仅是未来系统的一部分，必须受合规边界和 Adapter 隔离约束。系统最终目标形态是：

- 云端部署；
- Web 访问；
- 后台 Agent 持续运行；
- PostgreSQL 保存核心业务数据；
- Docker 化服务；
- 数据接入、业务服务、AI 服务和任务调度解耦；
- 通过 GitHub Actions 完成持续集成和后续交付验证；
- 形成从市场观察到 CRM 跟进的长期房产 AI 获客软件系统。

## 2. 核心业务链路

```text
Keyword
  ↓
Anchor
  ↓
Content Signal
  ↓
Buyer Persona Engine
  ↓
Lead Scoring
  ↓
AI Sales Agent
  ↓
CRM
```

- **Keyword**：定义市场需求、区域、产品与购房意图相关语义，是观察体系的基础词汇。
- **Anchor**：被系统持续观察的市场信息节点。Anchor 是观察节点，不是客户，也不是 Lead。
- **Content Signal**：不同合规数据来源经统一抽象后形成的平台中立事实输出。
- **Buyer Persona Engine**：基于合规证据形成带来源、置信度和时效性的房产客户画像。
- **Lead Scoring**：综合意图、画像和业务证据，为可运营线索提供可解释的优先级。
- **AI Sales Agent**：在授权范围内辅助分析、建议和客户沟通，不把推断当作确定事实。
- **CRM**：承接线索归属、跟进、状态和业务生命周期。

## 3. 当前架构状态

### 已完成并冻结

#### Sprint 2.1 Foundation

- 状态：**PASS / Frozen**
- 作用：完成项目基础工程、持久化架构、Keyword Repository、Prisma、Migration、Seed、测试和 CI 验收基础。

#### Sprint 2.2 Keyword Service

- 状态：**PASS / Frozen**
- 作用：完成 Keyword Service 业务能力及对应验收。
- 合并后 CI：`verify` 与 `container-smoke` 均通过。

### 当前冻结基线

```text
main@9fae04d678e1c3bf1139663ca9267cec84810f1b
```

该 SHA 是 Sprint 2.2 合并后的正式冻结基线。后续开发必须从该基线建立独立分支。

### 当前开发阶段

#### Sprint 3.0 Anchor Center

- 状态：**准备阶段**
- 分支：`sprint/03-0-anchor-center`
- 基准：`9fae04d678e1c3bf1139663ca9267cec84810f1b`
- 当前仅完成独立分支与干净工作区准备，尚未开始 Anchor Center 开发。

## 4. ADR 冻结记录

### ADR-0007：数据采集合规与平台适配策略

作用：

- 冻结数据接入的合规原则；
- 规定平台差异必须封装在独立 Adapter 中；
- 规定业务领域层不得依赖平台专有字段；
- 规定所有来源统一输出 Content Signal；
- 隔离平台规则变化、访问限制和可用性风险；
- 明确 Anchor、Platform Account、Content Signal 与 Lead 的边界。

该 ADR 不授权自动采集、Cookie 登录、浏览器自动化、绕过平台限制或高频批量采集。

### ADR-0008：生产部署与运行架构

作用：

- 冻结 RE-Agent 的长期运行方向；
- 明确最终形态为云端部署、Web 访问和后台 Agent 持续运行；
- 规定生产环境不得依赖个人电脑或本地文件数据库；
- 规定服务应支持 Docker 化部署；
- 规定前端、业务服务、AI 服务、数据库和任务调度保持解耦；
- 规定任何生产交付必须先通过 GitHub Actions 验证。

### ADR-0009：Buyer Persona Engine 与房产客户画像体系

作用：

- 冻结 Buyer Persona Engine 在 Content Signal 之后、Lead 之前的位置；
- 定义房产客户画像的证据、置信度、时效性和可解释性原则；
- 明确 Platform Account 不等于客户，Anchor 不等于 Lead；
- 明确画像服务不能替代 Lead 生命周期；
- 定义房产场景画像维度和 Intent Score 方向，但不实现算法；
- 约束未来 Lead Scoring 与 AI Sales Agent 只能消费有来源、有边界的画像结果。

## 5. 技术架构铁律

所有业务模块必须保持以下调用链：

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

职责边界：

- **Route**：处理协议输入、调用 Service、返回响应；
- **Service**：执行业务规则和状态转换；
- **Repository**：定义和实现持久化访问边界；
- **Prisma**：提供数据库访问实现；
- **Database**：保存核心业务数据。

禁止：

- Route 直接操作数据库；
- Route 直接依赖 Prisma；
- Service 直接依赖 Prisma；
- 绕过 Repository 访问数据库；
- 将平台 Adapter 逻辑写入业务领域层；
- 破坏模块边界或跨层调用。

## 6. 平台策略

总原则：

> 合规、稳定、可持续。

平台差异必须被 Adapter 隔离。业务层只消费平台中立模型，不把抖音、小红书、视频号或其他平台字段写入核心业务模型。

禁止：

- 绕过平台风控；
- Cookie 登录方案；
- 模拟人工欺骗平台；
- 未经授权的浏览器自动化；
- 未经授权的数据采集；
- 假设平台永久开放数据；
- 将单一平台作为唯一数据来源。

## 7. 客户画像战略

Buyer Persona Engine 面向房产购房决策，不照搬通用互联网广告画像。

未来画像重点包括：

- **兴趣习惯**：学区、地铁、改善、装修、投资、养老等主题偏好；
- **行为习惯**：浏览、关注、比较、询价、看房准备等阶段性行为；
- **家庭结构**：婚姻、子女、老人照护及家庭共同决策需求；
- **收入能力**：只在合法、必要且有证据时，以区间和置信度表达；
- **消费能力**：总价承受范围、首付能力、月供接受范围和贷款偏好；
- **工作区域**：工作地点、工作圈和生活半径；
- **通勤关系**：通勤距离、时间、方式和可接受通勤走廊；
- **地缘关系**：当前居住区域、生活圈和已有区域联系；
- **购房意图**：需求明确度、预算明确度、区域明确度和时间紧迫度；
- **购房阶段**：信息收集、需求澄清、区域筛选、房源比较、方案评估、询价或看房准备、明确购买意向。

画像必须：

- 基于合规证据；
- 标记来源、时间、置信度和有效期；
- 允许未知、降级、失效和重新计算；
- 区分事实与推断；
- 不把单次行为或平台账号资料当作确定客户事实。

Intent Score 当前只冻结评分方向，不实现算法、权重或自动化决策。

## 8. 开发流程

```text
任务书
  ↓
Codex 开发
  ↓
CI 测试
  ↓
审核
  ↓
冻结
```

执行规则：

1. 每个 Sprint 必须有明确任务书和范围；
2. Codex 只实现任务书授权内容；
3. 开发使用独立分支和干净工作区；
4. GitHub Actions 必须完成规定验收；
5. CI 失败只针对失败项做最小修复；
6. 审核通过后合并至 `main`；
7. 合并后再次运行 CI；
8. 形成 Frozen Baseline Report 并冻结；
9. 当前 Sprint 未 PASS 前，不进入下一 Sprint。

## 9. 当前项目状态表

| 模块 | 状态 | 说明 |
|---|---|---|
| 项目工程与 CI 基础 | PASS / Frozen | Sprint 2.1 完成；具备 Prisma、测试、Build 与 Docker Smoke 验收能力 |
| Keyword Repository / Persistence | PASS / Frozen | Repository、Prisma、Migration、Seed 与集成测试已纳入冻结基线 |
| Keyword Service | PASS / Frozen | Sprint 2.2 完成并合并；合并后 CI 全绿 |
| ADR-0007 平台合规与 Adapter | Frozen | 约束合规接入、平台中立和风险隔离 |
| ADR-0008 生产运行架构 | Frozen | 约束云端、Web、后台 Agent、Docker 与 CI/CD 方向 |
| ADR-0009 Buyer Persona Engine | Frozen | 冻结房产客户画像领域方向，不包含实现 |
| Anchor Center | 准备阶段 | Sprint 3.0 独立分支和干净工作区已准备；尚未开发 |
| Content Signal | 未开始 | 计划在后续独立 Sprint 实现 |
| Buyer Persona Engine | 架构已冻结 / 开发未开始 | 仅完成 ADR-0009，未实现算法或服务 |
| Lead Scoring | 未开始 | 等待前置业务链路完成和独立任务书 |
| AI Sales Agent | 未开始 | 等待 Lead 与画像能力完成和独立授权 |
| CRM 集成 | 未开始 | 核心链路末端能力，尚未进入开发 |

## 10. 下一阶段路线

### Sprint 3.0：Anchor Center

建立 Anchor Center 基础领域能力。Anchor 始终是观察节点，不是客户，不是 Lead。本阶段范围以正式 Sprint 3.0 任务书为准。

### Sprint 4.0：Content Signal

建立平台中立的统一内容信号输出，隔离外部数据来源与核心业务模型。

### Sprint 5.0：Buyer Persona Engine

基于 ADR-0009 建立房产客户画像能力，处理证据、维度、置信度、时效和画像快照。

### Sprint 6.0：Lead Scoring

基于合规证据、Content Signal 和客户画像，对可运营线索进行可解释排序。

### Sprint 7.0：AI Sales Agent

在授权的 Lead 和画像范围内提供销售建议、沟通辅助和业务协作能力，并与 CRM 流程衔接。

## 文档边界

本文仅整理当前已确认项目状态，不产生以下授权：

- 修改代码；
- 修改数据库 Schema；
- 修改任何 ADR；
- 创建或合并分支；
- 开始 Anchor Center 或其他模块开发；
- 增加未经确认的新架构；
- 调整既有 Sprint 范围。
