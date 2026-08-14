import { describe, expect, test } from 'vitest';
import {
  evidenceSignalRuleSetSchema,
  evidenceSignalSchema,
  SIGNAL_TYPES,
} from '../src/evidence-signal';

const fingerprint = 'a'.repeat(64);

const validSignal = {
  schemaVersion: '1.0.0',
  signalId: `sig1_${'b'.repeat(64)}`,
  signalCanonicalizationVersion: '1.0.0',
  signalType: 'TOPIC_MENTION',
  value: 'artificial intelligence',
  sourceEvidenceId: `ev1_${fingerprint}`,
  sourceFingerprint: fingerprint,
  ruleId: 'topic-ai',
  ruleVersion: '1.0.0',
} as const;

const validRuleSet = {
  ruleSetVersion: '1.0.0',
  rules: [
    {
      ruleId: 'topic-ai',
      ruleVersion: '1.0.0',
      signalType: 'TOPIC_MENTION',
      applicableEvidenceTypes: ['TEXT'],
      matcher: {
        operator: 'CONTAINS_NORMALIZED_TEXT',
        value: 'artificial intelligence',
      },
    },
  ],
} as const;

describe('Evidence Signal contracts', () => {
  test('accepts the frozen signal and rule-set shapes as readonly values', () => {
    const signal = evidenceSignalSchema.parse(validSignal);
    const ruleSet = evidenceSignalRuleSetSchema.parse(validRuleSet);

    expect(signal).toEqual(validSignal);
    expect(ruleSet).toEqual(validRuleSet);
    expect(Object.isFrozen(signal)).toBe(true);
    expect(Object.isFrozen(ruleSet)).toBe(true);
    expect(Object.isFrozen(ruleSet.rules)).toBe(true);
  });

  test('keeps the signal vocabulary restricted to verifiable abstractions', () => {
    expect(SIGNAL_TYPES).toEqual([
      'TOPIC_MENTION',
      'EXPRESSED_INTENT',
      'OBSERVED_BEHAVIOR',
      'OBSERVED_ENGAGEMENT',
    ]);
  });

  test('rejects each missing required Signal field', () => {
    for (const field of Object.keys(validSignal)) {
      const candidate = { ...validSignal } as Record<string, unknown>;
      delete candidate[field];

      expect(evidenceSignalSchema.safeParse(candidate).success).toBe(false);
    }
  });

  test.each([
    ['schemaVersion', { ...validSignal, schemaVersion: '2.0.0' }],
    ['signalCanonicalizationVersion', { ...validSignal, signalCanonicalizationVersion: '2.0.0' }],
    ['ruleVersion', { ...validSignal, ruleVersion: '2.0.0' }],
    ['signalType', { ...validSignal, signalType: 'CUSTOMER_INTENT' }],
    ['signalId', { ...validSignal, signalId: 'signal-1' }],
    ['sourceEvidenceId', { ...validSignal, sourceEvidenceId: 'evidence-1' }],
    ['sourceFingerprint', { ...validSignal, sourceFingerprint: 'not-a-fingerprint' }],
    ['value', { ...validSignal, value: ' Artificial   Intelligence ' }],
  ])('rejects an invalid %s', (_field, candidate) => {
    expect(evidenceSignalSchema.safeParse(candidate).success).toBe(false);
  });

  test('rejects invalid rule versions, enums, evidence types, and empty matchers', () => {
    const invalidRules = [
      { ...validRuleSet.rules[0], ruleVersion: '2.0.0' },
      { ...validRuleSet.rules[0], signalType: 'LEAD_SCORE' },
      { ...validRuleSet.rules[0], applicableEvidenceTypes: ['CUSTOMER'] },
      {
        ...validRuleSet.rules[0],
        matcher: { operator: 'CONTAINS_NORMALIZED_TEXT', value: '   ' },
      },
      {
        ...validRuleSet.rules[0],
        matcher: { operator: 'REGEX', value: 'ai.*' },
      },
    ];

    for (const rule of invalidRules) {
      expect(
        evidenceSignalRuleSetSchema.safeParse({ ...validRuleSet, rules: [rule] }).success,
      ).toBe(false);
    }
  });

  test.each(['customerId', 'leadId', 'profileId', 'confidence', 'score', 'action'])(
    'rejects forbidden downstream field %s',
    (field) => {
      expect(evidenceSignalSchema.safeParse({ ...validSignal, [field]: 'forbidden' }).success).toBe(
        false,
      );
    },
  );
});
