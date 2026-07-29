# Content Signal Domain Design

## Purpose

Content Signal converts an approved observation about an Anchor into a
platform-neutral business fact. It does not collect platform data and it does
not infer a Buyer Persona, Lead score, or sales action.

The bounded flow is:

```text
Keyword (optional context)
  -> Anchor (required observation node)
  -> Content Signal
  -> future Buyer Persona consumers
```

## Aggregate

`ContentSignal` is the aggregate root.

- `id`: immutable identifier.
- `anchorId`: required reference to the observed Anchor.
- `keywordId`: optional reference to a Keyword that provides discovery context.
- `type`: platform-neutral classification.
- `summary`: normalized human-readable fact.
- `source`: origin metadata without credentials or platform-specific fields.
- `evidence`: one or more supporting facts.
- `confidence`: integer from 0 to 100 representing evidence confidence, not
  purchase probability.
- `confidenceRationale`: required, human-readable explanation that connects the
  confidence value to the stored evidence.
- `occurredAt`: when the represented fact occurred.
- `observedAt`: when the fact was observed.
- `status`: `ACTIVE` or `ARCHIVED`.
- `createdAt`, `updatedAt`, `archivedAt`: lifecycle timestamps.

## Value Objects

### Signal Source

`SignalSource` contains:

- `type`: `MANUAL`, `IMPORT`, `AUTHORIZED_API`, or `SYSTEM`.
- `reference`: optional non-secret external or internal reference.
- `description`: optional platform-neutral explanation of how the source was
  registered.

The parent `ContentSignal.anchorId` identifies the associated Anchor.
`reference` is the only external-content reference in the core model. Together,
type, reference, description, and the Anchor link form the minimum trace
metadata; platform-specific response payloads are excluded.

It must never contain cookies, access tokens, login state, browser sessions, or
platform-specific authentication data.

### Signal Evidence

Each `SignalEvidence` contains:

- `id`
- `signalId`
- `type`: `TEXT`, `URL`, `METRIC`, or `OBSERVATION`
- `content`
- optional `referenceUrl`
- `observedAt`
- `createdAt`

Evidence is immutable after creation in Sprint 4.0.

## Invariants

1. Every Content Signal references an existing, active Anchor.
2. A referenced Keyword is optional, but when supplied it must exist and must
   not be deleted.
3. At least one evidence item is required.
4. `confidence` is an integer from 0 through 100.
   There is no default: the caller must provide it with a non-empty rationale.
   Boundary values 0 and 100 are valid. Confidence supports evidence review
   only and never changes lifecycle status automatically.
5. `occurredAt` cannot be later than `observedAt`.
6. Source and evidence values are platform-neutral and contain no credentials.
7. A deterministic fingerprint prevents duplicate active facts for the same
   Anchor, type, normalized summary, and occurrence time.
8. The only Sprint 4.0 lifecycle transition is `ACTIVE -> ARCHIVED`.

## Boundaries

- Route parses HTTP input and delegates to Service.
- Service enforces domain rules and transaction boundaries.
- Repository interfaces are ORM-neutral.
- Prisma repositories own persistence queries and mappings.
- PostgreSQL owns referential integrity and uniqueness constraints.

No automatic collection, Cookie handling, login automation, browser
automation, platform bypass, Buyer Persona, Lead, Lead Scoring, or AI Sales
Agent behavior is part of this module.
