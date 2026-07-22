import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaKeywordCategoryRepository } from '../src/features/keyword/keyword-category.repository.prisma';
import { PrismaKeywordRepository } from '../src/features/keyword/keyword.repository.prisma';
import { PrismaKeywordTagRepository } from '../src/features/keyword/keyword-tag.repository.prisma';
import { runInTransaction } from '../src/infrastructure/persistence/transaction-runner';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('keyword repository integration', () => {
  const keywords = new PrismaKeywordRepository(prisma);
  const categories = new PrismaKeywordCategoryRepository(prisma);
  const tags = new PrismaKeywordTagRepository(prisma);
  let categoryId = '';
  let tagId = '';
  let serial = 0;
  const phrase = () => `keyword-${++serial}`;

  beforeAll(async () => {
    await prisma.keywordTagLink.deleteMany();
    await prisma.keywordRoleLink.deleteMany();
    await prisma.keywordVariant.deleteMany();
    await prisma.keyword.deleteMany();
    await prisma.keywordTag.deleteMany();
    await prisma.keywordCategory.deleteMany();
    categoryId = (await prisma.keywordCategory.create({ data: { code: 'TEST_ROOT', name: 'Test Root', status: 'ACTIVE' } })).id;
    tagId = (await prisma.keywordTag.create({ data: { code: 'TEST_TAG', name: 'Test Tag', status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    await prisma.keywordTagLink.deleteMany();
    await prisma.keywordRoleLink.deleteMany();
    await prisma.keywordVariant.deleteMany();
    await prisma.keyword.deleteMany();
    await prisma.keywordTag.deleteMany();
    await prisma.keywordCategory.deleteMany();
  });

  async function createKeyword(overrides: Partial<{ normalizedPhrase: string; tagIds: readonly string[]; roles: readonly ('DISCOVERY' | 'CONTEXT')[]; variants: readonly Readonly<{ phrase: string; normalizedPhrase: string }>[] }> = {}) {
    const value = phrase();
    return keywords.create({ phrase: value, normalizedPhrase: overrides.normalizedPhrase ?? value, categoryId, source: 'MANUAL', matchMode: 'EXACT', roles: overrides.roles ?? ['DISCOVERY'], tagIds: overrides.tagIds, variants: overrides.variants });
  }

  it('creates Keyword and enforces global normalizedPhrase uniqueness after soft delete', async () => {
    const created = await createKeyword({ normalizedPhrase: 'create-once' });
    const deleted = await keywords.softDelete(created.id, created.updatedAt, new Date());
    expect(deleted.kind).toBe('UPDATED');
    expect((await keywords.list({}, { page: 1, pageSize: 100 })).items.map((item) => item.id)).not.toContain(created.id);
    await expect(createKeyword({ normalizedPhrase: 'create-once' })).rejects.toBeDefined();
  });

  it('enforces Variant and Role/TagLink composite uniqueness', async () => {
    const created = await createKeyword({ tagIds: [tagId], variants: [{ phrase: 'variant', normalizedPhrase: 'variant' }] });
    await expect(prisma.keywordVariant.create({ data: { keywordId: created.id, phrase: 'duplicate', normalizedPhrase: 'variant', status: 'ACTIVE' } })).rejects.toBeDefined();
    await expect(prisma.keywordRoleLink.create({ data: { keywordId: created.id, role: 'DISCOVERY' } })).rejects.toBeDefined();
    await expect(prisma.keywordTagLink.create({ data: { keywordId: created.id, tagId } })).rejects.toBeDefined();
  });

  it('returns explicit optimistic concurrency and deleted outcomes', async () => {
    const created = await createKeyword();
    const conflict = await keywords.update(created.id, { expectedUpdatedAt: new Date(0), note: 'stale' });
    expect(conflict.kind).toBe('VERSION_CONFLICT');
    const deleted = await keywords.softDelete(created.id, created.updatedAt, new Date());
    expect(deleted.kind).toBe('UPDATED');
    const afterDelete = await keywords.update(created.id, { expectedUpdatedAt: created.updatedAt, note: 'nope' });
    expect(afterDelete.kind).toBe('DELETED');
  });

  it('supports role, tag, category, source filters and stable pagination', async () => {
    const tagged = await createKeyword({ tagIds: [tagId], roles: ['CONTEXT'] });
    const roleFiltered = await keywords.list({ role: 'CONTEXT' }, { page: 1, pageSize: 10 });
    expect(roleFiltered.items.map((item) => item.id)).toContain(tagged.id);
    const tagFiltered = await keywords.list({ tagId, categoryId, source: 'MANUAL' }, { page: 1, pageSize: 10 });
    expect(tagFiltered.items.map((item) => item.id)).toContain(tagged.id);
    const page = await keywords.list({}, { page: 1, pageSize: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]?.updatedAt.getTime()).toBeGreaterThanOrEqual(page.items[1]?.updatedAt.getTime() ?? 0);
  });

  it('enforces FK Restrict and reports Category/Tag references', async () => {
    const created = await createKeyword({ tagIds: [tagId] });
    await expect(prisma.keywordCategory.delete({ where: { id: categoryId } })).rejects.toBeDefined();
    expect(await categories.isReferenced(categoryId)).toBe(true);
    expect(await tags.isReferenced(tagId)).toBe(true);
    expect(created.categoryId).toBe(categoryId);
  });

  it('supports Category self-reference and detects proposed cycles', async () => {
    const child = await categories.create({ code: 'TEST_CHILD', name: 'Test Child', parentId: categoryId, status: 'ACTIVE' });
    expect(await categories.hasChildren(categoryId)).toBe(true);
    expect(await categories.detectCyclePath(categoryId, child.id)).not.toBeNull();
    expect(await categories.detectCyclePath(child.id, child.id)).not.toBeNull();
  });

  it('rolls back Repository writes when Service transaction operation fails', async () => {
    const rollbackPhrase = 'rolled-back-keyword';
    await expect(runInTransaction(prisma, async (context) => { await keywords.create({ phrase: rollbackPhrase, normalizedPhrase: rollbackPhrase, categoryId, source: 'MANUAL', matchMode: 'EXACT', roles: ['DISCOVERY'] }, context); throw new Error('force rollback'); })).rejects.toThrow('force rollback');
    expect(await keywords.findByNormalizedPhrase(rollbackPhrase)).toBeNull();
  });
});
