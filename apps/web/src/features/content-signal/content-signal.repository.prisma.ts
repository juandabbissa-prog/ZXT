import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  ContentSignalDuplicateFilter,
  ContentSignalListFilter,
  ContentSignalRecord,
  ContentSignalRepository,
  ContentSignalStatus,
  CreateContentSignalInput,
  Page,
  PageRequest,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import { toContentSignalRecord } from '../../infrastructure/persistence/content-signal.mapper';
import { mapContentSignalPersistenceError } from '../../infrastructure/persistence/content-signal-persistence-error';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

const includeEvidence = {
  evidence: { orderBy: [{ observedAt: 'desc' as const }, { id: 'desc' as const }] },
};

export class PrismaContentSignalRepository implements ContentSignalRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateContentSignalInput,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).contentSignal.create({
        data: {
          anchorId: input.anchorId,
          keywordId: input.keywordId,
          type: input.type,
          summary: input.summary,
          normalizedSummary: input.normalizedSummary,
          sourceType: input.source.type,
          sourceReference: input.source.reference,
          sourceDescription: input.source.description,
          confidence: input.confidence,
          confidenceRationale: input.confidenceRationale,
          occurredAt: input.occurredAt,
          observedAt: input.observedAt,
          status: input.status,
          evidence: {
            create: input.evidence.map((item) => ({
              type: item.type,
              status: item.status,
              content: item.content,
              referenceUrl: item.referenceUrl,
              observedAt: item.observedAt,
            })),
          },
        },
        include: includeEvidence,
      });
      return toContentSignalRecord(row);
    });
  }

  async findById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).contentSignal.findUnique({
        where: { id },
        include: includeEvidence,
      });
      return row ? toContentSignalRecord(row) : null;
    });
  }

  async findByAnchor(
    filter: ContentSignalListFilter,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<ContentSignalRecord>> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      const where: Prisma.ContentSignalWhereInput = {
        anchorId: filter.anchorId,
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.observedFrom || filter.observedTo
          ? {
              observedAt: {
                ...(filter.observedFrom ? { gte: filter.observedFrom } : {}),
                ...(filter.observedTo ? { lte: filter.observedTo } : {}),
              },
            }
          : {}),
      };
      const [rows, total] = await Promise.all([
        client.contentSignal.findMany({
          where,
          include: includeEvidence,
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        client.contentSignal.count({ where }),
      ]);
      return {
        items: rows.map(toContentSignalRecord),
        page: page.page,
        pageSize: page.pageSize,
        total,
      };
    });
  }

  async findDuplicate(
    filter: ContentSignalDuplicateFilter,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).contentSignal.findFirst({
        where: filter,
        include: includeEvidence,
      });
      return row ? toContentSignalRecord(row) : null;
    });
  }

  async updateStatus(
    id: string,
    status: ContentSignalStatus,
    archivedAt: Date | null,
    context?: PersistenceTransactionContext,
  ): Promise<ContentSignalRecord | null> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      if (!(await client.contentSignal.findUnique({ where: { id }, select: { id: true } }))) {
        return null;
      }
      const row = await client.contentSignal.update({
        where: { id },
        data: { status, archivedAt },
        include: includeEvidence,
      });
      return toContentSignalRecord(row);
    });
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw mapContentSignalPersistenceError(error);
    }
  }
}
