# ADR 0005: Keyword Catalog as a Controlled Domain Aggregate

**状态：** Accepted
**日期：** 2026-07-22

## 背景

Keyword 将被未来 Anchor、内容、评论、信号和 Lead 模块共同使用。若把词直接嵌入各模块，会造成重复词、不同状态语义和无法审计的匹配规则。

## 决策

采用独立 Keyword Catalog：Keyword 是聚合根；Category、Tag、Variant、Role 和状态是受控模型。使用全局规范化词面唯一约束、可多选 Role、软删除和非正则 MatchMode。

## 放弃方案

1. **每个模块自建关键词表**：放弃，因无法共享治理与审计。
2. **单一 type 字段**：放弃，因一个词可同时用于发现与上下文/排除。
3. **JSON 标签和别名字段**：放弃，因索引、唯一约束、审计和查询能力不足。
4. **任意正则匹配**：放弃，因安全、性能和可解释性风险高。

## 影响

Sprint 2.1 将实现 Prisma/Repository 前，必须遵守此数据模型与 Service/Repository 标准。后续 Anchor/Comment/Lead 只能引用 Keyword 或其命中事实，不能复制或修改 Keyword 主数据。
