import { describe, expect, it } from 'vitest';
import {
  evaluateLeadScore,
  LEAD_SCORING_POLICY_VERSION,
} from '../src/features/lead-scoring/lead-scoring.policy';

describe('Lead Scoring policy', () => {
  it('keeps an assessment unassessed when no evidence-backed source exists', () => {
    expect(evaluateLeadScore([])).toMatchObject({
      score: 0,
      confidence: 0,
      purchaseStage: 'UNKNOWN',
      leadGrade: 'UNASSESSED',
      bases: [],
    });
  });

  it('produces an explainable, versioned assessment from evidence-backed sources', () => {
    const sources = [
      {
        basisType: 'PERSONA_SNAPSHOT',
        sourceId: 'snapshot-1',
        confidence: 1,
        observedAt: new Date('2026-07-29T00:00:00Z'),
        expiresAt: null,
      },
      {
        basisType: 'CONTENT_SIGNAL',
        sourceId: 'signal-1',
        confidence: 0.8,
        observedAt: new Date('2026-07-29T01:00:00Z'),
        expiresAt: null,
      },
    ] as const;
    const result = evaluateLeadScore(sources);

    expect(LEAD_SCORING_POLICY_VERSION).toBe('lead-scoring-v1');
    expect(result).toMatchObject({
      score: 26,
      purchaseStage: 'EXPLORATION',
      leadGrade: 'LOW',
    });
    expect(result.explanation).toContain(LEAD_SCORING_POLICY_VERSION);
    expect(result.bases).toHaveLength(2);
    expect(evaluateLeadScore(sources)).toEqual(result);
  });
});
