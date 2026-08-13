const root = import.meta.dir + '/../..';
const read = (path: string) => Bun.file(`${root}/${path}`).text();
const fail = (message: string): never => {
  throw new Error(message);
};

const matrix = await read('docs/governance/REPLAN-S0-Toolchain-Matrix.md');
const rows = matrix.split(/\r?\n/).filter((line) => /^\|[^-].*\|$/.test(line));
const definitions = new Map<string, string[]>();
for (const row of rows) {
  const cells = row
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim().replaceAll('`', ''));
  if (cells[0] === 'Tool') continue;
  if (cells.length !== 4 || !cells[0] || !cells[1]) fail('Malformed toolchain matrix row');
  definitions.set(cells[0], [...(definitions.get(cells[0]) ?? []), cells[1]]);
}
const required = [
  'Node.js',
  'Bun',
  'Docker Engine',
  'Docker Compose',
  'Prisma CLI',
  '@prisma/client',
];
for (const tool of required)
  if (definitions.get(tool)?.length !== 1) fail(`Missing or duplicate tool definition: ${tool}`);
const value = (tool: string) => definitions.get(tool)![0];
if (!/^\d+(?:\.\d+){0,2}$/.test(value('Node.js'))) fail('Invalid Node.js matrix version');
if (!/^\d+\.\d+\.\d+$/.test(value('Bun'))) fail('Invalid Bun matrix version');
for (const tool of ['Docker Engine', 'Docker Compose'])
  if (!/^\d+\.\d+ or newer$/.test(value(tool))) fail(`Invalid minimum version: ${tool}`);
const prismaDeclaration = value('Prisma CLI').match(
  /^declaration (\^\d+\.\d+\.\d+); lock (\d+\.\d+\.\d+)$/,
);
const clientDeclaration = value('@prisma/client').match(
  /^declaration (\^\d+\.\d+\.\d+); lock (\d+\.\d+\.\d+)$/,
);
if (!prismaDeclaration || !clientDeclaration) fail('Invalid Prisma matrix format');

const pkg = JSON.parse(await read('package.json'));
const workflow = await read('.github/workflows/sprint-0-static.yml');
const lock = await read('bun.lock');
const db = JSON.parse(await read('packages/database/package.json'));
if (pkg.packageManager !== `bun@${value('Bun')}`) fail('Bun packageManager conflicts with matrix');
if (!workflow.includes(`node-version: ${value('Node.js')}`))
  fail('Workflow Node conflicts with matrix');
if (!workflow.includes(`bun-version: ${value('Bun')}`)) fail('Workflow Bun conflicts with matrix');
if (
  db.dependencies.prisma !== prismaDeclaration[1] ||
  db.dependencies['@prisma/client'] !== clientDeclaration[1]
)
  fail('Prisma declaration conflicts with matrix');
const clientLock = lock.match(/"@prisma\/client": \["@prisma\/client@([^"]+)/)?.[1];
const prismaLock = lock.match(/"prisma": \["prisma@([^"]+)/)?.[1];
if (
  !clientLock ||
  clientLock !== clientDeclaration[2] ||
  prismaLock !== prismaDeclaration[2] ||
  clientLock !== prismaLock
)
  fail('Prisma lock conflicts with matrix');
process.stdout.write(
  `TOOLCHAIN_GOVERNANCE_STATIC_PASS node=${value('Node.js')} bun=${value('Bun')} prisma-lock=${prismaLock} docker-min=${value('Docker Engine')} compose-min=${value('Docker Compose')} runtime-versions=NOT_EXECUTED\n`,
);
