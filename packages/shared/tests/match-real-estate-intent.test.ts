import { describe, expect, test } from 'vitest';
import cases from './fixtures/real-estate-intent/cases.json';
import { matchRealEstateIntent } from '../src/real-estate-intent';

const fingerprint = 'a'.repeat(64);
const evidence = {
  schemaVersion: '1.0.0',
  adapterId: 'fixture',
  adapterVersion: '1.0.0',
  dataSourceId: 'fixture',
  sourceType: 'FIXTURE',
  sourceRecordId: 'record-1',
  businessSpaceId: 'test',
  purposeCode: 'validation',
  evidenceType: 'TEXT',
  content: '',
  acquiredAt: '2026-01-01T00:00:00.000Z',
  observedAt: '2026-01-01T00:00:00.000Z',
  occurredAt: null,
  provenance: {
    acquisitionMethod: 'FIXTURE',
    sourceReference: null,
    complianceDeclarationVersion: '1.0.0',
  },
  unknownFields: [],
  referenceUrl: null,
  contentLanguage: 'zh-CN',
  sourceMetadata: {},
  evidenceId: `ev1_${fingerprint}`,
  fingerprint,
  canonicalizationVersion: '1.0.0',
  validationStatus: 'ACCEPTED',
  validatedAt: '2026-01-01T00:00:00.000Z',
  validatorVersion: '1.0.0',
  qualityFacts: { freshness: 'FRESH' },
  realtimeEligibility: 'ELIGIBLE',
  redactionStatus: 'NOT_REQUIRED',
} as const;

