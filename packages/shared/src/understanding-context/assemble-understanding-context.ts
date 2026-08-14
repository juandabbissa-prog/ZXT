import { createHash } from 'node:crypto';
import { SIGNAL_SCHEMA_VERSION, type SignalType } from '../evidence-signal/contracts';
import type { EvidenceSignal } from '../evidence-signal/schemas';
import {
  UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION,
  UNDERSTANDING_CONTEXT_SCHEMA_VERSION,
  type UnderstandingContextErrorCode,
} from './contracts';
import type {
  UnderstandingContextAssemblyResult,
  UnderstandingContextGroup,
  UnderstandingContextRelation,
} from './schemas';
import {
  understandingContextAssemblyResultSchema,
  understandingContextInputSchema,
} from './schemas';

export type UnderstandingContextCanonicalizationInput = Readonly<{
  sourceSignalIds: readonly string[];
  groups: readonly UnderstandingContextGroup[];
  relations: readonly UnderstandingContextRelation[];
}>;

export type CanonicalUnderstandingContextIdentity = Readonly<{
  canonicalBytes: string;
  contextId: string;
}>;

const rejected = (
  code: UnderstandingContextErrorCode,
  field: string,
): UnderstandingContextAssemblyResult =>
  understandingContextAssemblyResultSchema.parse({ status: 'REJECTED', code, field });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const issuePath = (path: PropertyKey[]): string => ['signals', ...path.map(String)].join('.');

const sortedCanonicalInput = (
  input: UnderstandingContextCanonicalizationInput,
): UnderstandingContextCanonicalizationInput => ({
  sourceSignalIds: [...input.sourceSignalIds].sort(),
  groups: input.groups
    .map((group) => ({ key: group.key, signalIds: [...group.signalIds].sort() }))
    .sort((left, right) => left.key.localeCompare(right.key)),
  relations: [...input.relations].sort(
    (left, right) =>
      left.targetGroupKey.localeCompare(right.targetGroupKey) ||
      left.sourceSignalId.localeCompare(right.sourceSignalId),
  ),
});

export const canonicalizeUnderstandingContext = (
  input: UnderstandingContextCanonicalizationInput,
): CanonicalUnderstandingContextIdentity => {
  const canonical = sortedCanonicalInput(input);
  const canonicalBytes =
    `{"contextCanonicalizationVersion":${JSON.stringify(
      UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION,
    )}` +
    `,"schemaVersion":${JSON.stringify(UNDERSTANDING_CONTEXT_SCHEMA_VERSION)}` +
    `,"sourceSignalIds":${JSON.stringify(canonical.sourceSignalIds)}` +
    `,"groups":${JSON.stringify(canonical.groups)}` +
    `,"relations":${JSON.stringify(canonical.relations)}}`;
  const hash = createHash('sha256').update(canonicalBytes, 'utf8').digest('hex');

  return { canonicalBytes, contextId: `ctx1_${hash}` };
};

const versionMismatch = (input: unknown): UnderstandingContextAssemblyResult | null => {
  if (!Array.isArray(input)) return null;
  const mismatchIndex = input.findIndex(
    (signal) =>
      isRecord(signal) &&
      typeof signal.schemaVersion === 'string' &&
      signal.schemaVersion !== SIGNAL_SCHEMA_VERSION,
  );

  return mismatchIndex < 0
    ? null
    : rejected('VERSION_MISMATCH', `signals.${mismatchIndex}.schemaVersion`);
};

const groupSignals = (signals: readonly EvidenceSignal[]): UnderstandingContextGroup[] => {
  const grouped = new Map<SignalType, string[]>();
  for (const signal of signals) {
    const signalIds = grouped.get(signal.signalType) ?? [];
    signalIds.push(signal.signalId);
    grouped.set(signal.signalType, signalIds);
  }

  return [...grouped.entries()]
    .map(([key, signalIds]) => ({ key, signalIds: signalIds.sort() }))
    .sort((left, right) => left.key.localeCompare(right.key));
};

export const assembleUnderstandingContext = (
  input: unknown,
): UnderstandingContextAssemblyResult => {
  if (input === undefined) return rejected('MISSING_REQUIRED_FIELD', 'signals');

  const mismatch = versionMismatch(input);
  if (mismatch) return mismatch;

  const inputResult = understandingContextInputSchema.safeParse(input);
  if (!inputResult.success) {
    return rejected('INVALID_INPUT', issuePath(inputResult.error.issues[0]?.path ?? []));
  }

  const signals = inputResult.data;
  if (signals.length === 0) return rejected('EMPTY_SIGNAL_SET', 'signals');

  const sourceSignalIds = signals.map(({ signalId }) => signalId).sort();
  if (new Set(sourceSignalIds).size !== sourceSignalIds.length) {
    return rejected('DUPLICATE_SIGNAL_ID', 'signals');
  }

  const groups = groupSignals(signals);
  const relations: UnderstandingContextRelation[] = groups.flatMap((group) =>
    group.signalIds.map((sourceSignalId) => ({
      type: 'MEMBER_OF_GROUP',
      sourceSignalId,
      targetGroupKey: group.key,
    })),
  );
  const identity = canonicalizeUnderstandingContext({ sourceSignalIds, groups, relations });

  return understandingContextAssemblyResultSchema.parse({
    status: 'ASSEMBLED',
    context: {
      schemaVersion: UNDERSTANDING_CONTEXT_SCHEMA_VERSION,
      contextId: identity.contextId,
      contextCanonicalizationVersion: UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION,
      sourceSignalIds,
      groups,
      relations,
    },
  });
};
