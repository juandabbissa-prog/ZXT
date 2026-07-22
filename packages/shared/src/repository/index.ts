/**
 * Repository contracts are the only allowed persistence boundary for future
 * business modules. Concrete repositories own Prisma queries and return
 * domain-shaped values rather than leaking ORM implementation details.
 */
export interface Repository<T, Identifier = string> {
  findById(identifier: Identifier): Promise<T | null>;
}
