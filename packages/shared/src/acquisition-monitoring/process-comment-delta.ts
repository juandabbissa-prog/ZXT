import { createHash } from 'node:crypto';
import {
  commentObservationSchema,
  knownCommentIdentitySnapshotSchema,
  sourceCheckResultSchema,
  videoWatchEntrySchema,
  type CommentObservation,
  type KnownCommentIdentitySnapshot,
  type SourceCheckResult,
  type VideoWatchEntry,
} from './schemas';

const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');
const normalize = (value: string): string =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();
const canonical = (members: readonly (readonly [string, string | null])[]): string =>
  `{${members.map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',')}}`;

export type CommentIdentity = Readonly<{
  sourceLocalCommentIdentity: string;
  canonicalCommentIdentity: string;
  identityStrength: 'STRONG' | 'WEAK_FINGERPRINT';
  contentFingerprint: string;
}>;

export const deriveCommentIdentity = (input: CommentObservation): CommentIdentity => {
  const observation = commentObservationSchema.parse(input);
  const contentFingerprint = hash(normalize(observation.content));
  const weakBytes = canonical([
    ['platform', observation.platform],
    ['canonicalVideoIdentity', observation.canonicalVideoIdentity],
    [
      'authorIdentity',
      observation.normalizedAuthorIdentity === null
        ? null
        : normalize(observation.normalizedAuthorIdentity),
    ],
    ['content', normalize(observation.content)],
    [
      'occurredAt',
      observation.occurredAt === null ? null : new Date(observation.occurredAt).toISOString(),
    ],
  ]);
  const strong = observation.sourceCommentIdKind === 'PLATFORM_STABLE';
  const canonicalBytes = strong
    ? canonical([
        ['platform', observation.platform],
        ['canonicalVideoIdentity', observation.canonicalVideoIdentity],
        ['sourceCommentId', observation.sourceCommentId],
      ])
    : weakBytes;
  const localBytes = canonical([
    ['sourceId', observation.sourceCommentId === null ? null : observation.sourceId],
    [
      'sourceVideoIdentity',
      observation.sourceCommentId === null ? null : observation.sourceVideoIdentity,
    ],
    ['sourceCommentId', observation.sourceCommentId],
    ['fallback', observation.sourceCommentId === null ? weakBytes : null],
  ]);
  return {
    sourceLocalCommentIdentity: `src_cmt1_${hash(localBytes)}`,
    canonicalCommentIdentity: `cmt1_${hash(canonicalBytes)}`,
    identityStrength: strong ? 'STRONG' : 'WEAK_FINGERPRINT',
    contentFingerprint,
  };
};

type AuditFact = Readonly<{
  code: string;
  canonicalCommentIdentity: string | null;
  sourceId: string | null;
}>;
type CommentGroup = Readonly<{
  identity: CommentIdentity;
  observations: readonly CommentObservation[];
}>;

export type CommentDeltaResult = Readonly<{
  status: 'PROCESSED' | 'PARTIAL_FAILURE' | 'REJECTED';
  newComments: readonly CommentGroup[];
  seenCommentIdentities: readonly string[];
  duplicateObservations: readonly Readonly<{
    canonicalCommentIdentity: string;
    observationCount: number;
    sourceIds: readonly string[];
  }>[];
  explicitDeletions: readonly Readonly<{
    canonicalCommentIdentity: string;
    sourceIds: readonly string[];
  }>[];
  nextState: VideoWatchEntry;
  auditFacts: readonly AuditFact[];
}>;

const rejected = (state: VideoWatchEntry): CommentDeltaResult => ({
  status: 'REJECTED',
  newComments: [],
  seenCommentIdentities: [],
  duplicateObservations: [],
  explicitDeletions: [],
  nextState: state,
  auditFacts: [{ code: 'INPUT_REJECTED', canonicalCommentIdentity: null, sourceId: null }],
});

