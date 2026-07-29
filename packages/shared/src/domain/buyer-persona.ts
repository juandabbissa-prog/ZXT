import { ValidationError } from '../errors/app-error';

export const BUYER_PERSONA_DIMENSIONS = [
  'BASIC_DEMOGRAPHICS',
  'FAMILY_STRUCTURE',
  'WORK_AREA',
  'COMMUTE_RELATIONSHIP',
  'CURRENT_RESIDENTIAL_AREA',
  'INTEREST_PREFERENCE',
  'PROPERTY_PURCHASE_NEED',
  'BUDGET_RANGE',
  'PURCHASE_STAGE',
  'INTENT_INDICATOR',
] as const;

export type BuyerPersonaDimension = (typeof BUYER_PERSONA_DIMENSIONS)[number];
export type PersonaCognitiveStatus = 'FACT' | 'INFERENCE' | 'UNKNOWN';
export type BuyerPersonaStatus = 'DRAFT' | 'ACTIVE' | 'STALE' | 'ARCHIVED';
export type PersonaAssessmentStatus = 'CURRENT' | 'SUPERSEDED' | 'EXPIRED';
export type PersonaEvidenceRelation = 'SUPPORTS' | 'CONTRADICTS' | 'CONTEXT_ONLY';

export function assertAssessmentEvidence(
  cognitiveStatus: PersonaCognitiveStatus,
  evidenceLinkIds: readonly string[],
): void {
  if (cognitiveStatus === 'UNKNOWN' && evidenceLinkIds.length > 0) {
    throw new ValidationError('UNKNOWN assessments cannot claim evidence');
  }
  if (cognitiveStatus !== 'UNKNOWN' && evidenceLinkIds.length === 0) {
    throw new ValidationError(`${cognitiveStatus} assessments require evidence`);
  }
}

export function assertConfidence(confidence: number): void {
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    throw new ValidationError('Confidence must be between 0 and 100');
  }
}

export function assertValidityRange(validFrom: Date, validUntil?: Date | null): void {
  if (validUntil && validUntil.getTime() < validFrom.getTime()) {
    throw new ValidationError('validUntil cannot be before validFrom');
  }
}
