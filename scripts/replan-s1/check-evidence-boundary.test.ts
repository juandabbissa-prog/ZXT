import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  auditEvidenceBoundary,
  formatEvidenceBoundaryAudit,
  type EvidenceBoundaryViolationCode,
} from './check-evidence-boundary';

const temporaryRoots: string[] = [];

const writeFixture = (root: string, relativePath: string, content: string): void => {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content, 'utf8');
};

const createAllowedGraph = (reverseOrder = false): string => {
  const root = mkdtempSync(join(tmpdir(), 'rs1-05-boundary-'));
  temporaryRoots.push(root);
  const files = [
    [
      'apps/crawler/src/adapters/index.ts',
      "import type { EvidenceCandidate } from '@re-agent/shared';\nexport type AdapterOutput = EvidenceCandidate;\n",
    ],
    ['packages/shared/src/evidence-intake/index.ts', "export * from './allowed';\n"],
    [
      'packages/shared/src/evidence-intake/allowed.ts',
      "import { z } from 'zod';\nimport { createHash } from 'node:crypto';\nexport const value = createHash('sha256').update(z.string().parse('ok')).digest('hex');\n",
    ],
  ] as const;

  for (const [path, content] of reverseOrder ? [...files].reverse() : files) {
    writeFixture(root, path, content);
  }
  return root;
};

const replaceSharedEntrypoint = (root: string, content: string): void => {
  writeFixture(root, 'packages/shared/src/evidence-intake/index.ts', content);
};

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('auditEvidenceBoundary', () => {
  test('accepts the current production Evidence and Adapter entrypoints', () => {
    const result = auditEvidenceBoundary(process.cwd());

    expect(result.status).toBe('PASS');
    expect(result.checkedEntrypoints).toEqual([
      'apps/crawler/src/adapters/index.ts',
      'packages/shared/src/evidence-intake/index.ts',
    ]);
  });

  test('accepts allowed relative, zod, crypto, and shared evidence imports', () => {
    const result = auditEvidenceBoundary(createAllowedGraph());

    expect(result.status).toBe('PASS');
    expect(result.checkedFiles).toEqual([
      'apps/crawler/src/adapters/index.ts',
      'packages/shared/src/evidence-intake/allowed.ts',
      'packages/shared/src/evidence-intake/index.ts',
    ]);
  });

  test.each([
    ["import '@re-agent/database';\n", 'FORBIDDEN_DATABASE_DEPENDENCY'],
    ["import 'node:http';\nfetch('https://fixture.test');\n", 'FORBIDDEN_NETWORK_DEPENDENCY'],
    ["import { chromium } from 'playwright';\n", 'FORBIDDEN_BROWSER_DEPENDENCY'],
    ["Bun.spawn(['docker', 'run']);\n", 'FORBIDDEN_DOCKER_DEPENDENCY'],
    [
      "import { writeFileSync } from 'node:fs';\nwriteFileSync('state', 'x');\n",
      'FORBIDDEN_PERSISTENCE_CALL',
    ],
    ["import '@re-agent/shared/domain/lead-scoring';\n", 'FORBIDDEN_DOWNSTREAM_DOMAIN'],
    ["void import('./allowed');\n", 'FORBIDDEN_DYNAMIC_IMPORT'],
    ["export * from './missing';\n", 'UNRESOLVED_LOCAL_IMPORT'],
  ] as const)(
    'rejects a negative fixture as %s',
    (content, expectedCode: EvidenceBoundaryViolationCode) => {
      const root = createAllowedGraph();
      replaceSharedEntrypoint(root, content);

      const result = auditEvidenceBoundary(root);

      expect(result.status).toBe('FAIL');
      expect(result.violations.map(({ code }) => code)).toContain(expectedCode);
    },
  );

  test('returns ENTRYPOINT_MISSING for a missing canonical entrypoint', () => {
    const root = createAllowedGraph();
    rmSync(join(root, 'apps/crawler/src/adapters/index.ts'));

    const result = auditEvidenceBoundary(root);

    expect(result.status).toBe('FAIL');
    expect(result.violations).toContainEqual({
      code: 'ENTRYPOINT_MISSING',
      file: 'apps/crawler/src/adapters/index.ts',
      dependencyOrCall: 'entrypoint',
    });
  });

  test('returns byte-for-byte equal results for repeated audits', () => {
    const root = createAllowedGraph();

    const first = auditEvidenceBoundary(root);
    const second = auditEvidenceBoundary(root);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(formatEvidenceBoundaryAudit(first)).toBe(formatEvidenceBoundaryAudit(second));
  });

  test('is independent of fixture creation order', () => {
    const forward = auditEvidenceBoundary(createAllowedGraph());
    const reverse = auditEvidenceBoundary(createAllowedGraph(true));

    expect(JSON.stringify(forward)).toBe(JSON.stringify(reverse));
  });

  test('sorts violations deterministically and does not expose absolute paths', () => {
    const root = createAllowedGraph();
    replaceSharedEntrypoint(
      root,
      "import 'node:http';\nimport '@re-agent/database';\nvoid import('./missing');\n",
    );

    const result = auditEvidenceBoundary(root);
    const rendered = formatEvidenceBoundaryAudit(result);

    expect(result.status).toBe('FAIL');
    expect(result.violations.map(({ code }) => code)).toEqual([
      'FORBIDDEN_DATABASE_DEPENDENCY',
      'FORBIDDEN_DYNAMIC_IMPORT',
      'FORBIDDEN_NETWORK_DEPENDENCY',
    ]);
    expect(rendered).not.toContain(root);
  });
});
