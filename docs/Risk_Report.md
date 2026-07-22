# Risk Report

| # | 风险 | 等级 | 原因 | 方案 | 立即修复 |
|---:|---|---|---|---|---|
| 1 | CI 未真实运行 | P0 | 无远程 GitHub Actions 结果 | 推送后获取全量日志 | 是 |
| 2 | 无 `bun.lock` | P1 | 首次安装尚未在 CI 完成 | CI 成功后提交并强制校验 | 是 |
| 3 | Docker 未真实运行 | P0 | 当前机器无 Docker | 使用新增 CI container smoke | 是 |
| 4 | 依赖兼容性未知 | P1 | 未执行安装/构建 | CI 检验并固定 lockfile | 是 |
| 5 | Service/Repository 尚未形成模板 | P1 | Sprint 1 仅有 health route | Sprint 2 前由架构任务冻结模板 | 是 |
| 6 | 本地 `.env.local` 默认凭据 | P1 | 开发便利性配置 | 仅开发使用，生产改用密钥管理 | 否 |
| 7 | Crawler 空壳退出行为 | P2 | 未有正式任务循环 | 进入采集 Sprint 时定义生命周期 | 否 |
| 8 | 依赖安全审计未执行 | P1 | 无安装环境 | CI 后单独执行审计 | 否 |
| 9 | 远程仓库未配置 | P0 | CI 无法触发 | 关联 GitHub remote | 是 |
| 10 | Windows 行尾提示 | P2 | Git autocrlf 行为 | 保持 EditorConfig；首次 CI 验证格式 | 否 |
