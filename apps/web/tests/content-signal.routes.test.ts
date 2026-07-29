import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentSignalServiceError } from '../src/features/content-signal/content-signal.service';

const service = vi.hoisted(() => ({
  create: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  archive: vi.fn(),
}));

vi.mock('../src/features/content-signal/content-signal.runtime', () => ({
  contentSignalService: service,
}));

import { GET as list, POST } from '../src/app/api/content-signals/route';
import { GET as get, PATCH } from '../src/app/api/content-signals/[id]/route';

describe('Content Signal routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates and lists Content Signals through the Service boundary', async () => {
    service.create.mockResolvedValue({ id: 'signal-1' });
    const response = await POST(
      new Request('http://localhost/api/content-signals', {
        method: 'POST',
        body: JSON.stringify({
          anchorId: 'anchor-1',
          type: 'INTENT',
          summary: 'Buyer asks about commute time.',
          source: { type: 'MANUAL', description: 'Staff-entered observation.' },
          evidence: [
            {
              type: 'TEXT',
              content: 'Question about metro commute.',
              observedAt: '2026-07-29T06:00:00.000Z',
            },
          ],
          confidence: 80,
          confidenceRationale: 'The question is explicitly present in the evidence.',
          occurredAt: '2026-07-29T05:00:00.000Z',
          observedAt: '2026-07-29T06:00:00.000Z',
        }),
      }),
    );
    expect(response.status).toBe(201);
    expect(service.create).toHaveBeenCalledOnce();

    service.list.mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0 });
    await list(new Request('http://localhost/api/content-signals?anchorId=anchor-1&type=INTENT'));
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ anchorId: 'anchor-1', type: 'INTENT' }),
    );
  });

  it('gets and archives one Content Signal', async () => {
    service.get.mockResolvedValue({ id: 'signal-1' });
    expect(
      (await get(new Request('http://localhost'), { params: Promise.resolve({ id: 'signal-1' }) }))
        .status,
    ).toBe(200);
    service.archive.mockResolvedValue({ id: 'signal-1', status: 'ARCHIVED' });
    expect(
      (
        await PATCH(
          new Request('http://localhost', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'archive' }),
          }),
          { params: Promise.resolve({ id: 'signal-1' }) },
        )
      ).status,
    ).toBe(200);
  });

  it('maps Service errors and rejects unsupported mutation actions', async () => {
    service.get.mockRejectedValue(new ContentSignalServiceError('Not found.', 404, 'NOT_FOUND'));
    expect(
      (await get(new Request('http://localhost'), { params: Promise.resolve({ id: 'missing' }) }))
        .status,
    ).toBe(404);
    expect(
      (
        await PATCH(
          new Request('http://localhost', {
            method: 'PATCH',
            body: JSON.stringify({ action: 'update' }),
          }),
          { params: Promise.resolve({ id: 'signal-1' }) },
        )
      ).status,
    ).toBe(400);
  });

  it('rejects a structurally invalid create DTO before calling the Service', async () => {
    const response = await POST(
      new Request('http://localhost/api/content-signals', {
        method: 'POST',
        body: JSON.stringify({ source: {}, evidence: [null] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
});
