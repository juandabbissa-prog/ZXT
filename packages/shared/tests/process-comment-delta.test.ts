import { describe, expect, test } from 'vitest';
import {
  deriveCommentIdentity,
  processCommentDelta,
  type CommentObservation,
  type KnownCommentIdentitySnapshot,
  type SourceCheckResult,
  type VideoWatchEntry,
} from '../src/acquisition-monitoring';

const CHECKED_AT = '2026-08-17T02:00:00.000Z';
const OCCURRED_AT = '2026-08-17T00:00:00.000Z';

const observation = (
  index: number,
  overrides: Partial<CommentObservation> = {},
): CommentObservation => ({
  sourceId: 'provider-a',
  platform: 'DOUYIN',
  canonicalVideoIdentity: 'video_001',
  sourceVideoIdentity: 'source-video-a',
  sourceCommentId: `comment-${index.toString().padStart(4, '0')}`,
  sourceCommentIdKind: 'PLATFORM_STABLE',
  normalizedAuthorIdentity: `author-${index.toString().padStart(4, '0')}`,
  content: `评论内容 ${index}`,
  occurredAt: OCCURRED_AT,
  observedAt: CHECKED_AT,
  deletionState: 'ACTIVE',
  priorCanonicalCommentIdentity: null,
  sourceReference: `provider-a/comment-${index}`,
  ...overrides,
});

const state = (): VideoWatchEntry => ({
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
      cursor: 'old-a',
      continuationToken: null,
      lastCheckedAt: '2026-08-16T02:00:00.000Z',
      lastSuccessAt: '2026-08-16T02:00:00.000Z',
      observedCommentCount: 500,
    },
    {
      sourceId: 'provider-b',
      platform: 'DOUYIN',
      sourceVideoIdentity: 'source-video-b',
      cursor: 'old-b',
      continuationToken: null,
      lastCheckedAt: '2026-08-16T02:00:00.000Z',
      lastSuccessAt: '2026-08-16T02:00:00.000Z',
      observedCommentCount: 500,
    },
  ],
  observedCommentCount: 500,
  knownCommentCount: 500,
  lastCheckedAt: '2026-08-16T02:00:00.000Z',
  lastCommentCheckedAt: '2026-08-16T02:00:00.000Z',
  lastNewCommentAt: '2026-08-16T00:00:00.000Z',
  lastOpportunityAt: null,
  monitoringState: 'ACTIVE',
});

const success = (
  sourceId = 'provider-a',
  overrides: Partial<Extract<SourceCheckResult, { status: 'SUCCESS' }>> = {},
): SourceCheckResult => ({
  sourceId,
  status: 'SUCCESS',
  checkedAt: CHECKED_AT,
  cursor: `new-${sourceId}`,
  continuationToken: null,
  observedCommentCount: 550,
  ...overrides,
});

const knownSnapshot = (
  observations: readonly CommentObservation[],
): KnownCommentIdentitySnapshot => ({
  schemaVersion: '1.0.0',
  videoIdentity: 'video_001',
  comments: observations.map((item) => {
    const identity = deriveCommentIdentity(item);
    return {
      canonicalCommentIdentity: identity.canonicalCommentIdentity,
      contentFingerprint: identity.contentFingerprint,
    };
  }),
});