export const processCommentDelta = (
  input: Readonly<{
    observations: readonly CommentObservation[];
    knownSnapshot: KnownCommentIdentitySnapshot;
    state: VideoWatchEntry;
    sourceResults: readonly SourceCheckResult[];
  }>,
): CommentDeltaResult => {
  const stateResult = videoWatchEntrySchema.safeParse(input.state);
  const knownResult = knownCommentIdentitySnapshotSchema.safeParse(input.knownSnapshot);
  const observationsResult = commentObservationSchema.array().safeParse(input.observations);
  const sourceResultsResult = sourceCheckResultSchema.array().safeParse(input.sourceResults);
  if (
    !stateResult.success ||
    !knownResult.success ||
    !observationsResult.success ||
    !sourceResultsResult.success
  )
    return rejected(input.state);

  const state = stateResult.data;
  if (
    knownResult.data.videoIdentity !== state.videoIdentity ||
    observationsResult.data.some(
      (item) =>
        item.platform !== state.platform || item.canonicalVideoIdentity !== state.videoIdentity,
    )
  )
    return rejected(state);

  const known = new Map(
    knownResult.data.comments.map((item) => [
      item.canonicalCommentIdentity,
      item.contentFingerprint,
    ]),
  );
  const grouped = new Map<
    string,
    { identity: CommentIdentity; observations: CommentObservation[] }
  >();
  for (const item of observationsResult.data) {
    const identity = deriveCommentIdentity(item);
    const group = grouped.get(identity.canonicalCommentIdentity);
    if (group) group.observations.push(item);
    else grouped.set(identity.canonicalCommentIdentity, { identity, observations: [item] });
  }

  const groups = [...grouped.values()]
    .map((group) => ({
      ...group,
      observations: [...group.observations].sort((a, b) =>
        `${a.sourceId}\0${a.sourceReference ?? ''}`.localeCompare(
          `${b.sourceId}\0${b.sourceReference ?? ''}`,
        ),
      ),
    }))
    .sort((a, b) =>
      `${a.observations[0]?.sourceCommentId ?? ''}\0${a.identity.canonicalCommentIdentity}`.localeCompare(
        `${b.observations[0]?.sourceCommentId ?? ''}\0${b.identity.canonicalCommentIdentity}`,
      ),
    );
  const seenCommentIdentities = groups
    .filter((group) => group.observations.some((item) => item.deletionState !== 'DELETED'))
    .map((group) => group.identity.canonicalCommentIdentity);
  const newComments = groups.filter(
    (group) =>
      !known.has(group.identity.canonicalCommentIdentity) &&
      group.observations.some((item) => item.deletionState !== 'DELETED'),
  );
  const duplicateObservations = groups
    .filter((group) => group.observations.length > 1)
    .map((group) => ({
      canonicalCommentIdentity: group.identity.canonicalCommentIdentity,
      observationCount: group.observations.length,
      sourceIds: [...new Set(group.observations.map((item) => item.sourceId))].sort(),
    }));
  const explicitDeletions = groups
    .filter(
      (group) =>
        known.has(group.identity.canonicalCommentIdentity) &&
        group.observations.some((item) => item.deletionState === 'DELETED'),
    )
    .map((group) => ({
      canonicalCommentIdentity: group.identity.canonicalCommentIdentity,
      sourceIds: [
        ...new Set(
          group.observations
            .filter((item) => item.deletionState === 'DELETED')
            .map((item) => item.sourceId),
        ),
      ].sort(),
    }));

  const auditFacts: AuditFact[] = [];
  for (const group of groups) {
    if (group.identity.identityStrength === 'WEAK_FINGERPRINT')
      auditFacts.push({
        code: 'WEAK_COMMENT_IDENTITY',
        canonicalCommentIdentity: group.identity.canonicalCommentIdentity,
        sourceId: null,
      });
    if (
      known.has(group.identity.canonicalCommentIdentity) &&
      group.observations.some((item) => item.deletionState !== 'DELETED') &&
      known.get(group.identity.canonicalCommentIdentity) !== group.identity.contentFingerprint
    )
      auditFacts.push({
        code: 'COMMENT_EDIT_HANDLING_DEFERRED',
        canonicalCommentIdentity: group.identity.canonicalCommentIdentity,
        sourceId: null,
      });
  }
  for (const result of sourceResultsResult.data)
    if (result.status === 'FAILURE')
      auditFacts.push({
        code: 'SOURCE_FAILURE',
        canonicalCommentIdentity: null,
        sourceId: result.sourceId,
      });
  auditFacts.sort((a, b) =>
    `${a.code}\0${a.canonicalCommentIdentity ?? ''}\0${a.sourceId ?? ''}`.localeCompare(
      `${b.code}\0${b.canonicalCommentIdentity ?? ''}\0${b.sourceId ?? ''}`,
    ),
  );

  const resultBySource = new Map(
    sourceResultsResult.data.map((result) => [result.sourceId, result]),
  );
  const sourceCheckpoints = state.sourceCheckpoints.map((checkpoint) => {
    const result = resultBySource.get(checkpoint.sourceId);
    return result?.status === 'SUCCESS'
      ? {
          ...checkpoint,
          cursor: result.cursor,
          continuationToken: result.continuationToken,
          lastCheckedAt: result.checkedAt,
          lastSuccessAt: result.checkedAt,
          observedCommentCount: result.observedCommentCount,
        }
      : checkpoint;
  });
  const successes = sourceResultsResult.data.filter(
    (result): result is Extract<SourceCheckResult, { status: 'SUCCESS' }> =>
      result.status === 'SUCCESS',
  );
  const checkedAt =
    successes
      .map((result) => result.checkedAt)
      .sort()
      .at(-1) ?? state.lastCheckedAt;
  const observedCommentCount =
    successes.length === 0
      ? state.observedCommentCount
      : Math.max(...successes.map((result) => result.observedCommentCount));
  const lastNewCommentAt =
    newComments
      .flatMap((group) => group.observations.map((item) => item.observedAt))
      .sort()
      .at(-1) ?? state.lastNewCommentAt;
  const nextState = videoWatchEntrySchema.parse({
    ...state,
    sourceCheckpoints,
    observedCommentCount,
    knownCommentCount: Math.max(state.knownCommentCount, known.size) + newComments.length,
    lastCheckedAt: checkedAt,
    lastCommentCheckedAt: checkedAt,
    lastNewCommentAt,
  });

  return {
    status: sourceResultsResult.data.some((result) => result.status === 'FAILURE')
      ? 'PARTIAL_FAILURE'
      : 'PROCESSED',
    newComments,
    seenCommentIdentities,
    duplicateObservations,
    explicitDeletions,
    nextState,
    auditFacts,
  };
};
