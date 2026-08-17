import { z } from 'zod';
import { INTENT_STAGES, REAL_ESTATE_INTENTS } from '../real-estate-intent/contracts';
import { intentDictionarySchema } from '../real-estate-intent/schemas';
import {
  CANDIDATE_MAPPING_STATUSES,
  CANDIDATE_QUALITY_FLAGS,
  SEED_COMPILER_SCHEMA_VERSION,
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
    schemaVersion: z.literal(SEED_COMPILER_SCHEMA_VERSION),
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

export const compiledIntentCandidateSchema = z
  .object({
    schemaVersion: z.literal(SEED_COMPILER_SCHEMA_VERSION),
    compilerVersion: versionSchema,
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

export const compileSeedCorpusInputSchema = z
  .object({
    compilerVersion: versionSchema,
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
    compilerVersion: versionSchema,
    corpusId: identifierSchema,
    corpusVersion: versionSchema,
    candidates: z.array(compiledIntentCandidateSchema).readonly(),
    statistics: seedCompilationStatisticsSchema,
  })
  .strict()
  .readonly();

export type CompileSeedCorpusInput = z.infer<typeof compileSeedCorpusInputSchema>;
export type SeedCompilationResult = z.infer<typeof seedCompilationResultSchema>;
export type CompiledIntentCandidate = z.infer<typeof compiledIntentCandidateSchema>;
