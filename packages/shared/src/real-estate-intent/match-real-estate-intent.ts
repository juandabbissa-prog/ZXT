import { createHash } from 'node:crypto';
import type { IntentModifier, IntentStage, RealEstateIntent } from './contracts';
import { GLOBAL_SAFETY_MODIFIERS, INTENT_MODIFIERS, REAL_ESTATE_INTENTS } from './contracts';
import { segmentIntentClauses } from './normalize-intent-text';
import {
  realEstateIntentMatchInputSchema,
  type IntentDictionaryEntry,
  type IntentMatch,
  type RealEstateIntentMatchResult,
} from './schemas';

const strengthRank = { WEAK_TERM: 0, QUALIFIED_PHRASE: 1, EXPLICIT_ACTION: 2 } as const;
const safetyModifiers = new Set<string>(GLOBAL_SAFETY_MODIFIERS);

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const chooseEntry = (
  left: IntentDictionaryEntry,
  right: IntentDictionaryEntry,
): IntentDictionaryEntry => {
  const strength = strengthRank[right.evidenceStrength] - strengthRank[left.evidenceStrength];
  if (strength !== 0) return strength > 0 ? right : left;
  if (right.normalizedText.length !== left.normalizedText.length) {
    return right.normalizedText.length > left.normalizedText.length ? right : left;
  }
  return compareText(left.termId, right.termId) <= 0 ? left : right;
};

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export const matchRealEstateIntent = (input: unknown): RealEstateIntentMatchResult => {
  const parsed = realEstateIntentMatchInputSchema.safeParse(input);
  if (!parsed.success) return { status: 'REJECTED', code: 'INVALID_INPUT', field: 'input' };

  const { evidence, signals, dictionary, modifierRuleSet } = parsed.data;
  if (
    signals.some(
      (signal) =>
        signal.sourceEvidenceId !== evidence.evidenceId ||
        signal.sourceFingerprint !== evidence.fingerprint,
    )
  ) {
    return { status: 'REJECTED', code: 'SIGNAL_EVIDENCE_MISMATCH', field: 'signals' };
  }

  const entries = dictionary.entries.filter((entry) => entry.status === 'FROZEN');
  if (entries.length === 0) {
    return { status: 'REJECTED', code: 'NO_ACTIVE_DICTIONARY_ENTRY', field: 'dictionary.entries' };
  }

  const selected = new Map<
    RealEstateIntent,
    { entry: IntentDictionaryEntry; modifiers: Set<IntentModifier> }
  >();
  for (const clause of segmentIntentClauses(evidence.content)) {
    const clauseEntries = entries.filter(
      (entry) =>
        clause.includes(entry.normalizedText) ||
        entry.upstreamSignalRuleIds.some((ruleId) =>
          signals.some((signal) => signal.ruleId === ruleId),
        ),
    );
    const hasPropertyAnchor = clauseEntries.some((entry) => entry.intent !== 'HIGH_INTENT_ACTION');
    const eligibleEntries = clauseEntries.filter(
      (entry) =>
        entry.intent !== 'HIGH_INTENT_ACTION' ||
        (entry.evidenceStrength === 'EXPLICIT_ACTION' && hasPropertyAnchor),
    );
    const clauseModifiers = new Set<IntentModifier>();
    for (const rule of modifierRuleSet.rules) {
      if (rule.normalizedPhrases.some((phrase) => clause.includes(phrase)))
        clauseModifiers.add(rule.modifier);
    }
    if (clauseModifiers.has('NEGATED')) clauseModifiers.delete('AFFIRMATIVE');

    for (const entry of eligibleEntries) {
      const applicable = new Set<IntentModifier>();
      for (const modifier of clauseModifiers) {
        if (safetyModifiers.has(modifier) || entry.allowedModifiers.includes(modifier))
          applicable.add(modifier);
      }
      const current = selected.get(entry.intent);
      if (!current) selected.set(entry.intent, { entry, modifiers: applicable });
      else {
        current.entry = chooseEntry(current.entry, entry);
        for (const modifier of applicable) current.modifiers.add(modifier);
      }
    }
  }

  if (selected.size === 0) return { status: 'NO_MATCH' };

  const signalIds = signals.map((signal) => signal.signalId).sort(compareText);
  const matches: IntentMatch[] = [...selected.entries()]
    .sort(
      ([left], [right]) => REAL_ESTATE_INTENTS.indexOf(left) - REAL_ESTATE_INTENTS.indexOf(right),
    )
    .map(([intent, value]) => {
      if (value.entry.evidenceStrength === 'WEAK_TERM' && value.modifiers.size === 0) {
        value.modifiers.add('AMBIGUOUS');
      }
      const hasSafety = [...value.modifiers].some((modifier) => safetyModifiers.has(modifier));
      const stage: IntentStage = hasSafety
        ? 'CONTEXT_ONLY'
        : value.entry.evidenceStrength === 'WEAK_TERM' && value.modifiers.has('AMBIGUOUS')
          ? 'CONTEXT_ONLY'
          : value.modifiers.has('ACTION_REQUEST')
            ? 'ACTION_REQUEST'
            : value.entry.defaultStage;
      return {
        intent,
        stage,
        modifiers: [...value.modifiers].sort(
          (left, right) => INTENT_MODIFIERS.indexOf(left) - INTENT_MODIFIERS.indexOf(right),
        ),
        matchedRuleIds: [value.entry.termId],
        evidenceIds: [evidence.evidenceId],
        signalIds,
        dictionaryVersion: dictionary.dictionaryVersion,
        ruleVersion: modifierRuleSet.modifierRuleVersion,
      };
    });

  const canonical = {
    schemaVersion: '1.0.0' as const,
    canonicalizationVersion: '1.0.0' as const,
    dictionaryVersion: dictionary.dictionaryVersion,
    ruleVersion: modifierRuleSet.modifierRuleVersion,
    sourceEvidenceId: evidence.evidenceId,
    sourceSignalIds: signalIds,
    matches,
  };
  return {
    status: 'MATCHED',
    context: { ...canonical, contextId: `ictx1_${sha256(JSON.stringify(canonical))}` },
  };
};
