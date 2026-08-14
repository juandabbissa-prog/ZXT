import {
  dataSourceDescriptorSchema,
  evidenceCandidateSchema,
  sourcePayloadSchema,
} from '@re-agent/shared';
import { z } from 'zod';
import type { AdapterContract, AdapterFailure, AdapterResult } from './adapter-contract';

const CONTRACT_VERSION = '1.0.0';
const ADAPTER_VERSION = '1.0.0';
const SECRET_PATTERN = /(?:authorization|cookie|password|secret|session|token)=/iu;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

const referencePayloadSchema = z
  .object({
    evidenceType: z.enum(['TEXT', 'URL', 'METRIC', 'OBSERVATION']),
    content: z.string().trim().min(1).max(10_000),
    unknownFields: z.array(z.string().trim().min(1).max(160)).readonly(),
    referenceUrl: z
      .string()
      .url()
      .refine((value) => value.startsWith('http://') || value.startsWith('https://'))
      .nullable(),
    contentLanguage: z.string().trim().min(2).max(35).nullable(),
    sourceMetadata: z.record(z.string().max(1000)).readonly(),
  })
  .strict()
  .readonly();

const failure = (code: AdapterFailure['error']['code'], field: string | null): AdapterFailure => ({
  status: 'ERROR',
  error: { code, field },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issuePath = (path: PropertyKey[], prefix?: string): string | null => {
  const suffix = path.map(String).join('.');
  if (prefix && suffix) return `${prefix}.${suffix}`;
  return prefix ?? (suffix || null);
};

const versionFailure = (value: unknown, field: string): AdapterFailure | null => {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value) || value !== CONTRACT_VERSION) {
    return failure('VERSION_MISMATCH', field);
  }
  return null;
};

export const manualFixtureAdapter: AdapterContract = {
  adapterId: 'manual-fixture',
  adapterVersion: ADAPTER_VERSION,
  supportedSourceTypes: ['FIXTURE', 'MANUAL_IMPORT'],

  adapt(sourcePayload: unknown, dataSource: unknown): AdapterResult {
    if (
      isRecord(sourcePayload) &&
      typeof sourcePayload.sourceReference === 'string' &&
      SECRET_PATTERN.test(sourcePayload.sourceReference)
    ) {
      return failure('SECRET_DETECTED', 'sourceReference');
    }

    if (isRecord(sourcePayload)) {
      const invalidVersion = versionFailure(sourcePayload.contractVersion, 'contractVersion');
      if (invalidVersion) return invalidVersion;
    }
    if (isRecord(dataSource)) {
      const invalidVersion = versionFailure(dataSource.contractVersion, 'contractVersion');
      if (invalidVersion) return invalidVersion;
      const invalidComplianceVersion = versionFailure(
        dataSource.complianceDeclarationVersion,
        'complianceDeclarationVersion',
      );
      if (invalidComplianceVersion) return invalidComplianceVersion;
    }

    const parsedPayload = sourcePayloadSchema.safeParse(sourcePayload);
    if (!parsedPayload.success) {
      return failure('MALFORMED_PAYLOAD', issuePath(parsedPayload.error.issues[0]?.path ?? []));
    }

    const parsedDataSource = dataSourceDescriptorSchema.safeParse(dataSource);
    if (!parsedDataSource.success) {
      return failure('MALFORMED_PAYLOAD', issuePath(parsedDataSource.error.issues[0]?.path ?? []));
    }

    if (
      parsedPayload.data.sourceType !== 'FIXTURE' &&
      parsedPayload.data.sourceType !== 'MANUAL_IMPORT'
    ) {
      return failure('UNSUPPORTED_SOURCE', 'sourceType');
    }

    for (const field of [
      'dataSourceId',
      'sourceType',
      'businessSpaceId',
      'contractVersion',
    ] as const) {
      if (parsedPayload.data[field] !== parsedDataSource.data[field]) {
        return failure('INVALID_INPUT', field);
      }
    }

    const parsedReferencePayload = referencePayloadSchema.safeParse(parsedPayload.data.payload);
    if (!parsedReferencePayload.success) {
      return failure(
        'MALFORMED_PAYLOAD',
        issuePath(parsedReferencePayload.error.issues[0]?.path ?? [], 'payload'),
      );
    }

    const candidate = evidenceCandidateSchema.safeParse({
      schemaVersion: CONTRACT_VERSION,
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      dataSourceId: parsedPayload.data.dataSourceId,
      sourceType: parsedPayload.data.sourceType,
      sourceRecordId: parsedPayload.data.sourceRecordId,
      businessSpaceId: parsedPayload.data.businessSpaceId,
      purposeCode: parsedPayload.data.purposeCode,
      evidenceType: parsedReferencePayload.data.evidenceType,
      content: parsedReferencePayload.data.content,
      acquiredAt: parsedPayload.data.acquiredAt,
      observedAt: parsedPayload.data.observedAt,
      occurredAt: parsedPayload.data.occurredAt,
      provenance: {
        acquisitionMethod: parsedPayload.data.acquisitionMethod,
        sourceReference: parsedPayload.data.sourceReference,
        complianceDeclarationVersion: parsedDataSource.data.complianceDeclarationVersion,
      },
      unknownFields: parsedReferencePayload.data.unknownFields,
      referenceUrl: parsedReferencePayload.data.referenceUrl,
      contentLanguage: parsedReferencePayload.data.contentLanguage,
      sourceMetadata: parsedReferencePayload.data.sourceMetadata,
    });

    if (!candidate.success) {
      return failure('INVALID_INPUT', issuePath(candidate.error.issues[0]?.path ?? []));
    }

    return { status: 'SUCCESS', candidate: candidate.data };
  },
};
