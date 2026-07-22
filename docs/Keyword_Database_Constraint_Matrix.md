# Keyword Database Constraint Matrix

| Rule | Database | Repository | Service | 说明 |
|---|---|---|---|---|
| Keyword normalizedPhrase 唯一 | unique constraint 最终保护 | 查询已有值 | 规范化并把冲突映射为领域错误 | 并发创建以数据库为准。 |
| Variant 不得等于主词 | 无法跨表 check | 读取主词/variant | 规范化后比较并拒绝 | Service 保证。 |
| Variant 同 Keyword 唯一 | composite unique | 查询辅助 | 映射唯一冲突 | `(keyword_id, normalized_phrase)`。 |
| Keyword 至少一个 Role | 无法安全用普通 FK 保证 | 写入 Link | 创建/更新时验证非空 | 与 Keyword 写入同一事务。 |
| Category 不循环 | 无通用 FK 约束 | `detectCyclePath` | 拒绝循环 | Service 在事务内确认。 |
| Deleted Keyword 不可修改 | `deleted_at` 留存 | 默认查询排除 | 状态和更新前检查 | Service 负责状态规则。 |
| Category/Tag 必须 Active | FK 仅保证存在 | 查询状态 | 创建/变更前验证 | Service 保证。 |
| 状态流转合法 | 无 | 更新条件辅助 | 状态机验证 | Service 负责。 |
| Category/Tag 被引用不可归档 | FK 不阻止 archive | `isReferenced` | 拒绝归档 | Service 负责。 |
| 软删除 | `deleted_at` 字段 | `softDelete` | 禁止后续编辑、定义恢复流程 | DB 保留历史。 |
| 乐观并发 | `updated_at` 比较条件 | conditional update | 冲突映射 `409` | 所有编辑携带 expectedUpdatedAt。 |
| 事务边界 | 无自动事务 | 接收 opaque context | 开启/提交/回滚 transaction | Repository 不调用 `$transaction`。 |

数据库约束用于完整性底线，不替代跨表、状态机和授权等 Service 规则。