describe('Comment identity', () => {
  test('keeps source-local identity separate from stable platform canonical identity', () => {
    const first = deriveCommentIdentity(observation(1));
    const second = deriveCommentIdentity(
      observation(1, {
        sourceId: 'provider-b',
        sourceVideoIdentity: 'source-video-b',
        sourceReference: 'provider-b/comment-1',
      }),
    );

    expect(first.sourceLocalCommentIdentity).not.toBe(second.sourceLocalCommentIdentity);
    expect(first.canonicalCommentIdentity).toBe(second.canonicalCommentIdentity);
    expect(first.identityStrength).toBe('STRONG');
    expect(first.canonicalCommentIdentity).toMatch(/^cmt1_[a-f0-9]{64}$/u);
  });

  test('does not treat a source-local comment id as a cross-source canonical id', () => {
    const first = deriveCommentIdentity(
      observation(2, { sourceCommentIdKind: 'SOURCE_LOCAL', sourceCommentId: 'local-a' }),
    );
    const second = deriveCommentIdentity(
      observation(2, {
        sourceId: 'provider-b',
        sourceVideoIdentity: 'source-video-b',
        sourceCommentIdKind: 'SOURCE_LOCAL',
        sourceCommentId: 'local-b',
        sourceReference: 'provider-b/local-b',
      }),
    );

    expect(first.sourceLocalCommentIdentity).not.toBe(second.sourceLocalCommentIdentity);
    expect(first.canonicalCommentIdentity).toBe(second.canonicalCommentIdentity);
    expect(first.identityStrength).toBe('WEAK_FINGERPRINT');
  });

  test('creates a deterministic weak fingerprint without stable comment id', () => {
    const input = observation(3, {
      sourceCommentId: null,
      sourceCommentIdKind: 'ABSENT',
      content: '  大 连\t房价  多少钱  ',
    });
    const before = structuredClone(input);

    const first = deriveCommentIdentity(input);
    const second = deriveCommentIdentity({ ...input, sourceId: 'provider-b' });

    expect(first.sourceLocalCommentIdentity).not.toBe(second.sourceLocalCommentIdentity);
    expect(first.canonicalCommentIdentity).toBe(second.canonicalCommentIdentity);
    expect(first.identityStrength).toBe('WEAK_FINGERPRINT');
    expect(input).toEqual(before);
  });

  test('excludes observedAt, cursor, local timezone and randomness from canonical identity', () => {
    const first = deriveCommentIdentity(observation(4));
    const second = deriveCommentIdentity(
      observation(4, {
        observedAt: '2026-08-18T10:00:00.000+08:00',
        sourceReference: 'another-source-reference',
      }),
    );

    expect(first.canonicalCommentIdentity).toBe(second.canonicalCommentIdentity);
  });

  test('keeps Video identity independent from Comment identity', () => {
    const first = deriveCommentIdentity(observation(5));
    const second = deriveCommentIdentity(
      observation(5, {
        canonicalVideoIdentity: 'video_002',
        sourceVideoIdentity: 'source-video-002',
      }),
    );

    expect(first.canonicalCommentIdentity).not.toBe(second.canonicalCommentIdentity);
  });
});

