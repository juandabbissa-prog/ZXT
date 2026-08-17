import { createHash } from 'node:crypto';
import { INTENT_STAGES, REAL_ESTATE_INTENTS } from '../real-estate-intent/contracts';
import { normalizeIntentText } from '../real-estate-intent/normalize-intent-text';
import {
  CANDIDATE_IDENTITY_VERSION,
  OBSERVATION_IDENTITY_VERSION,
  SEED_COMPILER_SCHEMA_VERSION,
} from './contracts';
import {
  compileSeedCorpusInputSchema,
  seedCompilationResultSchema,
  type CompiledIntentCandidate,
  type SeedCompilationResult,
} from './schemas';

const compareText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;
const sha256 = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
const uniqueSorted = (values: readonly string[]): string[] =>
  [...new Set(values)].sort(compareText);
const findOccurrences = (text: string, phrase: string): Array<{ start: number; end: number }> => {
  const spans: Array<{ start: number; end: number }> = [];
  let start = text.indexOf(phrase);
  while (start >= 0) {
    spans.push({ start, end: start + phrase.length });
    start = text.indexOf(phrase, start + phrase.length);
  }
  return spans;
};

export const compileSeedCorpus = (input: unknown): SeedCompilationResult => {
  const { compilerVersion, corpus, dictionary } = compileSeedCorpusInputSchema.parse(input);
  const groups = new Map<string, (typeof corpus.items)[number][]>();
  for (const item of corpus.items) {
    const normalized = normalizeIntentText(item.rawText);
    groups.set(normalized, [...(groups.get(normalized) ?? []), item]);
  }
  const frozenEntries = dictionary.entries.filter((entry) => entry.status === 'FROZEN');
  const candidates: CompiledIntentCandidate[] = [];
  for (const [normalizedText, items] of groups) {
    const matchedRules = frozenEntries
      .flatMap((entry) =>
        findOccurrences(normalizedText, entry.normalizedText).map((matchedSpan) => ({
          termId: entry.termId,
          normalizedPhrase: entry.normalizedText,
          intent: entry.intent,
          defaultStage: entry.defaultStage,
          evidenceStrength: entry.evidenceStrength,
          matchedSpan,
          dictionaryVersionUsed: dictionary.dictionaryVersion,
        })),
      )
      .sort(
        (left, right) =>
          left.matchedSpan.start - right.matchedSpan.start ||
          left.matchedSpan.end - right.matchedSpan.end ||
          compareText(left.termId, right.termId),
      );
    const proposedIntents = [...new Set(matchedRules.map((rule) => rule.intent))].sort(
      (a, b) => REAL_ESTATE_INTENTS.indexOf(a) - REAL_ESTATE_INTENTS.indexOf(b),
    );
    const proposedDefaultStages = [...new Set(matchedRules.map((rule) => rule.defaultStage))].sort(
      (a, b) => INTENT_STAGES.indexOf(a) - INTENT_STAGES.indexOf(b),
    );
    const supportIntents = new Map<string, Set<string>>();
    for (const rule of matchedRules) {
      const key = `${rule.matchedSpan.start}:${rule.matchedSpan.end}:${rule.normalizedPhrase}`;
      const intents = supportIntents.get(key) ?? new Set<string>();
      intents.add(rule.intent);
      supportIntents.set(key, intents);
    }
    const conflicted = [...supportIntents.values()].some((intents) => intents.size > 1);
    const weakOnly =
      matchedRules.length > 0 &&
      matchedRules.every((rule) => rule.evidenceStrength === 'WEAK_TERM');
    const mappingStatus =
      matchedRules.length === 0
        ? 'UNMAPPED'
        : conflicted
          ? 'CONFLICTED'
          : weakOnly
            ? 'AMBIGUOUS'
            : proposedIntents.length > 1
              ? 'MULTI_INTENT'
              : 'MAPPED';
    const canonicalCandidateId = `icand1_${sha256({ identityVersion: CANDIDATE_IDENTITY_VERSION, normalizationVersion: corpus.normalizationVersion, market: corpus.market, locale: corpus.locale, normalizedText })}`;
    const observations = items
      .map((item) => ({
        observationId: `iobs1_${sha256({ observationIdentityVersion: OBSERVATION_IDENTITY_VERSION, compilerVersion, corpusId: corpus.corpusId, corpusVersion: corpus.corpusVersion, source: item.source, sourceArtifactId: item.provenance.sourceArtifactId, seedId: item.seedId, normalizedText })}`,
        seedId: item.seedId,
        rawText: item.rawText,
        normalizedText,
        source: item.source,
        provenance: item.provenance,
        originalOrder: item.originalOrder,
      }))
      .sort((a, b) => compareText(a.observationId, b.observationId));
    candidates.push({
      schemaVersion: SEED_COMPILER_SCHEMA_VERSION,
      compilerVersion,
      canonicalCandidateId,
      normalizedText,
      rawVariants: uniqueSorted(items.map((item) => item.rawText)),
      sourceSeedIds: items.map((item) => item.seedId).sort(compareText),
      observations,
      occurrenceCount: items.length,
      proposedIntents,
      proposedDefaultStages,
      matchedRules,
      mappingExplanations: matchedRules.map(
        (rule) => `${rule.termId}@${rule.matchedSpan.start}:${rule.matchedSpan.end}`,
      ),
      mappingStatus,
      qualityFlags: normalizedText === '' ? ['LOW_INFORMATION'] : [],
      dictionaryVersionUsed: dictionary.dictionaryVersion,
      normalizationVersion: corpus.normalizationVersion,
      source: 'SEED_GENERATED',
      reviewStatus: 'PENDING_REVIEW',
      modifierAssessmentStatus: 'NOT_EVALUATED',
    });
  }
  candidates.sort(
    (a, b) =>
      compareText(a.normalizedText, b.normalizedText) ||
      compareText(a.canonicalCandidateId, b.canonicalCandidateId),
  );
  const count = (status: CompiledIntentCandidate['mappingStatus']) =>
    candidates.filter((candidate) => candidate.mappingStatus === status).length;
  return seedCompilationResultSchema.parse({
    schemaVersion: SEED_COMPILER_SCHEMA_VERSION,
    compilerVersion,
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    candidates,
    statistics: {
      rawCount: corpus.items.length,
      normalizedCount: corpus.items.filter((item) => normalizeIntentText(item.rawText) !== '')
        .length,
      uniqueNormalizedCount: candidates.filter((candidate) => candidate.normalizedText !== '')
        .length,
      duplicateGroupCount: candidates.filter((candidate) => candidate.occurrenceCount > 1).length,
      mappedCount: count('MAPPED'),
      unmappedCount: count('UNMAPPED'),
      ambiguousCount: count('AMBIGUOUS'),
      multiIntentCount: count('MULTI_INTENT'),
      conflictedCount: count('CONFLICTED'),
      lowInformationCount: candidates.filter((candidate) =>
        candidate.qualityFlags.includes('LOW_INFORMATION'),
      ).length,
    },
  });
};
