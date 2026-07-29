export type Page<T> = Readonly<{
  items: readonly T[];
  page: number;
  pageSize: number;
  total: number;
}>;

export type PageRequest = Readonly<{
  page: number;
  pageSize: number;
  sort?: 'UPDATED_AT_DESC' | 'CREATED_AT_DESC' | 'PHRASE_ASC';
}>;

/** Opaque context supplied by Service-owned transaction orchestration, never Prisma types. */
export type PersistenceTransactionContext = Readonly<{
  readonly __persistenceTransaction: unique symbol;
}>;