describe('processCommentDelta', () => {
  test('uses identity set difference for known 500 plus unknown 50', () => {
    const known = Array.from({ length: 500 }, (_, index) => observation(index));
    const current = Array.from({ length: 550 }, (_, index) => observation(index));

    const result = processCommentDelta({
      observations: current,
      knownSnapshot: knownSnapshot(known),
      state: state(),
      sourceResults: [success()],
    });

    expect(result.status).toBe('PROCESSED');
    expect(result.newComments).toHaveLength(50);
    expect(result.seenCommentIdentities).toHaveLength(550);
    expect(result.newComments[0]!.observations[0]!.sourceCommentId).toBe('comment-0500');
    expect(result.nextState.observedCommentCount).toBe(550);
    expect(result.nextState.knownCommentCount).toBe(550);
  });

  test('finds 60 new comments when 10 old comments disappear and net count grows by 50', () => {
    const known = Array.from({ length: 500 }, (_, index) => observation(index));
    const current = [
      ...Array.from({ length: 490 }, (_, index) => observation(index)),
      ...Array.from({ length: 60 }, (_, index) => observation(index + 500)),
    ];

    const result = processCommentDelta({
      observations: current,
      knownSnapshot: knownSnapshot(known),
      state: state(),
      sourceResults: [success()],
    });

    expect(result.newComments).toHaveLength(60);
    expect(result.explicitDeletions).toEqual([]);
    expect(result.nextState.knownCommentCount).toBe(560);
  });

  test('replay against the updated known snapshot returns no new comments', () => {
    const current = [observation(500), observation(501)];
    const first = processCommentDelta({
      observations: current,
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success()],
    });
    const nextKnown: KnownCommentIdentitySnapshot = {
      schemaVersion: '1.0.0',
      videoIdentity: 'video_001',
      comments: first.seenCommentIdentities.map((canonicalCommentIdentity) => {
        const comment = first.newComments.find(
          (item) => item.identity.canonicalCommentIdentity === canonicalCommentIdentity,
        );
        if (!comment) throw new Error('Missing comment identity');
        return {
          canonicalCommentIdentity,
          contentFingerprint: comment.identity.contentFingerprint,
        };
      }),
    };

    const replay = processCommentDelta({
      observations: [...current].reverse(),
      knownSnapshot: nextKnown,
      state: first.nextState,
      sourceResults: [success()],
    });

    expect(replay.newComments).toEqual([]);
  });

  test('is input-order independent and byte-for-byte deterministic', () => {
    const observations = [observation(3), observation(1), observation(2)];
    const input = {
      observations,
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success()],
    };
    const before = structuredClone(input);

    const first = processCommentDelta(input);
    const reordered = processCommentDelta({ ...input, observations: [...observations].reverse() });

    expect(JSON.stringify(first)).toBe(JSON.stringify(reordered));
    expect(input).toEqual(before);
  });

  test('deduplicates the same cross-source comment and preserves both observations', () => {
    const first = observation(10);
    const second = observation(10, {
      sourceId: 'provider-b',
      sourceVideoIdentity: 'source-video-b',
      sourceReference: 'provider-b/comment-10',
    });

    const result = processCommentDelta({
      observations: [second, first],
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success('provider-a'), success('provider-b')],
    });

    expect(result.newComments).toHaveLength(1);
    expect(result.newComments[0]!.observations.map(({ sourceId }) => sourceId)).toEqual([
      'provider-a',
      'provider-b',
    ]);
    expect(
      result.newComments[0]!.observations.map(
        ({ sourceLocalCommentIdentity }) => sourceLocalCommentIdentity,
      ),
    ).toHaveLength(2);
    expect(
      new Set(
        result.newComments[0]!.observations.map(
          ({ sourceLocalCommentIdentity }) => sourceLocalCommentIdentity,
        ),
      ).size,
    ).toBe(2);
    expect(result.duplicateObservations).toEqual([
      {
        canonicalCommentIdentity: result.newComments[0]!.identity.canonicalCommentIdentity,
        observationCount: 2,
        sourceIds: ['provider-a', 'provider-b'],
      },
    ]);
  });

  test('is byte-stable when cross-source observations reverse order', () => {
    const first = observation(11);
    const second = observation(11, {
      sourceId: 'provider-b',
      sourceVideoIdentity: 'source-video-b',
      sourceReference: 'provider-b/comment-11',
    });
    const input = {
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success('provider-a'), success('provider-b')],
    };

    const forward = processCommentDelta({ ...input, observations: [first, second] });
    const reverse = processCommentDelta({ ...input, observations: [second, first] });

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });

  test('uses code-unit ordering for Unicode source references', () => {
    const first = observation(12, { sourceReference: 'provider-a/源' });
    const second = observation(12, { sourceReference: 'provider-a/z' });

    const result = processCommentDelta({
      observations: [first, second],
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success()],
    });

    expect(
      result.newComments[0]!.observations.map(({ sourceReference }) => sourceReference),
    ).toEqual(['provider-a/z', 'provider-a/源']);
  });

  test('does not create a new comment when stable identity content changes', () => {
    const original = observation(20, { content: '原始评论' });
    const edited = observation(20, { content: '修改后的评论' });
    const result = processCommentDelta({
      observations: [edited],
      knownSnapshot: knownSnapshot([original]),
      state: state(),
      sourceResults: [success()],
    });

    expect(result.newComments).toEqual([]);
    expect(result.auditFacts).toContainEqual({
      code: 'COMMENT_EDIT_HANDLING_DEFERRED',
      canonicalCommentIdentity: deriveCommentIdentity(original).canonicalCommentIdentity,
      sourceId: null,
    });
  });

  test('does not infer deletion from an absent comment', () => {
    const known = [observation(30), observation(31)];

    const result = processCommentDelta({
      observations: [observation(30)],
      knownSnapshot: knownSnapshot(known),
      state: { ...state(), knownCommentCount: 2 },
      sourceResults: [success('provider-a', { observedCommentCount: 1 })],
    });

    expect(result.explicitDeletions).toEqual([]);
    expect(result.nextState.knownCommentCount).toBe(2);
  });

  test('emits deletion only for an explicit tombstone and preserves identity', () => {
    const active = observation(40);
    const tombstone = observation(40, { deletionState: 'DELETED', content: '已删除' });

    const result = processCommentDelta({
      observations: [tombstone],
      knownSnapshot: knownSnapshot([active]),
      state: { ...state(), knownCommentCount: 1 },
      sourceResults: [success()],
    });

    expect(result.newComments).toEqual([]);
    expect(result.explicitDeletions).toEqual([
      {
        canonicalCommentIdentity: deriveCommentIdentity(active).canonicalCommentIdentity,
        sourceIds: ['provider-a'],
      },
    ]);
    expect(result.nextState.knownCommentCount).toBe(1);
  });

  test.each(['SOURCE_LOCAL', 'ABSENT'] as const)(
    'uses prior canonical identity for a %s tombstone',
    (sourceCommentIdKind) => {
      const active = observation(41, {
        sourceCommentIdKind,
        sourceCommentId: sourceCommentIdKind === 'ABSENT' ? null : 'local-41',
      });
      const priorCanonicalCommentIdentity = deriveCommentIdentity(active).canonicalCommentIdentity;
      const tombstone = observation(41, {
        sourceCommentIdKind,
        sourceCommentId: sourceCommentIdKind === 'ABSENT' ? null : 'local-41',
        content: '已删除',
        deletionState: 'DELETED',
        priorCanonicalCommentIdentity,
      });

      const result = processCommentDelta({
        observations: [tombstone],
        knownSnapshot: knownSnapshot([active]),
        state: { ...state(), knownCommentCount: 1 },
        sourceResults: [success()],
      });

      expect(result.status).toBe('PROCESSED');
      expect(result.explicitDeletions).toEqual([
        { canonicalCommentIdentity: priorCanonicalCommentIdentity, sourceIds: ['provider-a'] },
      ]);
    },
  );

  test.each(['SOURCE_LOCAL', 'ABSENT'] as const)(
    'rejects a %s tombstone without prior canonical identity',
    (sourceCommentIdKind) => {
      const result = processCommentDelta({
        observations: [
          observation(42, {
            sourceCommentIdKind,
            sourceCommentId: sourceCommentIdKind === 'ABSENT' ? null : 'local-42',
            content: '已删除',
            deletionState: 'DELETED',
          }),
        ],
        knownSnapshot: knownSnapshot([]),
        state: state(),
        sourceResults: [success()],
      });

      expect(result.status).toBe('REJECTED');
      expect(result.newComments).toEqual([]);
      expect(result.explicitDeletions).toEqual([]);
    },
  );

  test('does not advance a failed source checkpoint or cursor', () => {
    const beforeState = state();
    const failed: SourceCheckResult = {
      sourceId: 'provider-a',
      status: 'FAILURE',
      checkedAt: CHECKED_AT,
      reasonCode: 'SOURCE_UNAVAILABLE',
    };

    const result = processCommentDelta({
      observations: [],
      knownSnapshot: knownSnapshot([]),
      state: beforeState,
      sourceResults: [failed],
    });

    expect(result.status).toBe('PARTIAL_FAILURE');
    expect(result.nextState.sourceCheckpoints[0]).toEqual(beforeState.sourceCheckpoints[0]);
    expect(result.auditFacts).toContainEqual({
      code: 'SOURCE_FAILURE',
      canonicalCommentIdentity: null,
      sourceId: 'provider-a',
    });
  });

  test('rejects observations for another platform or video', () => {
    const result = processCommentDelta({
      observations: [observation(50, { canonicalVideoIdentity: 'video_other' })],
      knownSnapshot: knownSnapshot([]),
      state: state(),
      sourceResults: [success()],
    });

    expect(result.status).toBe('REJECTED');
    expect(result.newComments).toEqual([]);
  });

  test.each([
    ['rogue source', { sourceId: 'rogue-provider', sourceVideoIdentity: 'rogue-video' }],
    ['wrong source video', { sourceId: 'provider-a', sourceVideoIdentity: 'source-video-b' }],
    [
      'unregistered source for a known video alias',
      { sourceId: 'rogue-provider', sourceVideoIdentity: 'source-video-a' },
    ],
  ] as const)('rejects %s observations outside the watchlist alias', (_name, overrides) => {
    const result = processCommentDelta({
      observations: [observation(51, overrides)],
      knownSnapshot: knownSnapshot([]),
      state: state(),
      sourceResults: [success()],
    });

    expect(result.status).toBe('REJECTED');
    expect(result.newComments).toEqual([]);
    expect(result.nextState).toEqual(state());
  });

  test('rejects source results for an unregistered source', () => {
    const result = processCommentDelta({
      observations: [],
      knownSnapshot: knownSnapshot([]),
      state: state(),
      sourceResults: [success('rogue-provider')],
    });

    expect(result.status).toBe('REJECTED');
    expect(result.nextState).toEqual(state());
  });

  test('never emits forbidden downstream business fields', () => {
    const result = processCommentDelta({
      observations: [observation(60)],
      knownSnapshot: knownSnapshot([]),
      state: { ...state(), knownCommentCount: 0 },
      sourceResults: [success()],
    });

    expect(JSON.stringify(result)).not.toMatch(
      /customer|lead|score|ranking|prediction|marketing/iu,
    );
  });
});
