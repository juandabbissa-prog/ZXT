import { createHash } from 'node:crypto';
import type { EvidenceEnvelope } from '../evidence-intake/schemas';
import type { EvidenceSignalErrorCode, SignalType } from './contracts';
import {
  SIGNAL_CANONICALIZATION_VERSION,
  SIGNAL_RULE_SET_VERSION,
  SIGNAL_RULE_VERSION,
  SIGNAL_SCHEMA_VERSION,
} from './contracts';
import type { EvidenceSignal, EvidenceSignalProjectionResult, EvidenceSignalRule } from './schemas';
import {
  evidenceSignalProjectionInputSchema,
  evidenceSignalProjectionResultSchema,
  evidenceSignalSchema,
} from './schemas';

export type SignalCanonicalizationInput = Readonly<{
  sourceEvidenceId: string;
  sourceFingerprint: string;
  ruleId: string;
  ruleVersion: typeof SIGNAL_RULE_VERSION;
  signalType: SignalType;
  value: string;
}>;

export type CanonicalSignalIdentity = Readonly<{
  canonicalBytes: string;
  signalId: string;
}>;

const rejected = (code: EvidenceSignalErrorCode, field: string): EvidenceSignalProjectionResult =>
  evidenceSignalProjectionResultSchema.parse({ status: 'REJECTED', code, field });

const issuePath = (path: PropertyKey[]): string => path.map(String).join('.') || 'input';

const isMissingIssue = (issue: {
  code: string;
  path: PropertyKey[];
  received?: unknown;
}): boolean => issue.code === 'invalid_type' && issue.received === 'undefined';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const normalizeSignalText = (value: string): string =>
  value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();

export const canonicalizeSignalIdentity = (
  input: SignalCanonicalizationInput,
): CanonicalSignalIdentity => {
  const canonicalBytes =
    `{"signalCanonicalizationVersion":${JSON.stringify(SIGNAL_CANONICALIZATION_VERSION)}` +
    `,"schemaVersion":${JSON.stringify(SIGNAL_SCHEMA_VERSION)}` +
    `,"sourceEvidenceId":${JSON.stringify(input.sourceEvidenceId)}` +
    `,"sourceFingerprint":${JSON.stringify(input.sourceFingerprint)}` +
    `,"ruleId":${JSON.stringify(input.ruleId)}` +
    `,"ruleVersion":${JSON.stringify(input.ruleVersion)}` +
    `,"signalType":${JSON.stringify(input.signalType)}` +
    `,"value":${JSON.stringify(input.value)}}`;
  const hash = createHash('sha256').update(canonicalBytes, 'utf8').digest('hex');

  return { canonicalBytes, signalId: `sig1_${hash}` };
};

const versionMismatch = (input: unknown): EvidenceSignalProjectionResult | null => {
  if (!isRecord(input)) return null;

  const evidence = input.evidence;
  if (
    isRecord(evidence) &&
    typeof evidence.schemaVersion === 'string' &&
    evidence.schemaVersion !== SIGNAL_SCHEMA_VERSION
  ) {
    return rejected('VERSION_MISMATCH', 'evidence.schemaVersion');
  }

  const ruleSet = input.ruleSet;
  if (!isRecord(ruleSet)) return null;
  if (
    typeof ruleSet.ruleSetVersion === 'string' &&
    ruleSet.ruleSetVersion !== SIGNAL_RULE_SET_VERSION
  ) {
    return rejected('VERSION_MISMATCH', 'ruleSet.ruleSetVersion');
  }

  if (Array.isArray(ruleSet.rules)) {
    const mismatchIndex = ruleSet.rules.findIndex(
      (rule) =>
        isRecord(rule) &&
        typeof rule.ruleVersion === 'string' &&
        rule.ruleVersion !== SIGNAL_RULE_VERSION,
    );
    if (mismatchIndex >= 0) {
      return rejected('VERSION_MISMATCH', `ruleSet.rules.${mismatchIndex}.ruleVersion`);
    }
  }

  return null;
};

const createSignal = (evidence: EvidenceEnvelope, rule: EvidenceSignalRule): EvidenceSignal => {
  const value = normalizeSignalText(rule.matcher.value);
  const identity = canonicalizeSignalIdentity({
    sourceEvidenceId: evidence.evidenceId,
    sourceFingerprint: evidence.fingerprint,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
    signalType: rule.signalType,
    value,
  });

  return evidenceSignalSchema.parse({
    schemaVersion: SIGNAL_SCHEMA_VERSION,
    signalId: identity.signalId,
    signalCanonicalizationVersion: SIGNAL_CANONICALIZATION_VERSION,
    signalType: rule.signalType,
    value,
    sourceEvidenceId: evidence.evidenceId,
    sourceFingerprint: evidence.fingerprint,
    ruleId: rule.ruleId,
    ruleVersion: rule.ruleVersion,
  });
};

export const projectEvidenceToSignals = (input: unknown): EvidenceSignalProjectionResult => {
  const mismatch = versionMismatch(input);
  if (mismatch) return mismatch;

  const inputResult = evidenceSignalProjectionInputSchema.safeParse(input);
  if (!inputResult.success) {
    const issue = inputResult.error.issues[0];
    return rejected(
      issue && isMissingIssue(issue) ? 'MISSING_REQUIRED_FIELD' : 'INVALID_INPUT',
      issuePath(issue?.path ?? []),
    );
  }

  const { evidence, ruleSet } = inputResult.data;
  const seenRuleIds = new Set<string>();
  for (const rule of ruleSet.rules) {
    if (seenRuleIds.has(rule.ruleId)) {
      return rejected('DUPLICATE_RULE_ID', 'ruleSet.rules');
    }
    seenRuleIds.add(rule.ruleId);
  }

  const normalizedContent = normalizeSignalText(evidence.content);
  const signals = ruleSet.rules
    .filter(
      (rule) =>
        rule.applicableEvidenceTypes.includes(evidence.evidenceType) &&
        normalizedContent.includes(normalizeSignalText(rule.matcher.value)),
    )
    .map((rule) => createSignal(evidence, rule))
    .sort((left, right) => left.signalId.localeCompare(right.signalId));

  return evidenceSignalProjectionResultSchema.parse(
    signals.length === 0 ? { status: 'NO_SIGNAL', signals: [] } : { status: 'DERIVED', signals },
  );
};
