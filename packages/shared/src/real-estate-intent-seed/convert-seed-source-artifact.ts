import { createHash } from 'node:crypto';
import { SEED_COMPILER_SCHEMA_VERSION } from './contracts';
import { checksumSourceArtifact } from './checksum-source-artifact';
import {
  INTAKE_REPORT_SCHEMA_VERSION,
  PROVENANCE_MANIFEST_SCHEMA_VERSION,
  SEED_IDENTITY_VERSION,
  SEED_SOURCE_CONVERSION_TOOL_VERSION,
  type INTAKE_ERROR_CODES,
} from './intake-contracts';
import {
  intakeReportSchema,
  seedIdentityPayloadSchema,
  seedSourceIntakeRequestSchema,
  seedSourceIntakeResultSchema,
  type IntakeRecord,
  type SeedIdentityPayload,
  type SeedSourceIntakeMetadata,
  type SeedSourceIntakeResult,
} from './intake-schemas';
import { seedCorpusSchema } from './schemas';

type IntakeErrorCode = (typeof INTAKE_ERROR_CODES)[number];

const sha256Json = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');

export const createSeedObservationId = (input: unknown): string => {
  const payload = seedIdentityPayloadSchema.parse(input);
  return `seed1_${sha256Json(payload)}`;
};

const hasUtf8Bom = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;

const splitLogicalRecords = (text: string): string[] => {
  const records = text.split(/\r\n|\n|\r/u);
  if (/(?:\r\n|\n|\r)$/u.test(text)) records.pop();
  return records;
};

const countsFromRecords = (records: readonly IntakeRecord[]) => ({
  itemCountRaw: records.length,
  itemCountValid: records.filter((record) => record.status === 'VALID').length,
  itemCountEmpty: records.filter((record) => record.status === 'EMPTY').length,
  itemCountMalformed: records.filter((record) => record.status === 'MALFORMED').length,
  itemCountUnsupported: records.filter((record) => record.status === 'UNSUPPORTED').length,
});

const failure = (
  metadata: SeedSourceIntakeMetadata,
  sourceArtifactSha256: string,
  errorCode: IntakeErrorCode,
  status: 'MALFORMED' | 'UNSUPPORTED',
  reason: string,
  acceptedSourceFormat: 'TXT' | null = null,
  acceptedSourceEncoding: 'UTF-8' | 'UTF-8-BOM' | null = null,
  parsedRecords?: readonly IntakeRecord[],
): SeedSourceIntakeResult => {
  const records: readonly IntakeRecord[] = parsedRecords
    ? parsedRecords.map((record) => ({ ...record, included: false }))
    : [{ originalOrder: null, rawText: null, status, included: false, errorCode, reason }];
  const intakeReport = intakeReportSchema.parse({
    reportSchemaVersion: INTAKE_REPORT_SCHEMA_VERSION,
    sourceArtifactId: metadata.sourceArtifactId,
    sourceArtifactSha256,
    declaredSourceFormat: metadata.declaredSourceFormat,
    declaredSourceEncoding: metadata.declaredSourceEncoding,
    acceptedSourceFormat,
    acceptedSourceEncoding,
    status: 'FAILURE',
    errorCode,
    records,
    ...countsFromRecords(records),
  });
  return seedSourceIntakeResultSchema.parse({ status: 'FAILURE', errorCode, intakeReport });
};

