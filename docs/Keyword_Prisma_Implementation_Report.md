# Keyword Prisma Implementation Report

正式 schema 已合并至 `packages/database/prisma/schema.prisma`，候选 schema 保留作设计记录。

- 新增 Keyword、KeywordVariant、KeywordCategory、KeywordTag、KeywordRoleLink、KeywordTagLink。
- 新增 KeywordRole、KeywordSource、KeywordStatus、MatchMode、ReferenceStatus enum。
- 所有 Keyword 表使用 snake_case 映射、UUID、timestamptz(3)、Restrict FK、组合主键/唯一约束和冻结索引。
- Keyword 仍使用全局 `normalized_phrase` 唯一键；Deleted 记录占用该值，必须 Restore Instead of Recreate。
