# Buyer Persona Data and API Design

## Persistence model

- `BuyerPersona`: aggregate identity, optional platform-neutral subject
  reference, lifecycle status, aggregate version, and timestamps.
- `PersonaDimensionAssessment`: category, dimension key, normalized JSON value,
  cognitive status, confidence, rationale, validity, lifecycle state, and
  version.
- `PersonaEvidenceLink`: traceable references to Content Signal and optional
  Signal Evidence records, with relationship and evidence-time metadata.
- `PersonaSnapshot`: immutable aggregate projection, evidence summary, missing
  dimensions, snapshot version, and validity.

Database constraints enforce confidence bounds, valid time ranges, one current
assessment per persona/dimension key, and unique snapshot versions.

## Service boundary

The service may:

- create a draft persona;
- query one persona;
- link upstream evidence;
- record or revise an assessment;
- read assessment history;
- generate and retrieve a snapshot;
- mark a persona stale or archived.

The service validates domain rules and depends only on repository contracts and
transaction abstractions. It does not import Prisma.

## Repository boundary

The repository supports:

- `createPersona`
- `findPersonaById`
- `findPersonaBySubjectReference`
- `addEvidenceLink`
- `findEvidenceLinks`
- `saveDimensionAssessment`
- `findCurrentAssessments`
- `findAssessmentHistory`
- `createSnapshot`
- `findLatestValidSnapshot`
- `updatePersonaStatus`

## API boundary

- `POST /api/buyer-personas`
- `GET /api/buyer-personas/:id`
- `PATCH /api/buyer-personas/:id`
- `POST /api/buyer-personas/:id/evidence-links`
- `GET|POST /api/buyer-personas/:id/assessments`
- `GET|POST /api/buyer-personas/:id/snapshots`

Routes parse HTTP input and map service results. They do not access Prisma or
the database directly.
