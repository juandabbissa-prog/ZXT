import { describe, expect, test } from 'vitest';
import {
  ACCESS_METHODS,
  COST_MODELS,
  MONITORING_STATES,
  SOURCE_AUTHORITY_STATUSES,
  SOURCE_HEALTH_STATUSES,
  accountWatchEntrySchema,
  sourceCapabilityDescriptorSchema,
  videoWatchEntrySchema,
} from '../src/acquisition-monitoring';

const sourceCapability = {
  schemaVersion: '1.0.0',
  sourceId: 'douyin-authorized-provider',
  platform: 'DOUYIN',
  accessMethod: 'AUTHORIZED_PROVIDER',
  costModel: 'PER_CALL',
  costPerCall: { amountMinor: 3, currency: 'CNY' },
  quota: { limit: 10_000, remaining: 9_000, resetsAt: '2026-09-01T00:00:00.000Z' },
  searchSupported: true,
  accountSupported: true,
  contentSupported: true,
  commentSupported: true,
  incrementalCommentSupported: true,
  loginRequired: false,
  authorityStatus: 'AUTHORIZED',
  healthStatus: 'HEALTHY',
  lastSuccessAt: '2026-08-17T01:00:00.000Z',
  lastFailureAt: null,
} as const;

const accountWatchEntry = {
  schemaVersion: '1.0.0',
  accountIdentity: 'account_001',
  platform: 'DOUYIN',
  sourceAccountIdentities: [
    {
      sourceId: 'douyin-authorized-provider',
      platform: 'DOUYIN',
      sourceAccountIdentity: 'source-account-001',
    },
  ],
  monitoringState: 'ACTIVE',
  lastCheckedAt: '2026-08-17T01:00:00.000Z',
  lastNewContentAt: null,
} as const;

const videoWatchEntry = {
  schemaVersion: '1.0.0',
  videoIdentity: 'video_001',
  platform: 'DOUYIN',
  accountIdentity: 'account_001',
  sourceVideoIdentities: [
    {
      sourceId: 'provider-a',
      platform: 'DOUYIN',
      sourceVideoIdentity: 'source-video-a',
    },
    {
      sourceId: 'provider-b',
      platform: 'DOUYIN',
      sourceVideoIdentity: 'source-video-b',
    },
  ],
  sourceCheckpoints: [
    {
      sourceId: 'provider-a',
      platform: 'DOUYIN',
      sourceVideoIdentity: 'source-video-a',
      cursor: 'cursor-a',
      continuationToken: null,
      lastCheckedAt: '2026-08-17T01:00:00.000Z',
      lastSuccessAt: '2026-08-17T01:00:00.000Z',
      observedCommentCount: 500,
    },
    {
      sourceId: 'provider-b',
      platform: 'DOUYIN',
      sourceVideoIdentity: 'source-video-b',
      cursor: null,
      continuationToken: 'next-b',
      lastCheckedAt: '2026-08-17T01:00:00.000Z',
      lastSuccessAt: '2026-08-17T01:00:00.000Z',
      observedCommentCount: 510,
    },
  ],
  observedCommentCount: 510,
  knownCommentCount: 500,
  lastCheckedAt: '2026-08-17T01:00:00.000Z',
  lastCommentCheckedAt: '2026-08-17T01:00:00.000Z',
  lastNewCommentAt: '2026-08-16T12:00:00.000Z',
  lastOpportunityAt: null,
  monitoringState: 'ACTIVE',
} as const;

