# REPLAN-S1 RS1-06 Development Task

> 文档性质：正式开发冻结任务书候选
> 当前阶段：Task Freeze
> 实施状态：IMPLEMENTATION_ALLOWED = NO
> 生效条件：Chief Architect Review PASS，并由用户另行明确授权实施

## 1. 基础信息

    TASK_ID: RS1-06
    TITLE: Deterministic Evidence Signal Layer
    BASELINE: 71ce4667fd42e77638f85c820a7157697e64b398
    BASE_BRANCH: main
    IMPLEMENTATION_BRANCH: sprint/1-evidence-signal-layer

本任务书只冻结 RS1-06 的工程目标、数据语义和实施边界，不授权创建开发分支、修改代码、Commit、Push 或创建 PR。

## 2. 当前架构状态

当前 REPLAN-S1 已经具备：

- 平台中立的 EvidenceCandidate 与 EvidenceEnvelope contract；
- AdapterContract 与无网络 Reference Adapter；
- 无状态 Evidence Intake Gate；
- 确定性 canonicalization、SHA-256 fingerprint 与 evidenceId；
- DuplicateLookup port 与 freshness/realtime eligibility 判定；
- replay determinism tests；
- Evidence/Adapter 静态依赖与副作用边界 Auditor。

当前可信链路截止于：

    SourcePayload
      → Reference Adapter
      → EvidenceCandidate
      → Evidence Intake Gate
      → accepted EvidenceEnvelope

当前仍未实现：

- 真实平台采集、抖音/视频号/小红书采集；
- 自动登录、Cookie/session 管理或浏览器自动化；
- 用户账号发现与跨 Evidence 身份拼接；
- Customer、Lead、User Profile、Persona；
- Ranking、Scoring、Prospect Pool、CRM；
- 自动触达或营销自动化。

仓库中的 LEGACY domain 类型不构成 REPLAN-S1 当前完成证据，也不得作为 RS1-06 的隐式实现依赖。

## 3. 为什么现在进入 Signal Layer

RE-Agent 的核心链路不是“爬取更多数据”，而是：

    Evidence → Understanding → Action

RS1-02 至 RS1-05 已经建立了可验证 Evidence 的接入、身份、确定性和副作用边界。下一项最小工程缺口是：如何把已接受的事实材料转换为仍然可回溯、可重放、可验证的信息抽象。

因此 RS1-06 正式引入 Signal Layer，推进范围仅为：

    Evidence → Understanding

Signal 是 Evidence 的确定性、规则可解释抽象，不是客户结论，不是行动指令，也不是概率预测。它必须保留到唯一 Evidence 与唯一规则的追溯关系。

## 4. 为什么不能直接做客户识别

单份 Evidence 只能证明其中实际出现或记录的内容。将其直接提升为“某个人是客户”“某人值得触达”需要身份解析、跨来源拼接、归因、置信度、治理授权和业务决策策略；这些能力当前均未冻结。

跳过 Signal Layer 会把事实、解释和业务行动混在一个不可审计步骤中，并可能产生：

- 把显式文本误写成客户身份；
- 把行为记录误写成购买意愿；
- 无法从结论回溯 Evidence 与规则；
- 隐含评分、画像或营销偏见；
- 在没有数据治理边界时进行跨来源身份拼接。

因此 RS1-06 明确禁止 Customer Identification。任何 Customer、Lead、Profile、Ranking、Scoring 或 Marketing 输出均为范围越界。

## 5. RS1-06 唯一目标

唯一目标：

> 在 `packages/shared` 建立平台中立、确定性、无副作用的 Evidence Signal contract 与 projector，把一个 runtime-valid、已 ACCEPTED 的 EvidenceEnvelope，依据显式传入且版本化的文字匹配规则，转换为零个或多个可追溯 EvidenceSignal。

RS1-06 不使用 LLM、机器学习、模糊分类或外部服务。没有明确规则命中时必须输出 NO_SIGNAL，不得猜测。

## 6. 输入、输出与数据流

### 6.1 输入

Projector 输入必须为 unknown 边界，并在运行时验证：

    EvidenceSignalProjectionInput {
      evidence: unknown
      ruleSet: unknown
    }

