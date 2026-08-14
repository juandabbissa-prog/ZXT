import { describe, expect, test } from 'vitest';
import {
  canonicalizeSignalIdentity,
  projectEvidenceToSignals,
  type EvidenceSignalRuleSet,
} from '../src/evidence-signal';

const fingerprint = 'a'.repeat(64);

const evidence = {
  schemaVersion: '1.0.0',
  adapterId: 'manual-fixture',
  adapterVersion: '1.0.0',
  dataSourceId: 'fixture-source',
  sourceType: 'FIXTURE',
  sourceRecordId: 'fixture-record-1',
  businessSpaceId: 'fixture-space',
  purposeCode: 'test-only',
  evidenceType: 'TEXT',
  content: 'We are exploring  ARTIFICIAL   INTELLIGENCE and explicitly plan to buy.',
  acquiredAt: '2026-01-01T00:00:00.000Z',
  observedAt: '2026-01-01T00:00:00.000Z',
  occurredAt: '2026-01-01T00:00:00.000Z',
  provenance: {
    acquisitionMethod: 'FIXTURE',
    sourceReference: null,
    complianceDeclarationVersion: '1.0.0',
  },
  unknownFields: [],
  referenceUrl: null,
  contentLanguage: 'en',
  sourceMetadata: {},
  evidenceId: `ev1_${fingerprint}`,
  fingerprint,
  canonicalizationVersion: '1.0.0',
  validationStatus: 'ACCEPTED',
  validatedAt: '2026-01-01T00:00:01.000Z',
  validatorVersion: '1.0.0',
  qualityFacts: { freshness: 'FRESH' },
  realtimeEligibility: 'ELIGIBLE',
  redactionStatus: 'NOT_REQUIRED',
} as const;

const topicRule = {
  ruleId: 'topic-ai',
  ruleVersion: '1.0.0',
  signalType: 'TOPIC_MENTION',
  applicableEvidenceTypes: ['TEXT'],
  matcher: {
    operator: 'CONTAINS_NORMALIZED_TEXT',
    value: ' Artificial   Intelligence ',
  },
} as const;

const intentRule = {
  ruleId: 'intent-buy',
  ruleVersion: '1.0.0',
  signalType: 'EXPRESSED_INTENT',
  applicableEvidenceTypes: ['TEXT'],
  matcher: {
    operator: 'CONTAINS_NORMALIZED_TEXT',
    value: 'plan to buy',
  },
} as const;

const ruleSet = (rules: readonly unknown[]): unknown => ({
  ruleSetVersion: '1.0.0',
  rules,
});

