# Dependency Report

## 当前依赖治理结论

| 依赖 | 用途 | 状态 | 建议 |
|---|---|---|---|
| Next / React / React DOM | Web | 必需 | 保持同一发布代际，交由 CI 验证。 |
| Prisma / @prisma/client | 数据库与迁移 | 必需 | 两者版本范围已对齐为 6.7。 |
| Pino | 结构化日志 | 必需 | 保留。 |
| Zod | 环境配置校验 | 必需 | 保留。 |
| ioredis | Redis 单例客户端 | 必需 | 保留。 |
| Vitest | 单元/接口测试 | 必需 | 仅在需要测试的包中保留。 |
| tsx | Crawler 开发、Seed 执行 | 必需 | 保留。 |
| eslint-config-next | Next.js ESLint 兼容 | 待 CI 验证 | 当前 flat config 未显式继承其规则；若首次 CI 证实未使用，应移除或正式接入。 |

## 重复与冲突

- `vitest`、`tsx` 在多 workspace 重复声明；这是 workspace 独立可执行脚本的刻意选择，当前不合并。
- 未发现同一库存在相互冲突的版本范围。
- 未发现可确认的废弃依赖；需要首次 CI 的包安装/安全审计结果再最终确认。

## 后续动作

生成 `bun.lock` 后，以 lockfile 为唯一版本证据；依赖升级和安全审计必须通过独立 Sprint 任务进行。
