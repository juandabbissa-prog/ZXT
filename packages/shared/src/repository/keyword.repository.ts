/** Frozen Keyword Catalog persistence contracts. They never expose Prisma types. */
export type KeywordId = string;
export type KeywordRole = 'DISCOVERY' | 'CONTEXT' | 'SIGNAL' | 'EXCLUSION';
export type KeywordSource = 'MANUAL' | 'IMPORT' | 'SYSTEM_SUGGESTED' | 'API';
export type KeywordStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED';
export type MatchMode = 'EXACT' | 'PHRASE' | 'CONTAINS';
export type ReferenceStatus = 'ACTIVE' | 'ARCHIVED';

export type Page<T> = Readonly<{ items: readonly T[]; page: number; pageSize: number; total: number }>;
export type PageRequest = Readonly<{ page: number; pageSize: number; sort?: 'UPDATED_AT_DESC' | 'CREATED_AT_DESC' | 'PHRASE_ASC' }>;
export type ConditionalMutationResult<T> = Readonly<{ kind: 'UPDATED'; value: T } | { kind: 'NOT_FOUND' } | { kind: 'VERSION_CONFLICT' } | { kind: 'DELETED' }>;
/** Opaque context supplied by Service-owned transaction orchestration, never Prisma types. */
export type PersistenceTransactionContext = Readonly<{ readonly __persistenceTransaction: unique symbol }>;

export type KeywordRecord = Readonly<{ id: KeywordId; phrase: string; normalizedPhrase: string; categoryId: string; source: KeywordSource; status: KeywordStatus; matchMode: MatchMode; note: string | null; roles: readonly KeywordRole[]; tagIds: readonly string[]; createdAt: Date; updatedAt: Date; archivedAt: Date | null; deletedAt: Date | null }>;
export type KeywordVariantRecord = Readonly<{ id: string; keywordId: KeywordId; phrase: string; normalizedPhrase: string; status: ReferenceStatus; createdAt: Date; updatedAt: Date }>;
export type KeywordCategoryRecord = Readonly<{ id: string; code: string; name: string; parentId: string | null; status: ReferenceStatus; createdAt: Date; updatedAt: Date }>;
export type KeywordTagRecord = Readonly<{ id: string; code: string; name: string; status: ReferenceStatus; createdAt: Date; updatedAt: Date }>;

export type CreateKeywordInput = Readonly<{ phrase: string; normalizedPhrase: string; categoryId: string; source: KeywordSource; matchMode: MatchMode; note?: string; roles: readonly KeywordRole[]; tagIds?: readonly string[]; variants?: readonly Readonly<{ phrase: string; normalizedPhrase: string }>[] }>;
export type UpdateKeywordInput = Readonly<{ expectedUpdatedAt: Date; phrase?: string; normalizedPhrase?: string; categoryId?: string; matchMode?: MatchMode; note?: string | null }>;
export type KeywordListFilter = Readonly<{ status?: KeywordStatus; role?: KeywordRole; categoryId?: string; tagId?: string; source?: KeywordSource; normalizedPhrase?: string }>;

export interface KeywordRepository {
  create(input: CreateKeywordInput, context?: PersistenceTransactionContext): Promise<KeywordRecord>;
  findById(id: KeywordId, context?: PersistenceTransactionContext): Promise<KeywordRecord | null>;
  findByNormalizedPhrase(normalizedPhrase: string, context?: PersistenceTransactionContext): Promise<KeywordRecord | null>;
  list(filter: KeywordListFilter, page: PageRequest, context?: PersistenceTransactionContext): Promise<Page<KeywordRecord>>;
  update(id: KeywordId, input: UpdateKeywordInput, context?: PersistenceTransactionContext): Promise<ConditionalMutationResult<KeywordRecord>>;
  softDelete(id: KeywordId, expectedUpdatedAt: Date, deletedAt: Date, context?: PersistenceTransactionContext): Promise<ConditionalMutationResult<KeywordRecord>>;
  existsByNormalizedPhrase(normalizedPhrase: string, context?: PersistenceTransactionContext): Promise<boolean>;
}

export interface KeywordCategoryRepository {
  create(input: Omit<KeywordCategoryRecord, 'id' | 'createdAt' | 'updatedAt'>, context?: PersistenceTransactionContext): Promise<KeywordCategoryRecord>;
  findById(id: string, context?: PersistenceTransactionContext): Promise<KeywordCategoryRecord | null>;
  list(page: PageRequest, context?: PersistenceTransactionContext): Promise<Page<KeywordCategoryRecord>>;
  update(id: string, expectedUpdatedAt: Date, input: Partial<Pick<KeywordCategoryRecord, 'name' | 'parentId' | 'status'>>, context?: PersistenceTransactionContext): Promise<KeywordCategoryRecord | null>;
  hasChildren(id: string, context?: PersistenceTransactionContext): Promise<boolean>;
  isReferenced(id: string, context?: PersistenceTransactionContext): Promise<boolean>;
  detectCyclePath(id: string, proposedParentId: string | null, context?: PersistenceTransactionContext): Promise<readonly string[] | null>;
}

export interface KeywordTagRepository {
  create(input: Omit<KeywordTagRecord, 'id' | 'createdAt' | 'updatedAt'>, context?: PersistenceTransactionContext): Promise<KeywordTagRecord>;
  findById(id: string, context?: PersistenceTransactionContext): Promise<KeywordTagRecord | null>;
  list(page: PageRequest, context?: PersistenceTransactionContext): Promise<Page<KeywordTagRecord>>;
  update(id: string, expectedUpdatedAt: Date, input: Partial<Pick<KeywordTagRecord, 'name' | 'status'>>, context?: PersistenceTransactionContext): Promise<KeywordTagRecord | null>;
  isReferenced(id: string, context?: PersistenceTransactionContext): Promise<boolean>;
}
