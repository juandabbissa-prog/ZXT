import type { UnderstandingContextAssemblyResult } from './schemas';

export const UNDERSTANDING_RELATION_TYPES = ['MEMBER_OF_GROUP'] as const;

export const UNDERSTANDING_CONTEXT_ERROR_CODES = [
  'MISSING_REQUIRED_FIELD',
  'INVALID_INPUT',
  'VERSION_MISMATCH',
  'EMPTY_SIGNAL_SET',
  'DUPLICATE_SIGNAL_ID',
] as const;

export const UNDERSTANDING_CONTEXT_SCHEMA_VERSION = '1.0.0' as const;
export const UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION = '1.0.0' as const;

export type UnderstandingRelationType = (typeof UNDERSTANDING_RELATION_TYPES)[number];
export type UnderstandingContextErrorCode = (typeof UNDERSTANDING_CONTEXT_ERROR_CODES)[number];

export interface UnderstandingContextAssembler {
  assemble(input: unknown): UnderstandingContextAssemblyResult;
}
