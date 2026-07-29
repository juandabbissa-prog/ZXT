import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@re-agent/shared';

const service = vi.hoisted(() => ({
  assess: vi.fn(),
  get: vi.fn(),
  latest: vi.fn(),
  list: vi.fn(),
}));

vi.mock('../src/features/lead-scoring/lead-scoring.runtime', () => ({
  leadScoringService: service,
}));

import { POST as create } from '../src/app/api/lead-scoring/assessments/route';
import { GET as get } from '../src/app/api/lead-scoring/assessments/[assessmentId]/route';
import { GET as latest } from '../src/app/api/lead-scoring/personas/[personaId]/latest/route';
import { GET as list } from '../src/app/api/lead-scoring/personas/[personaId]/assessments/route';

describe('Lead Scoring routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an assessment through the Service boundary', async () => {
    service.assess.mockResolvedValue({ assessment: { id: 'assessment-1' } });
    const response = await create(
      new Request('http://localhost/api/lead-scoring/assessments', {
        method: 'POST',
        body: JSON.stringify({
          personaId: 'persona-1',
          personaSnapshotId: 'snapshot-1',
          sources: [{ basisType: 'PERSONA_SNAPSHOT', sourceId: 'snapshot-1' }],
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.assess).toHaveBeenCalledWith(
      'persona-1',
      expect.objectContaining({ personaSnapshotId: 'snapshot-1' }),
    );
  });

  it('retrieves an assessment, latest assessment, and history', async () => {
    service.get.mockResolvedValue({ assessment: { id: 'assessment-1' } });
    service.latest.mockResolvedValue({ assessment: { id: 'assessment-1' } });
    service.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

    expect(
      (
        await get(new Request('http://localhost'), {
          params: Promise.resolve({ assessmentId: 'assessment-1' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await latest(new Request('http://localhost'), {
          params: Promise.resolve({ personaId: 'persona-1' }),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await list(new Request('http://localhost?page=1&pageSize=20'), {
          params: Promise.resolve({ personaId: 'persona-1' }),
        })
      ).status,
    ).toBe(200);
  });

  it('maps Service validation failures without bypassing the Service boundary', async () => {
    service.assess.mockRejectedValue(new ValidationError('personaId is required.'));
    const response = await create(
      new Request('http://localhost/api/lead-scoring/assessments', {
        method: 'POST',
        body: JSON.stringify({
          personaId: '',
          personaSnapshotId: 'snapshot-1',
          score: 100,
          leadGrade: 'HIGH',
          sources: [],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: 'personaId is required.',
    });
    expect(service.assess).toHaveBeenCalledOnce();
  });
});
