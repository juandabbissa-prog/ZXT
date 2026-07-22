# Keyword API Contract

**状态：** 设计契约；本 Sprint 不实现 Route、Service 或 Repository。

Base path：`/api/v1/keyword-center`。所有响应沿用 `{ success, message, data, error }`；写操作未来必须具备认证、审计与幂等策略。

## Keyword

| 方法 | 路径 | 语义 |
|---|---|---|
| POST | `/keywords` | 创建 Draft Keyword。 |
| GET | `/keywords` | 分页查询；支持 `status`、`role`、`categoryId`、`tagId`、`q`。 |
| GET | `/keywords/{id}` | 查询详情及角色、标签、变体。 |
| PATCH | `/keywords/{id}` | 编辑 phrase、分类、角色、标签、matchMode、note。 |
| DELETE | `/keywords/{id}` | 软删除；返回 204。 |
| POST | `/keywords/{id}/activate` | Draft/Paused → Active。 |
| POST | `/keywords/{id}/pause` | Active → Paused。 |
| POST | `/keywords/{id}/variants` | 新增 Variant。 |
| DELETE | `/keywords/{id}/variants/{variantId}` | 归档 Variant。 |

创建请求：`phrase`、`categoryId`、`roles[]`、`matchMode` 必填；`source` 默认为 `MANUAL`。`phrase` 规范化后重复时返回 `409 KEYWORD_DUPLICATE`。

## Category

| 方法 | 路径 | 语义 |
|---|---|---|
| POST | `/categories` | 创建分类。 |
| GET | `/categories` | 查询分类树或平铺列表。 |
| PATCH | `/categories/{id}` | 编辑名称、父节点或状态。 |
| DELETE | `/categories/{id}` | 仅无子分类、无 Keyword 引用时允许归档。 |

## Tag

| 方法 | 路径 | 语义 |
|---|---|---|
| POST | `/tags` | 创建标签。 |
| GET | `/tags` | 分页查询标签。 |
| PATCH | `/tags/{id}` | 编辑名称或状态。 |
| DELETE | `/tags/{id}` | 仅无 Keyword 引用时允许归档。 |

## 错误契约

`400 VALIDATION_ERROR`、`404 NOT_FOUND`、`409 KEYWORD_DUPLICATE`、`409 INVALID_STATE_TRANSITION`、`409 CATEGORY_IN_USE`、`409 TAG_IN_USE`、`422 CATEGORY_CYCLE`。不在响应中暴露数据库或内部堆栈信息。