其中：

- evidence 必须通过现有 EvidenceEnvelope runtime schema；
- evidence.validationStatus 必须为 ACCEPTED；
- ruleSet 必须通过新增 EvidenceSignalRuleSet runtime schema；
- EvidenceCandidate、SourcePayload 或未接受 GateResult 不得直接投影 Signal。

### 6.2 输出

    EvidenceSignalProjectionResult =
      | DERIVED {
          signals: readonly EvidenceSignal[]
        }
      | NO_SIGNAL {
          signals: readonly []
        }
      | REJECTED {
          code: EvidenceSignalErrorCode
          field: string
        }

稳定错误码：

- MISSING_REQUIRED_FIELD
- INVALID_INPUT
- VERSION_MISMATCH
- DUPLICATE_RULE_ID

失败必须显式返回 REJECTED，不得吞掉 validation error，不得返回伪空结果。

### 6.3 数据流

    accepted EvidenceEnvelope
      → runtime validation
      → versioned rule-set validation
      → deterministic normalization
      → explicit literal rule matching
      → versioned signal canonical bytes
      → SHA-256 signalId
      → stable sort
      → DERIVED | NO_SIGNAL

Projector 必须是同步纯函数，不读取 wall clock、环境变量、网络、数据库、文件或全局状态。

## 7. Signal 数据模型边界

### 7.1 Controlled vocabulary

RS1-06 只允许以下 signalType：

- TOPIC_MENTION：Evidence 明确出现规则指定主题文字；
- EXPRESSED_INTENT：Evidence 明确出现规则指定意愿表达，不代表购买概率；
- OBSERVED_BEHAVIOR：Evidence 明确记录规则指定行为，不推断行为主体是客户；
- OBSERVED_ENGAGEMENT：Evidence 明确记录规则指定互动，不推断关系强度或价值。

禁止使用宽泛 `INTENT` 表示隐含意图。`EXPRESSED_INTENT` 只能由 Evidence 中实际存在的显式文字产生。

### 7.2 EvidenceSignal

冻结 shape：

    EvidenceSignal {
      schemaVersion: "1.0.0"
      signalId: "sig1_" + lowercase SHA-256 hex
      signalCanonicalizationVersion: "1.0.0"
      signalType:
        | "TOPIC_MENTION"
        | "EXPRESSED_INTENT"
        | "OBSERVED_BEHAVIOR"
        | "OBSERVED_ENGAGEMENT"
      value: string
      sourceEvidenceId: EvidenceEnvelope.evidenceId
      sourceFingerprint: EvidenceEnvelope.fingerprint
      ruleId: string
      ruleVersion: "1.0.0"
    }

要求：

- 输出为 immutable/readonly；
- 每个 Signal 只指向一份 accepted Evidence 和一条命中规则；
- 不包含 personId、customerId、leadId、profileId；
- 不包含 confidence、probability、rank、score、priority；
- 不包含 action、channel、campaign 或 outreach 指令；
- 不包含 derivedAt/createdAt，避免 wall clock 污染 replay；
- 不复制 Evidence 全文或 sourceMetadata。

### 7.3 Rule Set

冻结最小规则模型：

    EvidenceSignalRuleSet {
      ruleSetVersion: "1.0.0"
      rules: readonly EvidenceSignalRule[]
    }

    EvidenceSignalRule {
      ruleId: string
      ruleVersion: "1.0.0"
      signalType: controlled vocabulary
      applicableEvidenceTypes: readonly EvidenceType[]
      matcher: {
        operator: "CONTAINS_NORMALIZED_TEXT"
        value: string
      }
    }

约束：

- ruleId 在一个 rule set 内必须唯一；
- matcher.value 经过 normalization 后不得为空；
- 不允许 regex、脚本、回调、动态 import 或任意代码执行；
- Signal.value 必须等于规范化后的 matcher.value，不允许规则注入额外画像或结论；
- rule set 是显式函数输入，不从环境变量、文件、数据库或远程配置读取；
- 本任务不定义生产业务规则库，只用测试内最小规则验证 contract。

