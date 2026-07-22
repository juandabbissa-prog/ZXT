# ADR 0006: Keyword Persistence Architecture

**状态：** Accepted
**日期：** 2026-07-22

## 决策提案

采用 PostgreSQL/Prisma 关系模型：Keyword 为根，Role、Tag Link、Variant 规范化建模；Keyword 使用软删除；Service 管理事务；Repository 返回领域结构和 opaque transaction context，不暴露 Prisma 类型。V1 暂不引入 tenantId。

## 原因

- JSON 无法提供 Role/Tag/Variant 的组合唯一、索引、引用完整性和可审计查询。
- 软删除保留未来 Anchor/Comment/Lead 对 Keyword 的历史解释。
- Service 才知道跨 Repository 用例与事务边界；Repository 自行事务会破坏组合原子性。
- Prisma 类型泄漏会把 ORM 决策传播到 Service/Route，阻碍后续替换和测试。
- 多租户会改变全部唯一键、索引与 FK；在没有租户边界需求前加入会增加无效复杂度。

## 放弃方案

每模块独立关键词表、JSON roles/tags/variants、Repository transaction、物理删除、V1 多租户、任意正则和 materialized path。

## 后续影响

Sprint 2.1 已将候选 schema 转为正式 Prisma 变更并实现 Repository。Keyword 主数据遵循 **Create Once，Restore Instead of Recreate**：已软删除的 normalizedPhrase 不允许重新创建；未来需要恢复时必须恢复原记录。不得改变冻结领域决策。
