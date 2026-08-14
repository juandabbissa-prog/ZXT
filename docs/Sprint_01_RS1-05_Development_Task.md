# REPLAN-S1 RS1-05 Development Task

> 文档性质：正式开发任务书候选
> 当前阶段：Task Freeze
> 实施状态：IMPLEMENTATION_ALLOWED = NO
> 生效条件：Chief Architect Review PASS，并由用户另行明确授权实施

## 1. 基础信息

    TASK_ID: RS1-05
    TITLE: Evidence Boundary Architecture and Side-Effect Gate
    BASELINE: 4b6cbcb005b25e6df0e960ef9396c7644f7cc7df
    BASE_BRANCH: main
    IMPLEMENTATION_BRANCH: sprint/1-evidence-boundary-gate

本任务书只冻结 RS1-05 开发范围，不授权创建分支、修改工程文件或实施。

## 2. 当前系统状态

当前已经具备：

- EvidenceCandidate
- Evidence Intake Contract
- AdapterContract
- No-network Reference Adapter
- Evidence Intake Gate
- Deterministic Canonicalization
- SHA-256 evidence identity
- Duplicate Lookup Boundary
- Freshness Evaluation
- Replay Determinism Tests

当前仍未实现：

- 真实平台采集
- 抖音采集
- 视频号采集
- 小红书采集
- 自动登录
- Cookie 管理
- 客户识别
- 客户画像
- 线索评分
- 自动触达

## 3. RS1-05 定位

RS1-05 继续建设 Evidence 基础能力，其职责是证明 RS1-03 Adapter 与 RS1-04 Evidence Intake Gate 的静态可达边界不包含受禁依赖或下游业务推断。

RS1-05 不是获客功能开发，不生成新的业务实体，不改变 Evidence 语义，不进入：

- 平台爬虫
- 用户搜索
- 客户判断
- 营销自动化

V1.2 已冻结 RS1-05 为 Architecture 与副作用门禁；因此本任务不得重新解释为 Evidence → Signal、Customer、Lead 或 Ranking 转换。

## 4. 唯一工程目标

唯一目标：

> 实现一个确定性、只读、无副作用的 Evidence Boundary Architecture Auditor，对现有 EvidenceCandidate、EvidenceEnvelope、identity 与 Adapter/Gate 静态调用边界执行 allowlist-based import/call audit，并返回稳定 PASS/FAIL 结果。

### 4.1 输入

审计输入不是新的业务 payload。输入严格为：

- RS1-03 Adapter 入口模块和其静态依赖图；
- RS1-04 Evidence Intake 入口模块和其静态依赖图；
- 已有 EvidenceCandidate、EvidenceEnvelope、ValidationResult/GateResult 与 identity contract；
- 显式传入的 repository root，仅用于只读解析；
- 测试显式构造的临时 fixture root。

Canonical production entrypoints：

    apps/crawler/src/adapters/index.ts
    packages/shared/src/evidence-intake/index.ts

### 4.2 输出

RS1-05 新增能力为确定性的 EvidenceBoundaryAuditResult：

    EvidenceBoundaryAuditResult =
      PASS {
        checkedEntrypoints: sorted readonly paths
        checkedFiles: sorted readonly paths
      }
      | FAIL {
        checkedEntrypoints: sorted readonly paths
        checkedFiles: sorted readonly paths
        violations: sorted readonly EvidenceBoundaryViolation[]
      }

    EvidenceBoundaryViolation {
      code: stable controlled code
      file: repository-relative path
      dependencyOrCall: non-secret string
    }

稳定 violation codes：

- FORBIDDEN_DATABASE_DEPENDENCY
- FORBIDDEN_NETWORK_DEPENDENCY
- FORBIDDEN_BROWSER_DEPENDENCY
- FORBIDDEN_DOCKER_DEPENDENCY
- FORBIDDEN_PERSISTENCE_CALL
- FORBIDDEN_DOWNSTREAM_DOMAIN
- FORBIDDEN_DYNAMIC_IMPORT
- UNRESOLVED_LOCAL_IMPORT
- ENTRYPOINT_MISSING

Auditor CLI 必须：

- PASS 时退出码 0；
- FAIL 时退出码非 0；
- 输出稳定、排序后的摘要；
- 不输出文件正文、环境变量、secret 或绝对用户路径；
- 不创建 artifact、不改写源码、不访问网络。

### 4.3 与 RS1-04 的接口关系

