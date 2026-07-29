# Buyer Persona Engine Domain Design

## Frozen terminology

- **Buyer Persona**: a versioned, evidence-backed description of a possible
  property buyer. It is neither a Lead nor a confirmed customer record.
- **Dimension Assessment**: the current or historical assessment of one buyer
  persona dimension.
- **Evidence Link**: a traceable reference from a persona assessment to an
  existing Content Signal or Signal Evidence record.
- **Snapshot**: an immutable point-in-time projection of a persona and its
  assessments.
- **FACT**: an assessment directly supported by valid evidence.
- **INFERENCE**: an evidence-backed interpretation that is not a confirmed fact.
- **UNKNOWN**: an explicitly missing or unsupported dimension. It must not
  fabricate evidence.

## Aggregate position

Buyer Persona Engine consumes platform-neutral Content Signal evidence and
produces evidence-backed persona snapshots for future downstream modules.

`Keyword -> Anchor -> Content Signal -> Buyer Persona`

Downstream Lead, Lead Scoring, AI Sales Agent, and CRM capabilities are outside
Sprint 5.0.

## Property-industry dimensions

The foundation recognizes these dimensions without implementing scoring:

1. basic demographics
2. family structure
3. work area
4. commute relationship
5. current residential area
6. interest preference
7. property purchase need
8. budget range
9. purchase stage
10. intent indicator

An intent indicator is a descriptive assessment dimension only. Sprint 5.0
does not calculate an Intent Score.

## Invariants

- A FACT or INFERENCE assessment requires at least one valid evidence link.
- UNKNOWN records absence explicitly and cannot claim supporting evidence.
- Confidence is an integer from 0 through 100.
- Expiry cannot precede the assessment validity start.
- Updating an assessment preserves history and supersedes the previous current
  assessment for the same persona and dimension key.
- Snapshots are immutable and versioned per persona.
- Removing upstream signals must not cascade-delete persona history.
- Core models contain no platform-specific fields.
