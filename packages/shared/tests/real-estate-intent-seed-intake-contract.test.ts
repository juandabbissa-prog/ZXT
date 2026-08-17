import { describe, expect, test } from 'vitest';
import {
  convertSeedSourceArtifact,
  provenanceManifestSchema,
  seedIdentityPayloadSchema,
  seedSourceIntakeRequestSchema,
  seedSourceIntakeResultSchema,
} from '../src/real-estate-intent-seed';

const metadata = {
  sourceArtifactId: 'synthetic-source-v1',
  sourceArtifactFilename: 'synthetic-source.txt',
  declaredSourceFormat: 'TXT',
  declaredSourceEncoding: 'UTF-8',
  generationMethod: 'TEST_FIXTURE',
  contentOrigin: 'AI_GENERATED',
  sourceReference: null,
  userProvided: true,
  receivedAt: '2026-08-17T00:00:00.000Z',
  personalDataDeclaration: 'NO_PERSONAL_OR_PRIVATE_DATA',
  repositoryStoragePermission: true,
  market: 'CN-LN-DALIAN',
  compilerMarket: 'dalian-real-estate',
  locale: 'zh-CN',
  corpusId: 'synthetic-controlled-intake',
  corpusVersion: '1.0.0',
  normalizationVersion: '1.0.0',
} as const;

describe('real-estate seed intake contracts', () => {
  test('accepts explicit declared metadata and fails closed on missing governance declarations', () => {
    const request = { sourceBytes: new Uint8Array([0x61]), metadata };
    expect(seedSourceIntakeRequestSchema.safeParse(request).success).toBe(true);
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        ...request,
        metadata: { ...metadata, personalDataDeclaration: 'REVIEW_REQUIRED' },
      }).success,
    ).toBe(true);
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        ...request,
        metadata: { ...metadata, repositoryStoragePermission: false },
      }).success,
    ).toBe(true);
    const withoutPrivacy: Record<string, unknown> = { ...metadata };
    Reflect.deleteProperty(withoutPrivacy, 'personalDataDeclaration');
    expect(
      seedSourceIntakeRequestSchema.safeParse({
        sourceBytes: request.sourceBytes,
        metadata: withoutPrivacy,
      }).success,
    ).toBe(false);
    expect(seedSourceIntakeRequestSchema.safeParse({ ...request, unexpected: true }).success).toBe(
      false,
    );
  });

  test('keeps verified manifest metadata strict and distinct from declarations', () => {
    const manifest = {
      manifestSchemaVersion: '1.0.0',
      sourceArtifactId: metadata.sourceArtifactId,
      sourceArtifactFilename: metadata.sourceArtifactFilename,
      sourceArtifactSha256: 'a'.repeat(64),
      sourceArtifactByteLength: 1,
      declaredSourceFormat: 'TXT',
      declaredSourceEncoding: 'UTF-8',
      acceptedSourceFormat: 'TXT',
      acceptedSourceEncoding: 'UTF-8',
      source: 'SEED_GENERATED',
      generationMethod: metadata.generationMethod,
      contentOrigin: metadata.contentOrigin,
      sourceReference: null,
      userProvided: true,
      receivedAt: metadata.receivedAt,
      personalDataDeclaration: metadata.personalDataDeclaration,
      repositoryStoragePermission: true,
      market: metadata.market,
      compilerMarket: metadata.compilerMarket,
      locale: metadata.locale,
      corpusId: metadata.corpusId,
      corpusVersion: metadata.corpusVersion,
      normalizationVersion: metadata.normalizationVersion,
      itemCountRaw: 1,
      itemCountValid: 1,
      itemCountEmpty: 0,
      itemCountMalformed: 0,
      itemCountUnsupported: 0,
      conversionToolVersion: '1.0.0',
      convertedArtifactSha256: 'b'.repeat(64),
    } as const;
    expect(provenanceManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      provenanceManifestSchema.safeParse({ ...manifest, customerId: 'forbidden' }).success,
    ).toBe(false);
    expect(
      provenanceManifestSchema.safeParse({ ...manifest, acceptedSourceEncoding: 'UTF-16' }).success,
    ).toBe(false);
  });

  test('freezes seed identity payload without originalOrder or receivedAt', () => {
    const payload = {
      seedIdentityVersion: '1.0.0',
      sourceArtifactId: metadata.sourceArtifactId,
      sourceArtifactSha256: 'a'.repeat(64),
      rawText: '大连买房',
      sourceOccurrenceOrdinalAmongIdenticalRawText: 0,
    } as const;
    expect(seedIdentityPayloadSchema.safeParse(payload).success).toBe(true);
    expect(seedIdentityPayloadSchema.safeParse({ ...payload, originalOrder: 0 }).success).toBe(
      false,
    );
    expect(
      seedIdentityPayloadSchema.safeParse({ ...payload, receivedAt: metadata.receivedAt }).success,
    ).toBe(false);
  });

  test('keeps outer intake result and nested report status consistent', () => {
    const success = convertSeedSourceArtifact({
      sourceBytes: new TextEncoder().encode('大连买房'),
      metadata,
    });
    const failure = convertSeedSourceArtifact({
      sourceBytes: new TextEncoder().encode('大连买房'),
      metadata: { ...metadata, repositoryStoragePermission: false },
    });
    expect(seedSourceIntakeResultSchema.safeParse(success).success).toBe(true);
    expect(seedSourceIntakeResultSchema.safeParse(failure).success).toBe(true);
    if (success.status !== 'SUCCESS' || failure.status !== 'FAILURE')
      throw new Error('Expected valid success and failure fixtures');

    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...failure,
        intakeReport: { ...failure.intakeReport, status: 'SUCCESS', errorCode: null },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...failure,
        intakeReport: { ...failure.intakeReport, errorCode: null },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...success,
        intakeReport: {
          ...success.intakeReport,
          status: 'FAILURE',
          errorCode: 'UNSUPPORTED_FORMAT',
        },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        status: 'SUCCESS',
        intakeReport: success.intakeReport,
      }).success,
    ).toBe(false);
  });
});
