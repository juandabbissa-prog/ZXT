# RE-Agent V1.0 Project Constitution

**版本：** V1.0  
**状态：** Frozen

## 项目使命与开发纪律

RE-Agent 的唯一使命是自动发现公开网络中的购房意向客户，围绕发现、识别、评分和输出 Lead 建立最小可验证闭环。所有 Sprint 遵循先任务、后开发；先基础设施、后业务；先测试、后交付；先审核、后进入下一 Sprint 的纪律。

## 冻结技术栈

Next.js、TypeScript、Bun、PostgreSQL、Prisma、Redis、Playwright、Docker、GitHub Actions、Pino、Vitest。重大变更须经架构评审。

## 环境自解决原则（新增，冻结）

Engineering Team 必须优先以 Docker、CI、自动化脚本和项目配置解决环境问题。未充分尝试工程方案前，不得将安装开发软件的责任转移给 Product Owner。

## 最小宿主机依赖原则（新增，冻结）

Product Owner 的设备原则上只承担 Git、与 AI 协作及查看交付结果。Bun、Node.js、Docker、PostgreSQL、Redis 等开发依赖应优先在容器或 CI 中提供，不得默认要求安装。

## 验收与效力

Build、Docker 或 CI 等效验证、Migration、Seed、测试、文档及无 P0 问题是 Sprint PASS 的前提。宪章高于其他项目文档；修改须经 Product Owner 与 Chief Architect 共同确认。
