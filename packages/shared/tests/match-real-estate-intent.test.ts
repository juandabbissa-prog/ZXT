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
  QUESTION: ['吗', '多少', '？', '?'],
  NEGATED: ['不准备', '不打算', '不买'],
  RISK_CONCERN: ['风险', '会不会跌'],
  THIRD_PARTY_REFERENCE: ['朋友', '家人', '同事'],
  DISCUSSION_ONLY: ['讨论', '的人真多'],
  ACTION_REQUEST: ['还有吗', '预约看房'],
  PROMOTIONAL_CONTENT: ['广告', '推广'],
  INFORMATIONAL_REPORTING: ['新闻', '报道', '市场播报'],
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

const run = (content: string, signalOrder: 'normal' | 'reverse' = 'normal') => {
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
  return matchRealEstateIntent({
    evidence: { ...evidence, content },
    signals: signalOrder === 'reverse' ? signals.reverse() : signals,
    dictionary,
    modifierRuleSet,
  });
};

describe('deterministic real-estate intent matcher', () => {
  test.each(cases)('$id', ({ text, intents, stage }) => {
    const result = run(text);
    if (intents.length === 0) {
      expect(result.status).toBe('NO_MATCH');
      return;
    }
    expect(result.status).toBe('MATCHED');
    if (result.status !== 'MATCHED') return;
    expect(result.context.matches.map((match) => match.intent)).toEqual(intents);
    expect(result.context.matches.some((match) => match.stage === stage)).toBe(true);
  });

  test('applies global safety independently of entry allowedModifiers', () => {
    const result = run('朋友不准备买房，只是新闻讨论');
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
      JSON.stringify(run('这个90平户型还有吗？', 'reverse')),
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
});