## 8. Determinism Freeze

### 8.1 文字 normalization

匹配双方使用相同固定顺序：

1. Unicode NFC；
2. trim；
3. 连续 Unicode whitespace 折叠为单个 ASCII space；
4. ECMAScript `toLowerCase()`；
5. 使用规范化后的 literal substring match。

不得使用本地 locale、正则规则配置、模糊匹配、分词器、模型或网络服务。

### 8.2 Signal identity

signal canonical fingerprint input 必须按以下固定名称与顺序构造：

1. signalCanonicalizationVersion
2. schemaVersion
3. sourceEvidenceId
4. sourceFingerprint
5. ruleId
6. ruleVersion
7. signalType
8. value

算法冻结：

    canonicalBytes = UTF8(explicit fixed-order canonical JSON)
    signalHash = lowercase_hex(SHA-256(canonicalBytes))
    signalId = sig1_ + signalHash

不得依赖普通对象遍历顺序。signalId 不得包含 validatedAt、wall clock、随机数、本地时区、机器信息、数组输入顺序或运行次数。

### 8.3 Stable output

- rules 按任意输入顺序提供时，结果必须一致；
- 多个 Signal 按 signalId 升序输出；
- 完全相同输入的完整 result 必须 byte-for-byte 相同；
- 同一 ruleId 重复必须 REJECTED(DUPLICATE_RULE_ID)，不得静默覆盖；
- 同一 Evidence 与同一规则最多生成一个 Signal。

## 9. 与 RS1-04 / RS1-05 的接口关系

- RS1-04 是唯一 Evidence acceptance 边界；RS1-06 只消费其 accepted EvidenceEnvelope。
- RS1-06 不重新计算或修改 evidenceId/fingerprint/freshness/eligibility。
- STALE 或 INELIGIBLE Evidence 仍是 accepted Evidence；Signal projector 只表达可验证抽象，不赋予 realtime action eligibility。
- RS1-05 Auditor 继续证明 Evidence Intake 与 Adapter 不反向依赖 Signal、Customer 或副作用层。
- Signal Layer 可以依赖 Evidence contract；Evidence Intake 不得依赖 Signal Layer。
- RS1-06 不修改 RS1-05 Auditor，也不得通过排除规则隐藏新的边界问题。

## 10. Exact Allowlist

实施阶段精确允许以下 7 个文件，不得出现第 8 个文件：

ALLOWLIST:

- file: packages/shared/src/index.ts
  reason: 增加 `./evidence-signal` 公共 barrel export。

- file: packages/shared/src/evidence-signal/index.ts
  reason: 只导出 Signal contracts、schemas 与 projector。

- file: packages/shared/src/evidence-signal/contracts.ts
  reason: 定义 controlled vocabularies、stable error codes 与 projection result contract。

- file: packages/shared/src/evidence-signal/schemas.ts
  reason: 使用现有 Zod 定义 EvidenceSignal 与 EvidenceSignalRuleSet runtime schemas，并通过 `z.infer` 导出类型。

- file: packages/shared/src/evidence-signal/evidence-to-signal.ts
  reason: 实现纯函数 normalization、literal matching、canonical bytes、SHA-256 signalId 与稳定排序。

- file: packages/shared/tests/evidence-signal-contract.test.ts
  reason: 验证 runtime contract、required/missing、enum、version、immutability 与禁止字段边界。

- file: packages/shared/tests/evidence-to-signal.test.ts
  reason: 验证显式匹配、NO_SIGNAL、negative、deterministic、replay、identity 与输入不变性。

授权新增目录仅为 `packages/shared/src/evidence-signal/`。目录授权不是通配授权，只允许上述 4 个新文件。

测试数据必须在测试文件中以最小 immutable fixture 构造，不授权新增持久 fixture 文件。

## 11. Protected Files

除第 10 章 Exact Allowlist 外，所有文件均受保护。特别禁止修改：

