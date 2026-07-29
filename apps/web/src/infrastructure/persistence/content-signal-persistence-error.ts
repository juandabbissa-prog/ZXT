import { Prisma } from '@prisma/client';
import { DatabaseError } from '@re-agent/shared';

export class ContentSignalPersistenceError extends DatabaseError {
  constructor(public readonly kind: 'UNIQUE' | 'FOREIGN_KEY' | 'UNKNOWN') {
    super('Content Signal persistence operation failed.');
  }
}

export function mapContentSignalPersistenceError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return new ContentSignalPersistenceError('UNIQUE');
    if (error.code === 'P2003') return new ContentSignalPersistenceError('FOREIGN_KEY');
  }
  return new ContentSignalPersistenceError('UNKNOWN');
}