- RS1-04 生成和验证 EvidenceEnvelope；RS1-05 不重新生成、重算或修改它。
- RS1-05 读取 RS1-04 模块的静态依赖和调用边界，证明 identity、Gate、Envelope 不越界进入副作用或业务推断层。
- RS1-04 Gate tests 继续作为功能事实；RS1-05 只增加 architecture/negative evidence。
- RS1-05 输出是工程审计结果，不是 EvidenceEnvelope 的业务派生结果。

## 5. 数据边界

允许审计和引用：

- EvidenceEnvelope
- EvidenceCandidate
- ValidationResult / GateResult
- CanonicalEvidenceIdentity
- fingerprint / evidenceId
- AdapterContract
- Clock 与 DuplicateLookup ports

禁止创建、推断、处理或输出：

- Customer
- Lead
- User Profile
- Persona
- Ranking
- Scoring
- Intent
- Classification
- Prospect Pool
- CRM action

Auditor 只分析模块依赖和受禁调用标记，不读取 fixture 中的生产数据，不解释 Evidence content。

## 6. Exact Allowlist

实施阶段精确允许以下 2 个文件，不得出现第 3 个文件：

ALLOWLIST:

- file: scripts/replan-s1/check-evidence-boundary.ts
  reason: 实现只读、确定性的 Evidence architecture/import/call boundary auditor 和 CLI 退出码。

- file: scripts/replan-s1/check-evidence-boundary.test.ts
  reason: 使用系统临时目录构造 allowed/forbidden module graphs，验证 unit、boundary、negative、replay 与 deterministic 行为。

不得创建持久 fixture 文件。测试 fixture 必须在系统临时目录中生成，测试后清理；临时内容不得进入 Git 状态。

## 7. Protected Files

除第 6 章两个精确文件外，所有文件均受保护。特别禁止修改：

