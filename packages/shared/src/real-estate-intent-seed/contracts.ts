export const SEED_COMPILER_SCHEMA_VERSION = '1.0.0' as const;
export const CANDIDATE_IDENTITY_VERSION = '1.0.0' as const;
export const OBSERVATION_IDENTITY_VERSION = '1.0.0' as const;

export const CANDIDATE_MAPPING_STATUSES = [
  'MAPPED',
  'UNMAPPED',
  'AMBIGUOUS',
  'MULTI_INTENT',
  'CONFLICTED',
] as const;

export const CANDIDATE_QUALITY_FLAGS = ['LOW_INFORMATION'] as const;
