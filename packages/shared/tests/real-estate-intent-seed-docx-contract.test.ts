import { describe, expect, test } from 'vitest';
import {
  ACCEPTED_SOURCE_FORMATS,
  DOCX_EXTRACTION_VERSION,
  INTAKE_ERROR_CODES,
  provenanceManifestSchema,
  seedSourceIntakeRequestSchema,
} from '../src/real-estate-intent-seed';

const baseMetadata = {
  sourceArtifactId: 'synthetic-docx-v1',
  sourceArtifactFilename: 'synthetic.docx',
  declaredSourceFormat: 'DOCX',
  declaredSourceEncoding: null,
  expectedSourceArtifactSha256: 'a'.repeat(64),
  generationMethod: 'TEST_FIXTURE',
  contentOrigin: 'AI_GENERATED',
  sourceReference: null,
  userProvided: true,
  receivedAt: '2026-08-20T00:00:00.000Z',
  personalDataDeclaration: 'NO_PERSONAL_OR_PRIVATE_DATA',
  repositoryStoragePermission: true,
  market: 'CN-LN-DALIAN',
  compilerMarket: 'dalian-real-estate',
  locale: 'zh-CN',
  corpusId: 'synthetic-docx-intake',
  corpusVersion: '1.0.0',
  normalizationVersion: '1.0.0',
} as const;

describe('DOCX seed intake contracts', () => {
  test('accepts a strict DOCX request with null encoding and expected checksum', () => {
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        sourceBytes: new Uint8Array([1]),
        metadata: baseMetadata,
      }).success,
    ).toBe(true);
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        sourceBytes: new Uint8Array([1]),
        metadata: { ...baseMetadata, declaredSourceEncoding: 'BINARY' },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        sourceBytes: new Uint8Array([1]),
        metadata: { ...baseMetadata, unexpected: true },
      }).success,
    ).toBe(false);
  });

  test('keeps TXT and DOCX formats explicit and freezes DOCX errors/version', () => {
    expect(ACCEPTED_SOURCE_FORMATS).toEqual(['TXT', 'DOCX']);
    expect(DOCX_EXTRACTION_VERSION).toBe('1.0.0');
    expect(INTAKE_ERROR_CODES).toEqual(
      expect.arrayContaining([
        'SOURCE_ARTIFACT_CHECKSUM_MISMATCH',
        'SOURCE_ARTIFACT_TOO_LARGE',
        'ZIP_ENTRY_LIMIT_EXCEEDED',
        'ZIP_ENTRY_TOO_LARGE',
        'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED',
        'DOCUMENT_XML_TOO_LARGE',
        'INVALID_DOCX_CONTAINER',
        'DOCUMENT_XML_MISSING',
        'MALFORMED_DOCUMENT_XML',
        'UNSAFE_XML_STRUCTURE',
        'UNSUPPORTED_DOCX_STRUCTURE',
        'PROVENANCE_NOTICE_STRUCTURE_MISMATCH',
      ]),
    );
  });

  test('accepts strict DOCX manifest fields and rejects unknown fields', () => {
    const manifest = {
      manifestSchemaVersion: '1.0.0',
      sourceArtifactId: baseMetadata.sourceArtifactId,
      sourceArtifactFilename: baseMetadata.sourceArtifactFilename,
      expectedSourceArtifactSha256: 'a'.repeat(64),
      sourceArtifactSha256: 'a'.repeat(64),
      sourceArtifactByteLength: 1,
      declaredSourceFormat: 'DOCX',
      declaredSourceEncoding: null,
      acceptedSourceFormat: 'DOCX',
      acceptedSourceEncoding: null,
      source: 'SEED_GENERATED',
      generationMethod: baseMetadata.generationMethod,
      contentOrigin: baseMetadata.contentOrigin,
      sourceReference: null,
      userProvided: true,
      receivedAt: baseMetadata.receivedAt,
      personalDataDeclaration: baseMetadata.personalDataDeclaration,
      repositoryStoragePermission: true,
      market: baseMetadata.market,
      compilerMarket: baseMetadata.compilerMarket,
      locale: baseMetadata.locale,
      corpusId: baseMetadata.corpusId,
      corpusVersion: baseMetadata.corpusVersion,
      normalizationVersion: baseMetadata.normalizationVersion,
      itemCountRaw: 3,
      itemCountValid: 1,
      itemCountEmpty: 1,
      itemCountMalformed: 0,
      itemCountUnsupported: 0,
      sourceRecordCount: 3,
      itemCountExcludedProvenanceNotice: 1,
      conversionToolVersion: '1.0.0',
      docxExtractionVersion: DOCX_EXTRACTION_VERSION,
      extractedTextArtifactSha256: 'b'.repeat(64),
      convertedArtifactSha256: 'c'.repeat(64),
    } as const;
    expect(provenanceManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      provenanceManifestSchema.safeParse({ ...manifest, customerId: 'forbidden' }).success,
    ).toBe(false);
  });
});