- package.json 与任何 workspace package.json
- bun.lock
- .github/workflows/**
- Dockerfile、docker-compose*.yml、docker-compose*.yaml
- deployment / infrastructure 文件
- packages/database/**
- Prisma schema、Migration、Seed
- apps/crawler/**
- apps/web/**
- workers/**
- packages/shared/**
- scripts/replan-s0/**
- docs/context/**
- 既有 task、delivery、freeze、ADR 或 governance 文件

如 Auditor 需要新增 dependency、package script、workflow 或修改现有业务/contract 文件，立即 BLOCKED_SCOPE_EXPANSION_REQUIRED。

## 8. Architecture Audit Rules

### 8.1 允许边界

- TypeScript/ESM 静态 import/export；
- RS1-03 Adapter 的现有 @re-agent/shared evidence contract symbols；
- packages/shared/src/evidence-intake 内的相对静态依赖；
- zod；
- node:crypto，仅限现有 deterministic SHA-256；
- 测试使用 node:fs、node:path、node:os 创建和清理系统临时 fixture。

### 8.2 必须拒绝

- Prisma、@re-agent/database、PostgreSQL、pg、Redis；
- node:http、node:https、node:net、node:tls、node:dns；
- fetch、axios、WebSocket 或其他网络 client；
- Playwright、Puppeteer、browser automation；
- Docker CLI/runtime/container 调用；
- filesystem persistence 写入生产路径；
- dynamic import、eval、Function 构造；
- Signal、Intent、Persona、Customer、Lead、Ranking、Scoring、Classification、Prospect Pool、CRM 依赖；
- 无法解析的相对 import；
- module/global mutable cache 或隐藏去重状态。

扫描范围与 entrypoints 必须硬编码为第 4.1 节两个精确入口，不得扫描整个仓库，不得通过宽泛 exclude 隐藏失败。

### 8.3 Determinism

- 相同文件图必须产生 byte-for-byte 相同 result；
- checkedEntrypoints、checkedFiles、violations 必须按 repository-relative POSIX path、code、dependencyOrCall 稳定排序；
- 结果不得包含扫描时间、wall clock、随机数、绝对路径或机器信息；
- 文件枚举顺序变化不得改变结果；
- PASS/FAIL 必须由真实 violation 集决定，禁止 continue-on-error、|| true、set +e 或伪 PASS。

## 9. 测试要求

### 9.1 单元测试

- 两个 production entrypoint 存在并可解析；
- allowed relative imports、zod、node:crypto 和 evidence symbols 通过；
- 输出路径统一为 repository-relative POSIX 格式；
- PASS/FAIL 退出语义与 violation 数量一致。

### 9.2 边界与负向测试

在系统临时目录逐类构造最小 module graph，确认以下每类均返回非零/FAIL 和正确 stable code：

- database/Prisma；
- network/fetch；
- browser/Playwright；
- Docker；
- filesystem persistence；
- downstream Customer/Lead/Persona/Scoring；
- dynamic import；
- unresolved relative import。

测试不得改写真实仓库来制造失败。

### 9.3 Replay 与 Deterministic 测试

- 同一临时 module graph 连续审计两次，完整 result 深度相等；
- 以不同创建顺序写入同一组 fixture 文件，result byte-for-byte 相同；
- violation 输入顺序不同，输出排序相同；
- 当前真实 entrypoints 审计结果为 PASS；
- 删除/替换一个允许依赖的临时副本后，negative fixture 必须 FAIL，证明测试能捕获边界破坏。

### 9.4 验收命令

    $bun = 'C:\Users\dell\.bun\bin\bun.exe'

    & $bun test scripts/replan-s1/check-evidence-boundary.test.ts
    & $bun scripts/replan-s1/check-evidence-boundary.ts
    & $bun x eslint scripts/replan-s1/check-evidence-boundary.ts scripts/replan-s1/check-evidence-boundary.test.ts
    & $bun x prettier --check scripts/replan-s1/check-evidence-boundary.ts scripts/replan-s1/check-evidence-boundary.test.ts
    & $bun run architecture:check
    git diff --check
    git status --short --untracked-files=all
    git diff --name-status

禁止运行 Prisma、Database、Redis、Docker、network、root build 或真实平台测试。

### 9.5 PASS 标准

- RS1-05 tests：0 fail、0 skipped、0 todo、exit 0；
- production entrypoint audit：PASS、exit 0；
- ESLint、Prettier、architecture check、git diff --check 全部 exit 0；
- Git 状态精确只有 2 个 allowlisted files；
- Protected files 零 diff；
- 所有 negative fixtures 真实产生预期 FAIL，测试进程本身最终 PASS；
- 两次 replay 结果 byte-for-byte 相同。

## 10. Commit Boundary

本任务书不授权 Commit。Implementation Review PASS 与 Commit 前门禁 PASS 后，后续独立授权才可：

- 精确 stage 两个 allowlisted files；
- 创建一次且仅一次 Commit；
- Commit 不包含 task 文档、artifact、临时 fixture 或范围外文件。

建议 Conventional Commit message：

    test(architecture): enforce evidence boundary

Push、PR、Merge 均需独立授权。

## 11. Acceptance Criteria

全部满足才可声明 RS1_05_IMPLEMENTATION_COMPLETE_PENDING_REVIEW：

1. 基于 main@4b6cbcb005b25e6df0e960ef9396c7644f7cc7df 和指定 branch 实施。
2. 修改范围精确为 2 文件 allowlist，无第 3 个文件。
3. package、lockfile、CI、Docker、Prisma、database、crawler、web、workers、shared 与其他 protected files 零 diff。
4. Auditor 从两个精确 production entrypoints 建立静态可达边界，不扫描整个仓库。
5. 当前 Evidence/Adapter/Gate 调用边界审计 PASS。
6. database、network、browser、Docker、persistence、downstream domain、dynamic import 与 unresolved import negative tests 全部能被拒绝。
7. 单元、边界、Replay、Deterministic tests 全部 PASS。
8. 相同输入完整 result byte-for-byte 相同，不含 wall clock、随机值、绝对路径或机器信息。
9. 失败真实传播，无 continue-on-error、|| true、set +e 或排除失败文件伪绿。
10. architecture check、ESLint、Prettier、git diff --check 全部 PASS。
11. 无真实平台接入、网络请求、客户识别、客户画像、Lead、Scoring 或获客逻辑。
12. 未 Commit、未 Push、未创建 PR；实施报告形成并等待独立审核。

## 12. 最终冻结状态

    TASK_ID = RS1-05
    BASELINE = 4b6cbcb005b25e6df0e960ef9396c7644f7cc7df
    UNIQUE_GOAL = EVIDENCE_BOUNDARY_ARCHITECTURE_AND_SIDE_EFFECT_GATE
    EXACT_ALLOWLIST_FROZEN = YES
    AUTHORIZED_FILE_COUNT = 2
    IMPLEMENTATION_STARTED = NO
    IMPLEMENTATION_ALLOWED = NO
    READY_FOR_CHIEF_ARCHITECT_REVIEW = YES
