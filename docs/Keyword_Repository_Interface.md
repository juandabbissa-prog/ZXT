# Keyword Repository Interface

候选 TypeScript 契约位于 `packages/shared/src/repository/keyword.repository.ts`。它不导入 Prisma，也不包含查询实现。

## 设计规则

- `find*` 在未找到时返回 `null`；Service 决定是否转换为 Not Found。
- `PageRequest` 要求 page/pageSize，并只允许白名单排序：更新时间降序、创建时间降序、词面升序。
- list filter 支持状态、角色、分类、标签、来源和规范化精确词；模糊查询不在 V1 接口中。
- update/softDelete 返回 `null` 表示未找到或乐观并发冲突；Service 再次区分错误类型。
- 所有写操作支持可选 `PersistenceTransactionContext`。它是 opaque 类型，不泄漏 Prisma TransactionClient。
- Repository 不创建事务、不调用其他 Repository 或 Service。

## 并发

Keyword、Category、Tag 更新使用 `expectedUpdatedAt` 乐观并发控制。创建相同 normalizedPhrase 时，Service 应先做友好检查，再将数据库 unique conflict 视为最终保护并转换为 `KEYWORD_DUPLICATE`。
