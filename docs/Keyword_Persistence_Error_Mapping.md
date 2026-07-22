# Keyword Persistence Error Mapping

| 数据库情况 | 基础设施映射 | 上层安全语义 |
|---|---|---|
| Prisma P2002 | `KeywordPersistenceError(UNIQUE)` | 重复 Keyword/Variant/Link。 |
| Prisma P2003 | `FOREIGN_KEY` | 无效 Category/Tag/Keyword 引用。 |
| 序列化失败 | `SERIALIZATION`（后续驱动代码补充） | 可有限重试。 |
| 死锁 | `DEADLOCK`（后续驱动代码补充） | 可有限重试。 |
| 不存在/乐观冲突 | Repository 返回 null，Service 再查区分 | 不直接泄漏数据库错误。 |
| 未知错误 | `UNKNOWN` | 记录内部日志，对上层返回安全错误。 |

Repository 不直接把 Prisma error 或 stack 返回给 Service/Route。
