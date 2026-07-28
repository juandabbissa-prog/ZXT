import {
  AppError,
  type CreateKeywordInput,
  type KeywordCategoryRepository,
  type KeywordListFilter,
  type KeywordRecord,
  type KeywordRepository,
  type KeywordRole,
  type KeywordSource,
  type KeywordStatus,
  type KeywordTagRepository,
  type MatchMode,
  type Page,
  type PageRequest,
  type PersistenceTransactionContext,
  ValidationError,
} from '@re-agent/shared';
import { KeywordPersistenceError } from '../../infrastructure/persistence/keyword-persistence-error';

const sources = new Set<KeywordSource>(['MANUAL', 'IMPORT', 'SYSTEM_SUGGESTED', 'API']);
const matchModes = new Set<MatchMode>(['EXACT', 'PHRASE', 'CONTAINS']);
const statuses = new Set<KeywordStatus>(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED']);

function isKeywordRole(value: unknown): value is KeywordRole {
  return (
    value === 'DISCOVERY' || value === 'CONTEXT' || value === 'SIGNAL' || value === 'EXCLUSION'
  );
}

export type KeywordTransactionRunner = Readonly<{
  run<T>(operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}>;

export type CreateKeywordCommand = Readonly<{
  phrase: string;
  categoryId: string;
  roles: readonly KeywordRole[];
  source?: KeywordSource;
  matchMode?: MatchMode;
  note?: string;
  tagIds?: readonly string[];
  variants?: readonly Readonly<{ phrase: string }>[];
}>;
export type ListKeywordsQuery = Readonly<{
  page?: number;
  pageSize?: number;
  status?: KeywordStatus;
  categoryId?: string;
}>;
export type UpdateKeywordCommand = Readonly<{
  id: string;
  expectedUpdatedAt: Date;
  phrase?: string;
  categoryId?: string;
  matchMode?: MatchMode;
  note?: string | null;
}>;
export type ChangeKeywordStatusCommand = Readonly<{
  id: string;
  expectedUpdatedAt: Date;
  status: Exclude<KeywordStatus, 'DELETED'>;
}>;
export type DeleteKeywordCommand = Readonly<{ id: string; expectedUpdatedAt: Date }>;

export class KeywordServiceError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, { statusCode, code, expose: true });
  }
}

/** Service boundary: it consumes opaque repository contracts and never a database client. */
export class KeywordService {
  constructor(
    private readonly keywords: KeywordRepository,
    private readonly categories: KeywordCategoryRepository,
    private readonly tags: KeywordTagRepository,
    private readonly transactions: KeywordTransactionRunner,
  ) {}

  async create(command: CreateKeywordCommand): Promise<KeywordRecord> {
    const input = this.toCreateInput(command);
    return this.execute(async (context) => {
      await this.assertActiveCategory(input.categoryId, context);
      await this.assertActiveTags(input.tagIds ?? [], context);
      if (await this.keywords.existsByNormalizedPhrase(input.normalizedPhrase, context)) {
        throw new KeywordServiceError('Keyword phrase already exists.', 409, 'KEYWORD_DUPLICATE');
      }
      return this.keywords.create(input, context);
    });
  }

  async get(id: string): Promise<KeywordRecord> {
    const keyword = await this.execute((context) =>
      this.keywords.findById(this.requireId(id, 'id'), context),
    );
    if (!keyword) throw new KeywordServiceError('Keyword was not found.', 404, 'NOT_FOUND');
    return keyword;
  }

  async list(query: ListKeywordsQuery = {}): Promise<Page<KeywordRecord>> {
    const page: PageRequest = {
      page: this.requirePositiveInteger(query.page ?? 1, 'page'),
      pageSize: this.requirePageSize(query.pageSize ?? 20),
    };
    const filter: KeywordListFilter = {
      ...(query.status ? { status: this.requireStatus(query.status) } : {}),
      ...(query.categoryId ? { categoryId: this.requireId(query.categoryId, 'categoryId') } : {}),
    };
    return this.execute((context) => this.keywords.list(filter, page, context));
  }

