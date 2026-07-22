# RE-Agent V1.0 Service / Repository Standard

**版本：** V1.0
**状态：** Frozen
**适用范围：** 所有 Sprint 2 及之后的业务模块

## 分层顺序

```text
Route → Service → Repository → Prisma → PostgreSQL
```

| 层 | 职责 | 禁止事项 |
|---|---|---|
| Route | HTTP 输入校验、身份/请求上下文、响应映射 | 不写业务规则；不直接调用 Prisma。 |
| Service | 用例编排、事务、领域错误、审计日志、跨 Repository 协调 | 不暴露 HTTP 或 ORM 细节。 |
| Repository | 单一实体/聚合的数据读取与写入、Prisma 查询映射 | 不调用 Repository；不调用 Service；不自行开启事务。 |
| Prisma | ORM、migration、连接管理 | 不承载业务规则。 |

## 架构铁律

1. Repository 不允许调用 Repository。
2. Repository 不允许调用 Service。
3. Route 不允许直接调用 Prisma。Sprint 1 的数据库/Redis 健康检查接口是唯一基础设施例外；它们只能调用已记录的连接检查函数，不得承载业务逻辑。
4. Transaction 只能由 Service 层开启；Repository 不得自行开启 transaction。

## 标准模块目录

```text
feature/
├── feature.service.ts
├── feature.repository.ts
├── feature.types.ts
├── feature.service.test.ts
└── index.ts
```

默认生成位置：`apps/web/src/features/<feature-name>/`。业务模块可以增加 Route，但必须通过 Service 进入数据层。

## 创建方式

```bash
bun run feature:create <feature-name>
```

名称必须使用 kebab-case。脚手架只生成分层契约和测试占位，不生成业务模型、采集、识别或 Lead 功能。
