import { z } from 'zod';
import { INTENT_STAGES, REAL_ESTATE_INTENTS } from '../real-estate-intent/contracts';
import { intentDictionarySchema } from '../real-estate-intent/schemas';
import {
  CANDIDATE_EVIDENCE_ROLES,
  CANDIDATE_MAPPING_STATUSES,
  CANDIDATE_QUALITY_FLAGS,
  CANDIDATE_RESOLUTION_REASON_CODES,
  DERIVED_SUPPORT_COMPOSITION_TYPES,
  SEED_CORPUS_SCHEMA_VERSION,
  SEED_COMPILER_SCHEMA_VERSION,
  SEED_COMPILER_VERSION,
} from './contracts';

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const identifierSchema = z.string().trim().min(1).max(160);

export const seedProvenanceSchema = z
  .object({
    sourceReference: z.string().min(1).nullable(),
    sourceArtifactId: identifierSchema,
    generationMethod: identifierSchema,
  })
  .strict()
  .readonly();

export const rawSeedItemSchema = z
  .object({
    seedId: identifierSchema,
    rawText: z.string().max(500),
    source: z.literal('SEED_GENERATED'),
    provenance: seedProvenanceSchema,
    originalOrder: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const seedCorpusSchema = z
  .object({
    schemaVersion: z.literal(SEED_CORPUS_SCHEMA_VERSION),
    corpusId: identifierSchema,
    corpusVersion: versionSchema,
    source: z.literal('SEED_GENERATED'),
    market: identifierSchema,
    locale: z.string().trim().min(2).max(35),
    normalizationVersion: versionSchema,
    items: z
      .array(rawSeedItemSchema)
      .superRefine((items, context) => {
        const ids = new Set<string>();
        for (const item of items) {
          if (ids.has(item.seedId))
            context.addIssue({ code: 'custom', message: 'Duplicate seedId' });
          ids.add(item.seedId);
        }
      })
      .readonly(),
  })
  .strict()
  .readonly();

export const seedObservationSchema = z
  .object({
    observationId: z.string().regex(/^iobs1_[a-f0-9]{64}$/u),
    seedId: identifierSchema,
    rawText: z.string().max(500),
    normalizedText: z.string().max(500),
    source: z.literal('SEED_GENERATED'),
    provenance: seedProvenanceSchema,
    originalOrder: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const referenceMatchSchema = z
  .object({
    termId: identifierSchema,
    normalizedPhrase: z.string().min(1).max(500),
    intent: z.enum(REAL_ESTATE_INTENTS),
    defaultStage: z.enum(INTENT_STAGES),
    evidenceStrength: z.enum(['WEAK_TERM', 'QUALIFIED_PHRASE', 'EXPLICIT_ACTION']),
    matchedSpan: z
      .object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })
      .strict()
      .readonly(),
    dictionaryVersionUsed: versionSchema,
  })
  .strict()
  .readonly();

export const derivedIntentSupportSchema = z
  .object({
    supportId: z.string().regex(/^dsup1_[a-f0-9]{64}$/u),
    compositionType: z.enum(DERIVED_SUPPORT_COMPOSITION_TYPES),
    intent: z.enum(REAL_ESTATE_INTENTS),
    target: z.string().min(1).max(500),
    operator: z.string().min(1).max(500),
    matchedSpan: z
      .object({ start: z.number().int().nonnegative(), end: z.number().int().positive() })
      .strict()
      .refine((span) => span.end > span.start)
      .readonly(),
  })
  .strict()
  .readonly();

export const candidateIntentResolutionSchema = z
  .object({
    intent: z.enum(REAL_ESTATE_INTENTS),
    role: z.enum(CANDIDATE_EVIDENCE_ROLES),
    supportingTermIds: z.array(identifierSchema).readonly(),
    derivedSupportIds: z.array(z.string().regex(/^dsup1_[a-f0-9]{64}$/u)).readonly(),
    reasonCodes: z.array(z.enum(CANDIDATE_RESOLUTION_REASON_CODES)).min(1).readonly(),
  })
  .strict()
  .readonly();

const legacyCompiledIntentCandidateSchema = z
  .object({
    schemaVersion: z.literal('1.0.0'),
    compilerVersion: z.literal('1.0.0'),
    canonicalCandidateId: z.string().regex(/^icand1_[a-f0-9]{64}$/u),
    normalizedText: z.string().max(500),
    rawVariants: z.array(z.string().max(500)).readonly(),
    sourceSeedIds: z.array(identifierSchema).readonly(),
    observations: z.array(seedObservationSchema).readonly(),
    occurrenceCount: z.number().int().positive(),
    proposedIntents: z.array(z.enum(REAL_ESTATE_INTENTS)).readonly(),
    proposedDefaultStages: z.array(z.enum(INTENT_STAGES)).readonly(),
    matchedRules: z.array(referenceMatchSchema).readonly(),
    mappingExplanations: z.array(z.string().min(1)).readonly(),
    mappingStatus: z.enum(CANDIDATE_MAPPING_STATUSES),
    qualityFlags: z.array(z.enum(CANDIDATE_QUALITY_FLAGS)).readonly(),
    dictionaryVersionUsed: versionSchema,
    normalizationVersion: versionSchema,
    source: z.literal('SEED_GENERATED'),
    reviewStatus: z.literal('PENDING_REVIEW'),
    modifierAssessmentStatus: z.literal('NOT_EVALUATED'),
  })
  .strict()
  .readonly();

const compiledIntentCandidateV11Schema = z
  .object({
    schemaVersion: z.literal(SEED_COMPILER_SCHEMA_VERSION),
    compilerVersion: z.literal(SEED_COMPILER_VERSION),
    canonicalCandidateId: z.string().regex(/^icand1_[a-f0-9]{64}$/u),
    normalizedText: z.string().max(500),
    rawVariants: z.array(z.string().max(500)).readonly(),
    sourceSeedIds: z.array(identifierSchema).readonly(),
    observations: z.array(seedObservationSchema).readonly(),
    occurrenceCount: z.number().int().positive(),
    proposedIntents: z.array(z.enum(REAL_ESTATE_INTENTS)).readonly(),
    proposedDefaultStages: z.array(z.enum(INTENT_STAGES)).readonly(),
    matchedRules: z.array(referenceMatchSchema).readonly(),
    mappingExplanations: z.array(z.string().min(1)).readonly(),
    primaryIntents: z.array(z.enum(REAL_ESTATE_INTENTS)).readonly(),
    traceIntents: z.array(z.enum(REAL_ESTATE_INTENTS)).readonly(),
    derivedSupports: z.array(derivedIntentSupportSchema).readonly(),
    intentResolutions: z.array(candidateIntentResolutionSchema).readonly(),
    mappingStatus: z.enum(CANDIDATE_MAPPING_STATUSES),
    qualityFlags: z.array(z.enum(CANDIDATE_QUALITY_FLAGS)).readonly(),
    dictionaryVersionUsed: versionSchema,
    normalizationVersion: versionSchema,
    source: z.literal('SEED_GENERATED'),
    reviewStatus: z.literal('PENDING_REVIEW'),
    modifierAssessmentStatus: z.literal('NOT_EVALUATED'),
  })
  .strict()
  .superRefine((candidate, context) => {
    const add = (message: string, path: Array<string | number> = []) =>
      context.addIssue({ code: 'custom', message, path });
    const unique = (values: readonly string[]) => new Set(values).size === values.length;
    if (!unique(candidate.primaryIntents)) add('Duplicate primary intent', ['primaryIntents']);
    if (!unique(candidate.traceIntents)) add('Duplicate trace intent', ['traceIntents']);
    if (!unique(candidate.proposedIntents)) add('Duplicate proposed intent', ['proposedIntents']);
    if (!unique(candidate.derivedSupports.map((support) => support.supportId)))
      add('Duplicate derived supportId', ['derivedSupports']);

    const resolutionIntents = candidate.intentResolutions.map((resolution) => resolution.intent);
    if (!unique(resolutionIntents)) add('Duplicate intent resolution', ['intentResolutions']);

    const primaryFromResolutions = candidate.intentResolutions
      .filter((resolution) => resolution.role === 'PRIMARY')
      .map((resolution) => resolution.intent);
    const traceFromResolutions = candidate.intentResolutions
      .filter((resolution) => resolution.role === 'TRACE')
      .map((resolution) => resolution.intent);
    if (JSON.stringify(primaryFromResolutions) !== JSON.stringify(candidate.primaryIntents))
      add('primaryIntents must equal PRIMARY resolutions', ['primaryIntents']);
    if (JSON.stringify(traceFromResolutions) !== JSON.stringify(candidate.traceIntents))
      add('traceIntents must equal TRACE resolutions', ['traceIntents']);
    if (JSON.stringify(candidate.proposedIntents) !== JSON.stringify(candidate.primaryIntents))
      add('proposedIntents must equal primaryIntents', ['proposedIntents']);

    const termsById = new Map(candidate.matchedRules.map((rule) => [rule.termId, rule]));
    const derivedById = new Map(
      candidate.derivedSupports.map((support) => [support.supportId, support]),
    );
    for (const [index, resolution] of candidate.intentResolutions.entries()) {
      if (!unique(resolution.supportingTermIds))
        add('Duplicate supporting termId', ['intentResolutions', index, 'supportingTermIds']);
      if (!unique(resolution.derivedSupportIds))
        add('Duplicate derived supportId', ['intentResolutions', index, 'derivedSupportIds']);
      const termSupports = resolution.supportingTermIds.map((id) => termsById.get(id));
      const derivedSupports = resolution.derivedSupportIds.map((id) => derivedById.get(id));
      if (termSupports.some((support) => support === undefined))
        add('Unknown supporting termId', ['intentResolutions', index, 'supportingTermIds']);
      if (derivedSupports.some((support) => support === undefined))
        add('Unknown derived supportId', ['intentResolutions', index, 'derivedSupportIds']);
      if (
        termSupports.some(
          (support) => support !== undefined && support.intent !== resolution.intent,
        )
      )
        add('Term intent must match resolution intent', ['intentResolutions', index]);
      if (
        derivedSupports.some(
          (support) => support !== undefined && support.intent !== resolution.intent,
        )
      )
        add('Derived support intent must match resolution intent', ['intentResolutions', index]);
      if (
        resolution.role === 'PRIMARY' &&
        !termSupports.some(
          (support) => support !== undefined && support.evidenceStrength !== 'WEAK_TERM',
        ) &&
        derivedSupports.length === 0
      )
        add('PRIMARY requires non-weak or derived support', ['intentResolutions', index]);
    }

    const primaryCount = candidate.primaryIntents.length;
    const evidenceCount = candidate.matchedRules.length + candidate.derivedSupports.length;
    if (candidate.mappingStatus === 'MAPPED' && primaryCount !== 1)
      add('MAPPED requires exactly one primary', ['mappingStatus']);
    if (candidate.mappingStatus === 'MULTI_INTENT' && primaryCount < 2)
      add('MULTI_INTENT requires at least two primaries', ['mappingStatus']);
    if (candidate.mappingStatus === 'AMBIGUOUS' && (primaryCount !== 0 || evidenceCount === 0))
      add('AMBIGUOUS requires evidence and zero primaries', ['mappingStatus']);
    if (
      candidate.mappingStatus === 'UNMAPPED' &&
      (primaryCount !== 0 || candidate.traceIntents.length !== 0 || evidenceCount !== 0)
    )
      add('UNMAPPED cannot contain evidence or intent roles', ['mappingStatus']);
    if (candidate.mappingStatus === 'CONFLICTED' && primaryCount !== 0)
      add('CONFLICTED cannot publish primary intents', ['mappingStatus']);
  })
  .readonly();

export const compiledIntentCandidateSchema = z
  .union([legacyCompiledIntentCandidateSchema, compiledIntentCandidateV11Schema])
  .readonly();

export const compileSeedCorpusInputSchema = z
  .object({
    compilerVersion: z.literal(SEED_COMPILER_VERSION),
    corpus: seedCorpusSchema,
    dictionary: intentDictionarySchema,
  })
  .strict()
  .superRefine(({ corpus, dictionary }, context) => {
    for (const field of ['market', 'locale', 'normalizationVersion'] as const) {
      if (corpus[field] !== dictionary[field])
        context.addIssue({
          code: 'custom',
          path: ['dictionary', field],
          message: `Dictionary ${field} must match SeedCorpus ${field}`,
        });
    }
  })
  .readonly();

export const seedCompilationStatisticsSchema = z
  .object({
    rawCount: z.number().int().nonnegative(),
    normalizedCount: z.number().int().nonnegative(),
    uniqueNormalizedCount: z.number().int().nonnegative(),
    duplicateGroupCount: z.number().int().nonnegative(),
    mappedCount: z.number().int().nonnegative(),
    unmappedCount: z.number().int().nonnegative(),
    ambiguousCount: z.number().int().nonnegative(),
    multiIntentCount: z.number().int().nonnegative(),
    conflictedCount: z.number().int().nonnegative(),
    lowInformationCount: z.number().int().nonnegative(),
  })
  .strict()
  .readonly();

export const seedCompilationResultSchema = z
  .object({
    schemaVersion: z.literal(SEED_COMPILER_SCHEMA_VERSION),
    compilerVersion: z.literal(SEED_COMPILER_VERSION),
    corpusId: identifierSchema,
    corpusVersion: versionSchema,
    candidates: z.array(compiledIntentCandidateV11Schema).readonly(),
    statistics: seedCompilationStatisticsSchema,
  })
  .strict()
  .readonly();

export type CompileSeedCorpusInput = z.infer<typeof compileSeedCorpusInputSchema>;
export type SeedCompilationResult = z.infer<typeof seedCompilationResultSchema>;
export type CompiledIntentCandidate = z.infer<typeof compiledIntentCandidateV11Schema>;
export type DerivedIntentSupport = z.infer<typeof derivedIntentSupportSchema>;
export type CandidateIntentResolution = z.infer<typeof candidateIntentResolutionSchema>;
