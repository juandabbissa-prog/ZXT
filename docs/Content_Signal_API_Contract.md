# Content Signal API Contract

## Scope

This contract exposes platform-neutral Content Signal operations only. It does not authorize
collection, login automation, browser automation, platform bypass, Buyer Persona, Lead, or AI
Sales Agent behavior.

## Create a signal

`POST /api/content-signals`

Required fields:

- `anchorId`
- `type`: `DEMAND | PAIN_POINT | PREFERENCE | OBJECTION | INTENT`
- `summary`
- `source.type`: `MANUAL | IMPORT | AUTHORIZED_API | SYSTEM`
- `source.description`: optional platform-neutral source explanation
- `evidence[]`: at least one evidence item
- `confidence`: integer from 0 through 100
- `confidenceRationale`: required explanation of the confidence value
- `occurredAt` and `observedAt`: ISO-8601 timestamps

`keywordId`, source reference, and evidence reference URL are optional. A successful request
returns HTTP 201.

## Query signals

`GET /api/content-signals?anchorId={id}`

Optional filters: `type`, `status`, `observedFrom`, `observedTo`, `page`, and `pageSize`.
Results use stable descending observation-time pagination.

## Get one signal

`GET /api/content-signals/{id}`

Returns HTTP 404 when the signal does not exist.

## Archive a signal

`PATCH /api/content-signals/{id}`

Body:

```json
{ "status": "ARCHIVED" }
```

Only `ACTIVE -> ARCHIVED` is supported.

## Error behavior

Validation failures return HTTP 400, missing resources return HTTP 404, and duplicate or invalid
state conflicts return HTTP 409. Unexpected persistence failures are not exposed to callers.

Sprint 4.0 has no versioned update endpoint, so it cannot emit a version conflict. The only
mutation after creation is the explicit `ACTIVE -> ARCHIVED` transition; a repeated archive
returns `INVALID_STATE_TRANSITION`.
