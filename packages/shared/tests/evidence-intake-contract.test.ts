import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_INTAKE_ERROR_CODES,
  dataSourceDescriptorSchema,
  evidenceCandidateSchema,
  evidenceEnvelopeSchema,
  evidenceIntakePolicySchema,
  evidenceProvenanceSchema,
  gateResultSchema,
  sourcePayloadSchema,
} from '../src/evidence-intake';

const observedAt = '2026-08-14T01:00:00.000Z';
const acquiredAt = '2026-08-14T01:01:00.000Z';

const provenance = {
  acquisitionMethod: 'FIXTURE',
  sourceReference: 'fixture-record-1',
  complianceDeclarationVersion: '1.0.0',
} as const;

const candidate = {
  schemaVersion: '1.0.0',
  adapterId: 'manual-fixture',
  adapterVersion: '1.0.0',
  dataSourceId: 'source-1',
  sourceType: 'FIXTURE',
  sourceRecordId: 'record-1',
  businessSpaceId: 'space-1',
  purposeCode: 'PROSPECT_INTELLIGENCE',
  evidenceType: 'TEXT',
  content: 'A source-provided factual observation.',
  acquiredAt,
  observedAt,
  occurredAt: null,
  provenance,
  unknownFields: ['occurredAt'],
  referenceUrl: 'https://example.test/evidence/1',
  contentLanguage: 'en',
  sourceMetadata: { importBatch: 'fixture-batch-1' },
} as const;

describe('Evidence intake contracts', () => {
  it('accepts a complete platform-neutral contract', () => {
    expect(evidenceCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      dataSourceDescriptorSchema.parse({
        contractVersion: '1.0.0',
        dataSourceId: 'source-1',
        sourceType: 'FIXTURE',
        governanceStatus: 'ACTIVE',
        allowedPurposeCodes: ['PROSPECT_INTELLIGENCE'],
        businessSpaceId: 'space-1',
        complianceDeclarationVersion: '1.0.0',
      }),
    ).toMatchObject({ governanceStatus: 'ACTIVE' });
  });

  it('rejects invalid controlled vocabulary values', () => {
    expect(
      evidenceCandidateSchema.safeParse({ ...candidate, evidenceType: 'PERSONA' }).success,
    ).toBe(false);
    expect(
      dataSourceDescriptorSchema.safeParse({
        contractVersion: '1.0.0',
        dataSourceId: 'source-1',
        sourceType: 'FIXTURE',
        governanceStatus: 'UNKNOWN_STATUS',
        allowedPurposeCodes: ['PROSPECT_INTELLIGENCE'],
        businessSpaceId: 'space-1',
        complianceDeclarationVersion: '1.0.0',
      }).success,
    ).toBe(false);
  });

  it('rejects a missing required field instead of treating it as UNKNOWN', () => {
    expect(
      evidenceCandidateSchema.safeParse({ ...candidate, dataSourceId: undefined }).success,
    ).toBe(false);
    expect(
      evidenceCandidateSchema.safeParse({
        ...candidate,
        occurredAt: null,
        unknownFields: ['occurredAt'],
      }).success,
    ).toBe(true);
  });

  it('accepts only string or null at provenance.sourceReference', () => {
    expect(evidenceProvenanceSchema.safeParse(provenance).success).toBe(true);
    expect(
      evidenceProvenanceSchema.safeParse({ ...provenance, sourceReference: null }).success,
    ).toBe(true);
    expect(evidenceProvenanceSchema.safeParse({ ...provenance, sourceReference: 42 }).success).toBe(
      false,
    );
  });

  it('validates source payload metadata while leaving payload opaque', () => {
    const payload = {
      contractVersion: '1.0.0',
      dataSourceId: 'source-1',
      sourceType: 'FIXTURE',
      businessSpaceId: 'space-1',
      purposeCode: 'PROSPECT_INTELLIGENCE',
      sourceRecordId: 'record-1',
      acquisitionMethod: 'FIXTURE',
      acquiredAt,
      observedAt,
      occurredAt: null,
      sourceReference: null,
      traceId: 'trace-1',
      payload: { adapterOwned: true },
    };

    expect(sourcePayloadSchema.parse(payload)).toEqual(payload);
  });

  it('rejects invalid versions, URLs and timestamps', () => {
    expect(evidenceCandidateSchema.safeParse({ ...candidate, schemaVersion: 'v1' }).success).toBe(
      false,
    );
    expect(
      evidenceCandidateSchema.safeParse({ ...candidate, referenceUrl: 'file:///secret' }).success,
    ).toBe(false);
    expect(
      evidenceCandidateSchema.safeParse({ ...candidate, observedAt: '14 August 2026' }).success,
    ).toBe(false);
  });

  it('validates policy versions, durations and fixed policy vocabulary', () => {
    const policy = {
      policyVersion: '1.0.0',
      maxAgeByEvidenceType: { TEXT: 86_400_000 },
      maxFutureClockSkew: 30_000,
      missingOccurredAtBasis: 'OBSERVED_AT',
      unknownFreshnessBehavior: 'INELIGIBLE',
    } as const;

    expect(evidenceIntakePolicySchema.safeParse(policy).success).toBe(true);
    expect(
      evidenceIntakePolicySchema.safeParse({ ...policy, maxFutureClockSkew: -1 }).success,
    ).toBe(false);
    expect(
      evidenceIntakePolicySchema.safeParse({ ...policy, policyVersion: 'latest' }).success,
    ).toBe(false);
  });

  it('freezes parsed contract values without mutating the caller input', () => {
    const input = { ...provenance };
    const parsed = evidenceProvenanceSchema.parse(input);

    expect(parsed).not.toBe(input);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('freezes stable error codes and GateResult shapes without executing a Gate', () => {
    expect(EVIDENCE_INTAKE_ERROR_CODES).toContain('MISSING_REQUIRED_FIELD');
    expect(EVIDENCE_INTAKE_ERROR_CODES).toContain('DEPENDENCY_UNAVAILABLE');
    expect(
      gateResultSchema.safeParse({
        status: 'REJECTED',
        error: { code: 'MISSING_REQUIRED_FIELD', field: 'dataSourceId' },
      }).success,
    ).toBe(true);
    expect(
      gateResultSchema.safeParse({ status: 'REJECTED', error: { code: 'MADE_UP' } }).success,
    ).toBe(false);
  });

  it('validates an accepted EvidenceEnvelope shape without generating identity', () => {
    expect(
      evidenceEnvelopeSchema.safeParse({
        ...candidate,
        evidenceId: `ev1_${'a'.repeat(64)}`,
        fingerprint: 'a'.repeat(64),
        canonicalizationVersion: '1.0.0',
        validationStatus: 'ACCEPTED',
        validatedAt: acquiredAt,
        validatorVersion: '1.0.0',
        qualityFacts: { freshness: 'UNKNOWN' },
        realtimeEligibility: 'INELIGIBLE',
        redactionStatus: 'NOT_REQUIRED',
      }).success,
    ).toBe(true);
  });
});
