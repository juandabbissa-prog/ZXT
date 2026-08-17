import { describe, expect, test } from 'vitest';
import {
  INTENT_MODIFIERS,
  REAL_ESTATE_INTENTS,
  intentDictionarySchema,
  modifierRuleSetSchema,
} from '../src/real-estate-intent';

const dictionary = {
  dictionaryVersion: '1.0.0',
  locale: 'zh-CN',
  market: 'dalian-real-estate',
  normalizationVersion: '1.0.0',
  matchingRuleVersion: '1.0.0',
  conflictPolicyVersion: '1.0.0',
  entries: [
    {
      termId: 'property-house',
      normalizedText: '房源',
      intent: 'PROPERTY_SEARCH',
      defaultStage: 'EXPLORING',
      allowedModifiers: ['QUESTION'],
      matchKind: 'LITERAL_PHRASE',
      evidenceStrength: 'QUALIFIED_PHRASE',
      upstreamSignalRuleIds: [],
      positiveExamples: ['想找房源'],
      negativeExamples: ['新闻提到房源'],
      source: 'MANUAL_CURATED',
      status: 'FROZEN',
    },
  ],
} as const;

const modifierRules = {
  modifierRuleVersion: '1.0.0',
  conflictPolicyVersion: '1.0.0',
  scope: 'CLAUSE',
  rules: [
    {
      ruleId: 'question-ma',
      modifier: 'QUESTION',
      matchKind: 'LITERAL_PHRASE',
      normalizedPhrases: ['吗'],
    },
  ],
} as const;

describe('real-estate intent contracts', () => {
  test('freezes the nine-intent and ten-modifier vocabularies', () => {
    expect(REAL_ESTATE_INTENTS).toHaveLength(9);
    expect(INTENT_MODIFIERS).toEqual([
      'AFFIRMATIVE',
      'QUESTION',
      'NEGATED',
      'RISK_CONCERN',
      'THIRD_PARTY_REFERENCE',
      'DISCUSSION_ONLY',
      'ACTION_REQUEST',
      'AMBIGUOUS',
      'PROMOTIONAL_CONTENT',
      'INFORMATIONAL_REPORTING',
    ]);
  });

  test('accepts immutable frozen dictionary and modifier rules', () => {
    const parsedDictionary = intentDictionarySchema.parse(dictionary);
    const parsedRules = modifierRuleSetSchema.parse(modifierRules);
    expect(Object.isFrozen(parsedDictionary)).toBe(true);
    expect(Object.isFrozen(parsedDictionary.entries)).toBe(true);
    expect(Object.isFrozen(parsedRules.rules)).toBe(true);
  });

  test.each([
    { ...dictionary, dictionaryVersion: 'v1' },
    { ...dictionary, entries: [{ ...dictionary.entries[0], intent: 'LEAD' }] },
    { ...dictionary, entries: [{ ...dictionary.entries[0], normalizedText: ' 房源 ' }] },
    { ...dictionary, entries: [{ ...dictionary.entries[0], status: 'ACTIVE' }] },
    { ...dictionary, customerId: 'forbidden' },
  ])('rejects invalid or downstream dictionary shapes', (candidate) => {
    expect(intentDictionarySchema.safeParse(candidate).success).toBe(false);
  });

  test('rejects duplicate term and modifier rule identities', () => {
    expect(
      intentDictionarySchema.safeParse({
        ...dictionary,
        entries: [dictionary.entries[0], dictionary.entries[0]],
      }).success,
    ).toBe(false);
    expect(
      modifierRuleSetSchema.safeParse({
        ...modifierRules,
        rules: [modifierRules.rules[0], modifierRules.rules[0]],
      }).success,
    ).toBe(false);
  });
});
