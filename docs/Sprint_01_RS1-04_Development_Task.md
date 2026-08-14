# REPLAN-S1 RS1-04 Development Task

> 文档性质：正式开发任务书候选
> 当前阶段：Task Freeze
> 实施状态：IMPLEMENTATION_ALLOWED = NO
> 生效条件：Chief Architect Review PASS，并由用户另行明确授权实施

## 1. 基础信息

    TASK_ID: RS1-04
    TITLE: Evidence Intake Gate and Deterministic Replay
    BASELINE: b9a66c6001118c0fc34ba2e835b30d7fd6380cc3
    BASE_BRANCH: main
    IMPLEMENTATION_BRANCH: sprint/1-evidence-intake-gate

本任务根据 RS1-03 完成后的架构状态定义下一阶段任务。当前任务只冻结开发边界，不授权创建分支或实施。

## 2. 当前架构状态

当前已有：

- Evidence Intake Contract
- EvidenceCandidate Schema
- AdapterContract
- No-network Reference Adapter
- Fixture Tests

当前不存在：

- Evidence Intake Gate 实现
- Deterministic fingerprint / evidenceId 实现
- Real Platform Adapter
- Network Collector
- Customer Identification
- Lead Scoring
- Business Acquisition Logic

当前链路截止于：

    SourcePayload → Reference Adapter → EvidenceCandidate

## 3. RS1-04 目标

唯一目标：在 packages/shared 实现无状态 Evidence Intake Gate，将 schema-valid EvidenceCandidate 与显式治理、Clock、Policy、DuplicateLookup 输入确定性地判定为 ACCEPTED、REJECTED 或 DUPLICATE，并生成可重复的 Evidence identity。

RS1-04 只扩展工程基础能力，不得直接进入抖音采集、视频号采集、自动登录、客户识别或获客流程。

## 4. 技术目标与接口边界

### 4.1 输入输出

Gate 必须采用以下语义：

    EvidenceIntakeGateInput:
      candidate: unknown
      dataSource: unknown
      policy: unknown

    EvidenceIntakeGateDependencies:
      clock: Clock
      duplicateLookup: DuplicateLookup
      canonicalizationVersion: 1.0.0
      validatorVersion: 1.0.0

    EvidenceIntakeGate.evaluate(input): Promise<GateResult>

要求：

- candidate、dataSource、policy 分别通过现有 runtime schema。
- TypeScript assertion 不得代替 validation。
- Gate 只能依赖注入的 Clock、DuplicateLookup 和显式版本。
- Gate 不读取 wall clock、环境变量或全局状态，不修改输入。
- DuplicateLookup 是唯一允许的异步依赖，只查询 fingerprint，不保存 Evidence。

### 4.2 数据流

    RS1-03 EvidenceCandidate
      → runtime validation
      → governance / purpose / business-space / time validation
      → versioned canonical identity
      → SHA-256 fingerprint + evidenceId
      → DuplicateLookup.has(fingerprint)
         found       → DUPLICATE，不构造第二份 Envelope
         unavailable → REJECTED(DEPENDENCY_UNAVAILABLE)
         absent      → policy freshness → ACCEPTED(EvidenceEnvelope)

### 4.3 与 RS1-03 的关系

- RS1-04 只消费 RS1-03 输出的平台中立 EvidenceCandidate。
- 不修改或调用 Adapter 实现，不读取 Adapter-specific payload。
- 不增加真实 Adapter、Crawler 启动行为或网络入口。
- Candidate 是未接受候选；只有 Gate ACCEPTED 才生成 EvidenceEnvelope。

### 4.4 Determinism Freeze

Canonical fingerprint input 必须按以下固定名称和顺序构造：

1. canonicalizationVersion
2. schemaVersion
3. dataSourceId
4. sourceType
5. sourceRecordId
6. businessSpaceId
7. purposeCode
8. evidenceType
9. NFC + trim 后的 content
10. NFC + trim 后的 provenance.sourceReference，缺失为 JSON null
11. 规范化 HTTP/HTTPS referenceUrl，缺失为 JSON null
12. UTC ISO-8601 毫秒 occurredAt，未知为 JSON null
13. UTC ISO-8601 毫秒 observedAt

算法冻结：

    canonicalBytes = UTF8(explicit fixed-order canonical JSON)
    fingerprint = lowercase_hex(SHA-256(canonicalBytes))
    evidenceId = ev1_ + fingerprint

实现不得依赖普通对象遍历顺序；必须显式序列化有限字段，并用 golden vector 固定 canonical bytes 与 hash。

fingerprint 明确排除 validatedAt、acquiredAt、Adapter metadata、validatorVersion、traceId、freshness、eligibility、redaction status、DuplicateLookup 结果、wall clock、随机值、本地时区与机器信息。

### 4.5 Governance、时间与 freshness

