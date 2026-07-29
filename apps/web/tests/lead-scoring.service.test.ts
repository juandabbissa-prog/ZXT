import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BuyerPersonaRepository,
  ContentSignalRepository,
  CreateLeadScoreAssessmentInput,
  LeadScoreAssessmentDetail,
  LeadScoringRepository,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import { LeadScoringService } from '../src/features/lead-scoring/lead-scoring.service';

const assessmentRepository = {
  createAssessment: vi.fn<LeadScoringRepository['createAssessment']>(),
  findAssessmentById: vi.fn<LeadScoringRepository['findAssessmentById']>(),
  findLatestByPersonaId: vi.fn<LeadScoringRepository['findLatestByPersonaId']>(),
  listByPersonaId: vi.fn<LeadScoringRepository['listByPersonaId']>(),
  findByInputFingerprint: vi.fn<LeadScoringRepository['findByInputFingerprint']>(),
} satisfies LeadScoringRepository;

const repositories = {
  assessments: assessmentRepository,
  personas: {
    findPersonaById: vi.fn(),
    findLatestValidSnapshot: vi.fn(),
    findCurrentAssessments: vi.fn(),
    findEvidenceLinks: vi.fn(),
  },
  signals: { findById: vi.fn() },
};

describe('LeadScoringService', () => {
  const service = new LeadScoringService(
    repositories.assessments,
    repositories.personas as unknown as BuyerPersonaRepository,
    repositories.signals as unknown as ContentSignalRepository,
    { run: (operation) => operation({} as PersistenceTransactionContext) },
  );

  beforeEach(() => {
    vi.resetAllMocks();
    repositories.personas.findPersonaById.mockResolvedValue({ id: 'persona-1' });
    repositories.personas.findLatestValidSnapshot.mockResolvedValue({
      id: 'snapshot-1',
      generatedAt: new Date('2026-07-29T00:00:00Z'),
      validUntil: null,
    });
    repositories.personas.findCurrentAssessments.mockResolvedValue([
      {
        id: 'dimension-1',
        confidence: 80,
        assessedAt: new Date('2026-07-29T00:00:00Z'),
        validUntil: null,
      },
    ]);
    repositories.signals.findById.mockResolvedValue({
      id: 'signal-1',
      confidence: 75,
      observedAt: new Date('2026-07-29T01:00:00Z'),
      evidence: [],
    });
    repositories.assessments.findByInputFingerprint.mockResolvedValue(null);
    repositories.assessments.createAssessment.mockImplementation(
      (input: CreateLeadScoreAssessmentInput) =>
        Promise.resolve({
          assessment: { ...input.assessment, id: 'assessment-1', createdAt: new Date() },
          bases: [],
          evidenceLinks: [],
        }),
    );
  });

  it('creates an immutable assessment through the repository boundary', async () => {
    const result = await service.assess('persona-1', {
      personaSnapshotId: 'snapshot-1',
      sources: [
        { basisType: 'PERSONA_DIMENSION', sourceId: 'dimension-1' },
        { basisType: 'CONTENT_SIGNAL', sourceId: 'signal-1' },
      ],
    });

    expect(result.assessment.policyVersion).toBe('lead-scoring-v1');
    expect(repositories.assessments.createAssessment).toHaveBeenCalledOnce();
    const [created] = repositories.assessments.createAssessment.mock.calls[0] ?? [];
    expect(created?.assessment.personaId).toBe('persona-1');
  });

  it('reuses the same policy and input fingerprint instead of duplicating a snapshot', async () => {
    const existing: LeadScoreAssessmentDetail = {
      assessment: {
        id: 'existing',
        personaId: 'persona-1',
        personaSnapshotId: 'snapshot-1',
        purchaseStage: 'AWARENESS',
        leadGrade: 'LOW',
        score: 25,
        confidence: 0.75,
        explanation: 'Existing assessment',
        policyVersion: 'lead-scoring-v1',
        inputFingerprint: 'existing-fingerprint',
        assessedAt: new Date('2026-07-29T01:00:00Z'),
        expiresAt: null,
        createdAt: new Date('2026-07-29T01:00:00Z'),
      },
      bases: [],
      evidenceLinks: [],
    };
    repositories.assessments.findByInputFingerprint.mockResolvedValue(existing);

    await expect(
      service.assess('persona-1', {
        personaSnapshotId: 'snapshot-1',
        sources: [{ basisType: 'CONTENT_SIGNAL', sourceId: 'signal-1' }],
      }),
    ).resolves.toBe(existing);
    expect(repositories.assessments.createAssessment).not.toHaveBeenCalled();
  });

  it('rejects a stale Persona Snapshot', async () => {
    await expect(
      service.assess('persona-1', {
        personaSnapshotId: 'stale-snapshot',
        sources: [],
      }),
    ).rejects.toMatchObject({ code: 'PERSONA_SNAPSHOT_NOT_FOUND' });
  });

  it('rejects an unknown Buyer Persona before scoring', async () => {
    repositories.personas.findPersonaById.mockResolvedValue(null);

    await expect(
      service.assess('missing-persona', {
        personaSnapshotId: 'snapshot-1',
        sources: [],
      }),
    ).rejects.toMatchObject({ code: 'BUYER_PERSONA_NOT_FOUND' });
    expect(repositories.assessments.createAssessment).not.toHaveBeenCalled();
  });

  it('rejects an untraceable Content Signal', async () => {
    repositories.signals.findById.mockResolvedValue(null);

    await expect(
      service.assess('persona-1', {
        personaSnapshotId: 'snapshot-1',
        sources: [{ basisType: 'CONTENT_SIGNAL', sourceId: 'missing-signal' }],
      }),
    ).rejects.toMatchObject({ code: 'CONTENT_SIGNAL_NOT_FOUND' });
  });

  it('validates history pagination before accessing the repository', async () => {
    await expect(service.list('persona-1', { page: 0, pageSize: 20 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(repositories.assessments.listByPersonaId).not.toHaveBeenCalled();
  });
});