export const convertSeedSourceArtifact = (input: unknown): SeedSourceIntakeResult => {
  const { sourceBytes, metadata } = seedSourceIntakeRequestSchema.parse(input);
  const sourceArtifactSha256 = checksumSourceArtifact(sourceBytes);

  if (metadata.personalDataDeclaration !== 'NO_PERSONAL_OR_PRIVATE_DATA')
    return failure(
      metadata,
      sourceArtifactSha256,
      'PRIVACY_DECLARATION_REQUIRED',
      'UNSUPPORTED',
      'A no-personal/private-data declaration is required',
    );
  if (!metadata.repositoryStoragePermission)
    return failure(
      metadata,
      sourceArtifactSha256,
      'REPOSITORY_STORAGE_PERMISSION_REQUIRED',
      'UNSUPPORTED',
      'Repository storage permission is required',
    );
  if (metadata.declaredSourceFormat !== 'TXT')
    return failure(
      metadata,
      sourceArtifactSha256,
      'UNSUPPORTED_FORMAT',
      'UNSUPPORTED',
      'Only TXT is supported by this intake version',
    );

  const bom = hasUtf8Bom(sourceBytes);
  const acceptedSourceEncoding = bom ? 'UTF-8-BOM' : 'UTF-8';
  const contentBytes = bom ? sourceBytes.subarray(3) : sourceBytes;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(contentBytes);
  } catch {
    return failure(
      metadata,
      sourceArtifactSha256,
      'MALFORMED_ENCODING',
      'MALFORMED',
      'Source bytes are not valid UTF-8',
    );
  }
  if (metadata.declaredSourceEncoding !== acceptedSourceEncoding)
    return failure(
      metadata,
      sourceArtifactSha256,
      'DECLARED_ENCODING_MISMATCH',
      'UNSUPPORTED',
      'Declared encoding does not match verified source bytes',
      'TXT',
      acceptedSourceEncoding,
    );

  const rawRecords = splitLogicalRecords(text);
  const occurrenceOrdinals = new Map<string, number>();
  const records: IntakeRecord[] = [];
  const items: Array<{
    seedId: string;
    rawText: string;
    source: 'SEED_GENERATED';
    provenance: {
      sourceReference: string | null;
      sourceArtifactId: string;
      generationMethod: string;
    };
    originalOrder: number;
  }> = [];

  for (const [originalOrder, rawText] of rawRecords.entries()) {
    if (rawText.length > 500) {
      records.push({
        originalOrder,
        rawText: null,
        status: 'MALFORMED',
        included: false,
        errorCode: 'RECORD_TOO_LONG',
        reason: 'Record exceeds the SeedCorpus 500-character limit',
      });
      continue;
    }
    const ordinal = occurrenceOrdinals.get(rawText) ?? 0;
    occurrenceOrdinals.set(rawText, ordinal + 1);
    const identityPayload: SeedIdentityPayload = {
      seedIdentityVersion: SEED_IDENTITY_VERSION,
      sourceArtifactId: metadata.sourceArtifactId,
      sourceArtifactSha256,
      rawText,
      sourceOccurrenceOrdinalAmongIdenticalRawText: ordinal,
    };
    items.push({
      seedId: createSeedObservationId(identityPayload),
      rawText,
      source: 'SEED_GENERATED',
      provenance: {
        sourceReference: metadata.sourceReference,
        sourceArtifactId: metadata.sourceArtifactId,
        generationMethod: metadata.generationMethod,
      },
      originalOrder,
    });
    records.push({
      originalOrder,
      rawText,
      status: rawText === '' ? 'EMPTY' : 'VALID',
      included: true,
      errorCode: null,
      reason: null,
    });
  }

  if (records.some((record) => record.status === 'MALFORMED'))
    return failure(
      metadata,
      sourceArtifactSha256,
      'RECORD_TOO_LONG',
      'MALFORMED',
      'At least one record exceeds the SeedCorpus limit',
      'TXT',
      acceptedSourceEncoding,
      records,
    );

  const corpus = seedCorpusSchema.parse({
    schemaVersion: SEED_COMPILER_SCHEMA_VERSION,
    corpusId: metadata.corpusId,
    corpusVersion: metadata.corpusVersion,
    source: 'SEED_GENERATED',
    market: metadata.compilerMarket,
    locale: metadata.locale,
    normalizationVersion: metadata.normalizationVersion,
    items,
  });
  const canonicalCorpusJson = `${JSON.stringify(corpus, null, 2)}\n`;
  const convertedArtifactSha256 = checksumSourceArtifact(
    new TextEncoder().encode(canonicalCorpusJson),
  );
  const counts = countsFromRecords(records);
  const intakeReport = intakeReportSchema.parse({
    reportSchemaVersion: INTAKE_REPORT_SCHEMA_VERSION,
    sourceArtifactId: metadata.sourceArtifactId,
    sourceArtifactSha256,
    declaredSourceFormat: metadata.declaredSourceFormat,
    declaredSourceEncoding: metadata.declaredSourceEncoding,
    acceptedSourceFormat: 'TXT',
    acceptedSourceEncoding,
    status: 'SUCCESS',
    errorCode: null,
    records,
    ...counts,
  });
  const manifest = {
    manifestSchemaVersion: PROVENANCE_MANIFEST_SCHEMA_VERSION,
    sourceArtifactId: metadata.sourceArtifactId,
    sourceArtifactFilename: metadata.sourceArtifactFilename,
    sourceArtifactSha256,
    sourceArtifactByteLength: sourceBytes.byteLength,
    declaredSourceFormat: metadata.declaredSourceFormat,
    declaredSourceEncoding: metadata.declaredSourceEncoding,
    acceptedSourceFormat: 'TXT',
    acceptedSourceEncoding,
    source: 'SEED_GENERATED',
    generationMethod: metadata.generationMethod,
    contentOrigin: metadata.contentOrigin,
    sourceReference: metadata.sourceReference,
    userProvided: true,
    receivedAt: metadata.receivedAt,
    personalDataDeclaration: metadata.personalDataDeclaration,
    repositoryStoragePermission: metadata.repositoryStoragePermission,
    market: metadata.market,
    compilerMarket: metadata.compilerMarket,
    locale: metadata.locale,
    corpusId: metadata.corpusId,
    corpusVersion: metadata.corpusVersion,
    normalizationVersion: metadata.normalizationVersion,
    ...counts,
    conversionToolVersion: SEED_SOURCE_CONVERSION_TOOL_VERSION,
    convertedArtifactSha256,
  };
  return seedSourceIntakeResultSchema.parse({
    status: 'SUCCESS',
    manifest,
    intakeReport,
    corpus,
    canonicalCorpusJson,
  });
};
