import { mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const [featureName] = Bun.argv.slice(2);
if (!featureName || !/^[a-z]+(?:-[a-z]+)*$/.test(featureName)) {
  throw new Error('Usage: bun run feature:create <kebab-case-feature-name>');
}

const projectRoot = resolve(import.meta.dir, '..');
const templateRoot = resolve(projectRoot, 'templates', 'feature');
const destination = resolve(projectRoot, 'apps', 'web', 'src', 'features', featureName);
const featureRoot = resolve(projectRoot, 'apps', 'web', 'src', 'features');
const pascalName = featureName
  .split('-')
  .map((part) => part[0]?.toUpperCase() + part.slice(1))
  .join('');

await mkdir(featureRoot, { recursive: true });
await mkdir(destination);
for (const templateName of await readdir(templateRoot)) {
  const targetName = templateName.replace('feature', featureName).replace('.template', '');
  const templatePath = resolve(templateRoot, templateName);
  const targetPath = resolve(destination, targetName);
  const source = await Bun.file(templatePath).text();
  await Bun.write(
    targetPath,
    source
      .replaceAll('__FEATURE_PASCAL__', pascalName)
      .replaceAll('__FEATURE_KEBAB__', featureName)
      .replaceAll('feature', featureName),
  );
}
process.stdout.write(`Created feature template: ${destination}\n`);
