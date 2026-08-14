import { z } from 'zod';
import {
  ACQUISITION_METHODS,
  DATA_SOURCE_GOVERNANCE_STATUSES,
  DATA_SOURCE_TYPES,
  EVIDENCE_INTAKE_ERROR_CODES,
  EVIDENCE_TYPES,
  FRESHNESS_STATES,
  REALTIME_ELIGIBILITIES,
  REDACTION_STATUSES,
} from './contracts';

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u, 'Expected a semantic version');
const identifierSchema = z.string().trim().min(1).max(160);
const timestampSchema = z.string().datetime({ offset: true });
const durationSchema = z.number().int().nonnegative();
const httpUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith('http://') || value.startsWith('https://'), {
    message: 'Expected an HTTP or HTTPS URL',
  });
const sourceReferenceSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((value) => !/(?:authorization|cookie|password|secret|session|token)=/iu.test(value), {
    message: 'Source reference contains a secret-like value',
  })
  .nullable();

const sourceTypeSchema = z.enum(DATA_SOURCE_TYPES);
const acquisitionMethodSchema = z.enum(ACQUISITION_METHODS);
const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);

export const dataSourceDescriptorSchema = z
  .object({
    contractVersion: versionSchema,
    dataSourceId: identifierSchema,
    sourceType: sourceTypeSchema,
    governanceStatus: z.enum(DATA_SOURCE_GOVERNANCE_STATUSES),
    allowedPurposeCodes: z.array(identifierSchema).min(1).readonly(),
    businessSpaceId: identifierSchema,
    complianceDeclarationVersion: versionSchema,
  })
  .strict()
  .readonly();

export const sourcePayloadSchema = z
  .object({
    contractVersion: versionSchema,
    dataSourceId: identifierSchema,
    sourceType: sourceTypeSchema,
    businessSpaceId: identifierSchema,
    purposeCode: identifierSchema,
    sourceRecordId: identifierSchema,
    acquisitionMethod: acquisitionMethodSchema,
    acquiredAt: timestampSchema,
    observedAt: timestampSchema,
    occurredAt: timestampSchema.nullable(),
    sourceReference: sourceReferenceSchema,
    traceId: identifierSchema.optional(),
    payload: z.unknown(),
  })
  .strict()
  .readonly();

export const evidenceProvenanceSchema = z
  .object({
    acquisitionMethod: acquisitionMethodSchema,
    sourceReference: sourceReferenceSchema,
    complianceDeclarationVersion: versionSchema,
  })
  .strict()
  .readonly();

const evidenceCandidateShape = {
  schemaVersion: versionSchema,
  adapterId: identifierSchema,
  adapterVersion: versionSchema,
  dataSourceId: identifierSchema,
  sourceType: sourceTypeSchema,
  sourceRecordId: identifierSchema,
  businessSpaceId: identifierSchema,
  purposeCode: identifierSchema,
  evidenceType: evidenceTypeSchema,
  content: z.string().trim().min(1).max(10_000),
  acquiredAt: timestampSchema,
  observedAt: timestampSchema,
  occurredAt: timestampSchema.nullable(),
  provenance: evidenceProvenanceSchema,
  unknownFields: z.array(identifierSchema).readonly(),
  referenceUrl: httpUrlSchema.nullable(),
  contentLanguage: z.string().trim().min(2).max(35).nullable(),
  sourceMetadata: z.record(z.string().max(1000)).readonly(),
} as const;

export const evidenceCandidateSchema = z.object(evidenceCandidateShape).strict().readonly();

export const evidenceEnvelopeSchema = z
  .object({
    ...evidenceCandidateShape,
    evidenceId: z.string().regex(/^ev1_[a-f0-9]{64}$/u),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    canonicalizationVersion: versionSchema,
    validationStatus: z.literal('ACCEPTED'),
    validatedAt: timestampSchema,
    validatorVersion: versionSchema,
    qualityFacts: z
      .object({ freshness: z.enum(FRESHNESS_STATES) })
      .strict()
      .readonly(),
    realtimeEligibility: z.enum(REALTIME_ELIGIBILITIES),
    redactionStatus: z.enum(REDACTION_STATUSES),
  })
  .strict()
  .readonly();

export const evidenceIntakePolicySchema = z
  .object({
    policyVersion: versionSchema,
    maxAgeByEvidenceType: z.record(evidenceTypeSchema, durationSchema).readonly(),
    maxFutureClockSkew: durationSchema,
    missingOccurredAtBasis: z.literal('OBSERVED_AT'),
    unknownFreshnessBehavior: z.literal('INELIGIBLE'),
  })
  .strict()
  .readonly();

const rejectedGateResultSchema = z
  .object({
    status: z.literal('REJECTED'),
    error: z
      .object({
        code: z.enum(EVIDENCE_INTAKE_ERROR_CODES),
        field: identifierSchema.optional(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

const duplicateGateResultSchema = z
  .object({
    status: z.literal('DUPLICATE'),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
    existingEvidenceId: identifierSchema.nullable(),
  })
  .strict()
  .readonly();

const acceptedGateResultSchema = z
  .object({
    status: z.literal('ACCEPTED'),
    evidence: evidenceEnvelopeSchema,
  })
  .strict()
  .readonly();

export const gateResultSchema = z
  .union([acceptedGateResultSchema, rejectedGateResultSchema, duplicateGateResultSchema])
  .readonly();

export type DataSourceDescriptor = z.infer<typeof dataSourceDescriptorSchema>;
type ParsedSourcePayload = z.infer<typeof sourcePayloadSchema>;
export type SourcePayload<TPayload = unknown> = Omit<ParsedSourcePayload, 'payload'> &
  Readonly<{ payload: TPayload }>;
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>;
export type EvidenceCandidate = z.infer<typeof evidenceCandidateSchema>;
export type EvidenceEnvelope = z.infer<typeof evidenceEnvelopeSchema>;
export type EvidenceIntakePolicy = z.infer<typeof evidenceIntakePolicySchema>;
export type GateResult = z.infer<typeof gateResultSchema>;
