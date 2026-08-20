import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  checksumSourceArtifact,
  compileSeedCorpus,
  convertSeedSourceArtifact,
  createSeedObservationId,
  type SeedSourceIntakeMetadata,
} from '../src/real-estate-intent-seed';

const encoder = new TextEncoder();
const metadata: SeedSourceIntakeMetadata = {
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
};
const convert = (text: string, overrides: Partial<SeedSourceIntakeMetadata> = {}) =>
  convertSeedSourceArtifact({
    sourceBytes: encoder.encode(text),
    metadata: { ...metadata, ...overrides },
  });

describe('controlled seed source intake', () => {
  test('hashes exact source bytes without line-ending or BOM normalization', () => {
    const lf = encoder.encode('大连买房\n房价');
    const crlf = encoder.encode('大连买房\r\n房价');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...lf]);
    expect(checksumSourceArtifact(lf)).toBe(checksumSourceArtifact(lf));
    expect(checksumSourceArtifact(lf)).not.toBe(checksumSourceArtifact(crlf));
    expect(checksumSourceArtifact(lf)).not.toBe(checksumSourceArtifact(bom));
    expect(checksumSourceArtifact(lf)).toMatch(/^[a-f0-9]{64}$/u);
  });

  test('converts TXT literally while preserving duplicates, empty records and audit order', () => {
    const bytes = new Uint8Array(
      readFileSync(
        new URL('./fixtures/real-estate-intent-seed/synthetic-source.txt', import.meta.url),
      ),
    );
    const result = convertSeedSourceArtifact({ sourceBytes: bytes, metadata });
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(result.manifest).toMatchObject({
      declaredSourceFormat: 'TXT',
      declaredSourceEncoding: 'UTF-8',
      acceptedSourceFormat: 'TXT',
      acceptedSourceEncoding: 'UTF-8',
      sourceArtifactSha256: checksumSourceArtifact(bytes),
      itemCountRaw: 7,
      itemCountValid: 6,
      itemCountEmpty: 1,
    });
    expect(result.corpus.items.map((item) => item.rawText)).toEqual([
      '大连买房',
      ' 大连买房',
      '大连买房',
      '９０平',
      '- 学区房',
      '1. 首付',
    ]);
    expect(result.corpus.items.map((item) => item.originalOrder)).toEqual([0, 1, 2, 3, 5, 6]);
    expect(result.corpus.items[0]?.seedId).not.toBe(result.corpus.items[2]?.seedId);
    expect(result.intakeReport.records[4]).toMatchObject({
      rawText: '',
      status: 'EMPTY',
      included: false,
      errorCode: null,
      reason: 'No semantic seed content; retained for audit only',
    });
    expect(result.intakeReport.records[4]).not.toHaveProperty('seedId');
    const spaced = convert(' 甲 ');
    expect(spaced.status).toBe('SUCCESS');
    if (spaced.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(spaced.corpus.items[0]?.rawText).toBe(' 甲 ');
  });

  test('handles BOM and terminal/consecutive delimiters deterministically', () => {
    const source = encoder.encode('甲\n\n乙\n');
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...source]);
    const result = convertSeedSourceArtifact({
      sourceBytes: bom,
      metadata: { ...metadata, declaredSourceEncoding: 'UTF-8-BOM' },
    });
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(result.manifest.acceptedSourceEncoding).toBe('UTF-8-BOM');
    expect(result.corpus.items.map((item) => item.rawText)).toEqual(['甲', '乙']);
    expect(result.corpus.items.map((item) => item.originalOrder)).toEqual([0, 2]);
    expect(result.intakeReport.records[1]).toMatchObject({ status: 'EMPTY', included: false });
  });

  test('keeps multiple EMPTY records audit-only without changing VALID occurrence ordinals', () => {
    const result = convert('重复\n\n\n重复');
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(result.intakeReport.records).toMatchObject([
      { originalOrder: 0, rawText: '重复', status: 'VALID', included: true },
      { originalOrder: 1, rawText: '', status: 'EMPTY', included: false },
      { originalOrder: 2, rawText: '', status: 'EMPTY', included: false },
      { originalOrder: 3, rawText: '重复', status: 'VALID', included: true },
    ]);
    expect(result.corpus.items.map((item) => item.originalOrder)).toEqual([0, 3]);
    expect(result.corpus.items.map((item) => item.seedId)).toEqual([
      createSeedObservationId({
        seedIdentityVersion: '1.0.0',
        sourceArtifactId: metadata.sourceArtifactId,
        sourceArtifactSha256: result.manifest.sourceArtifactSha256,
        rawText: '重复',
        sourceOccurrenceOrdinalAmongIdenticalRawText: 0,
      }),
      createSeedObservationId({
        seedIdentityVersion: '1.0.0',
        sourceArtifactId: metadata.sourceArtifactId,
        sourceArtifactSha256: result.manifest.sourceArtifactSha256,
        rawText: '重复',
        sourceOccurrenceOrdinalAmongIdenticalRawText: 1,
      }),
    ]);
  });

  test('fails closed for invalid UTF-8, unsupported format, metadata mismatch and governance blocks', () => {
    const invalid = convertSeedSourceArtifact({
      sourceBytes: new Uint8Array([0xc3, 0x28]),
      metadata,
    });
    expect(invalid).toMatchObject({ status: 'FAILURE', errorCode: 'MALFORMED_ENCODING' });
    expect(invalid).not.toHaveProperty('manifest');
    expect(invalid).not.toHaveProperty('corpus');
    expect(convert('a', { declaredSourceFormat: 'CSV' })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'UNSUPPORTED_FORMAT',
    });
    expect(convert('a', { declaredSourceEncoding: 'UTF-8-BOM' })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'DECLARED_ENCODING_MISMATCH',
    });
    expect(convert('a', { personalDataDeclaration: 'REVIEW_REQUIRED' })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'PRIVACY_DECLARATION_REQUIRED',
    });
    expect(convert('a', { repositoryStoragePermission: false })).toMatchObject({
      status: 'FAILURE',
      errorCode: 'REPOSITORY_STORAGE_PERMISSION_REQUIRED',
    });
  });

  test('retains every parsed record in a malformed-record failure report', () => {
    const result = convert(`${'甲'.repeat(501)}\n大连买房`);
    expect(result.status).toBe('FAILURE');
    if (result.status !== 'FAILURE') throw new Error('Expected failed intake');
    expect(result.errorCode).toBe('RECORD_TOO_LONG');
    expect(result.intakeReport.records).toHaveLength(2);
    expect(result.intakeReport.records[0]).toMatchObject({
      originalOrder: 0,
      status: 'MALFORMED',
      included: false,
      errorCode: 'RECORD_TOO_LONG',
    });
    expect(result.intakeReport.records[1]).toMatchObject({
      originalOrder: 1,
      rawText: '大连买房',
      status: 'VALID',
      included: false,
    });
  });

  test('binds seed observation identity to exact source checksum but not receivedAt', () => {
    const first = convert('大连买房');
    const replay = convert('大连买房', { receivedAt: '2026-08-18T00:00:00.000Z' });
    const changedBytes = convert('大连买房\n');
    expect(first.status).toBe('SUCCESS');
    expect(replay.status).toBe('SUCCESS');
    expect(changedBytes.status).toBe('SUCCESS');
    if (
      first.status !== 'SUCCESS' ||
      replay.status !== 'SUCCESS' ||
      changedBytes.status !== 'SUCCESS'
    )
      throw new Error('Expected successful intake');
    expect(first.corpus).toEqual(replay.corpus);
    expect(first.corpus.items[0]?.seedId).toBe(replay.corpus.items[0]?.seedId);
    expect(first.manifest.receivedAt).not.toBe(replay.manifest.receivedAt);
    expect(first.manifest.convertedArtifactSha256).toBe(replay.manifest.convertedArtifactSha256);
    expect(first.manifest.sourceArtifactSha256).not.toBe(
      changedBytes.manifest.sourceArtifactSha256,
    );
    expect(first.corpus.items[0]?.seedId).not.toBe(changedBytes.corpus.items[0]?.seedId);

    const payload = {
      seedIdentityVersion: '1.0.0',
      sourceArtifactId: metadata.sourceArtifactId,
      sourceArtifactSha256: first.manifest.sourceArtifactSha256,
      rawText: '大连买房',
      sourceOccurrenceOrdinalAmongIdenticalRawText: 0,
    } as const;
    expect(createSeedObservationId(payload)).toBe(first.corpus.items[0]?.seedId);
    expect(createSeedObservationId({ ...payload, sourceArtifactSha256: 'f'.repeat(64) })).not.toBe(
      first.corpus.items[0]?.seedId,
    );
  });

  test('produces distinct source and canonical corpus checksums', () => {
    const result = convert('大连买房');
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(result.manifest.convertedArtifactSha256).toBe(
      checksumSourceArtifact(encoder.encode(result.canonicalCorpusJson)),
    );
    expect(result.manifest.convertedArtifactSha256).not.toBe(result.manifest.sourceArtifactSha256);
  });

  test('feeds the unchanged TAF-02B1 schema and compiler deterministically without publication', () => {
    const intake = convert('大连买房\n房价');
    expect(intake.status).toBe('SUCCESS');
    if (intake.status !== 'SUCCESS') throw new Error('Expected successful intake');
    expect(intake.corpus.schemaVersion).toBe('1.0.0');
    const dictionary = {
      dictionaryVersion: '1.0.0',
      locale: 'zh-CN',
      market: 'dalian-real-estate',
      normalizationVersion: '1.0.0',
      matchingRuleVersion: '1.0.0',
      conflictPolicyVersion: '1.0.0',
      entries: [
        {
          termId: 'buy',
          normalizedText: '买房',
          intent: 'PROPERTY_SEARCH',
          defaultStage: 'EXPLORING',
          allowedModifiers: [],
          matchKind: 'LITERAL_PHRASE',
          evidenceStrength: 'QUALIFIED_PHRASE',
          upstreamSignalRuleIds: [],
          positiveExamples: [],
          negativeExamples: [],
          source: 'MANUAL_CURATED',
          status: 'FROZEN',
        },
      ],
    };
    const first = compileSeedCorpus({
      compilerVersion: '1.1.0',
      corpus: intake.corpus,
      dictionary,
    });
    const replay = compileSeedCorpus({
      compilerVersion: '1.1.0',
      corpus: intake.corpus,
      dictionary,
    });
    expect(first).toEqual(replay);
    expect(first.schemaVersion).toBe('1.1.0');
    expect(first.compilerVersion).toBe('1.1.0');
    expect(first.candidates.every((candidate) => candidate.reviewStatus === 'PENDING_REVIEW')).toBe(
      true,
    );
    expect(first.candidates.some((candidate) => 'status' in candidate)).toBe(false);
    for (const mismatch of [
      { market: 'other-real-estate' },
      { locale: 'en-US' },
      { normalizationVersion: '9.9.9' },
    ]) {
      expect(() =>
        compileSeedCorpus({
          compilerVersion: '1.1.0',
          corpus: intake.corpus,
          dictionary: { ...dictionary, ...mismatch },
        }),
      ).toThrow();
    }
  });
});
