# Keyword Transaction Strategy

## Rule

Service opens and owns every transaction. Repositories only receive the opaque `PersistenceTransactionContext`; they never invoke `$transaction`.

| Use case | Transaction boundary | Concurrency / failure handling |
|---|---|---|
| Create Keyword + Roles + Tags + Variants | Validate active references and normalized conflicts, insert root and all links, commit atomically | Unique conflict maps to duplicate error; no partial links. |
| Update base fields | Read current state/version, validate, conditional update | `expectedUpdatedAt` mismatch returns conflict. |
| Update Roles / Tags | Validate non-empty roles and active refs, replace link set atomically | Reject invalid/duplicate IDs before writes. |
| Add Variant | Verify root active, compare primary/variants, insert | Composite unique conflict is final protection. |
| Soft delete | Confirm state/version, set `deletedAt` and status | No physical delete; concurrent edit conflicts. |
| Status transition | Validate state-machine edge, write status/time | Conditional update protects races. |
| Category parent change | Read ancestor path, reject cycle, update parent | Serializable transaction or retry on serialization conflict. |
| Category / Tag archive | Check references then archive | Use transaction; recheck after locking/conditional write. |

## Isolation and retry

Default is PostgreSQL `READ COMMITTED` for ordinary Keyword writes, with database unique constraints as final protection. Category parent changes and archive-vs-reference races use `SERIALIZABLE` or equivalent explicit locking chosen in Sprint 2.1. Retry only serialization/deadlock failures, at most three bounded attempts with jitter; never retry validation or unique conflicts.

## Idempotency

Create does not infer idempotency from phrase alone. A future HTTP layer may require an idempotency key. Until then, duplicate normalized phrase is a conflict, not success. All transaction orchestration and retry policy remains in Service.
