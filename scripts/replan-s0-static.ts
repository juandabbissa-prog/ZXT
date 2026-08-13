import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root=resolve(import.meta.dir,'..');
const out=resolve(root,'artifacts/replan-s0');
const checks=[
  ['01-toolchain.log','check-toolchain.ts'],['02-env-template.log','check-env-template.ts'],['03-secret-governance.log','check-secrets.ts'],['04-git-governance.log','check-git-governance.ts'],
  ['05-build-validation.log','check-build-boundary.ts'],['06-docker-static.log','check-docker-static.ts'],['07-prisma-static.log','check-prisma-static.ts'],['08-scope-audit.log','check-scope.ts'],
] as const;
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
const results:string[]=[];let failed=false;
for(const [log,script] of checks){const child=Bun.spawn(['bun',`scripts/replan-s0/${script}`],{cwd:root,stdout:'pipe',stderr:'pipe'});const stdout=await new Response(child.stdout).text();const stderr=await new Response(child.stderr).text();const code=await child.exited;const status=code===0?'PASS':'FAIL';await writeFile(resolve(out,log),`${status}\n${stdout}${stderr}`);results.push(`- ${log}: ${status}`);if(code!==0)failed=true;}
await writeFile(resolve(out,'MANIFEST.md'),`# REPLAN-S0 Evidence Manifest\n\n${results.join('\n')}\n`);
const sums:string[]=[];for(const [log] of checks){const bytes=await Bun.file(resolve(out,log)).arrayBuffer();sums.push(`${createHash('sha256').update(new Uint8Array(bytes)).digest('hex').toUpperCase()}  ${log}`);}const manifest=await Bun.file(resolve(out,'MANIFEST.md')).arrayBuffer();sums.push(`${createHash('sha256').update(new Uint8Array(manifest)).digest('hex').toUpperCase()}  MANIFEST.md`);await writeFile(resolve(out,'SHA256SUMS.txt'),sums.join('\n')+'\n');
process.stdout.write(results.join('\n')+'\n');if(failed)process.exit(1);
