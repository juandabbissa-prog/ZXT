export const DATA_SOURCE_TYPES = ['MANUAL_IMPORT', 'AUTHORIZED_API', 'FIXTURE'] as const;
export const DATA_SOURCE_GOVERNANCE_STATUSES = ['ACTIVE', 'PAUSED', 'DENIED'] as const;
export const ACQUISITION_METHODS = ['MANUAL', 'IMPORT', 'AUTHORIZED_API', 'FIXTURE'] as const;
export const EVIDENCE_TYPES = ['TEXT', 'URL', 'METRIC', 'OBSERVATION'] as const;
export const FRESHNESS_STATES = ['FRESH', 'STALE', 'UNKNOWN'] as const;
export const REALTIME_ELIGIBILITIES = ['ELIGIBLE', 'INELIGIBLE'] as const;
export const REDACTION_STATUSES = ['NOT_REQUIRED', 'REDACTED'] as const;

export const EVIDENCE_INTAKE_ERROR_CODES = [
  'MISSING_REQUIRED_FIELD',
  'INVALID_INPUT',
  'INVALID_TIME_ORDER',
  'CLOCK_SKEW_EXCEEDED',
  'UNSUPPORTED_SOURCE',
  'VERSION_MISMATCH',
  'MALFORMED_PAYLOAD',
  'DUPLICATE',
  'DEPENDENCY_UNAVAILABLE',
  'GOVERNANCE_DENIED',
  'SECRET_DETECTED',
] as const;

export type EvidenceIntakeErrorCode = (typeof EVIDENCE_INTAKE_ERROR_CODES)[number];
export type Instant = string;
export type Fingerprint = string;

export interface Clock {
  now(): Instant;
}

export type DuplicateLookupResult =
  | Readonly<{
      status: 'AVAILABLE';
      found: boolean;
      existingEvidenceId: string | null;
    }>
  | Readonly<{
      status: 'UNAVAILABLE';
      reasonCode: string;
    }>;

export interface DuplicateLookup {
  has(fingerprint: Fingerprint): Promise<DuplicateLookupResult>;
}
