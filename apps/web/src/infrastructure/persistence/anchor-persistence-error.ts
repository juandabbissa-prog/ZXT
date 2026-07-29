import { Prisma } from '@prisma/client';
import { DatabaseError } from '@re-agent/shared';

export class AnchorPersistenceError extends DatabaseError {
  constructor(public readonly kind: 'UNIQUE' | 'FOREIGN_KEY' | 'UNKNOWN') {
    super('Anchor Center persistence operation failed.');
  }
}

export function mapAnchorPersistenceError(error: unknown): Error {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return new AnchorPersistenceError('UNIQUE');
    if (error.code === 'P2003') return new AnchorPersistenceError('FOREIGN_KEY');
  }
  return new AnchorPersistenceError('UNKNOWN');
}
