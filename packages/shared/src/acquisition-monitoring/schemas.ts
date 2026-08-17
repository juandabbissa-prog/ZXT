import { z } from 'zod';
import {
  ACCESS_METHODS,
  COMMENT_DELETION_STATES,
  COST_MODELS,
  MONITORING_STATES,
  PLATFORMS,
  SOURCE_AUTHORITY_STATUSES,
  SOURCE_COMMENT_ID_KINDS,
  SOURCE_HEALTH_STATUSES,
} from './contracts';

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const identifierSchema = z.string().trim().min(1).max(256);
const timestampSchema = z.string().datetime({ offset: true });
const nullableTimestampSchema = timestampSchema.nullable();

const sourceAccountIdentitySchema = z
  .object({
    sourceId: identifierSchema,
    platform: z.enum(PLATFORMS),
    sourceAccountIdentity: identifierSchema,
  })
  .strict()
  .readonly();

const sourceVideoIdentitySchema = z
  .object({
    sourceId: identifierSchema,
    platform: z.enum(PLATFORMS),
    sourceVideoIdentity: identifierSchema,
  })
  .strict()
  .readonly();

const sourceCheckpointSchema = z
  .object({
    sourceId: identifierSchema,
    platform: z.enum(PLATFORMS),
    sourceVideoIdentity: identifierSchema,
    cursor: z.string().nullable(),
    continuationToken: z.string().nullable(),
    lastCheckedAt: nullableTimestampSchema,
    lastSuccessAt: nullableTimestampSchema,
    observedCommentCount: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const sourceCapabilityDescriptorSchema = z
  .object({
    schemaVersion: versionSchema,
    sourceId: identifierSchema,
    platform: z.enum(PLATFORMS),
    accessMethod: z.enum(ACCESS_METHODS),
    costModel: z.enum(COST_MODELS),
    costPerCall: z
      .object({
        amountMinor: z.number().int().nonnegative(),
        currency: z.string().regex(/^[A-Z]{3}$/u),
      })
      .strict()
      .readonly()
      .nullable(),
    quota: z
      .object({
        limit: z.number().int().nonnegative(),
        remaining: z.number().int().nonnegative(),
        resetsAt: nullableTimestampSchema,
      })
      .strict()
      .readonly()
      .nullable(),
    searchSupported: z.boolean(),
    accountSupported: z.boolean(),
    contentSupported: z.boolean(),
    commentSupported: z.boolean(),
    incrementalCommentSupported: z.boolean(),
    loginRequired: z.boolean(),
    authorityStatus: z.enum(SOURCE_AUTHORITY_STATUSES),
    healthStatus: z.enum(SOURCE_HEALTH_STATUSES),
    lastSuccessAt: nullableTimestampSchema,
    lastFailureAt: nullableTimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.incrementalCommentSupported && !value.commentSupported) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['incrementalCommentSupported'],
        message: 'Incremental access requires comment access',
      });
    }
    if (value.costModel === 'FREE' && value.costPerCall !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['costPerCall'],
        message: 'Free sources cannot declare per-call cost',
      });
    }
    if (value.costModel === 'PER_CALL' && value.costPerCall === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['costPerCall'],
        message: 'Per-call sources require cost',
      });
    }
    if (value.quota !== null && value.quota.remaining > value.quota.limit) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['quota', 'remaining'],
        message: 'Remaining quota exceeds limit',
      });
    }
  })
  .readonly();

export const accountWatchEntrySchema = z
  .object({
    schemaVersion: versionSchema,
    accountIdentity: identifierSchema,
    platform: z.enum(PLATFORMS),
    sourceAccountIdentities: z.array(sourceAccountIdentitySchema).min(1).readonly(),
    monitoringState: z.enum(MONITORING_STATES),
    lastCheckedAt: nullableTimestampSchema,
    lastNewContentAt: nullableTimestampSchema,
  })
  .strict()
  .superRefine((value, context) => {
    value.sourceAccountIdentities.forEach((identity, index) => {
      if (identity.platform !== value.platform) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceAccountIdentities', index, 'platform'],
          message: 'Platform mismatch',
        });
      }
    });
  })
  .readonly();

