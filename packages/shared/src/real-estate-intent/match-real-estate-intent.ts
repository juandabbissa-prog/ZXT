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
const contentAssetObjects = ['视频', '链接', '讲解', '内容', '资料视频', '帖子', '文章'] as const;
const propertyActionObjects = ['房源', '户型', '小区', '楼盘', '看房', '还有房', '在售房'] as const;

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

  const signalIdsByRuleId = new Map<string, string[]>();
  for (const signal of signals) {
    const ids = signalIdsByRuleId.get(signal.ruleId) ?? [];
    ids.push(signal.signalId);
    signalIdsByRuleId.set(signal.ruleId, ids);
  }
  for (const ids of signalIdsByRuleId.values()) ids.sort(compareText);

  const matches: IntentMatch[] = [];
  const clauses = segmentIntentClauses(evidence.content);
  for (const [clauseIndex, clause] of clauses.entries()) {
    const clauseEntries = entries.filter((entry) => clause.includes(entry.normalizedText));
    const hasContentAssetObject = contentAssetObjects.some((object) => clause.includes(object));
    const hasPropertyActionObject = propertyActionObjects.some((object) => clause.includes(object));
    const eligibleEntries = clauseEntries.filter((entry) => {
      if (entry.intent !== 'HIGH_INTENT_ACTION') return true;
      return (
        entry.evidenceStrength === 'EXPLICIT_ACTION' &&
        hasPropertyActionObject &&
        !hasContentAssetObject
      );
    });
    const hasStrongerEntry = eligibleEntries.some(
      (entry) => entry.evidenceStrength !== 'WEAK_TERM',
    );
    const selected = new Map<RealEstateIntent, IntentDictionaryEntry>();
    for (const entry of eligibleEntries) {
      const current = selected.get(entry.intent);
      selected.set(entry.intent, current ? chooseEntry(current, entry) : entry);
    }
    const clauseModifiers = new Set<IntentModifier>();
    for (const rule of modifierRuleSet.rules) {
      if (rule.normalizedPhrases.some((phrase) => clause.includes(phrase)))
        clauseModifiers.add(rule.modifier);
    }
    if (clauseModifiers.has('NEGATED')) clauseModifiers.delete('AFFIRMATIVE');

    for (const [intent, entry] of selected.entries()) {
      const applicable = new Set<IntentModifier>();
      for (const modifier of clauseModifiers) {
        if (safetyModifiers.has(modifier) || entry.allowedModifiers.includes(modifier))
          applicable.add(modifier);
      }
      if (entry.evidenceStrength === 'WEAK_TERM' && !hasStrongerEntry) applicable.add('AMBIGUOUS');
      const hasSafety = [...applicable].some((modifier) => safetyModifiers.has(modifier));
      const stage: IntentStage = hasSafety
        ? 'CONTEXT_ONLY'
        : entry.evidenceStrength === 'WEAK_TERM' && !hasStrongerEntry
          ? 'CONTEXT_ONLY'
          : applicable.has('ACTION_REQUEST')
            ? 'ACTION_REQUEST'
            : entry.defaultStage;
      const relevantSignalIds = entry.upstreamSignalRuleIds
        .flatMap((ruleId) => signalIdsByRuleId.get(ruleId) ?? [])
        .sort(compareText);
      matches.push({
        intent,
        clauseIndex,
        stage,
        modifiers: [...applicable].sort(
          (left, right) => INTENT_MODIFIERS.indexOf(left) - INTENT_MODIFIERS.indexOf(right),
        ),
        matchedRuleIds: [entry.termId],
        evidenceIds: [evidence.evidenceId],
        signalIds: relevantSignalIds,
        dictionaryVersion: dictionary.dictionaryVersion,
        matchingRuleVersion: dictionary.matchingRuleVersion,
        modifierRuleVersion: modifierRuleSet.modifierRuleVersion,
      });
    }
  }

  if (matches.length === 0) return { status: 'NO_MATCH' };

  const signalIds = signals.map((signal) => signal.signalId).sort(compareText);
  matches.sort(
    (left, right) =>
      left.clauseIndex - right.clauseIndex ||
      REAL_ESTATE_INTENTS.indexOf(left.intent) - REAL_ESTATE_INTENTS.indexOf(right.intent),
  );

  const canonical = {
    schemaVersion: '1.0.0' as const,
    canonicalizationVersion: '1.0.0' as const,
    dictionaryVersion: dictionary.dictionaryVersion,
    normalizationVersion: dictionary.normalizationVersion,
    matchingRuleVersion: dictionary.matchingRuleVersion,
    modifierRuleVersion: modifierRuleSet.modifierRuleVersion,
    dictionaryConflictPolicyVersion: dictionary.conflictPolicyVersion,
    modifierConflictPolicyVersion: modifierRuleSet.conflictPolicyVersion,
    sourceEvidenceId: evidence.evidenceId,
    sourceSignalIds: signalIds,
    matches,
  };
  return {
    status: 'MATCHED',
    context: { ...canonical, contextId: `ictx1_${sha256(JSON.stringify(canonical))}` },
  };
};
