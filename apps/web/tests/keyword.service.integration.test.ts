import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@re-agent/database';
import { PrismaKeywordCategoryRepository } from '../src/features/keyword/keyword-category.repository.prisma';
import { PrismaKeywordRepository } from '../src/features/keyword/keyword.repository.prisma';
import {
  KeywordService,
  type KeywordTransactionRunner,
} from '../src/features/keyword/keyword.service';
import { PrismaKeywordTagRepository } from '../src/features/keyword/keyword-tag.repository.prisma';
import { runInTransaction } from '../src/infrastructure/persistence/transaction-runner';
import { clearIntegrationData } from './helpers/clear-integration-data';

const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('KeywordService integration', () => {
  const keywords = new PrismaKeywordRepository(prisma);
  const categories = new PrismaKeywordCategoryRepository(prisma);
  const tags = new PrismaKeywordTagRepository(prisma);
  const transactions: KeywordTransactionRunner = {
    run: (operation) => runInTransaction(prisma, operation),
  };
  const service = new KeywordService(keywords, categories, tags, transactions);
  let categoryId = '';
  let tagId = '';
  let serial = 0;

  beforeAll(async () => {
    await clearIntegrationData();
    categoryId = (
      await prisma.keywordCategory.create({
        data: { code: 'SERVICE_TEST_ROOT', name: 'Service Test Root', status: 'ACTIVE' },
      })
    ).id;
    tagId = (
      await prisma.keywordTag.create({
        data: { code: 'SERVICE_TEST_TAG', name: 'Service Test Tag', status: 'ACTIVE' },
      })
    ).id;
  });

  afterAll(clearIntegrationData);

  it('runs create, query, state transition, update and soft delete through Service and Repository', async () => {
    const phrase = `service-keyword-${++serial}`;
    const created = await service.create({
      phrase: ` ${phrase} `,
      categoryId,
      tagIds: [tagId],
      roles: ['DISCOVERY'],
    });
    expect(created.normalizedPhrase).toBe(phrase);
    expect(
      (await service.list({ categoryId, status: 'DRAFT' })).items.map((item) => item.id),
    ).toContain(created.id);

    const active = await service.changeStatus({
      id: created.id,
      expectedUpdatedAt: created.updatedAt,
      status: 'ACTIVE',
    });
    expect(active.status).toBe('ACTIVE');

    const updated = await service.update({
      id: active.id,
      expectedUpdatedAt: active.updatedAt,
      note: 'updated through service',
    });
    expect(updated.note).toBe('updated through service');

    const deleted = await service.softDelete({
      id: updated.id,
      expectedUpdatedAt: updated.updatedAt,
    });
    expect(deleted.status).toBe('DELETED');
    await expect(service.get(deleted.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
