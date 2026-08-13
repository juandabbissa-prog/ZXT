const root=import.meta.dir+'/../..';
const pkg=JSON.parse(await Bun.file(`${root}/package.json`).text());
if(pkg.scripts.build!=="bun --filter '*' build")throw new Error('Root build boundary changed');
const allowed=['@re-agent/shared','@re-agent/sdk','@re-agent/crawler','@re-agent/workers'];
const paths=['packages/shared/package.json','packages/sdk/package.json','apps/crawler/package.json','workers/package.json'];
for(let index=0;index<paths.length;index++){const item=JSON.parse(await Bun.file(`${root}/${paths[index]}`).text());if(item.name!==allowed[index]||item.scripts?.build!=='tsc --noEmit')throw new Error(`Unsafe alternative build boundary: ${allowed[index]}`);}
process.stdout.write('BUILD_EXCLUDED_REASON root build includes Prisma-dependent web next build\n');
for(const workspace of allowed){const child=Bun.spawn(['bun','--filter',workspace,'build'],{cwd:root,stdout:'inherit',stderr:'inherit'});const code=await child.exited;if(code!==0)throw new Error(`Alternative build failed: ${workspace}`);}
process.stdout.write('ALTERNATIVE_STATIC_VALIDATION_PASS included shared/sdk/crawler/workers only\n');
