import { readdir, stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
const root = resolve(import.meta.dir, '../..');
const roots = ['apps','packages','workers','scripts','docs/governance','.github'];
const excluded = new Set(['.git','node_modules','artifacts','.next','dist','coverage','outputs']);
const rules = [
  ['SEC001', /-----BEGIN [A-Z ]+PRIVATE KEY-----/],
  ['SEC002', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/],
  ['SEC003', /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ['SEC004', /\bAKIA[0-9A-Z]{16}\b/],
] as const;
const violations: string[] = [];
async function scan(path: string): Promise<void> {
  const entries = await readdir(path,{withFileTypes:true});
  for (const entry of entries) {
    if (excluded.has(entry.name)) continue;
    const full=resolve(path,entry.name);
    if(entry.isDirectory()){await scan(full);continue;}
    if(!/\.(?:ts|tsx|js|mjs|json|md|ya?ml|sh|ps1|example|Dockerfile)$/i.test(entry.name) && !entry.name.endsWith('Dockerfile')) continue;
    const lines=(await Bun.file(full).text()).split(/\r?\n/);
    lines.forEach((line,index)=>rules.forEach(([id,pattern])=>{if(pattern.test(line)) violations.push(`${relative(root,full)}|${id}|${index+1}|REDACTED`);}));
  }
}
for(const path of roots){const full=resolve(root,path);try{if((await stat(full)).isDirectory())await scan(full);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
if(violations.length){process.stderr.write(violations.join('\n')+'\n');process.exit(1);}
process.stdout.write('SECRET_STATIC_SCAN_PASS controlled paths only; this does not assert NO_SECRET_EXISTS\n');
