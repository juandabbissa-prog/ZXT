import { z } from 'zod';
import { EVIDENCE_TYPES } from '../evidence-intake/contracts';
import { evidenceEnvelopeSchema } from '../evidence-intake/schemas';
import {
  EVIDENCE_SIGNAL_ERROR_CODES,
  SIGNAL_CANONICALIZATION_VERSION,
  SIGNAL_RULE_VERSION,
  SIGNAL_SCHEMA_VERSION,
  SIGNAL_TYPES,
} from './contracts';

const identifierSchema = z.string().trim().min(1).max(160);
const semanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/u, 'Expected a semantic version');
const evidenceIdSchema = z.string().regex(/^ev1_[a-f0-9]{64}$/u);
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const signalIdSchema = z.string().regex(/^sig1_[a-f0-9]{64}$/u);
const normalizedNonEmptyTextSchema = z
  .string()
  .max(10_000)
  .refine((value) => value.normalize('NFC').trim().length > 0, {
    message: 'Expected non-empty normalized text',
  });
const normalizedSignalValueSchema = normalizedNonEmptyTextSchema.refine(
  (value) => value === value.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase(),
  { message: 'Expected canonical Signal text' },
);

export const evidenceSignalSchema = z
  .object({
    schemaVersion: z.literal(SIGNAL_SCHEMA_VERSION),
    signalId: signalIdSchema,
    signalCanonicalizationVersion: z.literal(SIGNAL_CANONICALIZATION_VERSION),
    signalType: z.enum(SIGNAL_TYPES),
    value: normalizedSignalValueSchema,
    sourceEvidenceId: evidenceIdSchema,
    sourceFingerprint: fingerprintSchema,
    ruleId: identifierSchema,
    ruleVersion: z.literal(SIGNAL_RULE_VERSION),
  })
  .strict()
  .readonly();

export const evidenceSignalRuleSchema = z
  .object({
    ruleId: identifierSchema,
    ruleVersion: z.literal(SIGNAL_RULE_VERSION),
    signalType: z.enum(SIGNAL_TYPES),
    applicableEvidenceTypes: z.array(z.enum(EVIDENCE_TYPES)).min(1).readonly(),
    matcher: z
      .object({
        operator: z.literal('CONTAINS_NORMALIZED_TEXT'),
        value: normalizedNonEmptyTextSchema,
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();

export const evidenceSignalRuleSetSchema = z
  .object({
    ruleSetVersion: semanticVersionSchema,
    rules: z.array(evidenceSignalRuleSchema).readonly(),
  })
  .strict()
  .readonly();

export const evidenceSignalProjectionInputSchema = z
  .object({
    evidence: evidenceEnvelopeSchema,
    ruleSet: evidenceSignalRuleSetSchema,
  })
  .strict()
  .readonly();

const derivedProjectionResultSchema = z
  .object({
    status: z.literal('DERIVED'),
    signals: z.array(evidenceSignalSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

const noSignalProjectionResultSchema = z
  .object({
    status: z.literal('NO_SIGNAL'),
    signals: z.tuple([]).readonly(),
  })
  .strict()
  .readonly();

const rejectedProjectionResultSchema = z
  .object({
    status: z.literal('REJECTED'),
    code: z.enum(EVIDENCE_SIGNAL_ERROR_CODES),
    field: identifierSchema,
  })
  .strict()
  .readonly();

export const evidenceSignalProjectionResultSchema = z
  .union([
    derivedProjectionResultSchema,
    noSignalProjectionResultSchema,
    rejectedProjectionResultSchema,
  ])
  .readonly();

export type EvidenceSignal = z.infer<typeof evidenceSignalSchema>;
export type EvidenceSignalRule = z.infer<typeof evidenceSignalRuleSchema>;
export type EvidenceSignalRuleSet = z.infer<typeof evidenceSignalRuleSetSchema>;
export type EvidenceSignalProjectionInput = z.infer<typeof evidenceSignalProjectionInputSchema>;
export type EvidenceSignalProjectionResult = z.infer<typeof evidenceSignalProjectionResultSchema>;
