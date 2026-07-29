import { describe, expect, it } from 'vitest';
import type {
  AnchorRecord,
  AnchorRepository,
  ObservationRecord,
  ObservationRecordRepository,
  PersistenceTransactionContext,
  PlatformAccountRecord,
  PlatformAccountRepository,
} from '@re-agent/shared';
import { AnchorService, type AnchorTransactionRunner } from '../src/features/anchor/anchor.service';

const now = new Date('2026-07-29T00:00:00.000Z');
const context = {} as PersistenceTransactionContext;

const platformAccount = (
  overrides: Partial<PlatformAccountRecord> = {},
): PlatformAccountRecord => ({
  id: 'platform-account-1',
  platform: 'DOUYIN',
  accountName: 'Dalian Homes',
  accountIdentifier: 'account-001',
  profileUrl: 'https://example.com/accounts/account-001',
  followerCount: 1200,
  contentDomains: ['DALIAN_PROPERTY'],
  regionTags: ['DALIAN'],
  status: 'ACTIVE',
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const anchor = (overrides: Partial<AnchorRecord> = {}): AnchorRecord => ({
  id: 'anchor-1',
  name: 'Dalian property observer',
  platformAccountId: 'platform-account-1',
  observationReason: 'Tracks first-home buyer questions.',
  tags: ['FIRST_HOME'],
  priority: 'HIGH',
  status: 'ACTIVE',
  riskLevel: 'LOW',
  createdAt: now,
  updatedAt: now,
  archivedAt: null,
  ...overrides,
});

const observation = (overrides: Partial<ObservationRecord> = {}): ObservationRecord => ({
  id: 'observation-1',
  anchorId: 'anchor-1',
  observedAt: now,
  source: 'MANUAL_REVIEW',
  result: 'Account remains relevant to the observation objective.',
  notes: null,
  confidence: 80,
  createdAt: now,
  ...overrides,
});

function setup(options: { anchorPlatformAccountId?: string } = {}) {
  let accountValue = platformAccount();
  let anchorValue = anchor({
    platformAccountId: options.anchorPlatformAccountId ?? 'platform-account-1',
  });
  let observationValue = observation();

  const platformAccounts: PlatformAccountRepository = {
    create: (input) => {
      accountValue = platformAccount(input);
      return Promise.resolve(accountValue);
    },
    findById: (id) => Promise.resolve(id === accountValue.id ? accountValue : null),
    findByPlatformAndIdentifier: (platform, accountIdentifier) =>
      Promise.resolve(
        platform === accountValue.platform && accountIdentifier === accountValue.accountIdentifier
          ? accountValue
          : null,
      ),
  };

  const anchors: AnchorRepository = {
    create: (input) => {
      anchorValue = anchor(input);
      return Promise.resolve(anchorValue);
    },
    findById: (id) => Promise.resolve(id === anchorValue.id ? anchorValue : null),
    findByPlatformAccountId: (platformAccountId) =>
      Promise.resolve(platformAccountId === anchorValue.platformAccountId ? anchorValue : null),
    list: (filter, page) => {
      const matches =
        (!filter.platform || filter.platform === accountValue.platform) &&
        (!filter.tag || anchorValue.tags.includes(filter.tag)) &&
        (!filter.status || filter.status === anchorValue.status);
      return Promise.resolve({
        items: matches ? [anchorValue] : [],
        page: page.page,
        pageSize: page.pageSize,
        total: matches ? 1 : 0,
      });
    },
    update: (id, input) => {
      if (id !== anchorValue.id) return Promise.resolve(null);
      anchorValue = anchor({
        ...anchorValue,
        ...input,
        updatedAt: new Date(anchorValue.updatedAt.getTime() + 1),
      });
      return Promise.resolve(anchorValue);
    },
  };

  const observations: ObservationRecordRepository = {
    create: (input) => {
      observationValue = observation(input);
      return Promise.resolve(observationValue);
    },
    listByAnchorId: (anchorId, page) =>
      Promise.resolve({
        items: anchorId === observationValue.anchorId ? [observationValue] : [],
        page: page.page,
        pageSize: page.pageSize,
        total: anchorId === observationValue.anchorId ? 1 : 0,
      }),
  };

  const transactions: AnchorTransactionRunner = {
    run: (operation) => operation(context),
  };

  return {
    service: new AnchorService(platformAccounts, anchors, observations, transactions),
    account: () => accountValue,
    anchor: () => anchorValue,
  };
}

describe('AnchorService', () => {
  it('creates a platform-neutral Platform Account and rejects duplicates', async () => {
    const { service } = setup();

    await expect(
      service.createPlatformAccount({
        platform: ' douyin ',
        accountName: ' Dalian Homes ',
        accountIdentifier: 'new-account',
        profileUrl: 'https://example.com/accounts/new-account',
        followerCount: 30,
        contentDomains: [' PROPERTY ', 'PROPERTY'],
        regionTags: [' DALIAN '],
      }),
    ).resolves.toMatchObject({
      platform: 'DOUYIN',
      accountName: 'Dalian Homes',
      accountIdentifier: 'new-account',
      contentDomains: ['PROPERTY'],
      regionTags: ['DALIAN'],
      status: 'ACTIVE',
    });

    await expect(
      service.createPlatformAccount({
        platform: 'DOUYIN',
        accountName: 'Duplicate',
        accountIdentifier: 'new-account',
        profileUrl: 'https://example.com/duplicate',
      }),
    ).rejects.toMatchObject({ code: 'PLATFORM_ACCOUNT_DUPLICATE' });
  });

  it('validates Platform Account input without platform-specific fields', async () => {
    const { service } = setup();

    await expect(
      service.createPlatformAccount({
        platform: '!',
        accountName: '',
        accountIdentifier: '',
        profileUrl: 'javascript:alert(1)',
        followerCount: -1,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates one active Anchor per active Platform Account', async () => {
    const { service } = setup();

    await expect(
      service.createAnchor({
        name: ' New observer ',
        platformAccountId: 'platform-account-1',
        observationReason: ' Monitor buyer concerns. ',
        tags: [' FIRST_HOME ', 'FIRST_HOME'],
        priority: 'HIGH',
        riskLevel: 'MEDIUM',
      }),
    ).rejects.toMatchObject({ code: 'ANCHOR_DUPLICATE' });

    const fresh = setup({ anchorPlatformAccountId: 'other-account' });
    await expect(
      fresh.service.createAnchor({
        name: 'New observer',
        platformAccountId: 'platform-account-1',
        observationReason: 'Monitor buyer concerns.',
        tags: ['FIRST_HOME'],
      }),
    ).resolves.toMatchObject({
      status: 'ACTIVE',
      priority: 'NORMAL',
      riskLevel: 'UNKNOWN',
    });
  });

  it('supports bounded list queries with platform, tag and status filters', async () => {
    const { service } = setup();

    await expect(service.listAnchors({ page: 0 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(service.listAnchors({ pageSize: 101 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    await expect(
      service.listAnchors({ platform: 'douyin', tag: 'first_home', status: 'ACTIVE' }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it('updates only Anchor tags, priority and valid lifecycle state transitions', async () => {
    const { service } = setup();

    await expect(
      service.updateAnchor({
        id: 'anchor-1',
        tags: ['COMMUTE', ' commute '],
        priority: 'CRITICAL',
        status: 'PAUSED',
      }),
    ).resolves.toMatchObject({
      tags: ['COMMUTE'],
      priority: 'CRITICAL',
      status: 'PAUSED',
    });

    await expect(service.updateAnchor({ id: 'anchor-1', status: 'ACTIVE' })).resolves.toMatchObject(
      { status: 'ACTIVE' },
    );

    await expect(
      service.updateAnchor({ id: 'anchor-1', status: 'ARCHIVED' }),
    ).resolves.toMatchObject({ status: 'ARCHIVED' });

    await expect(service.updateAnchor({ id: 'anchor-1', status: 'ACTIVE' })).rejects.toMatchObject({
      code: 'INVALID_STATE_TRANSITION',
    });
  });

  it('records manual observation facts only for an active Anchor', async () => {
    const { service } = setup();

    await expect(
      service.recordObservation({
        anchorId: 'anchor-1',
        observedAt: now,
        source: ' MANUAL_REVIEW ',
        result: ' Relevant content was observed. ',
        notes: ' No automated collection. ',
        confidence: 75,
      }),
    ).resolves.toMatchObject({
      source: 'MANUAL_REVIEW',
      result: 'Relevant content was observed.',
      confidence: 75,
    });

    await service.updateAnchor({ id: 'anchor-1', status: 'PAUSED' });
    await expect(
      service.recordObservation({
        anchorId: 'anchor-1',
        observedAt: now,
        source: 'MANUAL_REVIEW',
        result: 'Should not be recorded.',
        confidence: 50,
      }),
    ).rejects.toMatchObject({ code: 'ANCHOR_NOT_ACTIVE' });
  });

  it('validates observation time, source, result and confidence', async () => {
    const { service } = setup();

    await expect(
      service.recordObservation({
        anchorId: 'anchor-1',
        observedAt: new Date('invalid'),
        source: '',
        result: '',
        confidence: 101,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