export const videoWatchEntrySchema = z
  .object({
    schemaVersion: versionSchema,
    videoIdentity: identifierSchema,
    platform: z.enum(PLATFORMS),
    accountIdentity: identifierSchema,
    sourceVideoIdentities: z.array(sourceVideoIdentitySchema).min(1).readonly(),
    sourceCheckpoints: z.array(sourceCheckpointSchema).readonly(),
    observedCommentCount: z.number().int().nonnegative(),
    knownCommentCount: z.number().int().nonnegative(),
    lastCheckedAt: nullableTimestampSchema,
    lastCommentCheckedAt: nullableTimestampSchema,
    lastNewCommentAt: nullableTimestampSchema,
    lastOpportunityAt: nullableTimestampSchema,
    monitoringState: z.enum(MONITORING_STATES),
  })
  .strict()
  .superRefine((value, context) => {
    const aliases = new Set(
      value.sourceVideoIdentities.map(
        (identity) => `${identity.sourceId}\0${identity.sourceVideoIdentity}`,
      ),
    );
    [...value.sourceVideoIdentities, ...value.sourceCheckpoints].forEach((identity, index) => {
      if (identity.platform !== value.platform) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceIdentity', index, 'platform'],
          message: 'Platform mismatch',
        });
      }
    });
    value.sourceCheckpoints.forEach((checkpoint, index) => {
      if (!aliases.has(`${checkpoint.sourceId}\0${checkpoint.sourceVideoIdentity}`)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['sourceCheckpoints', index, 'sourceVideoIdentity'],
          message: 'Checkpoint has no matching alias',
        });
      }
    });
  })
  .readonly();

export const commentObservationSchema = z
  .object({
    sourceId: identifierSchema,
    platform: z.enum(PLATFORMS),
    canonicalVideoIdentity: identifierSchema,
    sourceVideoIdentity: identifierSchema,
    sourceCommentId: identifierSchema.nullable(),
    sourceCommentIdKind: z.enum(SOURCE_COMMENT_ID_KINDS),
    normalizedAuthorIdentity: identifierSchema.nullable(),
    content: z.string().min(1).max(10_000),
    occurredAt: nullableTimestampSchema,
    observedAt: timestampSchema,
    deletionState: z.enum(COMMENT_DELETION_STATES),
    priorCanonicalCommentIdentity: z
      .string()
      .regex(/^cmt1_[a-f0-9]{64}$/u)
      .nullable(),
    sourceReference: z.string().trim().min(1).max(2048).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if ((value.sourceCommentIdKind === 'ABSENT') !== (value.sourceCommentId === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sourceCommentId'],
        message: 'Comment id and id kind disagree',
      });
    }
    if (
      value.deletionState === 'DELETED' &&
      value.sourceCommentIdKind !== 'PLATFORM_STABLE' &&
      value.priorCanonicalCommentIdentity === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['priorCanonicalCommentIdentity'],
        message: 'Weak tombstones require a prior canonical comment identity',
      });
    }
  })
  .readonly();

export const knownCommentIdentitySnapshotSchema = z
  .object({
    schemaVersion: versionSchema,
    videoIdentity: identifierSchema,
    comments: z
      .array(
        z
          .object({
            canonicalCommentIdentity: z.string().regex(/^cmt1_[a-f0-9]{64}$/u),
            contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/u),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const sourceCheckResultSchema = z
  .discriminatedUnion('status', [
    z
      .object({
        sourceId: identifierSchema,
        status: z.literal('SUCCESS'),
        checkedAt: timestampSchema,
        cursor: z.string().nullable(),
        continuationToken: z.string().nullable(),
        observedCommentCount: z.number().int().nonnegative(),
      })
      .strict(),
    z
      .object({
        sourceId: identifierSchema,
        status: z.literal('FAILURE'),
        checkedAt: timestampSchema,
        reasonCode: identifierSchema,
      })
      .strict(),
  ])
  .readonly();

export type SourceCapabilityDescriptor = z.infer<typeof sourceCapabilityDescriptorSchema>;
export type AccountWatchEntry = z.infer<typeof accountWatchEntrySchema>;
export type VideoWatchEntry = z.infer<typeof videoWatchEntrySchema>;
export type CommentObservation = z.infer<typeof commentObservationSchema>;
export type KnownCommentIdentitySnapshot = z.infer<typeof knownCommentIdentitySnapshotSchema>;
export type SourceCheckResult = z.infer<typeof sourceCheckResultSchema>;
