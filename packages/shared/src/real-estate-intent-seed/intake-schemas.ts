import { z } from 'zod';
import { seedCorpusSchema } from './schemas';
import { checksumSourceArtifact } from './checksum-source-artifact';
import {
  ACCEPTED_SOURCE_ENCODINGS,
  ACCEPTED_SOURCE_FORMATS,
  CONTENT_ORIGINS,
  DOCX_EXTRACTION_VERSION,
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
    declaredSourceEncoding: z.string().trim().min(1).max(40).nullable(),
    expectedSourceArtifactSha256: sha256Schema.optional(),
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
  .superRefine((metadata, context) => {
    if (metadata.declaredSourceFormat === 'DOCX') {
      if (metadata.declaredSourceEncoding !== null)
        context.addIssue({
          code: 'custom',
          path: ['declaredSourceEncoding'],
          message: 'DOCX requires a null declaredSourceEncoding',
        });
      if (!metadata.expectedSourceArtifactSha256)
        context.addIssue({
          code: 'custom',
          path: ['expectedSourceArtifactSha256'],
          message: 'DOCX requires an expected source artifact checksum',
        });
    } else if (metadata.declaredSourceEncoding === null)
      context.addIssue({
        code: 'custom',
        path: ['declaredSourceEncoding'],
        message: 'Non-DOCX source formats require a declared encoding',
      });
  })
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
  itemCountExcludedProvenanceNotice: z.number().int().nonnegative().default(0),
} as const;

export const intakeReportSchema = z
  .object({
    reportSchemaVersion: z.literal(INTAKE_REPORT_SCHEMA_VERSION),
    sourceArtifactId: identifierSchema,
    sourceArtifactSha256: sha256Schema,
    declaredSourceFormat: z.string().min(1).max(40),
    declaredSourceEncoding: z.string().min(1).max(40).nullable(),
    acceptedSourceFormat: z.enum(ACCEPTED_SOURCE_FORMATS).nullable(),
    acceptedSourceEncoding: z.enum(ACCEPTED_SOURCE_ENCODINGS).nullable(),
    status: z.enum(['SUCCESS', 'FAILURE']),
    errorCode: z.enum(INTAKE_ERROR_CODES).nullable(),
    records: z.array(intakeRecordSchema).readonly(),
    ...intakeCountsShape,
  })
  .strict()
  .readonly();

const provenanceManifestBaseShape = {
  manifestSchemaVersion: z.literal(PROVENANCE_MANIFEST_SCHEMA_VERSION),
  sourceArtifactId: identifierSchema,
  sourceArtifactFilename: z.string().min(1).max(255),
  sourceArtifactSha256: sha256Schema,
  sourceArtifactByteLength: z.number().int().nonnegative(),
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
} as const;

const txtProvenanceManifestSchema = z
  .object({
    ...provenanceManifestBaseShape,
    declaredSourceFormat: z.literal('TXT'),
    declaredSourceEncoding: z.enum(ACCEPTED_SOURCE_ENCODINGS),
    acceptedSourceFormat: z.literal('TXT'),
    acceptedSourceEncoding: z.enum(ACCEPTED_SOURCE_ENCODINGS),
  })
  .strict();

const docxProvenanceManifestSchema = z
  .object({
    ...provenanceManifestBaseShape,
    expectedSourceArtifactSha256: sha256Schema,
    declaredSourceFormat: z.literal('DOCX'),
    declaredSourceEncoding: z.null(),
    acceptedSourceFormat: z.literal('DOCX'),
    acceptedSourceEncoding: z.null(),
    docxExtractionVersion: z.literal(DOCX_EXTRACTION_VERSION),
    extractedTextArtifactSha256: sha256Schema,
    sourceRecordCount: z.number().int().nonnegative(),
  })
  .strict();

