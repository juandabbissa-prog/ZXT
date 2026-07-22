import type { Prisma, PrismaClient } from '@prisma/client';
import type { PersistenceTransactionContext } from '@re-agent/shared';

export type PrismaExecutor = PrismaClient | Prisma.TransactionClient;
const contexts = new WeakMap<object, PrismaExecutor>();
export class InvalidPersistenceTransactionContextError extends Error { constructor() { super('Invalid persistence transaction context.'); this.name = 'InvalidPersistenceTransactionContextError'; } }
export function createPrismaTransactionContext(client: Prisma.TransactionClient): PersistenceTransactionContext { const context = {} as PersistenceTransactionContext; contexts.set(context, client); return context; }
export function resolvePrismaExecutor(client: PrismaClient, context?: PersistenceTransactionContext): PrismaExecutor {
  if (!context) return client;
  const executor = contexts.get(context);
  if (!executor) throw new InvalidPersistenceTransactionContextError();
  return executor;
}
