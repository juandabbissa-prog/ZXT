import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaBuyerPersonaRepository } from '../src/features/buyer-persona/buyer-persona.repository.prisma';
import { clearIntegrationData } from './helpers/clear-integration-data';

const suite = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

suite.sequential('PrismaBuyerPersonaRepository integration', () => {
  const repository = new PrismaBuyerPersonaRepository(prisma);

  beforeAll(clearIntegrationData);
  afterAll(clearIntegrationData);

  it('persists a persona and preserves assessment history', async () => {
    const persona = await repository.createPersona({ subjectReference: 'buyer-001' });
    const first = await repository.saveDimensionAssessment({
      buyerPersonaId: persona.id,
      category: 'BUDGET_RANGE',
      dimensionKey: 'purchase-budget',
      normalizedValue: { minimum: 1000000, maximum: 1500000, currency: 'CNY' },
      cognitiveStatus: 'UNKNOWN',
      confidence: 0,
      rationale: 'No evidence available.',
      validFrom: new Date('2026-07-29T00:00:00.000Z'),
      validUntil: null,
      assessedAt: new Date('2026-07-29T00:00:00.000Z'),
      version: 1,
      changeReason: 'Initial assessment',
    });
    const second = await repository.saveDimensionAssessment({
      buyerPersonaId: first.buyerPersonaId,
      category: first.category,
      dimensionKey: first.dimensionKey,
      normalizedValue: null,
      cognitiveStatus: first.cognitiveStatus,
      confidence: first.confidence,
      rationale: first.rationale,
      validFrom: first.validFrom,
      validUntil: first.validUntil,
      assessedAt: new Date('2026-07-29T01:00:00.000Z'),
      version: 2,
      changeReason: 'Explicitly reconfirmed unknown',
    });

    expect(await repository.findCurrentAssessments(persona.id)).toMatchObject([
      { id: second.id, status: 'CURRENT', version: 2 },
    ]);
    expect(await repository.findAssessmentHistory(persona.id, 'purchase-budget')).toMatchObject([
      { version: 2, status: 'CURRENT' },
      { version: 1, status: 'SUPERSEDED' },
    ]);
  });
});