- package.json 与任何 workspace package.json；
- bun.lock；
- `.github/workflows/**`；
- `packages/shared/src/evidence-intake/**`；
- `packages/shared/src/domain/**` 与所有 LEGACY Signal/Lead/Persona 文件；
- `apps/crawler/**`；
- `apps/web/**`；
- `workers/**`；
- `packages/database/**`；
- Prisma schema、Migration、Seed；
- Dockerfile、docker-compose 与 deployment/infrastructure；
- `scripts/replan-s0/**`、`scripts/replan-s1/**`；
- `docs/context/**`、其他 task/delivery/governance 文件。

若实现需要新增 dependency、修改现有 Evidence contract、修改 Auditor 或增加第 8 个文件，必须立即返回 BLOCKED_SCOPE_EXPANSION_REQUIRED，不得自行扩大范围。

## 12. 测试要求

### 12.1 TDD 顺序

1. 先创建两份测试，引用尚不存在的 Evidence Signal API；
2. 执行定点测试并确认因模块/API 缺失而 RED；
3. 实现最小 contracts 与 schemas；
4. 实现最小 deterministic projector；
5. 运行完整验证直至 GREEN，不得削弱断言或失败传播。

### 12.2 Contract tests

必须覆盖：

- valid EvidenceSignal 与 rule set；
- missing required field 与 invalid input 的区别；
- invalid schema/rule/canonicalization version；
- invalid signalType、EvidenceType、signalId 与 fingerprint；
- duplicate ruleId；
- empty/whitespace matcher value；
- strict schema 拒绝 customerId、leadId、confidence、score 与 action 字段；
- runtime parsing 产生 readonly contract，输入对象不被修改。

### 12.3 Projection tests

必须覆盖：

- accepted Evidence + matching topic rule → TOPIC_MENTION；
- 明确意愿文字 + matching rule → EXPRESSED_INTENT；
- behavior 与 engagement 只能在 literal rule 命中时产生；
- non-matching rules → NO_SIGNAL；
- EvidenceType 不适用 → NO_SIGNAL；
- Candidate 或 malformed Envelope → REJECTED；
- duplicate ruleId → REJECTED(DUPLICATE_RULE_ID)；
- normalization 的 NFC、trim、whitespace 与 case 边界；
- golden canonical bytes、SHA-256 hash 与 sig1_ identity；
- rule 输入顺序不同，完整 result byte-for-byte 相同；
- 相同输入重复投影，完整 result byte-for-byte 相同；
- Evidence validatedAt 改变但 identity facts 与规则相同时，Signal identity 不变；
- 输入 Evidence 与 rule set 不被修改；
- 输出不包含 Customer、Lead、Profile、Persona、Ranking、Scoring 或 Marketing 字段。

### 12.4 Architecture/negative tests

必须静态确认新增生产模块不可达：

- network、fetch、WebSocket、Playwright；
- Prisma、Database、PostgreSQL、Redis；
- filesystem persistence；
- Docker runtime；
- Customer、Lead、Profile、Persona、Ranking、Scoring、CRM；
- wall clock、random、global mutable cache；
- dynamic import、eval 或 Function constructor。

### 12.5 验收命令

    $bun = 'C:\Users\dell\.bun\bin\bun.exe'

    & $bun test packages/shared/tests/evidence-signal-contract.test.ts packages/shared/tests/evidence-to-signal.test.ts
    & $bun --filter '@re-agent/shared' lint
    & $bun --filter '@re-agent/shared' typecheck
    & $bun scripts/replan-s1/check-evidence-boundary.ts
    & $bun run architecture:check
    & $bun x prettier --check packages/shared/src/index.ts packages/shared/src/evidence-signal/index.ts packages/shared/src/evidence-signal/contracts.ts packages/shared/src/evidence-signal/schemas.ts packages/shared/src/evidence-signal/evidence-to-signal.ts packages/shared/tests/evidence-signal-contract.test.ts packages/shared/tests/evidence-to-signal.test.ts
    git diff --check
    git status --short --untracked-files=all
    git diff --name-status

实际执行必须使用上述 Bun 1.2.15 绝对路径。禁止 root build、Prisma、Database、Redis、Docker、network 或真实平台测试。

### 12.6 PASS 标准

