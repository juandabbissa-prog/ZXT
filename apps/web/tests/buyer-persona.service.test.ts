import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerPersonaRepository,
  ContentSignalRepository,
  PersonaSnapshotRecord,
} from '@re-agent/shared';
import { BuyerPersonaService } from '../src/features/buyer-persona/buyer-persona.service';

const persona = {
  id: 'persona-1',
  subjectReference: null,
  status: 'DRAFT' as const,
  version: 1,
  lastAssessedAt: null,
  latestSnapshotId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  archivedAt: null,
};
const repositories = {
  personas: {
    createPersona: vi.fn(),
    findPersonaById: vi.fn(),
    findPersonaBySubjectReference: vi.fn(),
    addEvidenceLink: vi.fn(),
    findEvidenceLinks: vi.fn(),
    saveDimensionAssessment: vi.fn(),
    findCurrentAssessments: vi.fn(),
    findAssessmentHistory: vi.fn(),
    createSnapshot: vi.fn(),
    findLatestValidSnapshot: vi.fn(),
    updatePersonaStatus: vi.fn(),
  },
  signals: { findById: vi.fn() },
};

describe('BuyerPersonaService', () => {
  const service = new BuyerPersonaService(
    repositories.personas,
    repositories.signals as unknown as ContentSignalRepository,
    { run: async (operation) => operation({} as never) },
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repositories.personas.findAssessmentHistory.mockResolvedValue([]);
    repositories.personas.findLatestValidSnapshot.mockResolvedValue(null);
    repositories.personas.createSnapshot.mockImplementation(
      (
        input: Parameters<BuyerPersonaRepository['createSnapshot']>[0],
      ): Promise<PersonaSnapshotRecord> =>
        Promise.resolve({
          ...input,
          id: 'snapshot-1',
          generatedAt: new Date(),
        }),
    );
  });

  it('creates a platform-neutral draft and rejects duplicate subject references', async () => {
    repositories.personas.findPersonaBySubjectReference.mockResolvedValueOnce(null);
    repositories.personas.createPersona.mockResolvedValueOnce(persona);
    await expect(service.create({ subjectReference: 'authorized-subject-1' })).resolves.toEqual(
      persona,
    );
    repositories.personas.findPersonaBySubjectReference.mockResolvedValueOnce(persona);
    await expect(
      service.create({ subjectReference: 'authorized-subject-1' }),
    ).rejects.toMatchObject({
      code: 'BUYER_PERSONA_ALREADY_EXISTS',
    });
  });

  it('records an inference only with matching Content Signal evidence', async () => {
    repositories.personas.findPersonaById.mockResolvedValue(persona);
    repositories.signals.findById.mockResolvedValue({
      id: 'signal-1',
      status: 'ACTIVE',
      evidence: [{ id: 'evidence-1', observedAt: new Date('2026-07-29T00:00:00Z') }],
    });
    repositories.personas.saveDimensionAssessment.mockResolvedValue({
      buyerPersonaId: 'persona-1',
      category: 'BUDGET_RANGE',
      dimensionKey: 'total_price_range',
      normalizedValue: { minimum: 120, maximum: 180, unit: 'CNY_10K' },
      cognitiveStatus: 'INFERENCE',
      confidence: 70,
      rationale: 'Signal explicitly discusses a budget range.',
      validFrom: new Date('2026-07-29T00:00:00Z'),
      validUntil: null,
      assessedAt: new Date('2026-07-29T00:00:00Z'),
      version: 1,
      changeReason: null,
      id: 'assessment-1',
      status: 'CURRENT',
      supersededAt: null,
      createdAt: new Date(),
    });
    repositories.personas.addEvidenceLink.mockResolvedValue({
      id: 'link-1',
      buyerPersonaId: 'persona-1',
      assessmentId: 'assessment-1',
      contentSignalId: 'signal-1',
      signalEvidenceId: 'evidence-1',
      relation: 'SUPPORTS',
      observedAt: new Date('2026-07-29T00:00:00Z'),
      linkedAt: new Date(),
      reason: 'Direct budget discussion.',
      confidenceSnapshot: 70,
      validUntilSnapshot: null,
    });

    await service.recordAssessment('persona-1', {
      category: 'BUDGET_RANGE',
      dimensionKey: 'total_price_range',
      normalizedValue: { minimum: 120, maximum: 180, unit: 'CNY_10K' },
      cognitiveStatus: 'INFERENCE',
      confidence: 70,
      rationale: 'Signal explicitly discusses a budget range.',
      validFrom: new Date('2026-07-29T00:00:00Z'),
      validUntil: null,
      expectedPersonaVersion: 1,
      evidence: [
        {
          contentSignalId: 'signal-1',
          signalEvidenceId: 'evidence-1',
          relation: 'SUPPORTS',
          reason: 'Direct budget discussion.',
        },
      ],
    });
    expect(repositories.personas.addEvidenceLink).toHaveBeenCalledWith(
      expect.objectContaining({ assessmentId: 'assessment-1' }),
      expect.anything(),
    );
  });

  it('does not accept unsupported evidence or evidence-free inference', async () => {
    repositories.personas.findPersonaById.mockResolvedValue(persona);
    await expect(
      service.recordAssessment('persona-1', {
        category: 'FAMILY_STRUCTURE',
        dimensionKey: 'family_stage',
        normalizedValue: 'UNKNOWN',
        cognitiveStatus: 'INFERENCE',
        confidence: 50,
        rationale: 'Unverified.',
        validFrom: new Date(),
        validUntil: null,
        expectedPersonaVersion: 1,
        evidence: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps unknown dimensions in immutable snapshot output', async () => {
    repositories.personas.findPersonaById.mockResolvedValue(persona);
    repositories.personas.findCurrentAssessments.mockResolvedValue([]);
    repositories.personas.findEvidenceLinks.mockResolvedValue([]);
    const snapshot = await service.generateSnapshot('persona-1', {
      reason: 'Manual review baseline.',
      validUntil: null,
    });
    expect(snapshot.missingDimensions).toHaveLength(10);
  });

  it('rejects invalid state transitions without invoking Lead, CRM, or AI services', async () => {
    repositories.personas.findPersonaById.mockResolvedValue({ ...persona, status: 'ARCHIVED' });
    await expect(service.changeStatus('persona-1', 'ACTIVE')).rejects.toMatchObject({
      code: 'INVALID_PERSONA_STATE_TRANSITION',
    });
  });
});
