import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  for (const [key, value] of Object.entries({
    APP_VERSION: '0.1.0',
    SYSTEM_NAME: 'RE-Agent',
    ENVIRONMENT: 'development',
  })) {
    await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  if (process.env.NODE_ENV !== 'production') {
    const category = await prisma.keywordCategory.upsert({
      where: { code: 'UNCLASSIFIED' },
      update: {},
      create: { code: 'UNCLASSIFIED', name: 'Unclassified', status: 'ACTIVE' },
    });
    const account = await prisma.platformAccount.upsert({
      where: {
        platform_accountIdentifier: {
          platform: 'MANUAL',
          accountIdentifier: 'seed-content-signal-observer',
        },
      },
      update: {},
      create: {
        platform: 'MANUAL',
        accountName: 'Seed Content Signal Observer',
        accountIdentifier: 'seed-content-signal-observer',
        profileUrl: 'https://example.com/seed-content-signal-observer',
      },
    });
    const anchor = await prisma.anchor.upsert({
      where: { platformAccountId: account.id },
      update: {},
      create: {
        name: 'Seed Content Signal Anchor',
        platformAccountId: account.id,
        observationReason: 'Deterministic development seed for Content Signal.',
      },
    });
    const keyword = await prisma.keyword.upsert({
      where: { normalizedPhrase: 'seed content signal keyword' },
      update: {},
      create: {
        phrase: 'Seed Content Signal Keyword',
        normalizedPhrase: 'seed content signal keyword',
        categoryId: category.id,
        source: 'MANUAL',
        status: 'ACTIVE',
        matchMode: 'PHRASE',
      },
    });
    const existingSignal = await prisma.contentSignal.findFirst({
      where: {
        anchorId: anchor.id,
        type: 'INTENT',
        normalizedSummary: 'seed buyer asks about commute time',
        occurredAt: new Date('2026-07-29T00:00:00.000Z'),
      },
    });
    if (!existingSignal) {
      await prisma.contentSignal.create({
        data: {
          anchorId: anchor.id,
          keywordId: keyword.id,
          type: 'INTENT',
          summary: 'Seed buyer asks about commute time',
          normalizedSummary: 'seed buyer asks about commute time',
          sourceType: 'MANUAL',
          sourceReference: 'development-seed',
          sourceDescription: 'Deterministic development seed.',
          confidence: 80,
          confidenceRationale: 'The seeded question is explicitly recorded as evidence.',
          occurredAt: new Date('2026-07-29T00:00:00.000Z'),
          observedAt: new Date('2026-07-29T00:01:00.000Z'),
          evidence: {
            create: {
              type: 'TEXT',
              content: 'Seed evidence for deterministic development validation.',
              observedAt: new Date('2026-07-29T00:01:00.000Z'),
            },
          },
        },
      });
    }
  }
}
main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Seed failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
