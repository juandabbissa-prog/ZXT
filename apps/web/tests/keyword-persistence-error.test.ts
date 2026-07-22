import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { KeywordPersistenceError, mapKeywordPersistenceError } from '../src/infrastructure/persistence/keyword-persistence-error';

const prismaError = (code: string) => new Prisma.PrismaClientKnownRequestError('database error', { code, clientVersion: 'test' });

describe('keyword persistence error mapping', () => {
  it.each([
    ['P2002', 'UNIQUE'],
    ['P2003', 'FOREIGN_KEY'],
    ['P2034', 'SERIALIZATION'],
  ] as const)('maps Prisma %s to %s', (code, kind) => {
    const error = mapKeywordPersistenceError(prismaError(code));
    expect(error).toBeInstanceOf(KeywordPersistenceError);
    expect((error as KeywordPersistenceError).kind).toBe(kind);
  });

  it.each([
    ['40001', 'SERIALIZATION'],
    ['40P01', 'DEADLOCK'],
    ['unexpected', 'UNKNOWN'],
  ] as const)('maps database code %s to %s', (code, kind) => {
    expect((mapKeywordPersistenceError({ code }) as KeywordPersistenceError).kind).toBe(kind);
  });
});
