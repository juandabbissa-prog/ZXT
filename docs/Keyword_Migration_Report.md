# Keyword Migration Report

Migration：`20260722000100_add_keyword_catalog`。

新增五个 PostgreSQL enum、六张 Keyword Catalog 表、主键、外键、唯一约束、组合键和查询索引。它不修改 `20260722000000_init`，不删除任何对象。回滚采用应用回退加新的补偿 Migration；已执行 Migration 不得修改。生产执行前需要备份、SQL 审阅和变更审批。
