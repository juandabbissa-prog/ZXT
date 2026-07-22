# Keyword Domain Model

## 聚合

`KeywordCatalog` 是逻辑聚合边界；`Keyword` 是可独立编辑的聚合根。分类和标签是 Catalog 内受控参照数据，不能由 Keyword API 隐式创建。

## Entity

| Entity | 标识 | 职责 |
|---|---|---|
| Keyword | KeywordId | 管理词面、规范化值、状态、来源、分类、角色、标签与变体。 |
| KeywordVariant | KeywordVariantId | 表达同义、口语或拼写变体，隶属于一个 Keyword。 |
| KeywordCategory | KeywordCategoryId | 提供可层级化的受控分类。 |
| KeywordTag | KeywordTagId | 提供跨分类、多维标记。 |

## Value Object

| Value Object | 规则 |
|---|---|
| KeywordPhrase | 原始展示词；去除首尾空白，长度 1–120。 |
| NormalizedKeywordPhrase | Unicode 规范化、全角/半角统一、空白压缩、小写化（适用字符）；用于去重，不能被人工直接编辑。 |
| KeywordRole | `DISCOVERY`、`CONTEXT`、`SIGNAL`、`EXCLUSION`；一个 Keyword 可拥有多个角色。 |
| KeywordSource | `MANUAL`、`IMPORT`、`SYSTEM_SUGGESTED`、`API`。 |
| KeywordStatus | `DRAFT`、`ACTIVE`、`PAUSED`、`ARCHIVED`、`DELETED`。 |
| MatchMode | `EXACT`、`PHRASE`、`CONTAINS`；不在 V1 引入任意正则表达式。 |

## 不变量

1. `normalizedPhrase` 在未引入租户边界前全局唯一。
2. Deleted Keyword 不可新增角色、标签或变体。
3. Variant 的规范化值不得与所属 Keyword 或同一 Keyword 的其他 Variant 重复。
4. Category 只能引用已激活的分类；Tag 只能引用已激活的标签。
5. 每个 Keyword 至少有一个 Role，且 `EXCLUSION` 可与其他角色共存但必须由后续业务 Sprint 明确解释。
6. Category 树禁止循环引用。

## 领域事件（仅契约，未实现）

`KeywordCreated`、`KeywordUpdated`、`KeywordActivated`、`KeywordPaused`、`KeywordArchived`、`KeywordDeleted`、`KeywordVariantAdded`。事件不在本 Sprint 落库或投递。