  async update(command: UpdateKeywordCommand): Promise<KeywordRecord> {
    const id = this.requireId(command.id, 'id');
    const expectedUpdatedAt = this.requireDate(command.expectedUpdatedAt, 'expectedUpdatedAt');
    if (
      !command.phrase &&
      !command.categoryId &&
      !command.matchMode &&
      command.note === undefined
    ) {
      throw new ValidationError('At least one mutable Keyword field is required.');
    }
    return this.execute(async (context) => {
      const input = {
        expectedUpdatedAt,
        ...(command.phrase !== undefined ? this.toPhraseFields(command.phrase) : {}),
        ...(command.categoryId
          ? { categoryId: this.requireId(command.categoryId, 'categoryId') }
          : {}),
        ...(command.matchMode ? { matchMode: this.requireMatchMode(command.matchMode) } : {}),
        ...(command.note !== undefined ? { note: this.normalizeNote(command.note) } : {}),
      };
      if (input.categoryId) await this.assertActiveCategory(input.categoryId, context);
      if (input.normalizedPhrase)
        await this.assertPhraseAvailable(id, input.normalizedPhrase, context);
      return this.requireMutation(await this.keywords.update(id, input, context));
    });
  }

  async changeStatus(command: ChangeKeywordStatusCommand): Promise<KeywordRecord> {
    const id = this.requireId(command.id, 'id');
    const expectedUpdatedAt = this.requireDate(command.expectedUpdatedAt, 'expectedUpdatedAt');
    const requestedStatus = this.requireStatus(command.status);
    if (requestedStatus === 'DELETED') {
      throw new ValidationError('Use soft delete instead of a DELETED status transition.');
    }
    const status: Exclude<KeywordStatus, 'DELETED'> = requestedStatus;
    return this.execute(async (context) => {
      const current = await this.keywords.findById(id, context);
      if (!current) throw new KeywordServiceError('Keyword was not found.', 404, 'NOT_FOUND');
      if (!this.isAllowedTransition(current.status, status)) {
        throw new KeywordServiceError(
          'Keyword status transition is not allowed.',
          409,
          'INVALID_STATE_TRANSITION',
        );
      }
      return this.requireMutation(
        await this.keywords.update(
          id,
          { expectedUpdatedAt, status, archivedAt: status === 'ARCHIVED' ? new Date() : null },
          context,
        ),
      );
    });
  }

  async softDelete(command: DeleteKeywordCommand): Promise<KeywordRecord> {
    const id = this.requireId(command.id, 'id');
    const expectedUpdatedAt = this.requireDate(command.expectedUpdatedAt, 'expectedUpdatedAt');
    return this.execute((context) =>
      this.keywords
        .softDelete(id, expectedUpdatedAt, new Date(), context)
        .then((result) => this.requireMutation(result)),
    );
  }

