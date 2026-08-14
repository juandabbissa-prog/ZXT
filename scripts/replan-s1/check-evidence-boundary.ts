import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

const ENTRYPOINTS = [
  'apps/crawler/src/adapters/index.ts',
  'packages/shared/src/evidence-intake/index.ts',
] as const;

const ALLOWED_EXTERNAL_DEPENDENCIES = new Set(['@re-agent/shared', 'node:crypto', 'zod']);

export type EvidenceBoundaryViolationCode =
  | 'FORBIDDEN_DATABASE_DEPENDENCY'
  | 'FORBIDDEN_NETWORK_DEPENDENCY'
  | 'FORBIDDEN_BROWSER_DEPENDENCY'
  | 'FORBIDDEN_DOCKER_DEPENDENCY'
  | 'FORBIDDEN_PERSISTENCE_CALL'
  | 'FORBIDDEN_DOWNSTREAM_DOMAIN'
  | 'FORBIDDEN_DYNAMIC_IMPORT'
  | 'UNRESOLVED_LOCAL_IMPORT'
  | 'ENTRYPOINT_MISSING';

export type EvidenceBoundaryViolation = Readonly<{
  code: EvidenceBoundaryViolationCode;
  file: string;
  dependencyOrCall: string;
}>;

type AuditBase = Readonly<{
  checkedEntrypoints: readonly string[];
  checkedFiles: readonly string[];
}>;

export type EvidenceBoundaryAuditResult =
  | (AuditBase & Readonly<{ status: 'PASS' }>)
  | (AuditBase &
      Readonly<{
        status: 'FAIL';
        violations: readonly EvidenceBoundaryViolation[];
      }>);

const toPosix = (path: string): string => path.split(sep).join('/');

const repositoryRelative = (root: string, path: string): string => toPosix(relative(root, path));

const staticDependencies = (source: string): string[] => {
  const dependencies: string[] = [];
  const pattern = /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/gu;
  for (const match of source.matchAll(pattern)) {
    const dependency = match[1];
    if (dependency) dependencies.push(dependency);
  }
  return dependencies;
};

const classifyDependency = (dependency: string): EvidenceBoundaryViolationCode | null => {
  const normalized = dependency.toLowerCase();
  if (/(?:prisma|postgres|@re-agent\/database|(?:^|\/)pg(?:$|\/)|redis)/u.test(normalized)) {
    return 'FORBIDDEN_DATABASE_DEPENDENCY';
  }
  if (/^(?:node:)?(?:http|https|net|tls|dns)(?:$|\/)|axios|websocket/u.test(normalized)) {
    return 'FORBIDDEN_NETWORK_DEPENDENCY';
  }
  if (/playwright|puppeteer|browser/u.test(normalized)) {
    return 'FORBIDDEN_BROWSER_DEPENDENCY';
  }
  if (/docker/u.test(normalized)) return 'FORBIDDEN_DOCKER_DEPENDENCY';
  if (/^(?:node:)?fs(?:$|\/)/u.test(normalized)) return 'FORBIDDEN_PERSISTENCE_CALL';
  if (
    /signal|intent|persona|customer|lead|ranking|scoring|classification|prospect|crm/u.test(
      normalized,
    )
  ) {
    return 'FORBIDDEN_DOWNSTREAM_DOMAIN';
  }
  return ALLOWED_EXTERNAL_DEPENDENCIES.has(dependency) ? null : 'FORBIDDEN_DOWNSTREAM_DOMAIN';
};

