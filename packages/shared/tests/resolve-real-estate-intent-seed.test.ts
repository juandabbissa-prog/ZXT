import { describe, expect, test } from 'vitest';
import {
  compiledIntentCandidateSchema,
  type CompiledIntentCandidate,
} from '../src/real-estate-intent-seed/schemas';
import { resolveSeedCandidate } from '../src/real-estate-intent-seed/resolve-seed-candidate';

type Match = CompiledIntentCandidate['matchedRules'][number];

const match = (
  termId: string,
  normalizedPhrase: string,
  intent: Match['intent'],
  evidenceStrength: Match['evidenceStrength'],
  start = 0,
  defaultStage: Match['defaultStage'] = 'EXPLORING',
): Match => ({
  termId,
  normalizedPhrase,
  intent,
  defaultStage,
  evidenceStrength,
  matchedSpan: { start, end: start + normalizedPhrase.length },
  dictionaryVersionUsed: '1.0.0',
});

const resolve = (normalizedText: string, matchedRules: readonly Match[], conflicted = false) =>
  resolveSeedCandidate({ normalizedText, matchedRules, conflicted });

describe('deterministic seed candidate resolver', () => {
  test.each(['买房', '楼盘', '新房', '贷款', '公积金', '学区'])(
    'keeps an isolated weak trigger trace-only: %s',
    (phrase) => {
      const intent = ['贷款', '公积金'].includes(phrase)
        ? 'FINANCIAL_PREPARATION'
        : phrase === '学区'
          ? 'EDUCATION_NEED'
          : 'PROPERTY_SEARCH';
      expect(resolve(phrase, [match(`weak-${phrase}`, phrase, intent, 'WEAK_TERM')])).toMatchObject(
        {
          mappingStatus: 'AMBIGUOUS',
          primaryIntents: [],
          traceIntents: [intent],
        },
      );
    },
  );

  test('does not upgrade repeated weak evidence', () => {
    expect(
      resolve('买房买房', [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM', 0),
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM', 2),
      ]),
    ).toMatchObject({
      mappingStatus: 'AMBIGUOUS',
      primaryIntents: [],
      traceIntents: ['PROPERTY_SEARCH'],
    });
  });

  test.each([
    {
      text: '买房多少钱',
      rules: [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM'),
        match('price', '多少钱', 'PRICE_CONCERN', 'QUALIFIED_PHRASE', 2, 'EVALUATING'),
      ],
      primary: 'PRICE_CONCERN',
    },
    {
      text: '买房公积金怎么提',
      rules: [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM'),
        match('fund', '公积金', 'FINANCIAL_PREPARATION', 'WEAK_TERM', 2, 'EVALUATING'),
      ],
      primary: 'FINANCIAL_PREPARATION',
    },
    {
      text: '买房为了学区上学',
      rules: [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM'),
        match('school', '学区', 'EDUCATION_NEED', 'WEAK_TERM', 4),
      ],
      primary: 'EDUCATION_NEED',
    },
    {
      text: '现在买房合适吗',
      rules: [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM', 2),
        match(
          'decision',
          '现在买房合适吗',
          'PURCHASE_DECISION',
          'QUALIFIED_PHRASE',
          0,
          'EVALUATING',
        ),
      ],
      primary: 'PURCHASE_DECISION',
    },
    {
      text: '买房哪个区升值快',
      rules: [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM'),
        match('appreciation', '升值', 'INVESTMENT_INTENT', 'QUALIFIED_PHRASE', 5, 'EVALUATING'),
      ],
      primary: 'INVESTMENT_INTENT',
    },
  ])(
    'absorbs a weak buy topic into the qualified/derived primary: $text',
    ({ text, rules, primary }) => {
      expect(resolve(text, rules)).toMatchObject({
        mappingStatus: 'MAPPED',
        primaryIntents: [primary],
        traceIntents: ['PROPERTY_SEARCH'],
      });
    },
  );

  test('collapses multiple same-intent supports into one primary resolution', () => {
    const result = resolve('房源小区', [
      match('listing', '房源', 'PROPERTY_SEARCH', 'QUALIFIED_PHRASE'),
      match('community', '小区', 'PROPERTY_SEARCH', 'QUALIFIED_PHRASE', 2),
    ]);
    expect(result.primaryIntents).toEqual(['PROPERTY_SEARCH']);
    expect(result.intentResolutions).toEqual([
      expect.objectContaining({
        intent: 'PROPERTY_SEARCH',
        role: 'PRIMARY',
        supportingTermIds: ['community', 'listing'],
      }),
    ]);
  });

  test('keeps two independent qualified predicates as true multi-intent', () => {
    expect(
      resolve('看房同时首付比例', [
        match('view', '看房', 'PROPERTY_SEARCH', 'QUALIFIED_PHRASE'),
        match('down-payment', '首付', 'FINANCIAL_PREPARATION', 'QUALIFIED_PHRASE', 4, 'EVALUATING'),
      ]),
    ).toMatchObject({
      mappingStatus: 'MULTI_INTENT',
      primaryIntents: ['PROPERTY_SEARCH', 'FINANCIAL_PREPARATION'],
      traceIntents: [],
    });
  });

  test('treats a target intent as trace when a different predicate owns the same focus', () => {
    expect(
      resolve('学区房多少钱', [
        match('school-home', '学区房', 'EDUCATION_NEED', 'QUALIFIED_PHRASE'),
        match('price', '多少钱', 'PRICE_CONCERN', 'QUALIFIED_PHRASE', 3, 'EVALUATING'),
      ]),
    ).toMatchObject({
      mappingStatus: 'MAPPED',
      primaryIntents: ['PRICE_CONCERN'],
      traceIntents: ['EDUCATION_NEED'],
    });
    expect(
      resolve('哪个小区升值快', [
        match('community', '小区', 'PROPERTY_SEARCH', 'QUALIFIED_PHRASE', 2),
        match('appreciation', '升值', 'INVESTMENT_INTENT', 'QUALIFIED_PHRASE', 4, 'EVALUATING'),
      ]),
    ).toMatchObject({
      mappingStatus: 'MAPPED',
      primaryIntents: ['INVESTMENT_INTENT'],
      traceIntents: ['PROPERTY_SEARCH'],
    });
  });

  test('does not split one investment evaluation predicate into two primary intents', () => {
    expect(
      resolve('这套房值不值得投资', [
        match('investment', '投资', 'INVESTMENT_INTENT', 'QUALIFIED_PHRASE', 7, 'EVALUATING'),
      ]),
    ).toMatchObject({
      mappingStatus: 'MAPPED',
      primaryIntents: ['INVESTMENT_INTENT'],
      traceIntents: [],
    });
  });

  test.each([
    ['一居室哪里有', 'PROPERTY_SEARCH'],
    ['楼盘有哪些', 'PROPERTY_SEARCH'],
    ['酒店式公寓推荐', 'PROPERTY_SEARCH'],
    ['万达公馆价格', 'PRICE_CONCERN'],
    ['老房子能买吗', 'PURCHASE_DECISION'],
    ['海景房值不值得买', 'PURCHASE_DECISION'],
    ['公寓能不能落户', 'BUYING_QUALIFICATION'],
    ['房子能不能贷款', 'FINANCIAL_PREPARATION'],
    ['这套房能不能买', 'PURCHASE_DECISION'],
  ])('derives a bounded target/operator primary: %s', (text, primary) => {
    const result = resolve(text, []);
    expect(result).toMatchObject({ mappingStatus: 'MAPPED', primaryIntents: [primary] });
    expect(result.derivedSupports).toHaveLength(1);
  });

  test.each([
    '哪里有',
    '推荐',
    'ABC怎么样',
    '这个怎么样',
    '停车费一个月多少',
    '租房市场怎么样',
    '买房万科物业怎么样',
    '买房东港发展怎么样',
    '买房吗？',
  ])('fails closed without a valid target/operator composition: %s', (text) => {
    const rules = text === '买房吗？' ? [match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM')] : [];
    const result = resolve(text, rules);
    expect(result.primaryIntents).toEqual([]);
    expect(result.mappingStatus).toBe(rules.length === 0 ? 'UNMAPPED' : 'AMBIGUOUS');
  });

  test('does not swallow a pre-existing conflict', () => {
    const result = resolve(
      '值得吗',
      [
        match('decision', '值得吗', 'PURCHASE_DECISION', 'QUALIFIED_PHRASE'),
        match('investment', '值得吗', 'INVESTMENT_INTENT', 'QUALIFIED_PHRASE'),
      ],
      true,
    );
    expect(result).toMatchObject({ mappingStatus: 'CONFLICTED' });
  });

  test('keeps weak cross-intent support ambiguous when no primary predicate exists', () => {
    expect(
      resolve('买房学区', [
        match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM'),
        match('school', '学区', 'EDUCATION_NEED', 'WEAK_TERM', 2),
      ]),
    ).toMatchObject({
      mappingStatus: 'AMBIGUOUS',
      primaryIntents: [],
      traceIntents: ['PROPERTY_SEARCH', 'EDUCATION_NEED'],
    });
  });
});

describe('compiler 1.1 strict role/status contract', () => {
  const weakRule = match('buy', '买房', 'PROPERTY_SEARCH', 'WEAK_TERM');
  const primaryResolution = {
    intent: 'PROPERTY_SEARCH',
    role: 'PRIMARY',
    supportingTermIds: ['listing'],
    derivedSupportIds: [],
    reasonCodes: ['QUALIFIED_PRIMARY'],
  } as const;
  const base = {
    schemaVersion: '1.1.0',
    compilerVersion: '1.1.0',
    canonicalCandidateId: `icand1_${'a'.repeat(64)}`,
    normalizedText: '房源',
    rawVariants: ['房源'],
    sourceSeedIds: ['seed-1'],
    observations: [],
    occurrenceCount: 1,
    proposedIntents: ['PROPERTY_SEARCH'],
    proposedDefaultStages: ['EXPLORING'],
    matchedRules: [match('listing', '房源', 'PROPERTY_SEARCH', 'QUALIFIED_PHRASE')],
    mappingExplanations: [],
    primaryIntents: ['PROPERTY_SEARCH'],
    traceIntents: [],
    derivedSupports: [],
    intentResolutions: [primaryResolution],
    mappingStatus: 'MAPPED',
    qualityFlags: [],
    dictionaryVersionUsed: '1.0.0',
    normalizationVersion: '1.0.0',
    source: 'SEED_GENERATED',
    reviewStatus: 'PENDING_REVIEW',
    modifierAssessmentStatus: 'NOT_EVALUATED',
  } as const;

  test('accepts a consistent 1.1 mapped candidate', () => {
    expect(compiledIntentCandidateSchema.safeParse(base).success).toBe(true);
  });

  test.each([
    [
      'MAPPED with zero primary',
      { primaryIntents: [], proposedIntents: [], intentResolutions: [] },
    ],
    ['AMBIGUOUS with primary', { mappingStatus: 'AMBIGUOUS' }],
    ['MULTI_INTENT with one primary', { mappingStatus: 'MULTI_INTENT' }],
    [
      'UNMAPPED with trace evidence',
      {
        mappingStatus: 'UNMAPPED',
        primaryIntents: [],
        proposedIntents: [],
        traceIntents: ['PROPERTY_SEARCH'],
        matchedRules: [weakRule],
        intentResolutions: [
          {
            intent: 'PROPERTY_SEARCH',
            role: 'TRACE',
            supportingTermIds: ['buy'],
            derivedSupportIds: [],
            reasonCodes: ['WEAK_ONLY_TRACE'],
          },
        ],
      },
    ],
    [
      'PRIMARY generated only from weak evidence',
      {
        matchedRules: [weakRule],
        intentResolutions: [{ ...primaryResolution, supportingTermIds: ['buy'] }],
      },
    ],
    [
      'same intent as primary and trace',
      {
        traceIntents: ['PROPERTY_SEARCH'],
        intentResolutions: [
          primaryResolution,
          { ...primaryResolution, role: 'TRACE', reasonCodes: ['WEAK_ABSORBED'] },
        ],
      },
    ],
    ['duplicate resolution', { intentResolutions: [primaryResolution, primaryResolution] }],
    ['unknown role', { intentResolutions: [{ ...primaryResolution, role: 'OWNER' }] }],
    [
      'unknown reason code',
      { intentResolutions: [{ ...primaryResolution, reasonCodes: ['LOOKS_GOOD'] }] },
    ],
    [
      'unsupported derived composition',
      {
        derivedSupports: [
          {
            supportId: `dsup1_${'b'.repeat(64)}`,
            compositionType: 'SEMANTIC_INFERENCE',
            intent: 'PROPERTY_SEARCH',
            target: '房',
            operator: '推荐',
            matchedSpan: { start: 0, end: 3 },
          },
        ],
      },
    ],
  ])('rejects %s', (_name, change) => {
    expect(compiledIntentCandidateSchema.safeParse({ ...base, ...change }).success).toBe(false);
  });
});
