# RE-Agent V1.0 Development Management Spec

**版本：** V1.0  
**状态：** Frozen

## Sprint 流程

每个 Sprint 固定遵循：`Sprint_XX_Development_Task.md` → 工程实现 → `Sprint_XX_Delivery_Report.md` → Chief Architect 的 `Sprint_XX_Review_Report.md`。审核结论仅允许 PASS 或 REQUEST CHANGES；无 P0、验收全通过且 Review PASS 才能进入下一 Sprint。

## 角色边界

Chief Architect 负责任务、架构和审核；Engineering Team（Codex）负责实现、缺陷修复、真实运行结果和交付报告；Product Owner 负责方向与优先级。Codex 不得伪造运行结果或自行出具审核结论。

## 环境处理顺序（新增，冻结）

任何环境缺失问题必须依序处理：

1. 检查项目已有解决方案；
2. 检查 Docker 方案；
3. 检查自动化脚本方案；
4. 检查 GitHub Actions CI 方案；
5. 检查可规避问题的项目配置调整；
6. 上述方案均不可行时，才说明技术依据与最小宿主机依赖。

禁止默认要求 Product Owner 安装 Bun、Node.js、Docker、PostgreSQL 或 Redis。环境策略的详细执行方案以 `Environment_Strategy_Report.md` 为准。

## 固定验收

Build、数据库、Migration、Seed、Test、CI 与 Documentation 必须有真实证据。Docker 可由 CI 中等效的服务容器和可复现 runner 验证；本地 Docker 不是默认的 Product Owner 前置条件。
