# Keyword Data Model

**状态：** 设计冻结；本 Sprint 不创建 Prisma schema 或 Migration。

## 表结构

### `keyword_categories`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 分类标识。 |
| code | varchar(64) unique | 稳定机器码。 |
| name | varchar(120) | 显示名称。 |
| parent_id | uuid nullable FK | 自引用父分类。 |
| status | enum | `ACTIVE` / `ARCHIVED`。 |
| created_at / updated_at | timestamptz | 审计时间。 |

索引：`parent_id`、`status`；唯一：`code`。

### `keyword_tags`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 标签标识。 |
| code | varchar(64) unique | 稳定机器码。 |
| name | varchar(120) | 显示名称。 |
| status | enum | `ACTIVE` / `ARCHIVED`。 |
| created_at / updated_at | timestamptz | 审计时间。 |

索引：`status`；唯一：`code`。

### `keywords`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | KeywordId。 |
| phrase | varchar(120) | 原始展示词。 |
| normalized_phrase | varchar(160) unique | 去重和匹配键。 |
| category_id | uuid FK | 所属分类。 |
| source | enum | KeywordSource。 |
| status | enum | KeywordStatus。 |
| match_mode | enum | MatchMode。 |
| note | varchar(500) nullable | 人工维护说明。 |
| created_at / updated_at | timestamptz | 审计时间。 |
| archived_at / deleted_at | timestamptz nullable | 状态时间。 |

索引：`category_id`、`status`、`source`、`updated_at DESC`；唯一：`normalized_phrase`。

### `keyword_roles`

| 字段 | 类型 | 说明 |
|---|---|---|
| keyword_id | uuid FK | Keyword。 |
| role | enum | KeywordRole。 |
| created_at | timestamptz | 添加时间。 |

主键：`(keyword_id, role)`；索引：`role`。

### `keyword_variants`

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid PK | 变体标识。 |
| keyword_id | uuid FK | 所属 Keyword。 |
| phrase / normalized_phrase | varchar | 变体文本与规范化值。 |
| status | enum | `ACTIVE` / `ARCHIVED`。 |
| created_at / updated_at | timestamptz | 审计时间。 |

唯一：`(keyword_id, normalized_phrase)`；索引：`keyword_id`、`status`。

### `keyword_tag_links`

字段：`keyword_id`、`tag_id`、`created_at`。主键：`(keyword_id, tag_id)`；索引：`tag_id`。

## 约束与演进

所有 FK 使用限制删除；Keyword 使用软删除。多租户边界尚未在 V1.0 建模，未来引入 tenant 后所有唯一约束和索引必须前置 `tenant_id`。
