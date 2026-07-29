import type {
  LeadScoreAssessment,
  LeadScoreAssessmentDetail,
  LeadScoreBasisRecord,
  LeadScoreEvidenceLinkRecord,
} from '@re-agent/shared';

type AssessmentRow = Omit<LeadScoreAssessment, 'confidence'> & { confidence: number };
type BasisRow = Omit<LeadScoreBasisRecord, 'confidence'> & { confidence: number };

export const toLeadScoreAssessment = (row: AssessmentRow): LeadScoreAssessment => ({
  ...row,
  confidence: row.confidence / 100,
});

export const toLeadScoreBasis = (row: BasisRow): LeadScoreBasisRecord => ({
  ...row,
  confidence: row.confidence / 100,
});

export const toLeadScoreEvidenceLink = (
  row: LeadScoreEvidenceLinkRecord,
): LeadScoreEvidenceLinkRecord => row;

export const toLeadScoreAssessmentDetail = (
  row: AssessmentRow & {
    bases: BasisRow[];
    evidenceLinks: LeadScoreEvidenceLinkRecord[];
  },
): LeadScoreAssessmentDetail => {
  const { bases, evidenceLinks, ...assessment } = row;
  return {
    assessment: toLeadScoreAssessment(assessment),
    bases: bases.map(toLeadScoreBasis),
    evidenceLinks: evidenceLinks.map(toLeadScoreEvidenceLink),
  };
};
