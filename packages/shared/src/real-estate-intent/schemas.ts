import { z } from 'zod';
import { evidenceEnvelopeSchema } from '../evidence-intake/schemas';
import { evidenceSignalSchema } from '../evidence-signal/schemas';
import {
  INTENT_CANONICALIZATION_VERSION,
  INTENT_CONFLICT_POLICY_VERSION,
  INTENT_MATCHING_RULE_VERSION,
  INTENT_MODIFIERS,
  INTENT_NORMALIZATION_VERSION,
  INTENT_SCHEMA_VERSION,
  INTENT_STAGES,
  REAL_ESTATE_INTENT_ERROR_CODES,
  REAL_ESTATE_INTENTS,
} from './contracts';

const identifierSchema = z.string().trim().min(1).max(160);
const semanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u);
const normalizedTextSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value === value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase(), {
    message: 'Expected canonical intent text',
  });

export const intentDictionaryEntrySchema = z
  .object({
    termId: identifierSchema,
    normalizedText: normalizedTextSchema,
    intent: z.enum(REAL_ESTATE_INTENTS),
    defaultStage: z.enum(INTENT_STAGES),
    allowedModifiers: z.array(z.enum(INTENT_MODIFIERS)).readonly(),
    matchKind: z.literal('LITERAL_PHRASE'),
    evidenceStrength: z.enum(['WEAK_TERM', 'QUALIFIED_PHRASE', 'EXPLICIT_ACTION']),
    upstreamSignalRuleIds: z.array(identifierSchema).readonly(),
    positiveExamples: z.array(z.string().max(500)).readonly(),
    negativeExamples: z.array(z.string().max(500)).readonly(),
    source: z.enum(['SEED_GENERATED', 'OBSERVED_PUBLIC_LANGUAGE', 'MANUAL_CURATED']),
    status: z.enum(['CANDIDATE', 'FROZEN', 'RETIRED']),
  })
  .strict()
  .readonly();

export const intentDictionarySchema = z
  .object({
    dictionaryVersion: semanticVersionSchema,
    locale: z.string().trim().min(2).max(35),
    market: identifierSchema,
    normalizationVersion: semanticVersionSchema.default(INTENT_NORMALIZATION_VERSION),
    matchingRuleVersion: semanticVersionSchema.default(INTENT_MATCHING_RULE_VERSION),
    conflictPolicyVersion: semanticVersionSchema.default(INTENT_CONFLICT_POLICY_VERSION),
    entries: z.array(intentDictionaryEntrySchema).readonly(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const entry of value.entries) {
      if (ids.has(entry.termId)) context.addIssue({ code: 'custom', message: 'Duplicate termId' });
      ids.add(entry.termId);
    }
  })
  .readonly();

export const modifierRuleSchema = z
  .object({
    ruleId: identifierSchema,
    modifier: z.enum(INTENT_MODIFIERS),
    matchKind: z.literal('LITERAL_PHRASE'),
    normalizedPhrases: z.array(normalizedTextSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export const modifierRuleSetSchema = z
  .object({
    modifierRuleVersion: semanticVersionSchema,
    conflictPolicyVersion: semanticVersionSchema.default(INTENT_CONFLICT_POLICY_VERSION),
    scope: z.literal('CLAUSE'),
    rules: z.array(modifierRuleSchema).readonly(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = new Set<string>();
    for (const rule of value.rules) {
      if (ids.has(rule.ruleId))
        context.addIssue({ code: 'custom', message: 'Duplicate modifier ruleId' });
      ids.add(rule.ruleId);
    }
  })
  .readonly();

export const realEstateIntentMatchInputSchema = z
  .object({
    evidence: evidenceEnvelopeSchema,
    signals: z
      .array(evidenceSignalSchema)
      .superRefine((signals, context) => {
        const ids = new Set<string>();
        for (const signal of signals) {
          if (ids.has(signal.signalId)) {
            context.addIssue({ code: 'custom', message: 'Duplicate signalId' });
          }
          ids.add(signal.signalId);
        }
      })
      .readonly(),
    dictionary: intentDictionarySchema,
    modifierRuleSet: modifierRuleSetSchema,
  })
  .strict()
  .readonly();

export const intentMatchSchema = z
  .object({
    intent: z.enum(REAL_ESTATE_INTENTS),
    clauseIndex: z.number().int().nonnegative(),
    stage: z.enum(INTENT_STAGES),
    modifiers: z.array(z.enum(INTENT_MODIFIERS)).readonly(),
    matchedRuleIds: z.array(identifierSchema).min(1).readonly(),
    evidenceIds: z
      .array(z.string().regex(/^ev1_[a-f0-9]{64}$/u))
      .min(1)
      .readonly(),
    signalIds: z.array(z.string().regex(/^sig1_[a-f0-9]{64}$/u)).readonly(),
    dictionaryVersion: semanticVersionSchema,
    matchingRuleVersion: semanticVersionSchema,
    modifierRuleVersion: semanticVersionSchema,
  })
  .strict()
  .readonly();

export const intentContextSchema = z
  .object({
    schemaVersion: z.literal(INTENT_SCHEMA_VERSION),
    contextId: z.string().regex(/^ictx1_[a-f0-9]{64}$/u),
    canonicalizationVersion: z.literal(INTENT_CANONICALIZATION_VERSION),
    dictionaryVersion: semanticVersionSchema,
    normalizationVersion: semanticVersionSchema,
    matchingRuleVersion: semanticVersionSchema,
    modifierRuleVersion: semanticVersionSchema,
    dictionaryConflictPolicyVersion: semanticVersionSchema,
    modifierConflictPolicyVersion: semanticVersionSchema,
    sourceEvidenceId: z.string().regex(/^ev1_[a-f0-9]{64}$/u),
    sourceSignalIds: z.array(z.string().regex(/^sig1_[a-f0-9]{64}$/u)).readonly(),
    matches: z.array(intentMatchSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export const realEstateIntentMatchResultSchema = z
  .union([
    z
      .object({ status: z.literal('MATCHED'), context: intentContextSchema })
      .strict()
      .readonly(),
    z
      .object({ status: z.literal('NO_MATCH') })
      .strict()
      .readonly(),
    z
      .object({
        status: z.literal('REJECTED'),
        code: z.enum(REAL_ESTATE_INTENT_ERROR_CODES),
        field: identifierSchema,
      })
      .strict()
      .readonly(),
  ])
  .readonly();

export type IntentDictionaryEntry = z.infer<typeof intentDictionaryEntrySchema>;
export type IntentDictionary = z.infer<typeof intentDictionarySchema>;
export type ModifierRuleSet = z.infer<typeof modifierRuleSetSchema>;
export type RealEstateIntentMatchInput = z.infer<typeof realEstateIntentMatchInputSchema>;
export type IntentMatch = z.infer<typeof intentMatchSchema>;
export type IntentContext = z.infer<typeof intentContextSchema>;
export type RealEstateIntentMatchResult = z.infer<typeof realEstateIntentMatchResultSchema>;
