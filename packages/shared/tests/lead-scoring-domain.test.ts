import { describe, expect, it } from 'vitest';
import {
  LEAD_GRADES,
  PURCHASE_STAGES,
  SCORE_BASIS_TYPES,
  assertAssessmentWindow,
  assertConfidenceRatio,
  assertLeadScore,
  assertScoreBasis,
} from '../src/domain/lead-scoring';

describe('Lead Scoring domain', () => {
  it('freezes the platform-neutral vocabulary', () => {
    expect(PURCHASE_STAGES).toEqual([
      'UNKNOWN',
      'AWARENESS',
      'EXPLORATION',
      'COMPARISON',
      'DECISION_PREPARATION',
    ]);
    expect(LEAD_GRADES).toEqual(['UNASSESSED', 'LOW', 'MEDIUM', 'HIGH']);
    expect(SCORE_BASIS_TYPES).toEqual([
      'PERSONA_DIMENSION',
      'CONTENT_SIGNAL',
      'EVIDENCE',
      'PERSONA_SNAPSHOT',
    ]);
  });

  it('accepts only an integer score from zero through one hundred', () => {
    expect(() => assertLeadScore(-1)).toThrow('Lead score must be between 0 and 100');
    expect(() => assertLeadScore(10.5)).toThrow('Lead score must be between 0 and 100');
    expect(() => assertLeadScore(101)).toThrow('Lead score must be between 0 and 100');
    expect(() => assertLeadScore(0)).not.toThrow();
    expect(() => assertLeadScore(100)).not.toThrow();
  });

  it('accepts confidence only as a ratio from zero through one', () => {
    expect(() => assertConfidenceRatio(-0.01)).toThrow('Confidence must be between 0 and 1');
    expect(() => assertConfidenceRatio(1.01)).toThrow('Confidence must be between 0 and 1');
    expect(() => assertConfidenceRatio(0)).not.toThrow();
    expect(() => assertConfidenceRatio(1)).not.toThrow();
  });

  it('requires every score basis to be traceable and explained', () => {
    expect(() =>
      assertScoreBasis({
        basisType: 'CONTENT_SIGNAL',
        sourceId: '',
        direction: 'SUPPORTS',
        contribution: 10,
        confidence: 0.8,
        reasonCode: 'PURCHASE_COMPARISON',
        explanation: 'Compared two residential areas.',
        observedAt: null,
        expiresAt: null,
      }),
    ).toThrow('Score basis sourceId is required');
    expect(() =>
      assertScoreBasis({
        basisType: 'CONTENT_SIGNAL',
        sourceId: 'signal-1',
        direction: 'SUPPORTS',
        contribution: 10,
        confidence: 0.8,
        reasonCode: '',
        explanation: '',
        observedAt: null,
        expiresAt: null,
      }),
    ).toThrow('Score basis reason and explanation are required');
  });

  it('rejects an assessment expiry before its assessment time', () => {
    expect(() =>
      assertAssessmentWindow(
        new Date('2026-07-29T12:00:00.000Z'),
        new Date('2026-07-29T11:59:59.000Z'),
      ),
    ).toThrow('expiresAt cannot be before assessedAt');
  });
});
