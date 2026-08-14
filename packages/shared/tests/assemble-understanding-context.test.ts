import { describe, expect, test } from 'vitest';
import {
  assembleUnderstandingContext,
  canonicalizeUnderstandingContext,
  type EvidenceSignal,
} from '../src';

const signalId = (character: string): string => `sig1_${character.repeat(64)}`;
const fingerprint = (character: string): string => character.repeat(64);

const signal = (
  idCharacter: string,
  signalType: EvidenceSignal['signalType'],
  value: string,
): EvidenceSignal => ({
  schemaVersion: '1.0.0',
  signalId: signalId(idCharacter),
  signalCanonicalizationVersion: '1.0.0',
  signalType,
  value,
  sourceEvidenceId: `ev1_${fingerprint(idCharacter)}`,
  sourceFingerprint: fingerprint(idCharacter),
  ruleId: `rule-${idCharacter}`,
  ruleVersion: '1.0.0',
});

const intentSignal = signal('a', 'EXPRESSED_INTENT', 'plan to buy');
const topicSignal = signal('b', 'TOPIC_MENTION', 'artificial intelligence');
const secondTopicSignal = signal('c', 'TOPIC_MENTION', 'automation');

describe('assembleUnderstandingContext', () => {
  test('assembles deterministic groups and explicit membership relations', () => {
    const result = assembleUnderstandingContext([secondTopicSignal, topicSignal, intentSignal]);

    expect(result).toEqual({
      status: 'ASSEMBLED',
      context: {
        schemaVersion: '1.0.0',
        contextId: 'ctx1_b943852542a86a9e1bea8949099d9ff5d73d13f4e13b1555ec2a400fca5eb040',
        contextCanonicalizationVersion: '1.0.0',
        sourceSignalIds: [signalId('a'), signalId('b'), signalId('c')],
        groups: [
          { key: 'EXPRESSED_INTENT', signalIds: [signalId('a')] },
          { key: 'TOPIC_MENTION', signalIds: [signalId('b'), signalId('c')] },
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
          {
            type: 'MEMBER_OF_GROUP',
            sourceSignalId: signalId('c'),
            targetGroupKey: 'TOPIC_MENTION',
          },
        ],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== 'ASSEMBLED') throw new Error('Expected assembled context');
    expect(Object.isFrozen(result.context)).toBe(true);
  });

  test('freezes canonical bytes and SHA-256 context identity', () => {
    const canonical = canonicalizeUnderstandingContext({
      sourceSignalIds: [signalId('a'), signalId('b'), signalId('c')],
      groups: [
        { key: 'EXPRESSED_INTENT', signalIds: [signalId('a')] },
        { key: 'TOPIC_MENTION', signalIds: [signalId('b'), signalId('c')] },
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
        {
          type: 'MEMBER_OF_GROUP',
          sourceSignalId: signalId('c'),
          targetGroupKey: 'TOPIC_MENTION',
        },
      ],
    });

    expect(canonical.canonicalBytes).toBe(
      `{"contextCanonicalizationVersion":"1.0.0","schemaVersion":"1.0.0","sourceSignalIds":["${signalId('a')}","${signalId('b')}","${signalId('c')}"],"groups":[{"key":"EXPRESSED_INTENT","signalIds":["${signalId('a')}"]},{"key":"TOPIC_MENTION","signalIds":["${signalId('b')}","${signalId('c')}"]}],"relations":[{"type":"MEMBER_OF_GROUP","sourceSignalId":"${signalId('a')}","targetGroupKey":"EXPRESSED_INTENT"},{"type":"MEMBER_OF_GROUP","sourceSignalId":"${signalId('b')}","targetGroupKey":"TOPIC_MENTION"},{"type":"MEMBER_OF_GROUP","sourceSignalId":"${signalId('c')}","targetGroupKey":"TOPIC_MENTION"}]}`,
    );
    expect(canonical.contextId).toBe(
      'ctx1_b943852542a86a9e1bea8949099d9ff5d73d13f4e13b1555ec2a400fca5eb040',
    );
  });

  test('is byte-for-byte deterministic across input order and replay', () => {
    const forward = assembleUnderstandingContext([intentSignal, topicSignal, secondTopicSignal]);
    const reverse = assembleUnderstandingContext([secondTopicSignal, topicSignal, intentSignal]);

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    expect(JSON.stringify(forward)).toBe(
      JSON.stringify(assembleUnderstandingContext([intentSignal, topicSignal, secondTopicSignal])),
    );
  });

  test('rejects an empty Signal set', () => {
    expect(assembleUnderstandingContext([])).toEqual({
      status: 'REJECTED',
      code: 'EMPTY_SIGNAL_SET',
      field: 'signals',
    });
  });

  test('rejects duplicate Signal identity without silent deduplication', () => {
    expect(assembleUnderstandingContext([topicSignal, topicSignal])).toEqual({
      status: 'REJECTED',
      code: 'DUPLICATE_SIGNAL_ID',
      field: 'signals',
    });
  });

  test('distinguishes missing input from malformed Signal data', () => {
    expect(assembleUnderstandingContext(undefined)).toEqual({
      status: 'REJECTED',
      code: 'MISSING_REQUIRED_FIELD',
      field: 'signals',
    });
    expect(assembleUnderstandingContext([{ ...topicSignal, signalId: 'invalid' }])).toEqual({
      status: 'REJECTED',
      code: 'INVALID_INPUT',
      field: 'signals.0.signalId',
    });
  });

  test('rejects an unsupported Signal contract version', () => {
    expect(assembleUnderstandingContext([{ ...topicSignal, schemaVersion: '2.0.0' }])).toEqual({
      status: 'REJECTED',
      code: 'VERSION_MISMATCH',
      field: 'signals.0.schemaVersion',
    });
  });

  test('keeps every group and relation traceable to the input Signal set', () => {
    const result = assembleUnderstandingContext([intentSignal, topicSignal, secondTopicSignal]);

    expect(result.status).toBe('ASSEMBLED');
    if (result.status !== 'ASSEMBLED') throw new Error('Expected assembled context');
    const sourceIds = new Set(result.context.sourceSignalIds);
    for (const group of result.context.groups) {
      expect(group.signalIds.every((id) => sourceIds.has(id))).toBe(true);
    }
    for (const relation of result.context.relations) {
      expect(sourceIds.has(relation.sourceSignalId)).toBe(true);
      expect(result.context.groups.some((group) => group.key === relation.targetGroupKey)).toBe(
        true,
      );
    }
  });

  test('does not mutate inputs or add forbidden decision fields', () => {
    const signals = [topicSignal, intentSignal];
    const before = structuredClone(signals);

    const result = assembleUnderstandingContext(signals);

    expect(signals).toEqual(before);
    expect(JSON.stringify(result)).not.toMatch(
      /customer|lead|profile|ranking|score|priority|conversion|marketing|probability|prediction/iu,
    );
  });
});
