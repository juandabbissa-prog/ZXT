import type { LeadScoreAssessment, ScoreBasis, ScoreBasisType } from '../domain/lead-scoring';
import type { Page, PageRequest, PersistenceTransactionContext } from './persistence';

export type LeadScoreBasisRecord = ScoreBasis &
  Readonly<{
    id: string;
    assessmentId: string;
    createdAt: Date;
  }>;

export type LeadScoreEvidenceLinkRecord = Readonly<{
  id: string;
  assessmentId: string;
  sourceType: ScoreBasisType;
  sourceId: string;
  linkedAt: Date;
}>;

export type LeadScoreAssessmentDetail = Readonly<{
  assessment: LeadScoreAssessment;
  bases: readonly LeadScoreBasisRecord[];
  evidenceLinks: readonly LeadScoreEvidenceLinkRecord[];
}>;

export type CreateLeadScoreAssessmentInput = Readonly<{
  assessment: Omit<LeadScoreAssessment, 'id' | 'createdAt'>;
  bases: readonly ScoreBasis[];
  evidenceLinks: readonly Pick<LeadScoreEvidenceLinkRecord, 'sourceType' | 'sourceId'>[];
}>;

export interface LeadScoringRepository {
  createAssessment(
    input: CreateLeadScoreAssessmentInput,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail>;
  findAssessmentById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null>;
  findLatestByPersonaId(
    personaId: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null>;
  listByPersonaId(
    personaId: string,
    request: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<LeadScoreAssessmentDetail>>;
  findByInputFingerprint(
    inputFingerprint: string,
    policyVersion: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null>;
}
