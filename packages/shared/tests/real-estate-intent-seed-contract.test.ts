import { describe, expect, test } from 'vitest';
import { compiledIntentCandidateSchema, seedCorpusSchema } from '../src/real-estate-intent-seed';
import corpus from './fixtures/real-estate-intent-seed/synthetic-corpus.json';

describe('real-estate intent seed contracts', () => {
  test('accepts SEED_GENERATED corpus and rejects duplicate seed IDs', () => {
    expect(seedCorpusSchema.safeParse(corpus).success).toBe(true);
    expect(
      seedCorpusSchema.safeParse({ ...corpus, source: 'OBSERVED_PUBLIC_LANGUAGE' }).success,
    ).toBe(false);
    expect(
      seedCorpusSchema.safeParse({ ...corpus, items: [corpus.items[0], corpus.items[0]] }).success,
    ).toBe(false);
  });

  test('compiler candidates are permanently PENDING_REVIEW and strict', () => {
    const candidate = {
      schemaVersion: '1.0.0',
      compilerVersion: '1.0.0',
      canonicalCandidateId: `icand1_${'a'.repeat(64)}`,
      normalizedText: '大连买房',
      rawVariants: ['大连买房'],
      sourceSeedIds: ['seed-1'],
      observations: [],
      occurrenceCount: 1,
      proposedIntents: ['PROPERTY_SEARCH'],
      proposedDefaultStages: ['EXPLORING'],
      matchedRules: [],
      mappingExplanations: [],
      mappingStatus: 'MAPPED',
      qualityFlags: [],
      dictionaryVersionUsed: '1.0.0',
      normalizationVersion: '1.0.0',
      source: 'SEED_GENERATED',
      reviewStatus: 'PENDING_REVIEW',
      modifierAssessmentStatus: 'NOT_EVALUATED',
    } as const;
    expect(compiledIntentCandidateSchema.safeParse(candidate).success).toBe(true);
    expect(
      compiledIntentCandidateSchema.safeParse({ ...candidate, reviewStatus: 'REJECTED' }).success,
    ).toBe(false);
    expect(
      compiledIntentCandidateSchema.safeParse({ ...candidate, reviewStatus: 'APPROVED_FOR_FREEZE' })
        .success,
    ).toBe(false);
    expect(
      compiledIntentCandidateSchema.safeParse({ ...candidate, status: 'FROZEN' }).success,
    ).toBe(false);
    for (const field of ['customerId', 'leadId', 'score', 'confidence', 'ranking']) {
      expect(compiledIntentCandidateSchema.safeParse({ ...candidate, [field]: 1 }).success).toBe(
        false,
      );
    }
  });
});