const resolveLocalDependency = (
  root: string,
  importer: string,
  dependency: string,
): string | null => {
  const base = resolve(dirname(importer), dependency);
  const candidates = [base, `${base}.ts`, resolve(base, 'index.ts')];
  for (const candidate of candidates) {
    const relativeCandidate = relative(root, candidate);
    if (
      relativeCandidate !== '..' &&
      !relativeCandidate.startsWith(`..${sep}`) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }
  return null;
};

const sourceViolations = (file: string, source: string): EvidenceBoundaryViolation[] => {
  const violations: EvidenceBoundaryViolation[] = [];
  const checks: ReadonlyArray<readonly [RegExp, EvidenceBoundaryViolationCode, string]> = [
    [/\bimport\s*\(/u, 'FORBIDDEN_DYNAMIC_IMPORT', 'dynamic import'],
    [/\b(?:eval|Function)\s*\(/u, 'FORBIDDEN_DYNAMIC_IMPORT', 'dynamic evaluation'],
    [/\b(?:fetch|WebSocket)\s*\(/u, 'FORBIDDEN_NETWORK_DEPENDENCY', 'network call'],
    [
      /(?:\bBun\.spawn\s*\([^)]*docker|\bdocker\s+(?:build|compose|run|start|up)\b)/iu,
      'FORBIDDEN_DOCKER_DEPENDENCY',
      'docker invocation',
    ],
    [
      /\b(?:appendFile|appendFileSync|createWriteStream|writeFile|writeFileSync)\s*\(/u,
      'FORBIDDEN_PERSISTENCE_CALL',
      'filesystem write',
    ],
    [
      /\b(?:const|let|var)\s+\w+\s*=\s*new\s+(?:Map|Set)\s*\(/u,
      'FORBIDDEN_PERSISTENCE_CALL',
      'module mutable state',
    ],
  ];

  for (const [pattern, code, dependencyOrCall] of checks) {
    if (pattern.test(source)) violations.push({ code, file, dependencyOrCall });
  }
  return violations;
};

const compareViolations = (left: EvidenceBoundaryViolation, right: EvidenceBoundaryViolation) =>
  left.code.localeCompare(right.code) ||
  left.file.localeCompare(right.file) ||
  left.dependencyOrCall.localeCompare(right.dependencyOrCall);

export const auditEvidenceBoundary = (repositoryRoot: string): EvidenceBoundaryAuditResult => {
  const root = resolve(repositoryRoot);
  const checkedEntrypoints = [...ENTRYPOINTS].sort();
  const pending: string[] = [];
  const checked = new Set<string>();
  const violations: EvidenceBoundaryViolation[] = [];

  for (const entrypoint of checkedEntrypoints) {
    const absoluteEntrypoint = resolve(root, entrypoint);
    if (!existsSync(absoluteEntrypoint)) {
      violations.push({
        code: 'ENTRYPOINT_MISSING',
        file: entrypoint,
        dependencyOrCall: 'entrypoint',
      });
    } else {
      pending.push(absoluteEntrypoint);
    }
  }

  while (pending.length > 0) {
    pending.sort((left, right) =>
      repositoryRelative(root, left).localeCompare(repositoryRelative(root, right)),
    );
    const absoluteFile = pending.shift();
    if (!absoluteFile || checked.has(absoluteFile)) continue;
    checked.add(absoluteFile);

    const file = repositoryRelative(root, absoluteFile);
    const source = readFileSync(absoluteFile, 'utf8');
    violations.push(...sourceViolations(file, source));

    for (const dependency of staticDependencies(source).sort()) {
      if (dependency.startsWith('.')) {
        const resolvedDependency = resolveLocalDependency(root, absoluteFile, dependency);
        if (resolvedDependency) {
          if (!checked.has(resolvedDependency)) pending.push(resolvedDependency);
        } else {
          violations.push({
            code: 'UNRESOLVED_LOCAL_IMPORT',
            file,
            dependencyOrCall: dependency,
          });
        }
        continue;
      }

      const code = classifyDependency(dependency);
      if (code) violations.push({ code, file, dependencyOrCall: dependency });
    }
  }

  const checkedFiles = [...checked].map((file) => repositoryRelative(root, file)).sort();
  violations.sort(compareViolations);

  return violations.length === 0
    ? { status: 'PASS', checkedEntrypoints, checkedFiles }
    : { status: 'FAIL', checkedEntrypoints, checkedFiles, violations };
};

export const formatEvidenceBoundaryAudit = (result: EvidenceBoundaryAuditResult): string => {
  const lines = [
    `RS1_05_EVIDENCE_BOUNDARY_AUDIT=${result.status}`,
    `checkedEntrypoints=${result.checkedEntrypoints.join(',')}`,
    `checkedFiles=${result.checkedFiles.length}`,
  ];
  if (result.status === 'FAIL') {
    for (const violation of result.violations) {
      lines.push(`${violation.code}|${violation.file}|${violation.dependencyOrCall}`);
    }
  }
  return `${lines.join('\n')}\n`;
};

if (import.meta.main) {
  const result = auditEvidenceBoundary(process.cwd());
  process.stdout.write(formatEvidenceBoundaryAudit(result));
  if (result.status === 'FAIL') process.exitCode = 1;
}
