import { describe, expect, test } from 'vitest';
import { compileSeedCorpus } from '../src/real-estate-intent-seed';
import corpus from './fixtures/real-estate-intent-seed/synthetic-corpus.json';

const makeEntry = (
  termId: string,
  normalizedText: string,
  intent: string,
  defaultStage: string,
  evidenceStrength: string,
) => ({
  termId,
  normalizedText,
  intent,
  defaultStage,
  allowedModifiers: ['QUESTION', 'NEGATED'],
  matchKind: 'LITERAL_PHRASE',
  evidenceStrength,
  upstreamSignalRuleIds: [],
  positiveExamples: [],
  negativeExamples: [],
  source: 'MANUAL_CURATED',
  status: 'FROZEN',
});
const entries = [
  makeEntry('buy', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'),
  makeEntry('price-weak', '房价', 'PRICE_CONCERN', 'EVALUATING', 'WEAK_TERM'),
  makeEntry('down-payment', '首付', 'FINANCIAL_PREPARATION', 'PREPARING', 'QUALIFIED_PHRASE'),
  makeEntry('how-much', '多少钱', 'PRICE_CONCERN', 'EVALUATING', 'QUALIFIED_PHRASE'),
  makeEntry('worth-buy', '值得吗', 'PURCHASE_DECISION', 'EVALUATING', 'QUALIFIED_PHRASE'),
  makeEntry('worth-invest', '值得吗', 'INVESTMENT_INTENT', 'EVALUATING', 'QUALIFIED_PHRASE'),
];
const dictionary = {
  dictionaryVersion: '1.0.0',
  locale: 'zh-CN',
  market: 'dalian-real-estate',
  normalizationVersion: '1.0.0',
  matchingRuleVersion: '1.0.0',
  conflictPolicyVersion: '1.0.0',
  entries,
};
const compile = (items = corpus.items, dictionaryEntries = entries, sourceArtifactId?: string) =>
  compileSeedCorpus({
    compilerVersion: '1.0.0',
    corpus: {
      ...corpus,
      items: items.map((item) =>
        sourceArtifactId ? { ...item, provenance: { ...item.provenance, sourceArtifactId } } : item,
      ),
    },
    dictionary: { ...dictionary, entries: dictionaryEntries },
  });

describe('deterministic seed corpus compiler', () => {
  test('normalizes and exact-deduplicates while preserving the full audit trail', () => {
    const input = structuredClone(corpus.items);
    const result = compile(input);
    expect(input).toEqual(corpus.items);
    const group = result.candidates.find((candidate) => candidate.normalizedText === '大连买房');
    expect(group).toMatchObject({
      occurrenceCount: 3,
      sourceSeedIds: ['seed-1', 'seed-2', 'seed-3'],
      source: 'SEED_GENERATED',
      reviewStatus: 'PENDING_REVIEW',
      modifierAssessmentStatus: 'NOT_EVALUATED',
    });
    expect(group?.rawVariants).toEqual([' 大连买房 ', '大连买房', '大连买房　']);
    expect(group?.observations).toHaveLength(3);
    expect(result.candidates.some((candidate) => candidate.normalizedText === '大连购房')).toBe(
      true,
    );
    expect(result.statistics).toMatchObject({
      rawCount: 8,
      normalizedCount: 7,
      uniqueNormalizedCount: 5,
      duplicateGroupCount: 1,
    });
  });

  test('deduplicates explicit full-width and ASCII variants after normalization', () => {
    const items = [
      { ...corpus.items[0]!, seedId: 'full-width', rawText: '９０平' },
      { ...corpus.items[0]!, seedId: 'ascii', rawText: '90平' },
    ];
    const result = compile(items);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      normalizedText: '90平',
      occurrenceCount: 2,
      sourceSeedIds: ['ascii', 'full-width'],
    });
  });

  test('produces mapped, unmapped, ambiguous, multi-intent and conflicted proposals', () => {
    const result = compile();
    expect(result.candidates.find((x) => x.normalizedText === '大连买房')).toMatchObject({
      mappingStatus: 'MAPPED',
      proposedIntents: ['PROPERTY_SEARCH'],
    });
    expect(result.candidates.find((x) => x.normalizedText === '大连购房')).toMatchObject({
      mappingStatus: 'UNMAPPED',
      proposedIntents: [],
    });
    expect(result.candidates.find((x) => x.normalizedText === '房价')).toMatchObject({
      mappingStatus: 'AMBIGUOUS',
      proposedIntents: ['PRICE_CONCERN'],
    });
    expect(result.candidates.find((x) => x.normalizedText === '首付多少钱')).toMatchObject({
      mappingStatus: 'MULTI_INTENT',
      proposedIntents: ['PRICE_CONCERN', 'FINANCIAL_PREPARATION'],
    });
    expect(result.candidates.find((x) => x.normalizedText === '值得吗')).toMatchObject({
      mappingStatus: 'CONFLICTED',
      proposedIntents: ['PURCHASE_DECISION', 'INVESTMENT_INTENT'],
    });
  });

  test('marks incompatible default stages on the same support as conflicted', () => {
    const rules = [
      makeEntry('buy-exploring', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'),
      makeEntry('buy-preparing', '买房', 'PROPERTY_SEARCH', 'PREPARING', 'QUALIFIED_PHRASE'),
    ];
    const candidate = compile([{ ...corpus.items[0]!, rawText: '买房' }], rules).candidates[0];
    expect(candidate?.mappingStatus).toBe('CONFLICTED');
  });

  test('marks incompatible evidence strengths on the same support as conflicted', () => {
    const rules = [
      makeEntry('buy-weak', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'WEAK_TERM'),
      makeEntry('buy-qualified', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'),
    ];
    const candidate = compile([{ ...corpus.items[0]!, rawText: '买房' }], rules).candidates[0];
    expect(candidate?.mappingStatus).toBe('CONFLICTED');
  });

  test('keeps semantically compatible rules with different term IDs non-conflicting', () => {
    const rules = [
      makeEntry('buy-a', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'),
      makeEntry('buy-b', '买房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'),
    ];
    const candidate = compile([{ ...corpus.items[0]!, rawText: '买房' }], rules).candidates[0];
    expect(candidate).toMatchObject({ mappingStatus: 'MAPPED' });
    expect(candidate?.matchedRules.map((rule) => rule.termId)).toEqual(['buy-a', 'buy-b']);
  });

  test('retains auditable reference matches and never derives modifiers from allowedModifiers', () => {
    const candidate = compile().candidates.find((x) => x.normalizedText === '首付多少钱');
    expect(candidate?.matchedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          termId: 'down-payment',
          normalizedPhrase: '首付',
          intent: 'FINANCIAL_PREPARATION',
          defaultStage: 'PREPARING',
          evidenceStrength: 'QUALIFIED_PHRASE',
          matchedSpan: { start: 0, end: 2 },
          dictionaryVersionUsed: '1.0.0',
        }),
        expect.objectContaining({ termId: 'how-much', matchedSpan: { start: 2, end: 5 } }),
      ]),
    );
    expect(candidate?.proposedDefaultStages).toEqual(['EVALUATING', 'PREPARING']);
    expect(candidate).not.toHaveProperty('candidateModifiers');
  });

  test('is stable under corpus and dictionary permutations', () => {
    expect(compile([...corpus.items].reverse(), [...entries].reverse())).toEqual(compile());
  });

  test('uses source-neutral candidate identity and provenance-bound observation identity', () => {
    const first = compile(corpus.items.slice(0, 1), entries, 'artifact-a').candidates[0]!;
    const second = compile(corpus.items.slice(0, 1), entries, 'artifact-b').candidates[0]!;
    expect(first.canonicalCandidateId).toBe(second.canonicalCandidateId);
    expect(first.observations[0]?.observationId).not.toBe(second.observations[0]?.observationId);
    expect(compile().candidates.map((x) => x.canonicalCandidateId)).toEqual(
      compile().candidates.map((x) => x.canonicalCandidateId),
    );
  });

  test('retains empty normalized input as LOW_INFORMATION audit group', () => {
    const candidate = compile().candidates.find((x) => x.normalizedText === '');
    expect(candidate).toMatchObject({
      mappingStatus: 'UNMAPPED',
      qualityFlags: ['LOW_INFORMATION'],
      occurrenceCount: 1,
      proposedIntents: [],
    });
  });
});
