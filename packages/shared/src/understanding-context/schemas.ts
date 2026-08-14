import { z } from 'zod';
import { SIGNAL_TYPES } from '../evidence-signal/contracts';
import { evidenceSignalSchema } from '../evidence-signal/schemas';
import {
  UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION,
  UNDERSTANDING_CONTEXT_ERROR_CODES,
  UNDERSTANDING_CONTEXT_SCHEMA_VERSION,
  UNDERSTANDING_RELATION_TYPES,
} from './contracts';

const identifierSchema = z.string().trim().min(1).max(256);
const signalIdSchema = z.string().regex(/^sig1_[a-f0-9]{64}$/u);
const contextIdSchema = z.string().regex(/^ctx1_[a-f0-9]{64}$/u);
const groupKeySchema = z.enum(SIGNAL_TYPES);

export const understandingContextGroupSchema = z
  .object({
    key: groupKeySchema,
    signalIds: z.array(signalIdSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export const understandingContextRelationSchema = z
  .object({
    type: z.enum(UNDERSTANDING_RELATION_TYPES),
    sourceSignalId: signalIdSchema,
    targetGroupKey: groupKeySchema,
  })
  .strict()
  .readonly();

export const understandingContextSchema = z
  .object({
    schemaVersion: z.literal(UNDERSTANDING_CONTEXT_SCHEMA_VERSION),
    contextId: contextIdSchema,
    contextCanonicalizationVersion: z.literal(UNDERSTANDING_CONTEXT_CANONICALIZATION_VERSION),
    sourceSignalIds: z.array(signalIdSchema).min(1).readonly(),
    groups: z.array(understandingContextGroupSchema).min(1).readonly(),
    relations: z.array(understandingContextRelationSchema).min(1).readonly(),
  })
  .strict()
  .readonly();

export const understandingContextInputSchema = z.array(evidenceSignalSchema).readonly();

const assembledResultSchema = z
  .object({
    status: z.literal('ASSEMBLED'),
    context: understandingContextSchema,
  })
  .strict()
  .readonly();

const rejectedResultSchema = z
  .object({
    status: z.literal('REJECTED'),
    code: z.enum(UNDERSTANDING_CONTEXT_ERROR_CODES),
    field: identifierSchema,
  })
  .strict()
  .readonly();

export const understandingContextAssemblyResultSchema = z
  .union([assembledResultSchema, rejectedResultSchema])
  .readonly();

export type UnderstandingContextGroup = z.infer<typeof understandingContextGroupSchema>;
export type UnderstandingContextRelation = z.infer<typeof understandingContextRelationSchema>;
export type UnderstandingContext = z.infer<typeof understandingContextSchema>;
export type UnderstandingContextAssemblyResult = z.infer<
  typeof understandingContextAssemblyResultSchema
>;
