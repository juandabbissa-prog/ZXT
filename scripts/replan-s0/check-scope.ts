const root=import.meta.dir+'/../..';
const allowed=new Set([
  'package.json','.github/pull_request_template.md','.github/workflows/sprint-0-static.yml','docs/governance/REPLAN-S0-Toolchain-Matrix.md','docs/governance/Secret-Governance.md','docs/governance/Git-Governance.md','scripts/replan-s0-static.ts',
  ...['check-toolchain.ts','check-env-template.ts','check-secrets.ts','check-git-governance.ts','check-build-boundary.ts','check-docker-static.ts','check-prisma-static.ts','check-scope.ts'].map((name)=>`scripts/replan-s0/${name}`),
]);
const proc=Bun.spawn(['git','status','--porcelain=v1','--untracked-files=all'],{cwd:root,stdout:'pipe',stderr:'pipe'});const output=await new Response(proc.stdout).text();if(await proc.exited!==0)throw new Error('git status failed');
const changed=output.split(/\r?\n/).filter(Boolean).map((line)=>line.slice(3).replace(/\\/g,'/'));
const outside=changed.filter((path)=>!allowed.has(path));
if(outside.length)throw new Error(`Scope violation: ${outside.join(', ')}`);
if(changed.includes('.github/workflows/ci.yml'))throw new Error('Protected workflow changed: .github/workflows/ci.yml');
process.stdout.write(`SCOPE_AUDIT_PASS changed=${changed.length} allowed-only ci-workflow-unchanged\n`);
