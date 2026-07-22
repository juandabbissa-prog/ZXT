import { describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  createPrismaTransactionContext,
  InvalidPersistenceTransactionContextError,
  resolvePrismaExecutor,
} from '../src/infrastructure/persistence/prisma-transaction-context';

describe('Prisma transaction context', () => {
  it('uses the root client when no context is supplied', () => {
    const client = {} as PrismaClient;
    expect(resolvePrismaExecutor(client)).toBe(client);
  });

  it('resolves only contexts created for a Prisma transaction', () => {
    const transaction = {} as Prisma.TransactionClient;
    const context = createPrismaTransactionContext(transaction);
    expect(resolvePrismaExecutor({} as PrismaClient, context)).toBe(transaction);
  });

  it('fails fast for an unknown context instead of falling back to the root client', () => {
    expect(() => resolvePrismaExecutor({} as PrismaClient, {} as never)).toThrow(InvalidPersistenceTransactionContextError);
  });
});
