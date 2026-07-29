import type { PrismaClient } from '@prisma/client';
import type {
  CreatePlatformAccountInput,
  PersistenceTransactionContext,
  PlatformAccountRecord,
  PlatformAccountRepository,
} from '@re-agent/shared';
import { toPlatformAccountRecord } from '../../infrastructure/persistence/anchor.mapper';
import { mapAnchorPersistenceError } from '../../infrastructure/persistence/anchor-persistence-error';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

export class PrismaPlatformAccountRepository implements PlatformAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    input: CreatePlatformAccountInput,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).platformAccount.create({
        data: {
          ...input,
          contentDomains: [...input.contentDomains],
          regionTags: [...input.regionTags],
        },
      });
      return toPlatformAccountRecord(row);
    });
  }

  async findById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).platformAccount.findUnique({
        where: { id },
      });
      return row ? toPlatformAccountRecord(row) : null;
    });
  }

  async findByPlatformAndIdentifier(
    platform: string,
    accountIdentifier: string,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord | null> {
    return this.execute(async () => {
      const row = await resolvePrismaExecutor(this.prisma, context).platformAccount.findUnique({
        where: { platform_accountIdentifier: { platform, accountIdentifier } },
      });
      return row ? toPlatformAccountRecord(row) : null;
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
