import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  for (const [key, value] of Object.entries({ APP_VERSION: '0.1.0', SYSTEM_NAME: 'RE-Agent', ENVIRONMENT: 'development' })) {
    await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  if (process.env.NODE_ENV !== 'production') {
    await prisma.keywordCategory.upsert({ where: { code: 'UNCLASSIFIED' }, update: {}, create: { code: 'UNCLASSIFIED', name: 'Unclassified', status: 'ACTIVE' } });
  }
}
main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Seed failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
