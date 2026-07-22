import type { Prisma, PrismaClient } from '@prisma/client';
import type { ConditionalMutationResult, CreateKeywordInput, KeywordId, KeywordListFilter, KeywordRecord, KeywordRepository, Page, PageRequest, PersistenceTransactionContext, UpdateKeywordInput } from '@re-agent/shared';
import { toKeywordRecord } from '../../infrastructure/persistence/keyword.mapper';
import { mapKeywordPersistenceError } from '../../infrastructure/persistence/keyword-persistence-error';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';
const include = { roles: true, tags: true } satisfies Prisma.KeywordInclude;
export class PrismaKeywordRepository implements KeywordRepository {
  constructor(private readonly prisma: PrismaClient) {}
  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapKeywordPersistenceError(error);
    }
  }

  async create(input: CreateKeywordInput, context?: PersistenceTransactionContext): Promise<KeywordRecord> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      const row = await client.keyword.create({ data: { phrase: input.phrase, normalizedPhrase: input.normalizedPhrase, categoryId: input.categoryId, source: input.source, matchMode: input.matchMode, note: input.note, roles: { create: input.roles.map((role) => ({ role })) }, tags: { create: (input.tagIds ?? []).map((tagId) => ({ tagId })) }, variants: { create: (input.variants ?? []).map((variant) => ({ ...variant })) } }, include });
      return toKeywordRecord(row);
    });
  }
  async findById(id: KeywordId, context?: PersistenceTransactionContext): Promise<KeywordRecord | null> { const row = await resolvePrismaExecutor(this.prisma, context).keyword.findFirst({ where: { id, status: { not: 'DELETED' } }, include }); return row ? toKeywordRecord(row) : null; }
  async findByNormalizedPhrase(normalizedPhrase: string, context?: PersistenceTransactionContext): Promise<KeywordRecord | null> { const row = await resolvePrismaExecutor(this.prisma, context).keyword.findUnique({ where: { normalizedPhrase }, include }); return row ? toKeywordRecord(row) : null; }
  async list(filter: KeywordListFilter, page: PageRequest, context?: PersistenceTransactionContext): Promise<Page<KeywordRecord>> { const client = resolvePrismaExecutor(this.prisma, context); const where: Prisma.KeywordWhereInput = { status: filter.status ?? { not: 'DELETED' }, ...(filter.role ? { roles: { some: { role: filter.role } } } : {}), ...(filter.categoryId ? { categoryId: filter.categoryId } : {}), ...(filter.tagId ? { tags: { some: { tagId: filter.tagId } } } : {}), ...(filter.source ? { source: filter.source } : {}), ...(filter.normalizedPhrase ? { normalizedPhrase: filter.normalizedPhrase } : {}) }; const orderBy = page.sort === 'CREATED_AT_DESC' ? [{ createdAt: 'desc' as const }, { id: 'desc' as const }] : page.sort === 'PHRASE_ASC' ? [{ phrase: 'asc' as const }, { id: 'desc' as const }] : [{ updatedAt: 'desc' as const }, { id: 'desc' as const }]; const [rows, total] = await Promise.all([client.keyword.findMany({ where, include, orderBy, skip: (page.page - 1) * page.pageSize, take: page.pageSize }), client.keyword.count({ where })]); return { items: rows.map(toKeywordRecord), page: page.page, pageSize: page.pageSize, total }; }
  async update(id: KeywordId, input: UpdateKeywordInput, context?: PersistenceTransactionContext): Promise<ConditionalMutationResult<KeywordRecord>> { const client = resolvePrismaExecutor(this.prisma, context); const current = await client.keyword.findUnique({ where: { id }, select: { status: true, updatedAt: true } }); if (!current) return { kind: 'NOT_FOUND' }; if (current.status === 'DELETED') return { kind: 'DELETED' }; if (current.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return { kind: 'VERSION_CONFLICT' }; const result = await client.keyword.updateMany({ where: { id, updatedAt: input.expectedUpdatedAt, status: { not: 'DELETED' } }, data: { phrase: input.phrase, normalizedPhrase: input.normalizedPhrase, categoryId: input.categoryId, matchMode: input.matchMode, note: input.note } }); if (!result.count) return { kind: 'VERSION_CONFLICT' }; const value = await this.findById(id, context); return value ? { kind: 'UPDATED', value } : { kind: 'NOT_FOUND' }; }
  async softDelete(id: KeywordId, expectedUpdatedAt: Date, deletedAt: Date, context?: PersistenceTransactionContext): Promise<ConditionalMutationResult<KeywordRecord>> { const client = resolvePrismaExecutor(this.prisma, context); const current = await client.keyword.findUnique({ where: { id }, select: { status: true, updatedAt: true, normalizedPhrase: true } }); if (!current) return { kind: 'NOT_FOUND' }; if (current.status === 'DELETED') return { kind: 'DELETED' }; if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) return { kind: 'VERSION_CONFLICT' }; const result = await client.keyword.updateMany({ where: { id, updatedAt: expectedUpdatedAt, status: { not: 'DELETED' } }, data: { status: 'DELETED', deletedAt } }); if (!result.count) return { kind: 'VERSION_CONFLICT' }; const value = await this.findByNormalizedPhrase(current.normalizedPhrase, context); return value ? { kind: 'UPDATED', value } : { kind: 'NOT_FOUND' }; }
  async existsByNormalizedPhrase(normalizedPhrase: string, context?: PersistenceTransactionContext): Promise<boolean> { return Boolean(await resolvePrismaExecutor(this.prisma, context).keyword.findUnique({ where: { normalizedPhrase }, select: { id: true } })); }
}
