# Keyword Data Evolution Notes

| Future concern | V1实现 | 当前预留 | 可能影响表 | 迁移风险 | 推荐 Sprint |
|---|---|---|---|---|---|
| tenantId | 否 | 文档明确唯一键未来需前置 tenant | 全部 Keyword 表 | 高：所有 FK/unique/index | 多租户架构 Sprint |
| Keyword 多分类 | 否 | 当前单 categoryId | keywords、新 link 表 | 中：回填主分类 | 分类扩展 Sprint |
| Role Registry | 否 | 当前固定 enum | keyword_roles、enum | 中：enum 迁移 | 角色治理 Sprint |
| 多平台匹配策略 | 否 | MatchMode 为基础 | keywords、未来策略表 | 中 | 平台接入前 |
| 中文分词 | 否 | 不承诺模糊检索 | keywords、搜索索引 | 中/高 | 搜索策略 Sprint |
| 拼音/同音词 | 否 | Variant 可承载已批准变体 | keyword_variants | 中 | 中文匹配 Sprint |
| 地域属性 | 否 | Tag/Category 可临时表达 | keywords、未来地域表 | 中 | 地域建模 Sprint |
| 权重/优先级 | 否 | 不新增字段 | keywords、未来规则表 | 低 | 信号规则 Sprint |
| 命中事实表 | 否 | Keyword 不保存命中 | future_keyword_matches | 高：数据量 | Content/Comment 后 |
| 规则版本 | 否 | ADR/审计策略预留 | future_rule_versions | 中 | 规则治理 Sprint |
| 审计日志 | 否 | created/updated 时间已存在 | future_audit_events | 中 | 审计 Sprint |

这些项目均不得在 Sprint 2.0.5 或 2.1 提前实现。