describe('Acquisition Monitoring contracts', () => {
  test('accepts a complete Source Capability declaration as readonly data', () => {
    const parsed = sourceCapabilityDescriptorSchema.parse(structuredClone(sourceCapability));

    expect(parsed).toEqual(sourceCapability);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.costPerCall)).toBe(true);
    expect(Object.isFrozen(parsed.quota)).toBe(true);
  });

  test('freezes controlled vocabularies without business scoring concepts', () => {
    expect(ACCESS_METHODS).toEqual([
      'FREE_PUBLIC',
      'OFFICIAL_API',
      'AUTHORIZED_PROVIDER',
      'COMMERCIAL_PROVIDER',
    ]);
    expect(COST_MODELS).toEqual(['FREE', 'PER_CALL', 'SUBSCRIPTION', 'QUOTA_ONLY', 'UNKNOWN']);
    expect(SOURCE_AUTHORITY_STATUSES).toEqual(['AUTHORIZED', 'PENDING', 'DENIED', 'UNKNOWN']);
    expect(SOURCE_HEALTH_STATUSES).toEqual(['HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN']);
    expect(MONITORING_STATES).toEqual(['ACTIVE', 'PAUSED', 'SOURCE_UNAVAILABLE', 'COMPLETED']);
    expect(
      JSON.stringify({
        ACCESS_METHODS,
        COST_MODELS,
        SOURCE_AUTHORITY_STATUSES,
        SOURCE_HEALTH_STATUSES,
        MONITORING_STATES,
      }),
    ).not.toMatch(/customer|lead|score|ranking|prediction|marketing/iu);
  });

  test.each([
    ['accessMethod', 'SCRAPER'],
    ['costModel', 'FLOAT'],
    ['authorityStatus', 'TRUSTED'],
    ['healthStatus', 'FAST'],
  ] as const)('rejects invalid Source Capability %s vocabulary', (field, value) => {
    expect(
      sourceCapabilityDescriptorSchema.safeParse({ ...sourceCapability, [field]: value }).success,
    ).toBe(false);
  });

  test('rejects floating-point minor currency units', () => {
    expect(
      sourceCapabilityDescriptorSchema.safeParse({
        ...sourceCapability,
        costPerCall: { amountMinor: 1.5, currency: 'CNY' },
      }).success,
    ).toBe(false);
  });

  test('rejects incremental comments when comment access is unsupported', () => {
    expect(
      sourceCapabilityDescriptorSchema.safeParse({
        ...sourceCapability,
        commentSupported: false,
        incrementalCommentSupported: true,
      }).success,
    ).toBe(false);
  });

  test('requires free sources to have zero cost and per-call sources to declare cost', () => {
    expect(
      sourceCapabilityDescriptorSchema.safeParse({
        ...sourceCapability,
        costModel: 'FREE',
        costPerCall: sourceCapability.costPerCall,
      }).success,
    ).toBe(false);
    expect(
      sourceCapabilityDescriptorSchema.safeParse({
        ...sourceCapability,
        costModel: 'PER_CALL',
        costPerCall: null,
      }).success,
    ).toBe(false);
  });

  test('accepts an Account Watchlist entry without ranking fields', () => {
    const parsed = accountWatchEntrySchema.parse(structuredClone(accountWatchEntry));

    expect(parsed).toEqual(accountWatchEntry);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(JSON.stringify(parsed)).not.toMatch(
      /customer|lead|score|ranking|prediction|marketing/iu,
    );
  });

  test('accepts a Video Watchlist with independent per-source checkpoints', () => {
    const parsed = videoWatchEntrySchema.parse(structuredClone(videoWatchEntry));

    expect(parsed).toEqual(videoWatchEntry);
    expect(parsed.sourceCheckpoints).toHaveLength(2);
    expect(parsed.sourceCheckpoints.map(({ sourceId }) => sourceId)).toEqual([
      'provider-a',
      'provider-b',
    ]);
  });

  test('rejects Account Watchlist source aliases from another platform', () => {
    const invalid = {
      ...accountWatchEntry,
      sourceAccountIdentities: [
        { ...accountWatchEntry.sourceAccountIdentities[0], platform: 'WECHAT_VIDEO_ACCOUNT' },
      ],
    };

    expect(accountWatchEntrySchema.safeParse(invalid).success).toBe(false);
  });

  test('rejects Video Watchlist aliases and checkpoints from another platform or video', () => {
    const wrongPlatform = {
      ...videoWatchEntry,
      sourceCheckpoints: videoWatchEntry.sourceCheckpoints.map((checkpoint, index) =>
        index === 0 ? { ...checkpoint, platform: 'WECHAT_VIDEO_ACCOUNT' as const } : checkpoint,
      ),
    };
    expect(videoWatchEntrySchema.safeParse(wrongPlatform).success).toBe(false);

    const wrongVideo = {
      ...videoWatchEntry,
      sourceCheckpoints: videoWatchEntry.sourceCheckpoints.map((checkpoint, index) =>
        index === 0 ? { ...checkpoint, sourceVideoIdentity: 'not-an-alias' } : checkpoint,
      ),
    };
    expect(videoWatchEntrySchema.safeParse(wrongVideo).success).toBe(false);
  });
});