- dataSource.governanceStatus 必须为 ACTIVE。
- Candidate purposeCode 必须位于 allowedPurposeCodes。
- Candidate 与 descriptor 的 dataSourceId、sourceType、businessSpaceId 必须一致。
- occurredAt 非 null 时必须 occurredAt <= observedAt。
- observedAt <= acquiredAt + maxFutureClockSkew。
- acquiredAt <= clock.now() + maxFutureClockSkew。
- freshnessBasis = occurredAt ?? observedAt。
- age == threshold 为 FRESH；age > threshold 为 STALE。
- 缺少对应 evidence type threshold 时为 UNKNOWN。
- FRESH → ACCEPTED + ELIGIBLE。
- STALE → ACCEPTED + INELIGIBLE。
- UNKNOWN → ACCEPTED + INELIGIBLE。
- STALE 不是事实错误，也不是 validation rejection。

### 4.6 DuplicateLookup 边界

- Gate 无状态，不保留跨调用 mutable state。
- found=true 返回 DUPLICATE，不生成第二份 accepted Evidence。
- found=false 才可构造 Envelope。
- UNAVAILABLE 或 port throw 映射为 REJECTED(DEPENDENCY_UNAVAILABLE)，不得按未重复继续。
- 测试可显式构造 deterministic in-memory lookup；禁止生产 persistence adapter、module-level set 或 singleton。

## 5. Exact Allowlist

实施阶段精确允许以下 7 个文件，不得出现第 8 个文件：

ALLOWLIST:

- file: packages/shared/src/evidence-intake/index.ts
  reason: 导出 RS1-04 canonicalization 与 Gate 公共边界。
- file: packages/shared/src/evidence-intake/canonicalization.ts
  reason: 实现固定字段 canonical bytes、SHA-256 fingerprint 与 evidenceId。
- file: packages/shared/src/evidence-intake/evidence-intake-gate.ts
  reason: 实现无状态 runtime validation、governance、time、duplicate 与 freshness 编排。
- file: packages/shared/tests/evidence-intake-gate.test.ts
  reason: 覆盖 Gate、negative、boundary、duplicate 与 replay。
- file: packages/shared/tests/fixtures/evidence-intake/candidate.json
  reason: 固定 schema-valid Candidate 与 canonical golden input。
- file: packages/shared/tests/fixtures/evidence-intake/data-source.json
  reason: 固定 ACTIVE DataSourceDescriptor 与治理测试基础。
- file: packages/shared/tests/fixtures/evidence-intake/policy.json
  reason: 固定测试专用 freshness/clock-skew policy，不代表生产阈值。

授权新增目录仅为 packages/shared/tests/fixtures/evidence-intake/。目录授权不是通配授权，只允许上述 3 个 JSON 文件。

## 6. Protected Files

除 Exact Allowlist 外，所有文件均受保护。特别禁止修改：