const entries = [
  ['房源', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['二手房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['楼盘', 'PROPERTY_SEARCH', 'EXPLORING', 'WEAK_TERM'],
  ['户型', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['买房', 'PROPERTY_SEARCH', 'EXPLORING', 'WEAK_TERM'],
  ['看房', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['房价', 'PRICE_CONCERN', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['多少钱', 'PRICE_CONCERN', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['现在买房合适吗', 'PURCHASE_DECISION', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['首付', 'FINANCIAL_PREPARATION', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['资格', 'BUYING_QUALIFICATION', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['学区房', 'EDUCATION_NEED', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['结婚', 'LIFE_STAGE_CHANGE', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['换房', 'LIFE_STAGE_CHANGE', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['出租', 'INVESTMENT_INTENT', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['升值', 'INVESTMENT_INTENT', 'EVALUATING', 'QUALIFIED_PHRASE'],
  ['还有吗', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['预约看房', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['还有房吗', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['发一下', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['还有在售房源吗', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['还有没有房', 'HIGH_INTENT_ACTION', 'ACTION_REQUEST', 'EXPLICIT_ACTION'],
  ['小区', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['楼市政策', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
  ['新房', 'PROPERTY_SEARCH', 'EXPLORING', 'WEAK_TERM'],
  ['公积金', 'FINANCIAL_PREPARATION', 'EVALUATING', 'WEAK_TERM'],
  ['贷款', 'FINANCIAL_PREPARATION', 'EVALUATING', 'WEAK_TERM'],
  ['学区', 'EDUCATION_NEED', 'EXPLORING', 'WEAK_TERM'],
  ['高新区', 'PROPERTY_SEARCH', 'EXPLORING', 'QUALIFIED_PHRASE'],
].map(([normalizedText, intent, defaultStage, evidenceStrength], index) => ({
  termId: `term-${String(index).padStart(2, '0')}`,
  normalizedText,
  intent,
  defaultStage,
  allowedModifiers: ['AFFIRMATIVE', 'QUESTION', 'RISK_CONCERN', 'ACTION_REQUEST'],
  matchKind: 'LITERAL_PHRASE',
  evidenceStrength,
  upstreamSignalRuleIds: [],
  positiveExamples: [],
  negativeExamples: [],
  source: 'MANUAL_CURATED',
  status: 'FROZEN',
}));

const dictionary = {
  dictionaryVersion: '1.0.0',
  locale: 'zh-CN',
  market: 'dalian-real-estate',
  normalizationVersion: '1.0.0',
  matchingRuleVersion: '1.0.0',
  conflictPolicyVersion: '1.0.0',
  entries,
};
const phrases: Record<string, string[]> = {
  QUESTION: ['吗', '多少', '?'],
  NEGATED: ['不准备', '不打算', '不买'],
  RISK_CONCERN: ['风险', '会不会跌'],
  THIRD_PARTY_REFERENCE: ['朋友', '家人', '同事'],
  DISCUSSION_ONLY: ['讨论', '的人真多'],
  ACTION_REQUEST: [
    '还有吗',
    '还有房吗',
    '预约看房',
    '发一下',
    '还有在售房源吗',
    '欢迎联系我',
    '咨询房源',
  ],
  PROMOTIONAL_CONTENT: ['广告', '推广', '售楼处活动', '优惠', '欢迎联系我', '点击头像'],
  INFORMATIONAL_REPORTING: [
    '新闻',
    '报道',
    '市场播报',
    '政策发布',
    '数据显示',
    '专家称',
    '正式调整',
  ],
  AFFIRMATIVE: ['我想', '准备'],
  AMBIGUOUS: ['可能'],
};
const modifierRuleSet = {
  modifierRuleVersion: '1.0.0',
  conflictPolicyVersion: '1.0.0',
  scope: 'CLAUSE',
  rules: Object.entries(phrases).flatMap(([modifier, values]) =>
    values.map((value, index) => ({
      ruleId: `${modifier.toLowerCase()}-${index}`,
      modifier,
      matchKind: 'LITERAL_PHRASE',
      normalizedPhrases: [value],
    })),
  ),
};

const run = (
  content: string,
  options: {
    signalOrder?: 'normal' | 'reverse';
    signals?: readonly Record<string, unknown>[];
    dictionary?: Record<string, unknown>;
    modifierRuleSet?: Record<string, unknown>;
  } = {},
) => {
  const signals = [
    {
      schemaVersion: '1.0.0',
      signalId: `sig1_${'b'.repeat(64)}`,
      signalCanonicalizationVersion: '1.0.0',
      signalType: 'TOPIC_MENTION',
      value: '大连房产',
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: fingerprint,
      ruleId: 'topic-property',
      ruleVersion: '1.0.0',
    },
    {
      schemaVersion: '1.0.0',
      signalId: `sig1_${'c'.repeat(64)}`,
      signalCanonicalizationVersion: '1.0.0',
      signalType: 'EXPRESSED_INTENT',
      value: '买房',
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: fingerprint,
      ruleId: 'intent-buy',
      ruleVersion: '1.0.0',
    },
  ];
  const selectedSignals = options.signals ?? signals;
  return matchRealEstateIntent({
    evidence: { ...evidence, content },
    signals: options.signalOrder === 'reverse' ? [...selectedSignals].reverse() : selectedSignals,
    dictionary: options.dictionary ?? dictionary,
    modifierRuleSet: options.modifierRuleSet ?? modifierRuleSet,
  });
};

describe('deterministic real-estate intent matcher', () => {
  test.each(cases)('$id', ({ text, matches }) => {
    const result = run(text);
    if (matches.length === 0) {
      expect(result.status).toBe('NO_MATCH');
      return;
    }
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.map(({ intent, stage }) => ({ intent, stage }))).toEqual(matches);
  });

  test('applies global safety independently of entry allowedModifiers', () => {
    const result = run('朋友不准备买房新闻讨论');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches[0]?.modifiers).toEqual(
      expect.arrayContaining([
        'NEGATED',
        'THIRD_PARTY_REFERENCE',
        'DISCUSSION_ONLY',
        'INFORMATIONAL_REPORTING',
      ]),
    );
    expect(result.context.matches[0]?.stage).toBe('CONTEXT_ONLY');
    expect(result.context.matches[0]?.modifiers).not.toContain('AFFIRMATIVE');
  });

  test('requires a property anchor for high-intent actions', () => {
    expect(run('视频还有吗？').status).toBe('NO_MATCH');
    const result = run('这个90平户型还有吗？');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.map((match) => match.intent)).toEqual([
      'PROPERTY_SEARCH',
      'HIGH_INTENT_ACTION',
    ]);
    expect(result.context.matches.flatMap((match) => match.modifiers)).toEqual(
      expect.arrayContaining(['QUESTION', 'ACTION_REQUEST']),
    );
  });

  test('is byte-stable across replay and signal order', () => {
    expect(JSON.stringify(run('这个90平户型还有吗？'))).toBe(
      JSON.stringify(run('这个90平户型还有吗？', { signalOrder: 'reverse' })),
    );
  });

  test('rejects signal/evidence linkage mismatch', () => {
    const result = matchRealEstateIntent({
      evidence: { ...evidence, content: '房价' },
      signals: [
        {
          schemaVersion: '1.0.0',
          signalId: `sig1_${'d'.repeat(64)}`,
          signalCanonicalizationVersion: '1.0.0',
          signalType: 'TOPIC_MENTION',
          value: '房价',
          sourceEvidenceId: `ev1_${'e'.repeat(64)}`,
          sourceFingerprint: 'e'.repeat(64),
          ruleId: 'topic',
          ruleVersion: '1.0.0',
        },
      ],
      dictionary,
      modifierRuleSet,
    });
    expect(result).toMatchObject({ status: 'REJECTED', code: 'SIGNAL_EVIDENCE_MISMATCH' });
  });

  test('rejects a duplicate signalId', () => {
    const validSignal = {
      schemaVersion: '1.0.0',
      signalId: `sig1_${'b'.repeat(64)}`,
      signalCanonicalizationVersion: '1.0.0',
      signalType: 'TOPIC_MENTION',
      value: '房价',
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: fingerprint,
      ruleId: 'price-signal',
      ruleVersion: '1.0.0',
    } as const;
    expect(run('房价', { signals: [validSignal, validSignal] })).toMatchObject({
      status: 'REJECTED',
    });
  });

  test('does not allow a Signal to create an Intent without Evidence text support', () => {
    const signal = {
      schemaVersion: '1.0.0',
      signalId: `sig1_${'d'.repeat(64)}`,
      signalCanonicalizationVersion: '1.0.0',
      signalType: 'TOPIC_MENTION',
      value: '房价',
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: fingerprint,
      ruleId: 'price-signal',
      ruleVersion: '1.0.0',
    } as const;
    const signalEntry = { ...entries[6], upstreamSignalRuleIds: ['price-signal'] };
    const signalDictionary = { ...dictionary, entries: [signalEntry] };

    expect(run('今天阳光很好', { signals: [signal], dictionary: signalDictionary }).status).toBe(
      'NO_MATCH',
    );
    const matched = run('房价', { signals: [signal], dictionary: signalDictionary });
    expect(matched.status).toBe('MATCHED');
    if (matched.status !== 'MATCHED') return;
    expect(matched.context.matches).toHaveLength(1);
    expect(matched.context.matches[0]?.signalIds).toEqual([signal.signalId]);
  });

  test.each([
    '视频还有吗？',
    '这个户型讲解视频还有吗？',
    '房价这个视频能发一下吗？',
    '链接发一下',
    '这个楼盘介绍视频能看看吗？',
    '这个小区的文章还有吗？',
    '这个小区的资料还有吗？',
    '房价还有吗？',
    '房贷资料发一下',
    '房租还有吗？',
    '房产新闻还有吗？',
    '房产政策发一下',
    '房产视频还有吗？',
  ])('does not treat a content asset request as HIGH_INTENT_ACTION: %s', (text) => {
    const result = run(text);
    if (result.status !== 'MATCHED') {
      expect(result.status).toBe('NO_MATCH');
      return;
    }
    expect(result.context.matches.map((match) => match.intent)).not.toContain('HIGH_INTENT_ACTION');
  });

  test.each([
    '这个90平户型还有吗？',
    '还有房吗？',
    '可以预约看房吗？',
    '发一下这个小区的房源',
    '这个楼盘还有在售房源吗？',
    '看完视频后想预约看房',
    '这个介绍视频看完了，我想看看还有没有房',
    '这套房还有吗？',
    '房源发一下',
  ])('requires an explicit property action object: %s', (text) => {
    const result = run(text);
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.map((match) => match.intent)).toContain('HIGH_INTENT_ACTION');
  });

  test.each([
    '视频还有吗，这套房还有吗',
    '视频发一下，房源发一下',
    '这套房还有吗，视频还有吗',
    '房源发一下，链接发一下',
  ])('preserves a property action across repeated action phrases: %s', (text) => {
    const result = run(text);
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.map((match) => match.intent)).toContain('HIGH_INTENT_ACTION');
  });

  test.each(['视频还有吗，链接还有吗', '视频发一下，文章发一下'])(
    'does not invent a property action across repeated content requests: %s',
    (text) => {
      const result = run(text);
      if (result.status !== 'MATCHED') {
        expect(result.status).toBe('NO_MATCH');
        return;
      }
      expect(result.context.matches.map((match) => match.intent)).not.toContain(
        'HIGH_INTENT_ACTION',
      );
    },
  );

  test.each(['房价', '房价吗？', '买房？', '首付？', '贷款？'])(
    'keeps an isolated weak term safe: %s',
    (text) => {
      const weakDictionary = {
        ...dictionary,
        entries: entries.map((entry) => ({ ...entry, evidenceStrength: 'WEAK_TERM' })),
      };
      const result = run(text, { dictionary: weakDictionary });
      expect(result.status).toBe('MATCHED');
      if (result.status !== 'MATCHED') return;
      expect(result.context.matches.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
      expect(result.context.matches.every((match) => match.modifiers.includes('AMBIGUOUS'))).toBe(
        true,
      );
    },
  );

  test('does not upgrade multiple co-occurring weak terms', () => {
    const weakDictionary = {
      ...dictionary,
      entries: entries.map((entry) => ({ ...entry, evidenceStrength: 'WEAK_TERM' })),
    };
    const result = run('房价 首付 学区', { dictionary: weakDictionary });
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
  });

  test('keeps modifiers and stage clause-local', () => {
    const result = run('我想买房。后来不准备买房。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    const propertyMatches = result.context.matches.filter(
      (match) => match.intent === 'PROPERTY_SEARCH',
    );
    expect(propertyMatches).toHaveLength(2);
    expect(propertyMatches[0]?.modifiers).toContain('AFFIRMATIVE');
    expect(propertyMatches[1]?.modifiers).toContain('NEGATED');
  });

  test('does not leak informational safety into a later action clause', () => {
    const result = run('楼市政策发布了。我想看看这个小区还有没有房。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    const firstClause = result.context.matches.filter((match) => match.clauseIndex === 0);
    const secondClause = result.context.matches.filter((match) => match.clauseIndex === 1);
    expect(firstClause.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
    expect(secondClause.some((match) => match.intent === 'HIGH_INTENT_ACTION')).toBe(true);
    expect(
      secondClause.every((match) => !match.modifiers.includes('INFORMATIONAL_REPORTING')),
    ).toBe(true);
  });

  test('scopes negation to a connector-aware Chinese subclause', () => {
    const result = run('这个楼盘不错，但我不打算买。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches[0]?.intent).toBe('PROPERTY_SEARCH');
    expect(result.context.matches[0]?.modifiers).not.toContain('NEGATED');
  });

  test('does not leak third-party context across a contrast connector', () => {
    const result = run('朋友想买房，但我自己想看看高新区还有没有房。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    const first = result.context.matches.filter((match) => match.clauseIndex === 0);
    const second = result.context.matches.filter((match) => match.clauseIndex === 1);
    expect(first.every((match) => match.modifiers.includes('THIRD_PARTY_REFERENCE'))).toBe(true);
    expect(first.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
    expect(second.some((match) => match.intent === 'HIGH_INTENT_ACTION')).toBe(true);
    expect(second.every((match) => !match.modifiers.includes('THIRD_PARTY_REFERENCE'))).toBe(true);
  });

  test('does not leak reporting context across a contrast connector', () => {
    const result = run('楼市政策发布了，但我想看看这个小区还有没有房。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    const first = result.context.matches.filter((match) => match.clauseIndex === 0);
    const second = result.context.matches.filter((match) => match.clauseIndex === 1);
    expect(first.every((match) => match.modifiers.includes('INFORMATIONAL_REPORTING'))).toBe(true);
    expect(second.some((match) => match.intent === 'HIGH_INTENT_ACTION')).toBe(true);
    expect(second.every((match) => !match.modifiers.includes('INFORMATIONAL_REPORTING'))).toBe(
      true,
    );
  });

  test('keeps ordinary list commas inside one action context', () => {
    const result = run('大连高新区，90平左右，还有房吗？');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(new Set(result.context.matches.map((match) => match.clauseIndex))).toEqual(new Set([0]));
    expect(result.context.matches.map((match) => match.intent)).toContain('HIGH_INTENT_ACTION');
  });

  test('preserves evaluation, negation, and third-party facts separately', () => {
    const result = run('这个楼盘不错，但我不打算买。朋友倒是想问首付。');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.some((match) => match.clauseIndex === 0)).toBe(true);
    expect(
      result.context.matches
        .filter((match) => match.clauseIndex === 0)
        .every((match) => !match.modifiers.includes('NEGATED')),
    ).toBe(true);
    expect(
      result.context.matches
        .filter((match) => match.clauseIndex === 2)
        .every((match) => match.modifiers.includes('THIRD_PARTY_REFERENCE')),
    ).toBe(true);
  });

  test('changes context identity when a semantics-bearing version changes', () => {
    const baseline = run('房价');
    const changed = run('房价', {
      dictionary: { ...dictionary, normalizationVersion: '1.0.1' },
    });
    expect(baseline.status).toBe('MATCHED');
    expect(changed.status).toBe('MATCHED');
    if (baseline.status !== 'MATCHED' || changed.status !== 'MATCHED') return;
    expect(changed.context.contextId).not.toBe(baseline.context.contextId);
  });

  test('has a stable golden contextId', () => {
    const result = run('这个90平户型还有吗？');
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.contextId).toBe(
      'ictx1_47e0f48ae07c6534dc19ae7f28041718f5f54b9ec9b6f82df20e21aea6d01f45',
    );
  });

  test('rejects a sourceFingerprint-only mismatch', () => {
    const signal = {
      schemaVersion: '1.0.0',
      signalId: `sig1_${'e'.repeat(64)}`,
      signalCanonicalizationVersion: '1.0.0',
      signalType: 'TOPIC_MENTION',
      value: '房价',
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: 'f'.repeat(64),
      ruleId: 'price-signal',
      ruleVersion: '1.0.0',
    } as const;
    expect(run('房价', { signals: [signal] })).toMatchObject({
      status: 'REJECTED',
      code: 'SIGNAL_EVIDENCE_MISMATCH',
    });
  });

  test.each(['CANDIDATE', 'RETIRED'])('does not execute %s dictionary entries', (status) => {
    const inactiveDictionary = {
      ...dictionary,
      entries: entries.map((entry) => ({ ...entry, status })),
    };
    expect(run('房价', { dictionary: inactiveDictionary })).toMatchObject({
      status: 'REJECTED',
      code: 'NO_ACTIVE_DICTIONARY_ENTRY',
    });
  });

  test('is byte-stable across entry, modifier-rule, and signal permutations', () => {
    const baseline = run('这个90平户型还有吗？');
    const permuted = run('这个90平户型还有吗？', {
      signalOrder: 'reverse',
      dictionary: { ...dictionary, entries: [...entries].reverse() },
      modifierRuleSet: { ...modifierRuleSet, rules: [...modifierRuleSet.rules].reverse() },
    });
    expect(JSON.stringify(permuted)).toBe(JSON.stringify(baseline));
  });

  test.each([
    '大连最新楼市政策发布',
    '数据显示7月新房成交上涨',
    '专家称房价可能继续调整',
    '公积金政策今天正式调整',
  ])('keeps informational reporting safe: %s', (text) => {
    const result = run(text);
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
    expect(
      result.context.matches.every((match) => match.modifiers.includes('INFORMATIONAL_REPORTING')),
    ).toBe(true);
  });

  test.each(['售楼处活动，预约看房送礼', '新房优惠，欢迎联系我', '点击头像咨询房源'])(
    'keeps promotional content safe: %s',
    (text) => {
      const result = run(text);
      expect(result.status).toBe('MATCHED');
      if (result.status !== 'MATCHED') return;
      expect(result.context.matches.every((match) => match.stage === 'CONTEXT_ONLY')).toBe(true);
      expect(
        result.context.matches.every((match) => match.modifiers.includes('PROMOTIONAL_CONTENT')),
      ).toBe(true);
    },
  );

  test.each([
    ['matchingRuleVersion', { dictionary: { ...dictionary, matchingRuleVersion: '1.0.1' } }],
    [
      'dictionaryConflictPolicyVersion',
      { dictionary: { ...dictionary, conflictPolicyVersion: '1.0.1' } },
    ],
    [
      'modifierRuleVersion',
      { modifierRuleSet: { ...modifierRuleSet, modifierRuleVersion: '1.0.1' } },
    ],
    [
      'modifierConflictPolicyVersion',
      { modifierRuleSet: { ...modifierRuleSet, conflictPolicyVersion: '1.0.1' } },
    ],
  ])('includes %s in context identity', (_version, options) => {
    const baseline = run('房价');
    const changed = run('房价', options);
    expect(baseline.status).toBe('MATCHED');
    expect(changed.status).toBe('MATCHED');
    if (baseline.status !== 'MATCHED' || changed.status !== 'MATCHED') return;
    expect(changed.context.contextId).not.toBe(baseline.context.contextId);
  });
});
