import { z } from 'zod';
import { seedCorpusSchema } from './schemas';
import {
  ACCEPTED_SOURCE_ENCODINGS,
  ACCEPTED_SOURCE_FORMATS,
  CONTENT_ORIGINS,
  INTAKE_ERROR_CODES,
  INTAKE_RECORD_STATUSES,
  INTAKE_REPORT_SCHEMA_VERSION,
  PERSONAL_DATA_DECLARATIONS,
  PROVENANCE_MANIFEST_SCHEMA_VERSION,
  SEED_IDENTITY_VERSION,
} from './intake-contracts';

const identifierSchema = z.string().trim().min(1).max(160);
const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const receivedAtSchema = z.string().datetime({ offset: true });

export const seedSourceIntakeMetadataSchema = z
  .object({
    sourceArtifactId: identifierSchema,
    sourceArtifactFilename: z.string().min(1).max(255),
    declaredSourceFormat: z.string().trim().min(1).max(40),
    declaredSourceEncoding: z.string().trim().min(1).max(40),
    generationMethod: identifierSchema,
    contentOrigin: z.enum(CONTENT_ORIGINS),
    sourceReference: z.string().min(1).nullable(),
    userProvided: z.literal(true),
    receivedAt: receivedAtSchema,
    personalDataDeclaration: z.enum(PERSONAL_DATA_DECLARATIONS),
    repositoryStoragePermission: z.boolean(),
    market: z.literal('CN-LN-DALIAN'),
    compilerMarket: z.literal('dalian-real-estate'),
    locale: z.literal('zh-CN'),
    corpusId: identifierSchema,
    corpusVersion: versionSchema,
    normalizationVersion: versionSchema,
  })
  .strict()
  .readonly();

export const seedSourceIntakeRequestSchema = z
  .object({
    sourceBytes: z.instanceof(Uint8Array),
    metadata: seedSourceIntakeMetadataSchema,
  })
  .strict()
  .readonly();

export const seedIdentityPayloadSchema = z
  .object({
    seedIdentityVersion: z.literal(SEED_IDENTITY_VERSION),
    sourceArtifactId: identifierSchema,
    sourceArtifactSha256: sha256Schema,
    rawText: z.string().max(500),
    sourceOccurrenceOrdinalAmongIdenticalRawText: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const intakeRecordSchema = z
  .object({
    originalOrder: z.number().int().nonnegative().nullable(),
    rawText: z.string().max(500).nullable(),
    status: z.enum(INTAKE_RECORD_STATUSES),
    included: z.boolean(),
    errorCode: z.enum(INTAKE_ERROR_CODES).nullable(),
    reason: z.string().min(1).nullable(),
  })
  .strict()
  .readonly();

const intakeCountsShape = {
  itemCountRaw: z.number().int().nonnegative(),
  itemCountValid: z.number().int().nonnegative(),
  itemCountEmpty: z.number().int().nonnegative(),
  itemCountMalformed: z.number().int().nonnegative(),
  itemCountUnsupported: z.number().int().nonnegative(),
} as const;

export const intakeReportSchema = z
  .object({
    reportSchemaVersion: z.literal(INTAKE_REPORT_SCHEMA_VERSION),
    sourceArtifactId: identifierSchema,
    sourceArtifactSha256: sha256Schema,
    declaredSourceFormat: z.string().min(1).max(40),
    declaredSourceEncoding: z.string().min(1).max(40),
    acceptedSourceFormat: z.enum(ACCEPTED_SOURCE_FORMATS).nullable(),
    acceptedSourceEncoding: z.enum(ACCEPTED_SOURCE_ENCODINGS).nullable(),
    status: z.enum(['SUCCESS', 'FAILURE']),
    errorCode: z.enum(INTAKE_ERROR_CODES).nullable(),
    records: z.array(intakeRecordSchema).readonly(),
    ...intakeCountsShape,
  })
  .strict()
  .readonly();

export const provenanceManifestSchema = z
  .object({
    manifestSchemaVersion: z.literal(PROVENANCE_MANIFEST_SCHEMA_VERSION),
    sourceArtifactId: identifierSchema,
    sourceArtifactFilename: z.string().min(1).max(255),
    sourceArtifactSha256: sha256Schema,
    sourceArtifactByteLength: z.number().int().nonnegative(),
    declaredSourceFormat: z.string().min(1).max(40),
    declaredSourceEncoding: z.string().min(1).max(40),
    acceptedSourceFormat: z.enum(ACCEPTED_SOURCE_FORMATS),
    acceptedSourceEncoding: z.enum(ACCEPTED_SOURCE_ENCODINGS),
    source: z.literal('SEED_GENERATED'),
    generationMethod: identifierSchema,
    contentOrigin: z.enum(CONTENT_ORIGINS),
    sourceReference: z.string().min(1).nullable(),
    userProvided: z.literal(true),
    receivedAt: receivedAtSchema,
    personalDataDeclaration: z.literal('NO_PERSONAL_OR_PRIVATE_DATA'),
    repositoryStoragePermission: z.literal(true),
    market: z.literal('CN-LN-DALIAN'),
    compilerMarket: z.literal('dalian-real-estate'),
    locale: z.literal('zh-CN'),
    corpusId: identifierSchema,
    corpusVersion: versionSchema,
    normalizationVersion: versionSchema,
    ...intakeCountsShape,
    conversionToolVersion: versionSchema,
    convertedArtifactSha256: sha256Schema,
  })
  .strict()
  .readonly();

export const seedSourceIntakeSuccessSchema = z
  .object({
    status: z.literal('SUCCESS'),
    manifest: provenanceManifestSchema,
    intakeReport: intakeReportSchema,
    corpus: seedCorpusSchema,
    canonicalCorpusJson: z.string().min(1),
  })
  .strict()
  .readonly();

export const seedSourceIntakeFailureSchema = z
  .object({
    status: z.literal('FAILURE'),
    errorCode: z.enum(INTAKE_ERROR_CODES),
    intakeReport: intakeReportSchema,
  })
  .strict()
  .readonly();

export const seedSourceIntakeResultSchema = z.union([
  seedSourceIntakeSuccessSchema,
  seedSourceIntakeFailureSchema,
]);

export type SeedSourceIntakeMetadata = z.infer<typeof seedSourceIntakeMetadataSchema>;
export type SeedIdentityPayload = z.infer<typeof seedIdentityPayloadSchema>;
export type IntakeRecord = z.infer<typeof intakeRecordSchema>;
export type IntakeReport = z.infer<typeof intakeReportSchema>;
export type ProvenanceManifest = z.infer<typeof provenanceManifestSchema>;
export type SeedSourceIntakeResult = z.infer<typeof seedSourceIntakeResultSchema>;
