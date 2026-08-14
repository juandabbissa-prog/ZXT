import {
  evidenceCandidateSchema,
  type Clock,
  type DuplicateLookup,
  type DuplicateLookupResult,
} from '../src/evidence-intake';
import { describe, expect, test } from 'vitest';
import candidateFixture from './fixtures/evidence-intake/candidate.json';
import dataSourceFixture from './fixtures/evidence-intake/data-source.json';
import policyFixture from './fixtures/evidence-intake/policy.json';
import { canonicalizeEvidenceIdentity } from '../src/evidence-intake/canonicalization';
import { createEvidenceIntakeGate } from '../src/evidence-intake/evidence-intake-gate';

const GOLDEN_CANONICAL_BYTES =
  '{"canonicalizationVersion":"1.0.0","schemaVersion":"1.0.0","dataSourceId":"source-fixture-001","sourceType":"FIXTURE","sourceRecordId":"record-fixture-001","businessSpaceId":"business-test-001","purposeCode":"test-evidence","evidenceType":"TEXT","content":"Synthetic fixture evidence.","sourceReference":null,"referenceUrl":"https://fixture.test/evidence/001","occurredAt":"2026-01-01T23:00:00.000Z","observedAt":"2026-01-02T00:00:00.000Z"}';
const GOLDEN_FINGERPRINT = '7aa8425d7f54d399ceec907e4b4e286d7dfb05248d24ef85f79d1f5abfd4fe38';
const parsedCandidateFixture = evidenceCandidateSchema.parse(candidateFixture);

const clone = <T>(value: T): T => structuredClone(value);

const fixedClock = (instant: string): Clock => ({ now: () => instant });

const lookup = (result: DuplicateLookupResult): DuplicateLookup => ({
  has: () => Promise.resolve(result),
});

const availableLookup = (found = false, existingEvidenceId: string | null = null) =>
  lookup({ status: 'AVAILABLE', found, existingEvidenceId });

const gateAt = (instant: string, duplicateLookup: DuplicateLookup = availableLookup()) =>
  createEvidenceIntakeGate({
    clock: fixedClock(instant),
    duplicateLookup,
    canonicalizationVersion: '1.0.0',
    validatorVersion: '1.0.0',
  });

describe('canonicalizeEvidenceIdentity', () => {
  test('matches the fixed canonical bytes and SHA-256 golden vector', () => {
    const identity = canonicalizeEvidenceIdentity(parsedCandidateFixture, '1.0.0');

    expect(identity).toEqual({
      canonicalBytes: GOLDEN_CANONICAL_BYTES,
      fingerprint: GOLDEN_FINGERPRINT,
      evidenceId: `ev1_${GOLDEN_FINGERPRINT}`,
    });
  });

  test('excludes runtime metadata from evidence identity', () => {
    const changedAcquisition = clone(candidateFixture);
    changedAcquisition.acquiredAt = '2026-01-02T02:00:00.000Z';

    expect(
      canonicalizeEvidenceIdentity(evidenceCandidateSchema.parse(changedAcquisition), '1.0.0'),
    ).toEqual(canonicalizeEvidenceIdentity(parsedCandidateFixture, '1.0.0'));
  });

  test('normalizes canonical text to trimmed Unicode NFC', () => {
    const candidate = clone(candidateFixture);
    candidate.content = '  Cafe\u0301 evidence.  ';

    const identity = canonicalizeEvidenceIdentity(
      evidenceCandidateSchema.parse(candidate),
      '1.0.0',
    );

    expect(identity.canonicalBytes).toContain('"content":"Café evidence."');
    expect(identity.canonicalBytes).not.toContain('Café');
  });
});

