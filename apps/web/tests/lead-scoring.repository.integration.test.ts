import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaLeadScoringRepository } from '../src/features/lead-scoring/lead-scoring.repository.prisma';
import { clearIntegrationData } from './helpers/clear-integration-data';

const suite = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

suite.sequential('PrismaLeadScoringRepository integration', () => {
  const repository = new PrismaLeadScoringRepository(prisma);
  let personaId: string;
  let snapshotId: string;

  beforeAll(async () => {
    await clearIntegrationData();
    const persona = await prisma.buyerPersona.create({
      data: { subjectReference: 'lead-score-001' },
    });
    personaId = persona.id;
    const snapshot = await prisma.personaSnapshot.create({
      data: {
        buyerPersonaId: persona.id,
        snapshotVersion: 1,
        personaVersion: 1,
        dimensions: {},
        evidenceSummary: {},
        missingDimensions: [],
        reason: 'Lead Scoring integration fixture',
      },
    });
    snapshotId = snapshot.id;
  });
  afterAll(clearIntegrationData);

  it('persists an immutable assessment with basis and evidence links', async () => {
    const detail = await repository.createAssessment({
      assessment: {
        personaId,
        personaSnapshotId: snapshotId,
        purchaseStage: 'EXPLORATION',
        leadGrade: 'MEDIUM',
        score: 55,
        confidence: 0.8,
        explanation: 'Evidence-based assessment; not a confirmed purchase fact.',
        policyVersion: 'lead-scoring-v1',
        inputFingerprint: 'integration-fingerprint-1',
        assessedAt: new Date('2026-07-29T00:00:00.000Z'),
        expiresAt: null,
      },
      bases: [
        {
          basisType: 'PERSONA_SNAPSHOT',
          sourceId: snapshotId,
          direction: 'CONTEXT_ONLY',
          contribution: 0,
          confidence: 1,
          reasonCode: 'PERSONA_SNAPSHOT_CONTEXT',
          explanation: 'Snapshot anchors the assessment inputs.',
          observedAt: new Date('2026-07-29T00:00:00.000Z'),
          expiresAt: null,
        },
      ],
      evidenceLinks: [{ sourceType: 'PERSONA_SNAPSHOT', sourceId: snapshotId }],
    });

    expect(detail).toMatchObject({
      assessment: { personaId, score: 55, confidence: 0.8 },
      bases: [{ sourceId: snapshotId, confidence: 1 }],
      evidenceLinks: [{ sourceId: snapshotId }],
    });
    expect(await repository.findLatestByPersonaId(personaId)).toMatchObject({
      assessment: { id: detail.assessment.id },
    });
    expect(await repository.findAssessmentById(detail.assessment.id)).toEqual(detail);
    expect(
      await repository.findByInputFingerprint('integration-fingerprint-1', 'lead-scoring-v1'),
    ).toEqual(detail);
    expect(await repository.listByPersonaId(personaId, { page: 1, pageSize: 20 })).toMatchObject({
      total: 1,
      items: [{ assessment: { id: detail.assessment.id } }],
    });
  });
});