- 两份定点测试 0 fail、0 skipped、0 todo、exit 0；
- shared lint/typecheck、RS1-05 Auditor、architecture、Prettier 与 diff check 全部 exit 0；
- Git 状态精确只有 7 个 allowlisted files；
- Protected files 零 diff；
- replay 与不同 rule order 的完整结果 byte-for-byte 相同；
- 所有 rejection 与 negative tests 真实阻断，不使用伪 PASS。

## 13. 禁止范围

严格禁止：

- 真实平台 Adapter、Crawler、网络采集；
- HTTP、WebSocket、DNS、Playwright、Cookie、session、login；
- LLM、embedding、机器学习、模糊分类或外部推理服务；
- Customer、Lead、User Profile、Persona、Ranking、Scoring；
- 身份拼接、跨 Evidence 聚合、用户归因；
- Prospect Pool、CRM、Marketing、outreach、action recommendation；
- confidence/probability/value score；
- Database、Prisma、Migration、Seed、PostgreSQL、Redis；
- filesystem persistence、Docker runtime/container；
- wall clock、random、global mutable state；
- 生产 Signal rule catalog 或运营阈值配置；
- 新增 dependency、npm install、bun add；
- continue-on-error、`|| true`、`set +e` 或错误吞掉。

## 14. Acceptance Criteria

全部满足才可声明 `RS1_06_IMPLEMENTATION_COMPLETE_PENDING_REVIEW`：

1. 实施基于 `main@71ce4667fd42e77638f85c820a7157697e64b398` 与指定 branch。
2. 修改范围精确为 7 文件 allowlist，无第 8 个文件。
3. package、lockfile、workflow、Evidence Intake、LEGACY domain、database、Docker 与其他 protected files 零 diff。
4. Projector 只接受 runtime-valid accepted EvidenceEnvelope 与显式 versioned rule set。
5. Signal contract 严格符合第 7 章 shape，且不含客户、评分或行动字段。
6. Signal 只能由 literal normalized text match 产生；没有命中时返回 NO_SIGNAL。
7. EXPRESSED_INTENT 仅表示 Evidence 中明确表达的文字，不表示购买概率或客户资格。
8. canonical bytes、SHA-256 与 signalId 符合第 8 章并通过 golden vector。
9. replay、rule order 与多次运行结果 deterministic；无 wall clock、random 或机器信息。
10. 每个 Signal 可追溯到唯一 Evidence identity 与唯一 rule identity。
11. 输入不被修改，输出稳定排序且 immutable。
12. tests、lint、typecheck、RS1-05 Auditor、architecture、Prettier 与 git diff checks 全部 exit 0。
13. 无 Network、Playwright、DB、Redis、Docker、真实平台、Customer、Lead、Profile、Ranking、Scoring 或 Marketing 可达调用链。
14. 未 Commit、未 Push、未创建 PR；实施结果等待独立 Review。

## 15. Commit Boundary

本任务书不授权 Commit。只有 Implementation Review PASS 与 Commit 前门禁 PASS 后，后续独立授权才可：

- 精确 stage 第 10 章 7 个 allowlisted files；
- 创建一次且仅一次 Commit；
- Commit 不包含 task 文档、artifact、generated output 或范围外文件。

建议 Conventional Commit message：

    feat(shared): add deterministic evidence signal layer

Push、PR 与 Merge 必须分别获得独立授权。

## 16. 最终冻结状态

    TASK_ID = RS1-06
    BASELINE = 71ce4667fd42e77638f85c820a7157697e64b398
    UNIQUE_GOAL = DETERMINISTIC_EVIDENCE_SIGNAL_LAYER
    ACTIVE_FLOW = EVIDENCE_TO_UNDERSTANDING
    ACTION_LAYER_STARTED = NO
    CUSTOMER_IDENTIFICATION_STARTED = NO
    EXACT_ALLOWLIST_FROZEN = YES
    AUTHORIZED_FILE_COUNT = 7
    PROTECTED_FILES_FROZEN = YES
    IMPLEMENTATION_STARTED = NO
    IMPLEMENTATION_ALLOWED = NO
    READY_FOR_CHIEF_ARCHITECT_REVIEW = YES
