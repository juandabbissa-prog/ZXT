import type { Page, PageRequest, PersistenceTransactionContext } from './persistence';

export type ContentSignalType = 'DEMAND' | 'PAIN_POINT' | 'PREFERENCE' | 'OBJECTION' | 'INTENT';
export type ContentSignalStatus = 'ACTIVE' | 'ARCHIVED';
export type SignalSourceType = 'MANUAL' | 'IMPORT' | 'AUTHORIZED_API' | 'SYSTEM';
export type SignalEvidenceType = 'TEXT' | 'URL' | 'METRIC' | 'OBSERVATION';
export type SignalEvidenceStatus = 'AVAILABLE' | 'REDACTED';

export type SignalSource = Readonly<{
  type: SignalSourceType;
  reference: string | null;
  description: string | null;
}>;

export type SignalEvidenceRecord = Readonly<{
  id: string;
  contentSignalId: string;
  type: SignalEvidenceType;
  status: SignalEvidenceStatus;
  content: string;
  referenceUrl: string | null;
  observedAt: Date;
  createdAt: Date;
}>;

export type ContentSignalRecord = Readonly<{
  id: string;
  anchorId: string;
  keywordId: string | null;
  type: ContentSignalType;
  summary: string;
  source: SignalSource;
  evidence: readonly SignalEvidenceRecord[];
  confidence: number;
  confidenceRationale: string;
  occurredAt: Date | null;
  observedAt: Date;
  status: ContentSignalStatus;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}>;

export type CreateContentSignalInput = Readonly<{
  anchorId: string;
  keywordId: string | null;
  type: ContentSignalType;
  summary: string;
  normalizedSummary: string;
  source: SignalSource;
  evidence: readonly Omit<SignalEvidenceRecord, 'id' | 'contentSignalId' | 'createdAt'>[];
  confidence: number;
  confidenceRationale: string;
  occurredAt: Date | null;
  observedAt: Date;
  status: 'ACTIVE';
}>;

export type ContentSignalListFilter = Readonly<{
  anchorId: string;
  type?: ContentSignalType;
  status?: ContentSignalStatus;
  observedFrom?: Date;
  observedTo?: Date;
}>;

export type ContentSignalDuplicateFilter = Readonly<{
  anchorId: string;
  type: ContentSignalType;
  normalizedSummary: string;
  occurredAt: Date | null;
}>;

export interface ContentSignalRepository {
  create(
    input: CreateContentSignalInput,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord>;
  findById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null>;
  findByAnchor(
    filter: ContentSignalListFilter,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<ContentSignalRecord>>;
  findDuplicate(
    filter: ContentSignalDuplicateFilter,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null>;
  updateStatus(
    id: string,
    status: ContentSignalStatus,
    archivedAt: Date | null,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null>;
}