  private async execute<T>(
    operation: (context: PersistenceTransactionContext) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run(operation);
    } catch (error) {
      if (error instanceof KeywordPersistenceError) throw this.mapPersistenceError(error);
      if (error instanceof AppError) throw error;
      throw new AppError('Keyword service operation failed.');
    }
  }

  private toCreateInput(command: CreateKeywordCommand): CreateKeywordInput {
    const phrase = this.requirePhrase(command.phrase);
    const tagIds = this.uniqueIds(command.tagIds ?? [], 'tagIds');
    const variants = (command.variants ?? []).map(({ phrase: value }) => {
      const variantPhrase = this.requirePhrase(value);
      return { phrase: variantPhrase, normalizedPhrase: normalizeKeywordPhrase(variantPhrase) };
    });
    const normalizedPhrase = normalizeKeywordPhrase(phrase);
    if (variants.some((variant) => variant.normalizedPhrase === normalizedPhrase)) {
      throw new ValidationError('A variant cannot duplicate its Keyword phrase.');
    }
    if (new Set(variants.map((variant) => variant.normalizedPhrase)).size !== variants.length) {
      throw new ValidationError('Keyword variants must be unique.');
    }
    return {
      phrase,
      normalizedPhrase,
      categoryId: this.requireId(command.categoryId, 'categoryId'),
      source: this.requireSource(command.source ?? 'MANUAL'),
      matchMode: this.requireMatchMode(command.matchMode ?? 'EXACT'),
      ...(command.note !== undefined
        ? { note: this.normalizeNote(command.note) ?? undefined }
        : {}),
      roles: this.requireRoles(command.roles),
      ...(tagIds.length ? { tagIds } : {}),
      ...(variants.length ? { variants } : {}),
    };
  }

  private async assertPhraseAvailable(
    id: string,
    normalizedPhrase: string,
    context: PersistenceTransactionContext,
  ) {
    const existing = await this.keywords.findByNormalizedPhrase(normalizedPhrase, context);
    if (existing && existing.id !== id)
      throw new KeywordServiceError('Keyword phrase already exists.', 409, 'KEYWORD_DUPLICATE');
  }

  private async assertActiveCategory(id: string, context: PersistenceTransactionContext) {
    const category = await this.categories.findById(id, context);
    if (!category || category.status !== 'ACTIVE') {
      throw new KeywordServiceError(
        'Keyword category must exist and be active.',
        400,
        'VALIDATION_ERROR',
      );
    }
  }

  private async assertActiveTags(ids: readonly string[], context: PersistenceTransactionContext) {
    for (const id of ids) {
      const tag = await this.tags.findById(id, context);
      if (!tag || tag.status !== 'ACTIVE') {
        throw new KeywordServiceError(
          'Keyword tag must exist and be active.',
          400,
          'VALIDATION_ERROR',
        );
      }
    }
  }

  private requireMutation(result: Awaited<ReturnType<KeywordRepository['update']>>): KeywordRecord {
    if (result.kind === 'UPDATED') return result.value;
    if (result.kind === 'VERSION_CONFLICT')
      throw new KeywordServiceError(
        'Keyword was changed by another operation.',
        409,
        'VERSION_CONFLICT',
      );
    throw new KeywordServiceError('Keyword was not found.', 404, 'NOT_FOUND');
  }

  private mapPersistenceError(error: KeywordPersistenceError): AppError {
    if (error.kind === 'UNIQUE')
      return new KeywordServiceError('Keyword phrase already exists.', 409, 'KEYWORD_DUPLICATE');
    if (error.kind === 'FOREIGN_KEY')
      return new KeywordServiceError('Keyword reference does not exist.', 400, 'VALIDATION_ERROR');
    return new AppError('Keyword operation could not be completed.');
  }

  private isAllowedTransition(from: KeywordStatus, to: Exclude<KeywordStatus, 'DELETED'>): boolean {
    if (from === to || from === 'DELETED') return false;
    return (
      (from === 'DRAFT' && (to === 'ACTIVE' || to === 'PAUSED' || to === 'ARCHIVED')) ||
      (from === 'ACTIVE' && (to === 'PAUSED' || to === 'ARCHIVED')) ||
      (from === 'PAUSED' && (to === 'ACTIVE' || to === 'ARCHIVED'))
    );
  }

  private requirePhrase(value: string): string {
    if (typeof value !== 'string') throw new ValidationError('Keyword phrase is required.');
    const phrase = value.trim();
    if (phrase.length < 1 || phrase.length > 120)
      throw new ValidationError('Keyword phrase must contain between 1 and 120 characters.');
    return phrase;
  }

  private toPhraseFields(phrase: string) {
    const value = this.requirePhrase(phrase);
    return { phrase: value, normalizedPhrase: normalizeKeywordPhrase(value) };
  }

  private requireRoles(value: unknown): readonly KeywordRole[] {
    if (!Array.isArray(value) || value.length === 0)
      throw new ValidationError('At least one Keyword role is required.');
    const roleValues: unknown[] = value;
    if (!roleValues.every(isKeywordRole)) throw new ValidationError('Keyword role is invalid.');
    if (new Set(roleValues).size !== roleValues.length)
      throw new ValidationError('Keyword roles must be unique.');
    return roleValues;
  }

  private requireSource(value: KeywordSource): KeywordSource {
    if (!sources.has(value)) throw new ValidationError('Keyword source is invalid.');
    return value;
  }

  private requireMatchMode(value: MatchMode): MatchMode {
    if (!matchModes.has(value)) throw new ValidationError('Keyword match mode is invalid.');
    return value;
  }

  private requireStatus(value: KeywordStatus): KeywordStatus {
    if (!statuses.has(value)) throw new ValidationError('Keyword status is invalid.');
    return value;
  }

  private requireId(value: string, name: string): string {
    if (typeof value !== 'string' || !value.trim())
      throw new ValidationError(`${name} is required.`);
    return value;
  }

  private uniqueIds(values: readonly string[], name: string): readonly string[] {
    const ids = values.map((value) => this.requireId(value, name));
    if (new Set(ids).size !== ids.length)
      throw new ValidationError(`${name} must not contain duplicates.`);
    return ids;
  }

  private requireDate(value: Date, name: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
      throw new ValidationError(`${name} must be a valid Date.`);
    return value;
  }

  private requirePositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1)
      throw new ValidationError(`${name} must be a positive integer.`);
    return value;
  }

  private requirePageSize(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 100)
      throw new ValidationError('pageSize must be an integer between 1 and 100.');
    return value;
  }

  private normalizeNote(value: string | null): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') throw new ValidationError('Keyword note must be text.');
    const note = value.trim();
    if (note.length > 1000)
      throw new ValidationError('Keyword note must not exceed 1000 characters.');
    return note || null;
  }
}

export function normalizeKeywordPhrase(phrase: string): string {
  return phrase.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
}
