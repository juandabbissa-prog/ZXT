import { describe, expect, it } from 'vitest';
import {
  BUYER_PERSONA_DIMENSIONS,
  assertAssessmentEvidence,
  assertConfidence,
  assertValidityRange,
} from '../src/domain/buyer-persona';

describe('Buyer Persona domain', () => {
  it('freezes the ten property-industry dimensions', () => {
    expect(BUYER_PERSONA_DIMENSIONS).toHaveLength(10);
    expect(BUYER_PERSONA_DIMENSIONS).toContain('FAMILY_STRUCTURE');
    expect(BUYER_PERSONA_DIMENSIONS).toContain('COMMUTE_RELATIONSHIP');
    expect(BUYER_PERSONA_DIMENSIONS).toContain('PURCHASE_STAGE');
  });

  it('requires evidence for FACT and INFERENCE assessments', () => {
    expect(() => assertAssessmentEvidence('FACT', [])).toThrow('FACT assessments require evidence');
    expect(() => assertAssessmentEvidence('INFERENCE', [])).toThrow(
      'INFERENCE assessments require evidence',
    );
    expect(() => assertAssessmentEvidence('FACT', ['evidence-1'])).not.toThrow();
  });

  it('prevents UNKNOWN assessments from claiming evidence', () => {
    expect(() => assertAssessmentEvidence('UNKNOWN', ['evidence-1'])).toThrow(
      'UNKNOWN assessments cannot claim evidence',
    );
    expect(() => assertAssessmentEvidence('UNKNOWN', [])).not.toThrow();
  });

  it('accepts confidence only from zero through one hundred', () => {
    expect(() => assertConfidence(-1)).toThrow('Confidence must be between 0 and 100');
    expect(() => assertConfidence(101)).toThrow('Confidence must be between 0 and 100');
    expect(() => assertConfidence(0)).not.toThrow();
    expect(() => assertConfidence(100)).not.toThrow();
  });

  it('rejects an expiry before the validity start', () => {
    expect(() =>
      assertValidityRange(
        new Date('2026-07-29T12:00:00.000Z'),
        new Date('2026-07-29T11:59:59.000Z'),
      ),
    ).toThrow('validUntil cannot be before validFrom');
  });
});
