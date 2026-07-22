# Architecture Review

## 当前架构

```text
Web page / API Route
  → health-check boundary
    → shared config + logger + error response
    → database client / redis client
      → Prisma → PostgreSQL
      → ioredis → Redis
```

## Web → API → Service → Repository → Prisma 复核

Sprint 1 只实现基础健康检查，Route 直接调用连接检查函数是允许的最小实现。正式业务模块不得沿用此捷径，必须采用：

```text
Route → Service → Repository → Prisma
```

- **Route**：HTTP 输入、请求标识、响应映射；不得写业务规则。
- **Service**：业务编排、事务边界、日志与领域错误。
- **Repository**：唯一 Prisma 查询入口；不得向上层泄漏 ORM 细节。
- **Prisma/PostgreSQL**：数据持久化与 migration。

## 最易返工位置

1. 健康检查直接连接基础设施：业务开始前需建立 Service/Repository 模板。
2. 配置 schema 当前是全局必填：未来 worker/crawler 配置增长时应按服务拆分并共享基类。
3. Docker 首次构建没有锁文件：首次 CI 通过后必须提交 `bun.lock`。
4. Crawler/Workers 是空壳：未来任务必须明确生命周期、优雅关闭和队列契约后再实现。
