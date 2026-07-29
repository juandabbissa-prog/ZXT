import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaContentSignalRepository } from '../src/features/content-signal/content-signal.repository.prisma';
import { runInTransaction } from '../src/infrastructure/persistence/transaction-runner';
import { clearIntegrationData } from './helpers/clear-integration-data';

const suite = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true' ? describe : describe.skip;

suite('PrismaContentSignalRepository integration', () => {
  const repository = new PrismaContentSignalRepository(prisma);
  let anchorId: string;
  let keywordId: string;

  beforeAll(async () => {
    await clearIntegrationData();

    const category = await prisma.keywordCategory.create({
      data: { code: 'CONTENT_SIGNAL_TEST', name: 'Content Signal Test' },
    });
    const keyword = await prisma.keyword.create({
      data: {
        phrase: 'Commute time',
        normalizedPhrase: 'commute time',
        categoryId: category.id,
        source: 'MANUAL',
        status: 'ACTIVE',
        matchMode: 'PHRASE',
      },
    });
    keywordId = keyword.id;
    const account = await prisma.platformAccount.create({
      data: {
        platform: 'MANUAL',
        accountName: 'Content Signal Test Observer',
        accountIdentifier: 'content-signal-test-observer',
        profileUrl: 'https://example.com/content-signal-test-observer',
      },
    });
    const anchor = await prisma.anchor.create({
      data: {
        name: 'Content Signal Test Anchor',
        platformAccountId: account.id,
        observationReason: 'Repository integration validation.',
      },
    });
    anchorId = anchor.id;
  });

  afterAll(clearIntegrationData);

  it('persists, filters and archives a platform-neutral signal with evidence', async () => {
    const occurredAt = new Date('2026-07-29T05:00:00.000Z');
    const observedAt = new Date('2026-07-29T06:00:00.000Z');
    const created = await repository.create({
      anchorId,
      keywordId,
      type: 'INTENT',
      summary: 'Buyer asks about commute time.',
      normalizedSummary: 'buyer asks about commute time.',
      source: {
        type: 'MANUAL',
        reference: 'integration-test',
        description: 'Repository integration fixture.',
      },
      evidence: [
        {
          type: 'TEXT',
          status: 'AVAILABLE',
          content: 'Question about metro commute.',
          referenceUrl: null,
          observedAt,
        },
      ],
      confidence: 80,
      confidenceRationale: 'Explicit commute question captured in evidence.',
      occurredAt,
      observedAt,
      status: 'ACTIVE',
    });

    expect(await repository.findById(created.id)).toMatchObject({
      anchorId,
      keywordId,
      evidence: [{ type: 'TEXT' }],
    });
    expect(
      await repository.findByAnchor(
        {
          anchorId,
          type: 'INTENT',
          status: 'ACTIVE',
          observedFrom: occurredAt,
          observedTo: observedAt,
        },
        { page: 1, pageSize: 10 },
      ),
    ).toMatchObject({ total: 1 });
    expect(
      await repository.findDuplicate({
        anchorId,
        type: 'INTENT',
        normalizedSummary: 'buyer asks about commute time.',
        occurredAt,
      }),
    ).toMatchObject({ id: created.id });
    await expect(
      repository.updateStatus(created.id, 'ARCHIVED', observedAt),
    ).resolves.toMatchObject({
      status: 'ARCHIVED',
      evidence: [{ content: 'Question about metro commute.' }],
    });
  });

  it('rolls back a signal and its evidence as one transaction', async () => {
    await expect(
      runInTransaction(prisma, async (context) => {
        await repository.create(
          {
            anchorId,
            keywordId: null,
            type: 'DEMAND',
            summary: 'Rollback signal',
            normalizedSummary: 'rollback signal',
            source: { type: 'SYSTEM', reference: null, description: null },
            evidence: [
              {
                type: 'OBSERVATION',
                status: 'AVAILABLE',
                content: 'Rollback evidence',
                referenceUrl: null,
                observedAt: new Date('2026-07-29T07:00:00.000Z'),
              },
            ],
            confidence: 50,
            confidenceRationale: 'Transaction rollback fixture.',
            occurredAt: new Date('2026-07-29T07:00:00.000Z'),
            observedAt: new Date('2026-07-29T07:00:00.000Z'),
            status: 'ACTIVE',
          },
          context,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');
    expect(
      await repository.findDuplicate({
        anchorId,
        type: 'DEMAND',
        normalizedSummary: 'rollback signal',
        occurredAt: new Date('2026-07-29T07:00:00.000Z'),
      }),
    ).toBeNull();
  });
});
