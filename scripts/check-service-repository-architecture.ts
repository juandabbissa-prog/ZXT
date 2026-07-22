import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..');
const violations: string[] = [];

async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory() && ['.git', '.next', '.tools', 'node_modules'].includes(entry.name)) return [];
    return entry.isDirectory() ? filesIn(fullPath) : [fullPath];
  }));
  return children.flat();
}

for (const filePath of await filesIn(resolve(projectRoot, 'apps'))) {
  const source = await Bun.file(filePath).text();
  const isRoute = filePath.endsWith('route.ts');
  const isService = filePath.includes('.service.');
  if ((isRoute || isService) && (source.includes("from '@prisma/client'") || source.includes('Prisma.') || source.includes('prisma.'))) {
    violations.push(`Route directly accesses Prisma: ${filePath}`);
  }
}

for (const filePath of await filesIn(projectRoot)) {
  if (!filePath.includes('.repository.')) continue;
  const source = await Bun.file(filePath).text();
  if (/from ['"].*\.repository['"]/.test(source)) violations.push(`Repository imports repository: ${filePath}`);
  if (/from ['"].*\.service['"]/.test(source)) violations.push(`Repository imports service: ${filePath}`);
  if (source.includes('$transaction')) violations.push(`Repository opens transaction: ${filePath}`);
  if (source.includes('.keyword.delete(')) violations.push(`Repository physically deletes Keyword: ${filePath}`);
}

for (const filePath of await filesIn(resolve(projectRoot, 'packages', 'shared'))) {
  const source = await Bun.file(filePath).text();
  if (source.includes('@prisma/client') || source.includes('Prisma.')) violations.push(`Shared contract leaks Prisma: ${filePath}`);
}

if (violations.length > 0) throw new Error(violations.join('\n'));
process.stdout.write('Service/Repository architecture compliance passed.\n');
