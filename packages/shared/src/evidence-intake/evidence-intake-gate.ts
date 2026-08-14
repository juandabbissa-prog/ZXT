import type { Clock, DuplicateLookup, EvidenceIntakeErrorCode } from './contracts';
import type { CanonicalizationVersion } from './canonicalization';
import type { GateResult } from './schemas';
import { canonicalizeEvidenceIdentity } from './canonicalization';
import {
  dataSourceDescriptorSchema,
  evidenceCandidateSchema,
  evidenceEnvelopeSchema,
  evidenceIntakePolicySchema,
} from './schemas';

const SUPPORTED_VERSION = '1.0.0';

export type EvidenceIntakeGateInput = Readonly<{
  candidate: unknown;
  dataSource: unknown;
  policy: unknown;
}>;

export type EvidenceIntakeGateDependencies = Readonly<{
  clock: Clock;
  duplicateLookup: DuplicateLookup;
  canonicalizationVersion: CanonicalizationVersion;
  validatorVersion: '1.0.0';
}>;

export interface EvidenceIntakeGate {
  evaluate(input: EvidenceIntakeGateInput): Promise<GateResult>;
}

const rejected = (code: EvidenceIntakeErrorCode, field: string): GateResult => ({
  status: 'REJECTED',
  error: { code, field },
});

const issuePath = (path: PropertyKey[]): string => path.map(String).join('.') || 'input';

const isMissingIssue = (issue: {
  code: string;
  path: PropertyKey[];
  received?: unknown;
}): boolean => issue.code === 'invalid_type' && issue.received === 'undefined';

const validateVersion = (value: string, field: string): GateResult | null =>
  value === SUPPORTED_VERSION ? null : rejected('VERSION_MISMATCH', field);

export const createEvidenceIntakeGate = (
  dependencies: EvidenceIntakeGateDependencies,
): EvidenceIntakeGate => ({
  async evaluate(input): Promise<GateResult> {
    const candidateResult = evidenceCandidateSchema.safeParse(input.candidate);
    if (!candidateResult.success) {
      const issue = candidateResult.error.issues[0];
      return rejected(
        issue && isMissingIssue(issue) ? 'MISSING_REQUIRED_FIELD' : 'INVALID_INPUT',
        issuePath(issue?.path ?? []),
      );
    }

    const dataSourceResult = dataSourceDescriptorSchema.safeParse(input.dataSource);
    if (!dataSourceResult.success) {
      const issue = dataSourceResult.error.issues[0];
      return rejected(
        issue && isMissingIssue(issue) ? 'MISSING_REQUIRED_FIELD' : 'INVALID_INPUT',
        issuePath(issue?.path ?? []),
      );
    }

    const policyResult = evidenceIntakePolicySchema.safeParse(input.policy);
    if (!policyResult.success) {
      const issue = policyResult.error.issues[0];
      return rejected(
        issue && isMissingIssue(issue) ? 'MISSING_REQUIRED_FIELD' : 'INVALID_INPUT',
        issuePath(issue?.path ?? []),
      );
    }

    const candidate = candidateResult.data;
    const dataSource = dataSourceResult.data;
    const policy = policyResult.data;

    for (const [value, field] of [
      [candidate.schemaVersion, 'schemaVersion'],
      [candidate.adapterVersion, 'adapterVersion'],
      [dataSource.contractVersion, 'contractVersion'],
      [dataSource.complianceDeclarationVersion, 'complianceDeclarationVersion'],
      [policy.policyVersion, 'policyVersion'],
    ] as const) {
      const versionError = validateVersion(value, field);
      if (versionError) return versionError;
    }

    if (dataSource.governanceStatus !== 'ACTIVE') {
      return rejected('GOVERNANCE_DENIED', 'governanceStatus');
    }

    for (const field of ['dataSourceId', 'sourceType', 'businessSpaceId'] as const) {
      if (candidate[field] !== dataSource[field]) {
        return rejected('GOVERNANCE_DENIED', field);
      }
    }

    if (!dataSource.allowedPurposeCodes.includes(candidate.purposeCode)) {
      return rejected('GOVERNANCE_DENIED', 'purposeCode');
    }

    const occurredAt = candidate.occurredAt === null ? null : Date.parse(candidate.occurredAt);
    const observedAt = Date.parse(candidate.observedAt);
    const acquiredAt = Date.parse(candidate.acquiredAt);
    const validatedAt = dependencies.clock.now();
    const now = Date.parse(validatedAt);

    if (occurredAt !== null && occurredAt > observedAt) {
      return rejected('INVALID_TIME_ORDER', 'occurredAt');
    }
    if (observedAt > acquiredAt + policy.maxFutureClockSkew) {
      return rejected('CLOCK_SKEW_EXCEEDED', 'observedAt');
    }
    if (acquiredAt > now + policy.maxFutureClockSkew) {
      return rejected('CLOCK_SKEW_EXCEEDED', 'acquiredAt');
    }

    const identity = canonicalizeEvidenceIdentity(candidate, dependencies.canonicalizationVersion);

    let duplicateResult;
    try {
      duplicateResult = await dependencies.duplicateLookup.has(identity.fingerprint);
    } catch {
      return rejected('DEPENDENCY_UNAVAILABLE', 'duplicateLookup');
    }

    if (duplicateResult.status === 'UNAVAILABLE') {
      return rejected('DEPENDENCY_UNAVAILABLE', 'duplicateLookup');
    }
    if (duplicateResult.found) {
      return {
        status: 'DUPLICATE',
        fingerprint: identity.fingerprint,
        existingEvidenceId: duplicateResult.existingEvidenceId,
      };
    }

    const threshold = policy.maxAgeByEvidenceType[candidate.evidenceType];
    const freshnessBasis = occurredAt ?? observedAt;
    const age = Math.max(0, now - freshnessBasis);
    const freshness = threshold === undefined ? 'UNKNOWN' : age <= threshold ? 'FRESH' : 'STALE';

    const envelopeResult = evidenceEnvelopeSchema.safeParse({
      ...candidate,
      evidenceId: identity.evidenceId,
      fingerprint: identity.fingerprint,
      canonicalizationVersion: dependencies.canonicalizationVersion,
      validationStatus: 'ACCEPTED',
      validatedAt,
      validatorVersion: dependencies.validatorVersion,
      qualityFacts: { freshness },
      realtimeEligibility: freshness === 'FRESH' ? 'ELIGIBLE' : 'INELIGIBLE',
      redactionStatus: 'NOT_REQUIRED',
    });

    if (!envelopeResult.success) {
      return rejected('INVALID_INPUT', issuePath(envelopeResult.error.issues[0]?.path ?? []));
    }

    return { status: 'ACCEPTED', evidence: envelopeResult.data };
  },
});
