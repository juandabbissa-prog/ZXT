# Keyword Domain Analysis

## 作用

Keyword Center 是 RE-Agent 的受控词汇源。它定义系统可用于发现公开内容、理解内容上下文、识别意向信号和排除无关内容的词汇，但本 Sprint 不执行搜索、采集、AI 分析或评分。

## 生命周期

```text
Draft → Active ↔ Paused → Archived → Deleted
```

- **Draft**：已录入，尚未被后续模块使用。
- **Active**：可被获批的后续模块引用。
- **Paused**：保留历史与关系，但不参与新处理。
- **Archived**：停止使用，仅可查询审计。
- **Deleted**：软删除；不物理删除，防止历史引用失效。

## 来源

首期支持人工录入；模型同时预留批量导入、系统建议和 API 接入来源。来源只说明录入路径，不代表数据真实性或采集授权。

## 使用场景

| 角色 | 后续使用方 | 作用 |
|---|---|---|
| Discovery | Anchor Center | 定义账号、主页或公开内容发现的查询词。 |
| Context | Content/Comment 模块 | 提供房产、本地、楼盘等上下文分类词。 |
| Signal | Signal/Lead 模块 | 提供可复核的意向信号词，不能单独决定 Lead。 |
| Exclusion | 任意后续处理模块 | 标识应排除或降权的语境。 |

## 关系

- **Anchor**：一个 Anchor 可由多个 Discovery Keyword 发现；Keyword 不保存 Anchor 实例。
- **Comment/Content**：一个 Comment 可命中多个 Keyword 或 Variant；命中结果是未来独立事实，不写回 Keyword。
- **Lead**：Lead 只能引用已解释的信号结果；Keyword 是规则输入，不能直接等同于 Lead 或评分。

## 领域边界

Keyword Catalog 只管理受控词、分类、标签、变体、状态与审计信息。不管理平台账号、用户、评论、内容、抓取任务、模型推理或销售线索。
