import {
  assertConfidenceRatio,
  assertLeadScore,
  assertScoreBasis,
  type LeadGrade,
  type PurchaseStage,
  type ScoreBasis,
  type ScoreBasisType,
} from '@re-agent/shared';

export const LEAD_SCORING_POLICY_VERSION = 'lead-scoring-v1';

export type ScoringSource = Readonly<{
  basisType: ScoreBasisType;
  sourceId: string;
  confidence: number;
  observedAt: Date | null;
  expiresAt: Date | null;
}>;

export type ScoringResult = Readonly<{
  score: number;
  purchaseStage: PurchaseStage;
  leadGrade: LeadGrade;
  confidence: number;
  explanation: string;
  bases: readonly ScoreBasis[];
}>;

const contribution: Readonly<Record<ScoreBasisType, number>> = {
  PERSONA_SNAPSHOT: 10,
  PERSONA_DIMENSION: 15,
  CONTENT_SIGNAL: 20,
  EVIDENCE: 10,
};

export function evaluateLeadScore(sources: readonly ScoringSource[]): ScoringResult {
  const bases = sources.map((source): ScoreBasis => {
    assertConfidenceRatio(source.confidence);
    const value = Math.round(contribution[source.basisType] * source.confidence);
    const basis = {
      ...source,
      direction: 'SUPPORTS' as const,
      contribution: value,
      reasonCode: `${source.basisType}_PRESENT`,
      explanation: `${source.basisType} contributes to this evidence-based assessment.`,
    };
    assertScoreBasis(basis);
    return basis;
  });
  const score = Math.min(
    100,
    bases.reduce((total, basis) => total + basis.contribution, 0),
  );
  assertLeadScore(score);
  const confidence =
    bases.length === 0
      ? 0
      : bases.reduce((total, basis) => total + basis.confidence, 0) / bases.length;
  const leadGrade: LeadGrade =
    score >= 65 ? 'HIGH' : score >= 35 ? 'MEDIUM' : score > 0 ? 'LOW' : 'UNASSESSED';
  const purchaseStage: PurchaseStage =
    score >= 65
      ? 'DECISION_PREPARATION'
      : score >= 50
        ? 'COMPARISON'
        : score >= 25
          ? 'EXPLORATION'
          : score > 0
            ? 'AWARENESS'
            : 'UNKNOWN';
  return {
    score,
    confidence,
    leadGrade,
    purchaseStage,
    explanation: `Assessment produced by ${LEAD_SCORING_POLICY_VERSION} from ${bases.length} evidence-backed basis item(s).`,
    bases,
  };
}
