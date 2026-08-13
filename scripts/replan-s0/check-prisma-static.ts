import { stat } from 'node:fs/promises';
const root = import.meta.dir + '/../..';
const read = (path: string) => Bun.file(`${root}/${path}`).text();
const db = JSON.parse(await read('packages/database/package.json'));
const rootPackage = JSON.parse(await read('package.json'));
const lock = await read('bun.lock');
if (db.dependencies.prisma !== db.dependencies['@prisma/client']) throw new Error('Prisma declarations mismatch');
const client = lock.match(/"@prisma\/client": \["@prisma\/client@([^"]+)/)?.[1];
const cli = lock.match(/"prisma": \["prisma@([^"]+)/)?.[1];
if (!client || client !== cli) throw new Error('Prisma lock versions mismatch');
for (const path of ['packages/database/prisma/schema.prisma','packages/database/prisma/migrations']) try { await stat(`${root}/${path}`); } catch { throw new Error(`Prisma path convention missing: ${path}`); }

const legacyKeywords = /(?:prisma|migrate|migration|seed|^db:|database)/i;
const legacyScripts = [...Object.entries(rootPackage.scripts), ...Object.entries(db.scripts)].filter(([name, command]) => legacyKeywords.test(name) || legacyKeywords.test(String(command)));
if (!legacyScripts.length) throw new Error('Expected legacy Prisma/DB scripts were not inventoried');

if (rootPackage.scripts['replan-s0:static'] !== 'bun run scripts/replan-s0-static.ts') throw new Error('REPLAN-S0 entrypoint drift');
const aggregator = await read('scripts/replan-s0-static.ts');
const expectedChecks = ['check-toolchain.ts','check-env-template.ts','check-secrets.ts','check-git-governance.ts','check-build-boundary.ts','check-docker-static.ts','check-prisma-static.ts','check-scope.ts'];
for (const check of expectedChecks) if (!aggregator.includes(check)) throw new Error(`Aggregator omits ${check}`);
const buildBoundary = await read('scripts/replan-s0/check-build-boundary.ts');
const allowedBuilds = ['packages/shared/package.json','packages/sdk/package.json','apps/crawler/package.json','workers/package.json'];
for (const path of allowedBuilds) {
  const pkg = JSON.parse(await read(path));
  if (pkg.scripts?.build !== 'tsc --noEmit') throw new Error(`Unsafe REPLAN build path: ${pkg.name}`);
}
const forbiddenReference = /(?:db:(?:generate|validate|migrate|seed|reset)|prisma:(?:generate|validate|format|migrate|seed)|prisma\s+(?:generate|validate|format|migrate|db|studio)|docker\s+(?:compose|run|build)|next\s+build)/i;
if (forbiddenReference.test(rootPackage.scripts['replan-s0:static'])) throw new Error('REPLAN-S0 entrypoint references a forbidden command');
const spawnedCommands = [...aggregator.matchAll(/Bun\.spawn\(\[([^\]]+)\]/g), ...buildBoundary.matchAll(/Bun\.spawn\(\[([^\]]+)\]/g)].map((match) => match[1]);
for (const command of spawnedCommands) if (forbiddenReference.test(command)) throw new Error('REPLAN-S0 spawned command crosses Prisma/DB/runtime boundary');
process.stdout.write(`PRISMA_STATIC_BOUNDARY_PASS legacy-scripts=${legacyScripts.length} replan-call-chain=SAFE commands=NOT_EXECUTED repository-wide-absence=NOT_ASSERTED\n`);
