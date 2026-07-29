import { ValidationError } from '../errors/app-error';

export const PURCHASE_STAGES = [
  'UNKNOWN',
  'AWARENESS',
  'EXPLORATION',
  'COMPARISON',
  'DECISION_PREPARATION',
] as const;
export type PurchaseStage = (typeof PURCHASE_STAGES)[number];

export const LEAD_GRADES = ['UNASSESSED', 'LOW', 'MEDIUM', 'HIGH'] as const;
export type LeadGrade = (typeof LEAD_GRADES)[number];

export const SCORE_BASIS_TYPES = [
  'PERSONA_DIMENSION',
  'CONTENT_SIGNAL',
  'EVIDENCE',
  'PERSONA_SNAPSHOT',
] as const;
export type ScoreBasisType = (typeof SCORE_BASIS_TYPES)[number];
export type ScoreBasisDirection = 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT_ONLY';

export type ScoreBasis = Readonly<{
  basisType: ScoreBasisType;
  sourceId: string;
  direction: ScoreBasisDirection;
  contribution: number;
  confidence: number;
  reasonCode: string;
  explanation: string;
  observedAt: Date | null;
  expiresAt: Date | null;
}>;

export type LeadScoreAssessment = Readonly<{
  id: string;
  personaId: string;
  personaSnapshotId: string;
  purchaseStage: PurchaseStage;
  leadGrade: LeadGrade;
  score: number;
  confidence: number;
  explanation: string;
  policyVersion: string;
  inputFingerprint: string;
  assessedAt: Date;
  expiresAt: Date | null;
  createdAt: Date;
}>;

export function assertLeadScore(score: number): void {
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new ValidationError('Lead score must be between 0 and 100');
  }
}

export function assertConfidenceRatio(confidence: number): void {
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new ValidationError('Confidence must be between 0 and 1');
  }
}

export function assertScoreBasis(basis: ScoreBasis): void {
  if (!basis.sourceId.trim()) {
    throw new ValidationError('Score basis sourceId is required');
  }
  if (!basis.reasonCode.trim() || !basis.explanation.trim()) {
    throw new ValidationError('Score basis reason and explanation are required');
  }
  if (
    !Number.isInteger(basis.contribution) ||
    basis.contribution < -100 ||
    basis.contribution > 100
  ) {
    throw new ValidationError('Score basis contribution must be between -100 and 100');
  }
  assertConfidenceRatio(basis.confidence);
}

export function assertAssessmentWindow(assessedAt: Date, expiresAt?: Date | null): void {
  if (expiresAt && expiresAt.getTime() < assessedAt.getTime()) {
    throw new ValidationError('expiresAt cannot be before assessedAt');
  }
}
