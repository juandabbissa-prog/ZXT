import { describe, expect, it } from 'vitest';
import type {
  KeywordCategoryRepository,
  KeywordCategoryRecord,
  KeywordRecord,
  KeywordRepository,
  KeywordTagRepository,
  KeywordTagRecord,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import { KeywordPersistenceError } from '../src/infrastructure/persistence/keyword-persistence-error';
import {
  KeywordService,
  type KeywordTransactionRunner,
  normalizeKeywordPhrase,
} from '../src/features/keyword/keyword.service';

const now = new Date('2026-07-27T00:00:00.000Z');
const context = {} as PersistenceTransactionContext;
const activeCategory: KeywordCategoryRecord = {
  id: 'category-1', code: 'ROOT', name: 'Root', parentId: null, status: 'ACTIVE', createdAt: now, updatedAt: now,
};
const activeTag: KeywordTagRecord = { id: 'tag-1', code: 'TAG', name: 'Tag', status: 'ACTIVE', createdAt: now, updatedAt: now };
const record = (overrides: Partial<KeywordRecord> = {}): KeywordRecord => ({
  id: 'keyword-1', phrase: 'Home', normalizedPhrase: 'home', categoryId: activeCategory.id, source: 'MANUAL', status: 'DRAFT', matchMode: 'EXACT', note: null, roles: ['DISCOVERY'], tagIds: [], createdAt: now, updatedAt: now, archivedAt: null, deletedAt: null, ...overrides,
});

function setup(overrides: Partial<KeywordRepository> = {}) {
  let value = record();
  const keywords: KeywordRepository = {
    create: async (input) => { value = record({ phrase: input.phrase, normalizedPhrase: input.normalizedPhrase, categoryId: input.categoryId, roles: input.roles, tagIds: input.tagIds ?? [] }); return value; },
    findById: async (id) => (id === value.id && value.status !== 'DELETED' ? value : null),
    findByNormalizedPhrase: async (phrase) => (phrase === value.normalizedPhrase ? value : null),
    list: async (filter, page) => ({ items: filter.status && filter.status !== value.status ? [] : [value], page: page.page, pageSize: page.pageSize, total: 1 }),
    update: async (id, input) => { if (id !== value.id) return { kind: 'NOT_FOUND' }; if (input.expectedUpdatedAt.getTime() !== value.updatedAt.getTime()) return { kind: 'VERSION_CONFLICT' }; value = record({ ...value, ...input, updatedAt: new Date(now.getTime() + 1) }); return { kind: 'UPDATED', value }; },
    softDelete: async (id, expectedUpdatedAt, deletedAt) => { if (id !== value.id) return { kind: 'NOT_FOUND' }; if (expectedUpdatedAt.getTime() !== value.updatedAt.getTime()) return { kind: 'VERSION_CONFLICT' }; value = record({ ...value, status: 'DELETED', deletedAt }); return { kind: 'UPDATED', value }; },
    existsByNormalizedPhrase: async (phrase) => phrase === value.normalizedPhrase,
    ...overrides,
  };
  const categories: KeywordCategoryRepository = {
    create: async () => activeCategory, findById: async (id) => (id === activeCategory.id ? activeCategory : null), list: async (page) => ({ items: [activeCategory], page: page.page, pageSize: page.pageSize, total: 1 }), update: async () => activeCategory, hasChildren: async () => false, isReferenced: async () => false, detectCyclePath: async () => null,
  };
  const tags: KeywordTagRepository = {
    create: async () => activeTag, findById: async (id) => (id === activeTag.id ? activeTag : null), list: async (page) => ({ items: [activeTag], page: page.page, pageSize: page.pageSize, total: 1 }), update: async () => activeTag, isReferenced: async () => false,
  };
  const transactions: KeywordTransactionRunner = { run: async (operation) => operation(context) };
  return { service: new KeywordService(keywords, categories, tags, transactions), keywords };
}

describe('KeywordService', () => {
  it('normalizes, validates references and creates through the transaction boundary', async () => {
    const { service } = setup({ existsByNormalizedPhrase: async () => false, findByNormalizedPhrase: async () => null });
    const created = await service.create({ phrase: '  ＨＯＭＥ   Buyer ', categoryId: activeCategory.id, roles: ['DISCOVERY'], tagIds: [activeTag.id] });
    expect(created.normalizedPhrase).toBe('home buyer');
    expect(normalizeKeywordPhrase('  A\tＢ  ')).toBe('a b');
  });

  it('rejects invalid commands and duplicate phrases without exposing persistence details', async () => {
    const { service } = setup();
    await expect(service.create({ phrase: ' ', categoryId: activeCategory.id, roles: ['DISCOVERY'] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.create({ phrase: 'Home', categoryId: activeCategory.id, roles: ['DISCOVERY'] })).rejects.toMatchObject({ code: 'KEYWORD_DUPLICATE' });
  });

  it('maps repository persistence uniqueness errors to the public duplicate contract', async () => {
    const { service } = setup({ existsByNormalizedPhrase: async () => false, create: async () => { throw new KeywordPersistenceError('UNIQUE'); } });
    await expect(service.create({ phrase: 'New', categoryId: activeCategory.id, roles: ['DISCOVERY'] })).rejects.toMatchObject({ code: 'KEYWORD_DUPLICATE' });
  });

  it('supports bounded list queries and category/status filters', async () => {
    const { service } = setup();
    await expect(service.list({ page: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.list({ pageSize: 101 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.list({ status: 'DRAFT', categoryId: activeCategory.id })).resolves.toMatchObject({ total: 1 });
  });

  it('enforces valid status transitions and optimistic concurrency', async () => {
    const { service } = setup();
    await expect(service.changeStatus({ id: 'keyword-1', expectedUpdatedAt: now, status: 'ACTIVE' })).resolves.toMatchObject({ status: 'ACTIVE' });
    await expect(service.changeStatus({ id: 'keyword-1', expectedUpdatedAt: now, status: 'ACTIVE' })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    await expect(service.changeStatus({ id: 'keyword-1', expectedUpdatedAt: new Date(now.getTime() + 1), status: 'DRAFT' })).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  });

  it('uses soft delete rather than physical deletion', async () => {
    const { service } = setup();
    await expect(service.softDelete({ id: 'keyword-1', expectedUpdatedAt: now })).resolves.toMatchObject({ status: 'DELETED' });
  });
});
