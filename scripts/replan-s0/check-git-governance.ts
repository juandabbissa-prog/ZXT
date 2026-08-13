const root = import.meta.dir + '/../..';
const required: Record<string, string[]> = {
  'docs/governance/Git-Governance.md': [
    'Branch naming',
    'Commit messages',
    'Pull requests and review',
    'Merge',
    'Tags and release baseline',
  ],
  'docs/governance/Secret-Governance.md': [
    'Repository boundary',
    'CI boundary',
    'Exposure response',
  ],
  '.github/pull_request_template.md': [
    'Canonical scope',
    'Change audit',
    'Verification and evidence',
    'Review and merge gate',
  ],
};
for (const [path, headings] of Object.entries(required)) {
  const file = Bun.file(`${root}/${path}`);
  if (!(await file.exists())) throw new Error(`${path} missing`);
  const text = await file.text();
  for (const heading of headings)
    if (!text.includes(heading)) throw new Error(`${path}: missing ${heading}`);
}
process.stdout.write('GIT_GOVERNANCE_STATIC_CHECK_PASS no history inspected or rewritten\n');