export const provenanceManifestSchema = z
  .discriminatedUnion('acceptedSourceFormat', [
    txtProvenanceManifestSchema,
    docxProvenanceManifestSchema,
  ])
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
  .superRefine(({ manifest, intakeReport, corpus, canonicalCorpusJson }, context) => {
    if (intakeReport.status !== 'SUCCESS')
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'status'],
        message: 'SUCCESS result requires a SUCCESS intake report',
      });
    if (intakeReport.errorCode !== null)
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'errorCode'],
        message: 'SUCCESS result requires a null intake report errorCode',
      });
    const countFields = [
      'itemCountRaw',
      'itemCountValid',
      'itemCountEmpty',
      'itemCountMalformed',
      'itemCountUnsupported',
      'itemCountExcludedProvenanceNotice',
    ] as const;
    for (const field of countFields)
      if (manifest[field] !== intakeReport[field])
        context.addIssue({
          code: 'custom',
          path: ['intakeReport', field],
          message: `Manifest and intake report ${field} must match`,
        });
    const classifiedCount =
      intakeReport.itemCountValid +
      intakeReport.itemCountEmpty +
      intakeReport.itemCountMalformed +
      intakeReport.itemCountUnsupported +
      intakeReport.itemCountExcludedProvenanceNotice;
    if (
      intakeReport.itemCountRaw !== intakeReport.records.length ||
      classifiedCount !== intakeReport.itemCountRaw
    )
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'itemCountRaw'],
        message: 'Intake counts must exactly classify all records',
      });
    if (corpus.items.length !== intakeReport.records.filter((record) => record.included).length)
      context.addIssue({
        code: 'custom',
        path: ['corpus', 'items'],
        message: 'Corpus items must match included intake records',
      });
    if (
      manifest.sourceArtifactId !== intakeReport.sourceArtifactId ||
      manifest.sourceArtifactSha256 !== intakeReport.sourceArtifactSha256
    )
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'sourceArtifactSha256'],
        message: 'Manifest and report source identity must match',
      });
    if (
      manifest.acceptedSourceFormat !== intakeReport.acceptedSourceFormat ||
      manifest.acceptedSourceEncoding !== intakeReport.acceptedSourceEncoding ||
      manifest.declaredSourceFormat !== intakeReport.declaredSourceFormat ||
      manifest.declaredSourceEncoding !== intakeReport.declaredSourceEncoding
    )
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'acceptedSourceFormat'],
        message: 'Manifest and report source format/encoding must match',
      });
    if (
      manifest.convertedArtifactSha256 !==
      checksumSourceArtifact(new TextEncoder().encode(canonicalCorpusJson))
    )
      context.addIssue({
        code: 'custom',
        path: ['manifest', 'convertedArtifactSha256'],
        message: 'Converted artifact checksum must match canonical corpus bytes',
      });
    if (`${JSON.stringify(corpus, null, 2)}\n` !== canonicalCorpusJson)
      context.addIssue({
        code: 'custom',
        path: ['canonicalCorpusJson'],
        message: 'Canonical corpus JSON must serialize the corpus exactly',
      });
    if (
      manifest.acceptedSourceFormat === 'DOCX' &&
      manifest.sourceRecordCount !== intakeReport.itemCountRaw
    )
      context.addIssue({
        code: 'custom',
        path: ['manifest', 'sourceRecordCount'],
        message: 'DOCX sourceRecordCount must equal raw paragraph count',
      });
  })
  .readonly();

export const seedSourceIntakeFailureSchema = z
  .object({
    status: z.literal('FAILURE'),
    errorCode: z.enum(INTAKE_ERROR_CODES),
    intakeReport: intakeReportSchema,
  })
  .strict()
  .superRefine(({ errorCode, intakeReport }, context) => {
    if (intakeReport.status !== 'FAILURE')
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'status'],
        message: 'FAILURE result requires a FAILURE intake report',
      });
    if (intakeReport.errorCode === null)
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'errorCode'],
        message: 'FAILURE result requires a non-null intake report errorCode',
      });
    else if (intakeReport.errorCode !== errorCode)
      context.addIssue({
        code: 'custom',
        path: ['intakeReport', 'errorCode'],
        message: 'FAILURE result and intake report errorCode must match',
      });
  })
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
