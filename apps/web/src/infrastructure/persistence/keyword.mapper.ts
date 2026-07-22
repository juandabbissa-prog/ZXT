import type { Keyword, KeywordCategory, KeywordTag, Prisma } from '@prisma/client';
import type { KeywordCategoryRecord, KeywordRecord, KeywordTagRecord } from '@re-agent/shared';
type KeywordRow = Prisma.KeywordGetPayload<{ include: { roles: true; tags: true } }>;
export const toKeywordRecord = (row: KeywordRow): KeywordRecord => ({
  id: row.id, phrase: row.phrase, normalizedPhrase: row.normalizedPhrase, categoryId: row.categoryId,
  source: row.source, status: row.status, matchMode: row.matchMode, note: row.note,
  createdAt: row.createdAt, updatedAt: row.updatedAt, archivedAt: row.archivedAt, deletedAt: row.deletedAt,
  roles: row.roles.map((item) => item.role), tagIds: row.tags.map((item) => item.tagId),
});
export const toCategoryRecord = (row: KeywordCategory): KeywordCategoryRecord => ({ ...row });
export const toTagRecord = (row: KeywordTag): KeywordTagRecord => ({ ...row });
