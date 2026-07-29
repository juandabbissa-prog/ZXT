import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaAnchorRepository } from '../src/features/anchor/anchor.repository.prisma';
import { AnchorService, type AnchorTransactionRunner } from '../src/features/anchor/anchor.service';
import { PrismaObservationRecordRepository } from '../src/features/anchor/observation-record.repository.prisma';
import { PrismaPlatformAccountRepository } from '../src/features/anchor/platform-account.repository.prisma';
import { runInTransaction } from '../src/infrastructure/persistence/transaction-runner';
import { clearIntegrationData } from './helpers/clear-integration-data';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('AnchorService integration', () => {
  const platformAccounts = new PrismaPlatformAccountRepository(prisma);
  const anchors = new PrismaAnchorRepository(prisma);
  const observations = new PrismaObservationRecordRepository(prisma);
  const transactions: AnchorTransactionRunner = {
    run: (operation) => runInTransaction(prisma, operation),
  };
  const service = new AnchorService(platformAccounts, anchors, observations, transactions);

  beforeAll(clearIntegrationData);
  afterAll(clearIntegrationData);

  it('persists Platform Account, Anchor and Observation Record through Service and Repository', async () => {
    const account = await service.createPlatformAccount({
      platform: 'douyin',
      accountName: 'Dalian First Home Observer',
      accountIdentifier: 'dalian-first-home-observer',
      profileUrl: 'https://example.com/dalian-first-home-observer',
      followerCount: 1200,
      contentDomains: ['PROPERTY'],
      regionTags: ['DALIAN'],
    });
    const created = await service.createAnchor({
      name: 'Dalian first-home observation node',
      platformAccountId: account.id,
      observationReason: 'Observe recurring first-home buyer questions.',
      tags: ['FIRST_HOME'],
      priority: 'HIGH',
      riskLevel: 'LOW',
    });

    expect(
      (
        await service.listAnchors({
          platform: 'DOUYIN',
          tag: 'FIRST_HOME',
          status: 'ACTIVE',
        })
      ).items.map((item) => item.id),
    ).toContain(created.id);

    const paused = await service.updateAnchor({ id: created.id, status: 'PAUSED' });
    expect(paused.status).toBe('PAUSED');
    await service.updateAnchor({ id: created.id, status: 'ACTIVE' });

    const observedAt = new Date('2026-07-29T08:00:00.000Z');
    const observation = await service.recordObservation({
      anchorId: created.id,
      observedAt,
      source: 'MANUAL_REVIEW',
      result: 'First-home financing questions were observed.',
      confidence: 80,
    });
    expect(observation).toMatchObject({ anchorId: created.id, observedAt, confidence: 80 });
    expect((await observations.listByAnchorId(created.id, { page: 1, pageSize: 10 })).total).toBe(
      1,
    );
  });

  it('enforces platform identity and one Anchor per Platform Account', async () => {
    const account = await service.createPlatformAccount({
      platform: 'XIAOHONGSHU',
      accountName: 'Dalian Commute Observer',
      accountIdentifier: 'dalian-commute-observer',
      profileUrl: 'https://example.com/dalian-commute-observer',
    });
    await expect(
      service.createPlatformAccount({
        platform: 'XIAOHONGSHU',
        accountName: 'Duplicate',
        accountIdentifier: 'dalian-commute-observer',
        profileUrl: 'https://example.com/duplicate',
      }),
    ).rejects.toMatchObject({ code: 'PLATFORM_ACCOUNT_DUPLICATE' });

    await service.createAnchor({
      name: 'Dalian commute observation node',
      platformAccountId: account.id,
      observationReason: 'Observe commute-related location concerns.',
    });
    await expect(
      service.createAnchor({
        name: 'Duplicate Anchor',
        platformAccountId: account.id,
        observationReason: 'Must not create a second Anchor.',
      }),
    ).rejects.toMatchObject({ code: 'ANCHOR_DUPLICATE' });
  });

  it('rolls back Anchor Center writes when the transaction operation fails', async () => {
    const identifier = 'rolled-back-platform-account';
    await expect(
      runInTransaction(prisma, async (context) => {
        await platformAccounts.create(
          {
            platform: 'WECHAT_CHANNELS',
            accountName: 'Rollback account',
            accountIdentifier: identifier,
            profileUrl: 'https://example.com/rollback',
            followerCount: 0,
            contentDomains: [],
            regionTags: [],
            status: 'ACTIVE',
          },
          context,
        );
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    expect(
      await platformAccounts.findByPlatformAndIdentifier('WECHAT_CHANNELS', identifier),
    ).toBeNull();
  });
});
