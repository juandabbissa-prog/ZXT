import type { PrismaClient } from '@prisma/client';
import type { KeywordTagRecord, KeywordTagRepository, Page, PageRequest, PersistenceTransactionContext } from '@re-agent/shared';
import { toTagRecord } from '../../infrastructure/persistence/keyword.mapper';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';
export class PrismaKeywordTagRepository implements KeywordTagRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async create(input: Omit<KeywordTagRecord, 'id' | 'createdAt' | 'updatedAt'>, context?: PersistenceTransactionContext): Promise<KeywordTagRecord> { return toTagRecord(await resolvePrismaExecutor(this.prisma, context).keywordTag.create({ data: input })); }
  async findById(id: string, context?: PersistenceTransactionContext): Promise<KeywordTagRecord | null> { const row = await resolvePrismaExecutor(this.prisma, context).keywordTag.findUnique({ where: { id } }); return row ? toTagRecord(row) : null; }
  async list(page: PageRequest, context?: PersistenceTransactionContext): Promise<Page<KeywordTagRecord>> { const client = resolvePrismaExecutor(this.prisma, context); const [items, total] = await Promise.all([client.keywordTag.findMany({ orderBy: [{ code: 'asc' }], skip: (page.page - 1) * page.pageSize, take: page.pageSize }), client.keywordTag.count()]); return { items: items.map(toTagRecord), page: page.page, pageSize: page.pageSize, total }; }
  async update(id: string, expectedUpdatedAt: Date, input: Partial<Pick<KeywordTagRecord, 'name' | 'status'>>, context?: PersistenceTransactionContext): Promise<KeywordTagRecord | null> { const client = resolvePrismaExecutor(this.prisma, context); const result = await client.keywordTag.updateMany({ where: { id, updatedAt: expectedUpdatedAt }, data: input }); return result.count ? this.findById(id, context) : null; }
  async isReferenced(id: string, context?: PersistenceTransactionContext): Promise<boolean> { return Boolean(await resolvePrismaExecutor(this.prisma, context).keywordTagLink.findFirst({ where: { tagId: id }, select: { tagId: true } })); }
}
