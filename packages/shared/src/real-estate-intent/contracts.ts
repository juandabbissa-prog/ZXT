import type { RealEstateIntentMatchResult } from './schemas';

export const REAL_ESTATE_INTENTS = [
  'PROPERTY_SEARCH',
  'PRICE_CONCERN',
  'PURCHASE_DECISION',
  'FINANCIAL_PREPARATION',
  'BUYING_QUALIFICATION',
  'EDUCATION_NEED',
  'LIFE_STAGE_CHANGE',
  'INVESTMENT_INTENT',
  'HIGH_INTENT_ACTION',
] as const;

export const INTENT_MODIFIERS = [
  'AFFIRMATIVE',
  'QUESTION',
  'NEGATED',
  'RISK_CONCERN',
  'THIRD_PARTY_REFERENCE',
  'DISCUSSION_ONLY',
  'ACTION_REQUEST',
  'AMBIGUOUS',
  'PROMOTIONAL_CONTENT',
  'INFORMATIONAL_REPORTING',
] as const;

export const GLOBAL_SAFETY_MODIFIERS = [
  'NEGATED',
  'THIRD_PARTY_REFERENCE',
  'DISCUSSION_ONLY',
  'PROMOTIONAL_CONTENT',
  'INFORMATIONAL_REPORTING',
] as const;

export const INTENT_STAGES = [
  'CONTEXT_ONLY',
  'AWARENESS',
  'EXPLORING',
  'EVALUATING',
  'PREPARING',
  'ACTION_REQUEST',
] as const;

export const REAL_ESTATE_INTENT_ERROR_CODES = [
  'MISSING_REQUIRED_FIELD',
  'INVALID_INPUT',
  'VERSION_MISMATCH',
  'DUPLICATE_TERM_ID',
  'DUPLICATE_MODIFIER_RULE_ID',
  'SIGNAL_EVIDENCE_MISMATCH',
  'NO_ACTIVE_DICTIONARY_ENTRY',
] as const;

export const INTENT_SCHEMA_VERSION = '1.0.0' as const;
export const INTENT_CANONICALIZATION_VERSION = '1.0.0' as const;
export const INTENT_NORMALIZATION_VERSION = '1.0.0' as const;
export const INTENT_MATCHING_RULE_VERSION = '1.0.0' as const;
export const INTENT_CONFLICT_POLICY_VERSION = '1.0.0' as const;

export type RealEstateIntent = (typeof REAL_ESTATE_INTENTS)[number];
export type IntentModifier = (typeof INTENT_MODIFIERS)[number];
export type IntentStage = (typeof INTENT_STAGES)[number];

export interface RealEstateIntentMatcher {
  match(input: unknown): RealEstateIntentMatchResult;
}
