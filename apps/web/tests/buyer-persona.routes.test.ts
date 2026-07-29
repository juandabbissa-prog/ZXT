import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuyerPersonaServiceError } from '../src/features/buyer-persona/buyer-persona.service';

const service = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  changeStatus: vi.fn(),
  recordAssessment: vi.fn(),
  history: vi.fn(),
  generateSnapshot: vi.fn(),
  latestSnapshot: vi.fn(),
}));
vi.mock('../src/features/buyer-persona/buyer-persona.runtime', () => ({
  buyerPersonaService: service,
}));

import { POST as create } from '../src/app/api/buyer-personas/route';
import { GET as get, PATCH } from '../src/app/api/buyer-personas/[id]/route';
import {
  GET as history,
  POST as assess,
} from '../src/app/api/buyer-personas/[id]/assessments/route';
import {
  GET as latestSnapshot,
  POST as snapshot,
} from '../src/app/api/buyer-personas/[id]/snapshots/route';

const context = { params: Promise.resolve({ id: 'persona-1' }) };

describe('Buyer Persona routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and retrieves a Persona through the Service boundary', async () => {
    service.create.mockResolvedValue({ id: 'persona-1' });
    expect(
      (
        await create(
          new Request('http://localhost/api/buyer-personas', {
            method: 'POST',
            body: JSON.stringify({ subjectReference: 'authorized-subject-1' }),
          }),
        )
      ).status,
    ).toBe(201);
    service.get.mockResolvedValue({ persona: { id: 'persona-1' } });
    expect((await get(new Request('http://localhost'), context)).status).toBe(200);
  });

  it('records and reads assessment history', async () => {
    service.recordAssessment.mockResolvedValue({ id: 'assessment-1' });
    const response = await assess(
      new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({
          category: 'COMMUTE_RELATIONSHIP',
          dimensionKey: 'acceptable_commute_minutes',
          normalizedValue: { minimum: 20, maximum: 45 },
          cognitiveStatus: 'INFERENCE',
          confidence: 75,
          rationale: 'Supported by an explicit commute question.',
          validFrom: '2026-07-29T00:00:00.000Z',
          validUntil: null,
          expectedPersonaVersion: 1,
          evidence: [{ contentSignalId: 'signal-1', relation: 'SUPPORTS' }],
        }),
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(service.recordAssessment).toHaveBeenCalledWith(
      'persona-1',
      expect.objectContaining({ validFrom: expect.any(Date) }),
    );
    service.history.mockResolvedValue([]);
    await history(new Request('http://localhost?dimensionKey=acceptable_commute_minutes'), context);
    expect(service.history).toHaveBeenCalledWith('persona-1', 'acceptable_commute_minutes');
  });

  it('creates and retrieves an immutable Snapshot and changes status', async () => {
    service.generateSnapshot.mockResolvedValue({ id: 'snapshot-1' });
    expect(
      (
        await snapshot(
          new Request('http://localhost', {
            method: 'POST',
            body: JSON.stringify({ reason: 'Manual review complete.' }),
          }),
          context,
        )
      ).status,
    ).toBe(201);
    service.latestSnapshot.mockResolvedValue({ id: 'snapshot-1' });
    expect((await latestSnapshot(new Request('http://localhost'), context)).status).toBe(200);
    service.changeStatus.mockResolvedValue({ id: 'persona-1', status: 'ACTIVE' });
    await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      }),
      context,
    );
    expect(service.changeStatus).toHaveBeenCalledWith('persona-1', 'ACTIVE');
  });

  it('maps stable Service errors to HTTP responses', async () => {
    service.get.mockRejectedValue(
      new BuyerPersonaServiceError('Buyer Persona was not found.', 404, 'BUYER_PERSONA_NOT_FOUND'),
    );
    expect((await get(new Request('http://localhost'), context)).status).toBe(404);
  });
});
