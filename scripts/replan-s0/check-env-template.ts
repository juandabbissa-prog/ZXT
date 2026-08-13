const root = import.meta.dir + '/../..';
const envFile = Bun.file(`${root}/.env.example`);
if (!(await envFile.exists())) throw new Error('.env.example missing');
const env = await envFile.text();
const ignore = await Bun.file(`${root}/.gitignore`).text();
const required = [
  'NODE_ENV',
  'APP_NAME',
  'APP_PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'LOG_LEVEL',
  'POSTGRES_DB',
  'POSTGRES_USER',
  'POSTGRES_PASSWORD',
];
const sensitiveName =
  /(?:PASSWORD|SECRET|TOKEN|API_KEY|PRIVATE_KEY|DATABASE_URL|REDIS_URL|ACCESS_KEY|CLIENT_SECRET)/;
const explicitPlaceholder =
  /(?:example|placeholder|changeme|replace_me|dummy|fake|localhost|127\.0\.0\.1|example\.com|\.invalid|test|dev(?:elopment)?|YOUR_[A-Z0-9_]+|<[^>]+>|\$\{[^}]+\}|xxx|\*\*\*|re_agent|@postgres(?::|\/)|@redis(?::|\/)|redis:\/\/redis)/i;
const highConfidenceSecret =
  /(?:^|\b)(?:sk_live_|gh[pousr]_|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/;
const entries = new Map<string, string>();
const violations: string[] = [];
for (const line of env.split(/\r?\n/).filter(Boolean)) {
  const at = line.indexOf('=');
  const name = line.slice(0, at);
  const value = line.slice(at + 1);
  if (at < 1 || !/^[A-Z][A-Z0-9_]*$/.test(name) || entries.has(name))
    violations.push(`${name || 'UNKNOWN'}|ENV001|REDACTED`);
  entries.set(name, value);
}
for (const name of required) if (!entries.has(name)) violations.push(`${name}|ENV002|REDACTED`);
for (const [name, value] of entries) {
  if (highConfidenceSecret.test(value)) violations.push(`${name}|ENV003|REDACTED`);
  if (sensitiveName.test(name) && !explicitPlaceholder.test(value))
    violations.push(`${name}|ENV004|REDACTED`);
}
if (!ignore.split(/\r?\n/).includes('.env') || !ignore.split(/\r?\n/).includes('.env.local'))
  violations.push(`LOCAL_ENV|ENV005|REDACTED`);
if (violations.length) {
  process.stderr.write(violations.join('\n') + '\n');
  process.exit(1);
}
process.stdout.write(
  'ENV_TEMPLATE_PLACEHOLDER_STATIC_PASS static placeholder policy only; this does not assert NO_SECRET_EXISTS\n',
);
