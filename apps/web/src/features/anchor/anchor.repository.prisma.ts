import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AnchorListFilter,
  AnchorRecord,
  AnchorRepository,
  CreateAnchorInput,
  Page,
  PageRequest,
  PersistenceTransactionContext,
  UpdateAnchorInput,
} from '@re-agent/shared';
import { toAnchorRecord } from '../../infrastructure/persistence/anchor.mapper';
import { mapAnchorPersistenceError } from '../../infrastructure/persistence/anchor-persistence-error';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

export class PrismaAnchorRepository implements AnchorRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateAnchorInput,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).anchor.create({
        data: { ...input, tags: [...input.tags] },
      });
      return toAnchorRecord(row);
    });
  }

  async findById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).anchor.findUnique({
        where: { id },
      });
      return row ? toAnchorRecord(row) : null;
    });
  }

  async findByPlatformAccountId(
    platformAccountId: string,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).anchor.findUnique({
        where: { platformAccountId },
      });
      return row ? toAnchorRecord(row) : null;
    });
  }

  async list(
    filter: AnchorListFilter,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<AnchorRecord>> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      const where: Prisma.AnchorWhereInput = {
        ...(filter.platform ? { platformAccount: { is: { platform: filter.platform } } } : {}),
        ...(filter.tag ? { tags: { has: filter.tag } } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      };
      const [rows, total] = await Promise.all([
        client.anchor.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        client.anchor.count({ where }),
      ]);
      return {
        items: rows.map(toAnchorRecord),
        page: page.page,
        pageSize: page.pageSize,
        total,
      };
    });
  }

  async update(
    id: string,
    input: UpdateAnchorInput,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord | null> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      const existing = await client.anchor.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return null;
      const row = await client.anchor.update({
        where: { id },
        data: {
          ...(input.tags !== undefined ? { tags: [...input.tags] } : {}),
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt } : {}),
        },
      });
      return toAnchorRecord(row);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapAnchorPersistenceError(error);
    }
  }
}