- package.json 与任何 workspace package.json
- bun.lock
- .github/workflows/**
- packages/shared/src/evidence-intake/contracts.ts
- packages/shared/src/evidence-intake/schemas.ts
- packages/shared/src/index.ts
- apps/crawler/**，包括 RS1-03 Adapter 与 fixtures
- apps/web/**
- packages/database/**
- Prisma schema、Migration、Seed
- Dockerfile、docker-compose*.yml、docker-compose*.yaml
- deployment / infrastructure 文件
- scripts/**
- docs/context/**
- 其他 Sprint task、delivery 或 governance 文件

若现有 contract 无法在零修改下支持本任务，立即 BLOCKED_CONTRACT_CHANGE_REQUIRED，不得自行扩大 allowlist。

## 7. 测试要求

### 7.1 TDD 顺序

1. 先创建 fixtures 与 evidence-intake-gate.test.ts。
2. 运行测试，确认因 Gate/canonicalization 模块缺失而 RED。
3. 实现最小 canonicalization。
4. 实现最小 Gate。
5. 运行完整验证直至 GREEN；不得削弱测试或错误传播。

### 7.2 必测目标

- valid Candidate + ACTIVE descriptor + allowed purpose → ACCEPTED。
- descriptor identity、source type、business space、purpose 不匹配的稳定错误映射。
- missing required field 与允许的 UNKNOWN 明确区分。
- invalid time order 与 clock skew 返回稳定错误码，不修改输入时间。
- FRESH、STALE、UNKNOWN 的 acceptance/eligibility 映射。
- fixed Clock 决定 validatedAt，但不影响 fingerprint/evidenceId。
- canonical bytes 与 SHA-256 golden vector 精确匹配。
- 相同事实、不同 Clock/acquiredAt/lookup state 的 identity 一致。
- 相同全部决策输入重复执行时完整 GateResult 深度相等。
- freshness threshold 两侧 identity 不变，freshness/eligibility 正确转换。
- empty lookup 接受；预置 fingerprint 返回 DUPLICATE；unavailable/throw 返回 DEPENDENCY_UNAVAILABLE。
- duplicate 不生成第二份 Envelope。
- 输入 Candidate、descriptor、policy 不被修改。
- 输出不包含 Signal、Intent、Persona、Customer、Lead 或 Scoring 字段。

### 7.3 验收命令

    $bun = C:\Users\dell\.bun\bin\bun.exe
    & $bun test packages/shared/tests/evidence-intake-gate.test.ts
    & $bun --filter '@re-agent/shared' lint
    & $bun --filter '@re-agent/shared' typecheck
    & $bun run architecture:check
    & $bun x prettier --check packages/shared/src/evidence-intake/index.ts packages/shared/src/evidence-intake/canonicalization.ts packages/shared/src/evidence-intake/evidence-intake-gate.ts packages/shared/tests/evidence-intake-gate.test.ts packages/shared/tests/fixtures/evidence-intake/candidate.json packages/shared/tests/fixtures/evidence-intake/data-source.json packages/shared/tests/fixtures/evidence-intake/policy.json
    git diff --check
    git status --short --untracked-files=all
    git diff --name-status

实际执行时使用上方 Bun 绝对路径。禁止 root build、Prisma、DB、Docker 或网络验证。

### 7.4 PASS 标准

- Gate tests 0 fail、0 skipped、0 todo、exit 0。
- shared lint/typecheck、architecture、定点 Prettier、git diff --check 全部 exit 0。
- Git 状态精确只有 7 个 allowlisted files。
- Protected files 零 diff。
- 静态 import/call audit不存在受禁依赖或副作用。

## 8. 禁止范围

严格禁止：

- 网络请求、HTTP client、WebSocket、DNS
- Playwright、浏览器自动化
- Cookie、session、token、自动登录
- 抖音、视频号、小红书或其他真实平台接口
- Database read/write、Prisma、Migration、Seed
- PostgreSQL、Redis、文件持久化
- Docker CLI/runtime/container
- Real Platform Adapter、Network Collector、Crawler runtime
- Lead、Persona、Customer Profile、Customer Identification、Scoring
- Signal、Intent、Classification、Prospect Pool、CRM、获客业务流程
- 随机或时间依赖 fingerprint
- 硬编码生产 freshness 阈值
- 隐藏全局 duplicate state
- continue-on-error、|| true、set +e 或其他伪成功逻辑
- 新增第三方 dependency、npm install、bun add

允许使用现有运行时的本地 SHA-256 能力；不得修改 dependency manifest 或 lockfile。

## 9. Commit Boundary

本任务书不授权 Commit。只有 Implementation Review PASS 与 Commit 前范围门禁 PASS 后，后续独立指令才可：

- 精确 stage 7 个 allowlisted files；
- 创建一次且仅一次 Commit；
- 不包含 task 文档、artifact、generated output 或范围外文件。

建议 Conventional Commit message：

    feat(shared): add deterministic evidence intake gate

Push、PR、Merge 均需分别授权。

## 10. Acceptance Criteria

全部满足才可声明 RS1_04_IMPLEMENTATION_COMPLETE_PENDING_REVIEW：

1. 实施基于 main@b9a66c6001118c0fc34ba2e835b30d7fd6380cc3 和指定 branch。
2. 修改范围精确为 7 文件 allowlist，无第 8 个文件。
3. Protected files、manifest、lockfile、workflow、database、Docker、deployment 零 diff。
4. Gate 是无状态、无网络、无 persistence 的显式 dependency orchestration。
5. 输入全部经过现有 runtime schemas，无 assertion 替代 validation。
6. Governance、purpose、space、source、time、version 规则均有 negative/boundary tests。
7. Canonical bytes、fingerprint、evidenceId 符合 Determinism Freeze 并通过 golden vector。
8. fingerprint 不依赖 wall clock、随机数、本地时区或排除字段。
9. DuplicateLookup absent/found/unavailable/throw 全部分支通过，无隐藏状态。
10. FRESH/STALE/UNKNOWN 与 eligibility 映射符合 policy，STALE 不被拒绝为事实错误。
11. Identity replay、decision replay、freshness transition 全部 PASS。
12. tests、lint、typecheck、architecture、Prettier、diff checks 全部 exit 0。
13. 无 Network、Playwright、Cookie、Login、DB、Redis、Docker、真实平台、Lead/Persona/Customer/Scoring 可达调用链。
14. 未 Commit、未 Push、未创建 PR；实施报告形成并等待独立审核。

## 11. 最终冻结状态

    TASK_ID = RS1-04
    BASELINE = b9a66c6001118c0fc34ba2e835b30d7fd6380cc3
    UNIQUE_GOAL = EVIDENCE_INTAKE_GATE_AND_DETERMINISTIC_REPLAY
    EXACT_ALLOWLIST_FROZEN = YES
    AUTHORIZED_FILE_COUNT = 7
    PROTECTED_FILES_FROZEN = YES
    IMPLEMENTATION_STARTED = NO
    IMPLEMENTATION_ALLOWED = NO
    READY_FOR_CHIEF_ARCHITECT_REVIEW = YES
