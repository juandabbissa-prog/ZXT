import { describe, expect, it } from 'vitest';
import type {
  AnchorRecord,
  AnchorRepository,
  ContentSignalRecord,
  ContentSignalRepository,
  KeywordRecord,
  KeywordRepository,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import {
  ContentSignalService,
  type ContentSignalTransactionRunner,
} from '../src/features/content-signal/content-signal.service';

const now = new Date('2026-07-29T06:00:00.000Z');
const earlier = new Date('2026-07-29T05:00:00.000Z');
const context = {} as PersistenceTransactionContext;

function setup(options: { anchorStatus?: AnchorRecord['status']; keywordExists?: boolean } = {}) {
  let signal: ContentSignalRecord | null = null;
  const anchor = {
    id: 'anchor-1',
    status: options.anchorStatus ?? 'ACTIVE',
  } as AnchorRecord;
  const keyword = { id: 'keyword-1' } as KeywordRecord;

  const anchors = {
    findById: (id: string) => Promise.resolve(id === anchor.id ? anchor : null),
  } as AnchorRepository;
  const keywords = {
    findById: (id: string) =>
      Promise.resolve(options.keywordExists === false || id !== keyword.id ? null : keyword),
  } as KeywordRepository;
  const signals: ContentSignalRepository = {
    create: (input) => {
      signal = {
        id: 'signal-1',
        ...input,
        evidence: input.evidence.map((item, index) => ({
          ...item,
          id: `evidence-${index + 1}`,
          contentSignalId: 'signal-1',
          createdAt: now,
        })),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      };
      return Promise.resolve(signal);
    },
    findById: (id) => Promise.resolve(signal?.id === id ? signal : null),
    findByAnchor: (filter, page) =>
      Promise.resolve({
        items: signal?.anchorId === filter.anchorId ? [signal] : [],
        page: page.page,
        pageSize: page.pageSize,
        total: signal?.anchorId === filter.anchorId ? 1 : 0,
      }),
    findDuplicate: () => Promise.resolve(null),
    updateStatus: (id, status, archivedAt) => {
      if (!signal || signal.id !== id) return Promise.resolve(null);
      signal = { ...signal, status, archivedAt, updatedAt: now };
      return Promise.resolve(signal);
    },
  };
  const transactions: ContentSignalTransactionRunner = {
    run: (operation) => operation(context),
  };
  return { service: new ContentSignalService(signals, anchors, keywords, transactions), signals };
}

const command = () => ({
  anchorId: 'anchor-1',
  keywordId: 'keyword-1',
  type: 'INTENT' as const,
  summary: ' Buyer asks about commute time. ',
  source: {
    type: 'MANUAL' as const,
    reference: 'staff-review-1',
    description: 'Staff-entered observation.',
  },
  evidence: [
    {
      type: 'TEXT' as const,
      content: 'Question about metro commute.',
      observedAt: now,
    },
  ],
  confidence: 80,
  confidenceRationale: 'The question is explicitly present in the evidence.',
  occurredAt: earlier,
  observedAt: now,
});

describe('ContentSignalService', () => {
  it('creates a platform-neutral signal with evidence', async () => {
    const { service } = setup();
    await expect(service.create(command())).resolves.toMatchObject({
      anchorId: 'anchor-1',
      keywordId: 'keyword-1',
      type: 'INTENT',
      summary: 'Buyer asks about commute time.',
      confidence: 80,
      confidenceRationale: 'The question is explicitly present in the evidence.',
      status: 'ACTIVE',
      evidence: [{ type: 'TEXT' }],
    });
  });

  it('defaults optional signal fields without inventing an occurrence time', async () => {
    const { service } = setup();
    const required = { ...command(), occurredAt: undefined, keywordId: undefined };

    await expect(service.create(required)).resolves.toMatchObject({
      keywordId: null,
      occurredAt: null,
      evidence: [{ status: 'AVAILABLE' }],
    });
  });

  it('requires an active Anchor and an existing optional Keyword', async () => {
    await expect(setup({ anchorStatus: 'PAUSED' }).service.create(command())).rejects.toMatchObject(
      {
        code: 'ANCHOR_NOT_ACTIVE',
      },
    );
    await expect(setup({ keywordExists: false }).service.create(command())).rejects.toMatchObject({
      code: 'KEYWORD_NOT_FOUND',
    });
  });

  it('validates evidence, confidence and timestamp ordering', async () => {
    const { service } = setup();
    await expect(service.create({ ...command(), evidence: [] })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.create({ ...command(), confidence: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.create({ ...command(), confidenceRationale: '' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      service.create({ ...command(), occurredAt: now, observedAt: earlier }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.create({ ...command(), evidence: undefined } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      service.create({ ...command(), source: undefined } as never),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a duplicate and an invalid state transition', async () => {
    const fixture = setup();
    const created = await fixture.service.create(command());
    fixture.signals.findDuplicate = () => Promise.resolve(created);
    await expect(fixture.service.create(command())).rejects.toMatchObject({
      code: 'CONTENT_SIGNAL_DUPLICATE',
    });
    await fixture.service.archive(created.id);
    await expect(fixture.service.archive(created.id)).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('lists with bounded pagination and time filters', async () => {
    const { service } = setup();
    await service.create(command());
    await expect(
      service.list({
        anchorId: 'anchor-1',
        page: 1,
        pageSize: 20,
        observedFrom: earlier,
        observedTo: now,
      }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(service.list({ anchorId: 'anchor-1', pageSize: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
