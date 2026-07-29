# Sprint 6.0 Lead Scoring Implementation Plan

**Baseline:** `main@e3ce23865f051058e8f14b2b4a2cd4b6acea123c`

**Branch:** `sprint/06-0-lead-scoring`

**Goal:** Implement an evidence-based, versioned Lead Scoring foundation while preserving `Route -> Service -> Repository -> Prisma -> Database`.

## Scope guardrails

- Inputs are limited to Buyer Persona, Persona Snapshot, Content Signal, and Evidence.
- Outputs are Lead Score Assessment, Purchase Stage, Lead Grade, Score Basis, Confidence, Explanation, policy version, and immutable snapshots.
- A score is a model judgment, never a fact or confirmed purchase behavior.
- Do not implement AI Sales Agent, CRM, contact or messaging automation, sales decisions, acquisition, login/browser automation, cookies, platform bypass, income inference, or payment-capacity inference.

## Execution and verification

1. Freeze terminology and invariants in the shared domain model.
   - Verify: domain tests reject invalid score, confidence, basis, timestamps, and prohibited semantic claims.
2. Add failing domain unit tests, then implement the minimum domain rules.
   - Verify: targeted tests demonstrate RED before implementation and GREEN after it.
3. Add Prisma enums/models and a forward-only migration.
   - Verify: Prisma format, validate, generate, and migration deploy pass.
4. Add repository contract, mapper, and Prisma repository.
   - Verify: serial PostgreSQL integration tests cover create, deduplication, latest lookup, and history.
5. Implement versioned scoring policy and Service boundary.
   - Verify: unit tests cover deterministic policy output, input validation, traceable score bases, policy version, and immutable assessment creation.
6. Implement runtime wiring and platform-neutral routes.
   - Verify: route tests cover create, get, latest, and history without direct Prisma access.
7. Update exports, architecture checks where required, seed compatibility, and delivery documentation.
   - Verify: no forbidden module or direct layer dependency is introduced.
8. Run the complete validation pipeline and Docker smoke.
   - Verify: install, Prisma checks, migration, seed, format, lint, architecture, typecheck, unit/integration tests, build, and health routes pass.
9. Commit, push, run GitHub Actions, and download evidence.
   - Verify: `verify` and `container-smoke` succeed and the complete evidence directory is packaged as ZIP.
