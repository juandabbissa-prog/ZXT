import { describe, expect, test } from 'vitest';
import {
  UNDERSTANDING_RELATION_TYPES,
  understandingContextAssemblyResultSchema,
  understandingContextSchema,
} from '../src/understanding-context';

const signalId = (character: string): string => `sig1_${character.repeat(64)}`;

const validContext = {
  schemaVersion: '1.0.0',
  contextId: `ctx1_${'d'.repeat(64)}`,
  contextCanonicalizationVersion: '1.0.0',
  sourceSignalIds: [signalId('a'), signalId('b')],
  groups: [
    { key: 'EXPRESSED_INTENT', signalIds: [signalId('a')] },
    { key: 'TOPIC_MENTION', signalIds: [signalId('b')] },
  ],
  relations: [
    {
      type: 'MEMBER_OF_GROUP',
      sourceSignalId: signalId('a'),
      targetGroupKey: 'EXPRESSED_INTENT',
    },
    {
      type: 'MEMBER_OF_GROUP',
      sourceSignalId: signalId('b'),
      targetGroupKey: 'TOPIC_MENTION',
    },
  ],
} as const;

describe('Understanding Context contracts', () => {
  test('accepts the frozen context shape as deeply readonly data', () => {
    const context = understandingContextSchema.parse(validContext);

    expect(context).toEqual(validContext);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.sourceSignalIds)).toBe(true);
    expect(Object.isFrozen(context.groups)).toBe(true);
    expect(Object.isFrozen(context.groups[0])).toBe(true);
    expect(Object.isFrozen(context.groups[0]?.signalIds)).toBe(true);
    expect(Object.isFrozen(context.relations)).toBe(true);
    expect(Object.isFrozen(context.relations[0])).toBe(true);
  });

  test('restricts relations to explicit group membership', () => {
    expect(UNDERSTANDING_RELATION_TYPES).toEqual(['MEMBER_OF_GROUP']);
  });

  test('rejects every missing required context field', () => {
    for (const field of Object.keys(validContext)) {
      const candidate = { ...validContext } as Record<string, unknown>;
      delete candidate[field];

      expect(understandingContextSchema.safeParse(candidate).success).toBe(false);
    }
  });

  test.each([
    ['schemaVersion', { ...validContext, schemaVersion: '2.0.0' }],
    [
      'contextCanonicalizationVersion',
      { ...validContext, contextCanonicalizationVersion: '2.0.0' },
    ],
    ['contextId', { ...validContext, contextId: 'context-1' }],
    ['sourceSignalId', { ...validContext, sourceSignalIds: ['signal-1'] }],
    ['group key', { ...validContext, groups: [{ key: 'CUSTOMER', signalIds: [signalId('a')] }] }],
    [
      'relation type',
      {
        ...validContext,
        relations: [
          {
            type: 'IMPLIES',
            sourceSignalId: signalId('a'),
            targetGroupKey: 'EXPRESSED_INTENT',
          },
        ],
      },
    ],
  ])('rejects an invalid %s', (_field, candidate) => {
    expect(understandingContextSchema.safeParse(candidate).success).toBe(false);
  });

  test.each([
    'customerId',
    'leadId',
    'profileId',
    'rank',
    'score',
    'priority',
    'conversion',
    'marketingAction',
    'probability',
    'prediction',
  ])('rejects forbidden downstream field %s', (field) => {
    expect(
      understandingContextSchema.safeParse({ ...validContext, [field]: 'forbidden' }).success,
    ).toBe(false);
  });

  test('accepts only frozen ASSEMBLED and REJECTED result shapes', () => {
    const assembled = understandingContextAssemblyResultSchema.parse({
      status: 'ASSEMBLED',
      context: validContext,
    });
    const rejected = understandingContextAssemblyResultSchema.parse({
      status: 'REJECTED',
      code: 'EMPTY_SIGNAL_SET',
      field: 'signals',
    });

    expect(Object.isFrozen(assembled)).toBe(true);
    expect(Object.isFrozen(rejected)).toBe(true);
  });
});