describe('projectEvidenceToSignals', () => {
  test('derives a traceable topic Signal from an explicit literal match', () => {
    const result = projectEvidenceToSignals({ evidence, ruleSet: ruleSet([topicRule]) });

    expect(result).toEqual({
      status: 'DERIVED',
      signals: [
        {
          schemaVersion: '1.0.0',
          signalId: 'sig1_47cf7a8d14cb6046e51e1a177acb76708ac12628994748a68ab5761b6d29fef1',
          signalCanonicalizationVersion: '1.0.0',
          signalType: 'TOPIC_MENTION',
          value: 'artificial intelligence',
          sourceEvidenceId: evidence.evidenceId,
          sourceFingerprint: evidence.fingerprint,
          ruleId: 'topic-ai',
          ruleVersion: '1.0.0',
        },
      ],
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.status !== 'DERIVED') throw new Error('Expected a derived result');
    expect(Object.isFrozen(result.signals)).toBe(true);
  });

  test('derives expressed intent only when its literal rule matches', () => {
    const result = projectEvidenceToSignals({ evidence, ruleSet: ruleSet([intentRule]) });

    expect(result.status).toBe('DERIVED');
    if (result.status !== 'DERIVED') throw new Error('Expected a derived result');
    expect(result.signals[0]?.signalType).toBe('EXPRESSED_INTENT');
    expect(result.signals[0]?.value).toBe('plan to buy');
  });

  test.each([
    ['OBSERVED_BEHAVIOR', 'explicitly plan to buy'],
    ['OBSERVED_ENGAGEMENT', 'exploring artificial intelligence'],
  ] as const)('derives %s only from its explicit literal rule', (signalType, value) => {
    const result = projectEvidenceToSignals({
      evidence,
      ruleSet: ruleSet([
        {
          ...topicRule,
          ruleId: `rule-${signalType.toLowerCase()}`,
          signalType,
          matcher: { operator: 'CONTAINS_NORMALIZED_TEXT', value },
        },
      ]),
    });

    expect(result.status).toBe('DERIVED');
    if (result.status !== 'DERIVED') throw new Error('Expected a derived result');
    expect(result.signals[0]?.signalType).toBe(signalType);
  });

  test('returns NO_SIGNAL when text or EvidenceType does not match', () => {
    const nonMatching = projectEvidenceToSignals({
      evidence,
      ruleSet: ruleSet([
        { ...topicRule, matcher: { ...topicRule.matcher, value: 'not present' } },
        { ...intentRule, applicableEvidenceTypes: ['METRIC'] },
      ]),
    });

    expect(nonMatching).toEqual({ status: 'NO_SIGNAL', signals: [] });
  });

  test('distinguishes missing required input from malformed input', () => {
    expect(projectEvidenceToSignals({ ruleSet: ruleSet([]) })).toEqual({
      status: 'REJECTED',
      code: 'MISSING_REQUIRED_FIELD',
      field: 'evidence',
    });
    expect(
      projectEvidenceToSignals({ evidence: { ...evidence, evidenceId: 'invalid' }, ruleSet }),
    ).toEqual({
      status: 'REJECTED',
      code: 'INVALID_INPUT',
      field: 'evidence.evidenceId',
    });
  });

  test('rejects unsupported contract versions', () => {
    expect(
      projectEvidenceToSignals({
        evidence: { ...evidence, schemaVersion: '2.0.0' },
        ruleSet: ruleSet([]),
      }),
    ).toEqual({
      status: 'REJECTED',
      code: 'VERSION_MISMATCH',
      field: 'evidence.schemaVersion',
    });
    expect(
      projectEvidenceToSignals({
        evidence,
        ruleSet: { ruleSetVersion: '2.0.0', rules: [] },
      }),
    ).toEqual({
      status: 'REJECTED',
      code: 'VERSION_MISMATCH',
      field: 'ruleSet.ruleSetVersion',
    });
  });

  test('rejects duplicate rule ids instead of silently overwriting them', () => {
    expect(
      projectEvidenceToSignals({ evidence, ruleSet: ruleSet([topicRule, topicRule]) }),
    ).toEqual({
      status: 'REJECTED',
      code: 'DUPLICATE_RULE_ID',
      field: 'ruleSet.rules',
    });
  });

  test('freezes canonical bytes and SHA-256 Signal identity', () => {
    const identity = canonicalizeSignalIdentity({
      sourceEvidenceId: evidence.evidenceId,
      sourceFingerprint: evidence.fingerprint,
      ruleId: topicRule.ruleId,
      ruleVersion: topicRule.ruleVersion,
      signalType: topicRule.signalType,
      value: 'artificial intelligence',
    });

    expect(identity.canonicalBytes).toBe(
      `{"signalCanonicalizationVersion":"1.0.0","schemaVersion":"1.0.0","sourceEvidenceId":"${evidence.evidenceId}","sourceFingerprint":"${evidence.fingerprint}","ruleId":"topic-ai","ruleVersion":"1.0.0","signalType":"TOPIC_MENTION","value":"artificial intelligence"}`,
    );
    expect(identity.signalId).toBe(
      'sig1_47cf7a8d14cb6046e51e1a177acb76708ac12628994748a68ab5761b6d29fef1',
    );
  });

  test('is byte-for-byte deterministic across replay and rule order', () => {
    const forward = projectEvidenceToSignals({
      evidence,
      ruleSet: ruleSet([topicRule, intentRule]),
    });
    const reverse = projectEvidenceToSignals({
      evidence,
      ruleSet: ruleSet([intentRule, topicRule]),
    });

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
    expect(JSON.stringify(forward)).toBe(
      JSON.stringify(
        projectEvidenceToSignals({ evidence, ruleSet: ruleSet([topicRule, intentRule]) }),
      ),
    );
  });

  test('excludes runtime validation time from Signal identity', () => {
    const first = projectEvidenceToSignals({ evidence, ruleSet: ruleSet([topicRule]) });
    const second = projectEvidenceToSignals({
      evidence: { ...evidence, validatedAt: '2030-01-01T00:00:00.000Z' },
      ruleSet: ruleSet([topicRule]),
    });

    expect(first).toEqual(second);
  });

  test('does not mutate inputs or add downstream business fields', () => {
    const explicitRuleSet: EvidenceSignalRuleSet = {
      ruleSetVersion: '1.0.0',
      rules: [topicRule],
    };
    const beforeEvidence = structuredClone(evidence);
    const beforeRules = structuredClone(explicitRuleSet);

    const result = projectEvidenceToSignals({ evidence, ruleSet: explicitRuleSet });

    expect(evidence).toEqual(beforeEvidence);
    expect(explicitRuleSet).toEqual(beforeRules);
    expect(JSON.stringify(result)).not.toMatch(
      /customer|lead|profile|persona|ranking|scoring|marketing|confidence|action/iu,
    );
  });
});
