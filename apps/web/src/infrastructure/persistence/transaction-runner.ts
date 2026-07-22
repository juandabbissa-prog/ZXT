import type { PrismaClient } from '@prisma/client';
import type { PersistenceTransactionContext } from '@re-agent/shared';
import { createPrismaTransactionContext } from './prisma-transaction-context';
/** Service-only helper. Repositories must never call this. */
export async function runInTransaction<T>(prisma: PrismaClient, operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T> { return prisma.$transaction((transaction) => operation(createPrismaTransactionContext(transaction))); }
