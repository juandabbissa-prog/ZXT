import { describe, expect, it } from 'vitest';
import { toKeywordRecord } from '../src/infrastructure/persistence/keyword.mapper';

describe('keyword mapper', () => {
  it('maps Prisma relation rows to a domain record without relation payloads', () => {
    const row = { id: 'keyword-1', phrase: 'home', normalizedPhrase: 'home', categoryId: 'category-1', source: 'MANUAL', status: 'ACTIVE', matchMode: 'EXACT', note: null, createdAt: new Date(), updatedAt: new Date(), archivedAt: null, deletedAt: null, roles: [{ keywordId: 'keyword-1', role: 'DISCOVERY', createdAt: new Date() }], tags: [{ keywordId: 'keyword-1', tagId: 'tag-1', createdAt: new Date() }] } as unknown as Parameters<typeof toKeywordRecord>[0];
    const result = toKeywordRecord(row);
    expect(result.roles).toEqual(['DISCOVERY']);
    expect(result.tagIds).toEqual(['tag-1']);
    expect(result).not.toHaveProperty('tags');
  });
});
