import { Prisma } from '@prisma/client';
import { DatabaseError } from '@re-agent/shared';
export class KeywordPersistenceError extends DatabaseError { constructor(public readonly kind: 'UNIQUE' | 'FOREIGN_KEY' | 'SERIALIZATION' | 'DEADLOCK' | 'UNKNOWN') { super('Keyword persistence operation failed.'); } }
export function mapKeywordPersistenceError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return new KeywordPersistenceError('UNIQUE');
    if (error.code === 'P2003') return new KeywordPersistenceError('FOREIGN_KEY');
    if (error.code === 'P2034') return new KeywordPersistenceError('SERIALIZATION');
  }
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === '40001') return new KeywordPersistenceError('SERIALIZATION');
  if (code === '40P01') return new KeywordPersistenceError('DEADLOCK');
  return new KeywordPersistenceError('UNKNOWN');
}