describe('EvidenceIntakeGate', () => {
  test('accepts valid fresh evidence and constructs an envelope', async () => {
    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result.status).toBe('ACCEPTED');
    if (result.status === 'ACCEPTED') {
      expect(result.evidence).toMatchObject({
        evidenceId: `ev1_${GOLDEN_FINGERPRINT}`,
        fingerprint: GOLDEN_FINGERPRINT,
        canonicalizationVersion: '1.0.0',
        validationStatus: 'ACCEPTED',
        validatedAt: '2026-01-02T12:00:00.000Z',
        validatorVersion: '1.0.0',
        qualityFacts: { freshness: 'FRESH' },
        realtimeEligibility: 'ELIGIBLE',
        redactionStatus: 'NOT_REQUIRED',
      });
    }
  });

  test.each([
    ['governanceStatus', 'PAUSED'],
    ['dataSourceId', 'other-source'],
    ['sourceType', 'MANUAL_IMPORT'],
    ['businessSpaceId', 'other-space'],
  ] as const)('rejects invalid governance field %s', async (field, value) => {
    const dataSource = clone(dataSourceFixture);
    dataSource[field] = value;

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate: candidateFixture,
      dataSource,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'GOVERNANCE_DENIED', field },
    });
  });

  test('rejects a purpose outside the descriptor allowlist', async () => {
    const candidate = clone(candidateFixture);
    candidate.purposeCode = 'other-purpose';

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'GOVERNANCE_DENIED', field: 'purposeCode' },
    });
  });

  test('rejects an unsupported schema version', async () => {
    const candidate = clone(candidateFixture);
    candidate.schemaVersion = '2.0.0';

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'VERSION_MISMATCH', field: 'schemaVersion' },
    });
  });

  test('distinguishes a missing required field from UNKNOWN freshness', async () => {
    const missing = clone(candidateFixture) as Record<string, unknown>;
    delete missing.content;

    const missingResult = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate: missing,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });
    const unknownPolicy = { ...clone(policyFixture), maxAgeByEvidenceType: {} };
    const unknownResult = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: unknownPolicy,
    });

    expect(missingResult).toEqual({
      status: 'REJECTED',
      error: { code: 'MISSING_REQUIRED_FIELD', field: 'content' },
    });
    expect(unknownResult).toMatchObject({
      status: 'ACCEPTED',
      evidence: {
        qualityFacts: { freshness: 'UNKNOWN' },
        realtimeEligibility: 'INELIGIBLE',
      },
    });
  });

  test('rejects invalid time order without correcting input', async () => {
    const candidate = clone(candidateFixture);
    candidate.occurredAt = '2026-01-02T00:01:00.000Z';
    const before = clone(candidate);

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'INVALID_TIME_ORDER', field: 'occurredAt' },
    });
    expect(candidate).toEqual(before);
  });

  test('rejects acquired time beyond the allowed clock skew', async () => {
    const candidate = clone(candidateFixture);
    candidate.acquiredAt = '2026-01-02T12:06:00.000Z';

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'CLOCK_SKEW_EXCEEDED', field: 'acquiredAt' },
    });
  });

  test('rejects observed time beyond acquired time plus allowed skew', async () => {
    const candidate = clone(candidateFixture);
    candidate.observedAt = '2026-01-02T01:06:00.000Z';

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'CLOCK_SKEW_EXCEEDED', field: 'observedAt' },
    });
  });

  test('accepts stale evidence but makes it realtime-ineligible', async () => {
    const result = await gateAt('2026-01-03T00:00:00.001Z').evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toMatchObject({
      status: 'ACCEPTED',
      evidence: {
        validationStatus: 'ACCEPTED',
        qualityFacts: { freshness: 'STALE' },
        realtimeEligibility: 'INELIGIBLE',
      },
    });
  });

  test('returns DUPLICATE without constructing another envelope', async () => {
    const result = await gateAt(
      '2026-01-02T12:00:00.000Z',
      availableLookup(true, 'existing-evidence-001'),
    ).evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'DUPLICATE',
      fingerprint: GOLDEN_FINGERPRINT,
      existingEvidenceId: 'existing-evidence-001',
    });
    expect(result).not.toHaveProperty('evidence');
  });

  test.each([
    lookup({ status: 'UNAVAILABLE', reasonCode: 'fixture-unavailable' }),
    { has: () => Promise.reject(new Error('fixture failure')) },
  ])('maps unavailable duplicate lookup to a rejected result', async (duplicateLookup) => {
    const result = await gateAt('2026-01-02T12:00:00.000Z', duplicateLookup).evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(result).toEqual({
      status: 'REJECTED',
      error: { code: 'DEPENDENCY_UNAVAILABLE', field: 'duplicateLookup' },
    });
  });

  test('replays identical decision inputs deterministically', async () => {
    const gate = gateAt('2026-01-02T12:00:00.000Z');
    const input = {
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    };

    expect(await gate.evaluate(input)).toEqual(await gate.evaluate(input));
  });

  test('keeps identity stable across the freshness threshold', async () => {
    const fresh = await gateAt('2026-01-02T23:00:00.000Z').evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });
    const stale = await gateAt('2026-01-03T00:00:00.001Z').evaluate({
      candidate: candidateFixture,
      dataSource: dataSourceFixture,
      policy: policyFixture,
    });

    expect(fresh.status).toBe('ACCEPTED');
    expect(stale.status).toBe('ACCEPTED');
    if (fresh.status === 'ACCEPTED' && stale.status === 'ACCEPTED') {
      expect(fresh.evidence.fingerprint).toBe(stale.evidence.fingerprint);
      expect(fresh.evidence.evidenceId).toBe(stale.evidence.evidenceId);
      expect(fresh.evidence.qualityFacts.freshness).toBe('FRESH');
      expect(stale.evidence.qualityFacts.freshness).toBe('STALE');
    }
  });

  test('does not mutate explicit inputs or add downstream business fields', async () => {
    const candidate = clone(candidateFixture);
    const dataSource = clone(dataSourceFixture);
    const policy = clone(policyFixture);
    const before = clone({ candidate, dataSource, policy });

    const result = await gateAt('2026-01-02T12:00:00.000Z').evaluate({
      candidate,
      dataSource,
      policy,
    });

    expect({ candidate, dataSource, policy }).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(/signal|intent|persona|customer|lead|scoring/iu);
  });
});
