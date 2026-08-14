import type { EvidenceSignalProjectionResult } from './schemas';

export const SIGNAL_TYPES = [
  'TOPIC_MENTION',
  'EXPRESSED_INTENT',
  'OBSERVED_BEHAVIOR',
  'OBSERVED_ENGAGEMENT',
] as const;

export const EVIDENCE_SIGNAL_ERROR_CODES = [
  'MISSING_REQUIRED_FIELD',
  'INVALID_INPUT',
  'VERSION_MISMATCH',
  'DUPLICATE_RULE_ID',
] as const;

export const SIGNAL_SCHEMA_VERSION = '1.0.0' as const;
export const SIGNAL_CANONICALIZATION_VERSION = '1.0.0' as const;
export const SIGNAL_RULE_VERSION = '1.0.0' as const;
export const SIGNAL_RULE_SET_VERSION = '1.0.0' as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];
export type EvidenceSignalErrorCode = (typeof EVIDENCE_SIGNAL_ERROR_CODES)[number];

export interface EvidenceSignalProjector {
  project(input: unknown): EvidenceSignalProjectionResult;
}
