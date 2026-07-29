import type { PrismaClient } from '@prisma/client';
import type {
  CreateObservationRecordInput,
  ObservationRecord,
  ObservationRecordRepository,
  Page,
  PageRequest,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import { toObservationRecord } from '../../infrastructure/persistence/anchor.mapper';
import { mapAnchorPersistenceError } from '../../infrastructure/persistence/anchor-persistence-error';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

export class PrismaObservationRecordRepository implements ObservationRecordRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreateObservationRecordInput,
    context?: PersistenceTransactionContext,
  ): Promise<ObservationRecord> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).observationRecord.create({
        data: input,
      });
      return toObservationRecord(row);
    });
  }

  async listByAnchorId(
    anchorId: string,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<ObservationRecord>> {
    return this.execute(async () => {
      const client = resolvePrismaExecutor(this.prisma, context);
      const where = { anchorId };
      const [rows, total] = await Promise.all([
        client.observationRecord.findMany({
          where,
          orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        client.observationRecord.count({ where }),
      ]);
      return {
        items: rows.map(toObservationRecord),
        page: page.page,
        pageSize: page.pageSize,
        total,
      };
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
