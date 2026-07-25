# ADR 0007: Data Acquisition Compliance and Platform Adapter Strategy

**状态：** Proposed
**日期：** 2026-07-25
**项目：** RE-Agent V1.0

## 背景

RE-Agent 不是单一平台爬虫，而是房地产购房意向发现系统。

未来可能接入：

- 抖音
- 视频号
- 小红书
- 百度贴吧
- 房产论坛
- 人工导入
- 合作数据接口

不同平台存在访问限制、接口限制、登录限制和数据结构变化风险。因此系统不能绑定单个平台。

## 决策

采用 Data Acquisition Abstraction Layer（数据采集抽象层）。

业务领域层不感知具体平台。所有来源统一转换为 **Content Signal**，而不是 Douyin Data / XHS Data / WeChat Data。

架构流水线：

```text
Platform Adapter
↓
Acquisition Layer
↓
Content Signal
↓
Intent Analysis
↓
Lead
```

平台适配原则：每个平台独立 Adapter——DouyinAdapter、XHSAdapter、WeChatVideoAdapter、ForumAdapter、ManualImportAdapter。平台规则变化时，只替换 Adapter，不影响 Keyword、Signal、Lead 与 CRM 流程。

## 决策论证（四个"为什么"）

### 为什么不做单平台爬虫

不同平台存在访问限制、接口限制、登录限制和数据结构变化风险。若以单一平台（例如抖音）的字段结构作为系统数据基础，平台规则或数据结构一旦变化，风险会穿透至领域模型与数据模型，波及 Keyword、Signal、Lead 与 CRM 全部下游流程。同时，单一平台作为唯一数据来源在合规与业务连续性上均不可接受——RE-Agent 的定位是购房意向发现系统，而非某平台的数据抓取工具。

### 为什么采用 Adapter

平台差异是不可消除的外部事实，只能被隔离，不能被忽略。Adapter 模式将每个平台的访问与数据结构差异封装在独立的适配器内（DouyinAdapter、XHSAdapter、WeChatVideoAdapter、ForumAdapter、ManualImportAdapter），对上只输出统一的 Content Signal。这样平台规则变化时的应对动作被收敛为"只替换对应 Adapter"，系统其余部分无需变更，也为人工导入、合作数据接口等非抓取来源保留了同等的接入位置。

### 为什么平台风险隔离

平台的访问限制、接口限制与登录限制意味着每个平台的可用性、合规风险和数据稳定性各不相同，且会独立变化。若风险不隔离，单一平台的封禁、限流或结构变更会拖垮整条采集链路。因此平台风险按平台维度独立建模与处置（见 Platform Risk Model：ACTIVE / LOW_RISK / WARNING / PAUSED 风险等级与自动降频、暂停策略），单个平台进入 WARNING 或 PAUSED 只影响其自身 Adapter 与对应观察活动，不影响其他平台，也不影响 Content Signal 之后的业务链路。

### 为什么业务层不依赖平台字段

业务领域层不感知具体平台。所有来源统一转换为 Content Signal，业务层（Keyword、Signal、Lead、CRM）只面向平台中立的数据结构工作。平台差异只允许存在于两处受控位置：Adapter 实现内部，以及 PlatformIdentity 中的受控枚举（PlatformType）与 opaque 平台标识——业务层只保存与传递该标识，不解析其平台专有内容。若允许平台字段渗入业务层，数据库设计将被绑定到具体平台字段，等价于把单平台爬虫的风险重新引入系统，直接违反本决策。

## 放弃方案

1. **单平台直连爬虫（以抖音字段为系统数据基础）**：放弃。平台规则与数据结构变化风险直接穿透至领域模型与数据模型；违反"单一平台不得作为唯一数据来源"的合规底线。
2. **业务层直接消费平台原始数据（Douyin Data / XHS Data / WeChat Data）**：放弃。业务逻辑将与平台字段耦合，平台变化需修改 Keyword、Signal、Lead 与 CRM 全部下游模块，丧失可替换性。
3. **统一采集器内嵌多平台分支**：放弃。平台差异散落在同一采集代码的各处条件分支中，变更一个平台需回归全部平台，无法做到"只替换 Adapter"的隔离粒度。
4. **假设平台永久开放数据、按高频批量采集设计**：放弃。与平台访问/接口/登录限制的现实相矛盾，且构成合规风险。

## 禁止事项

- 将业务逻辑写入平台采集代码；
- 将数据库设计绑定平台字段；
- 假设平台永久开放数据；
- 单一平台作为唯一数据来源。

## V1 范围

实现：

- 数据来源抽象接口；
- Content Signal 标准模型；
- Adapter 扩展能力。

暂不承诺：

- 全自动抓取所有平台；
- 绕过平台限制；
- 高频批量采集。

## 影响

- **对领域模型**：Anchor（观察锚点，被系统长期观察的市场信息节点，不是采集结果）与 PlatformAccount 的领域建模必须保持平台中立；平台差异只允许出现在 Adapter 与 PlatformIdentity 的受控枚举（PlatformType）/opaque 标识中。Anchor ≠ Lead，平台账号不得等同于客户线索。
- **对数据模型**：Anchor、PlatformAccount、ObservationRecord、PlatformRisk 各表不得包含平台专有字段，以支持多平台并存、账号迁移与平台级风险暂停。
- **对既有架构**：不影响 Keyword 架构（ADR-0005 / ADR-0006）。Anchor/Content Signal 只能引用 Keyword 或其命中事实，不得复制或修改 Keyword 主数据；分层仍遵守 Service / Repository Standard（Route → Service → Repository → Prisma → PostgreSQL）。
- **对后续 Sprint**：本 ADR 为纯决策记录，不授权任何采集实现。抖音接入、浏览器自动化、批量搜索、评论抓取、AI 识别、Lead 生成、CRM 与自动触达均不在本决策范围内，须待后续 Sprint 任务书另行授权。

## 状态

等待 Chief Architect 审核。通过后纳入 RE-Agent 架构冻结规范。
