// Create an isolated exercise copy; never edit the canonical application files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);let dependencies=root,member='all',name;
if(args[0]&&!args[0].startsWith('--'))dependencies=args.shift();
while(args.length){const option=args.shift(),value=args.shift();if(option==='--member')member=value;else if(option==='--name')name=value;else throw Error('Use optional dependency path, --member sadat|faraaz|sahir, --name simple-name.');}
if(!['all','sadat','faraaz','sahir'].includes(member))throw Error('Choose a known member.');
if(name&&!/^[a-z][a-z0-9-]*$/.test(name))throw Error('Use a simple directory name without paths.');
name=name||(member==='all'?'Rehearsal_Source':member+'-practice');
const review=path.resolve(root,'../Support/Step42_Review'),dest=path.join(review,name);
if(fs.existsSync(dest))throw Error('Rehearsal copy exists; preserve it and choose a fresh directory manually before repeating preparation.');
const deps=path.resolve(dependencies);
for(const sub of ['node_modules','verification/step18/node_modules'])if(!fs.existsSync(path.join(deps,sub)))throw Error('Install root and verification/step18 dependencies first, or supply a tested dependency checkout.');
fs.mkdirSync(dest,{recursive:true});
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))];
const canonical=[];
for(const name of names){
 if(name.startsWith('docs/evidence/step42/'))continue;
 if(/(^|\/)\.env($|\.)/.test(name)&&!name.endsWith('.env.example'))throw Error('Private environment selected');
 const source=path.resolve(root,name),target=path.resolve(dest,name);
 if(!source.startsWith(path.resolve(root)+path.sep)||!target.startsWith(dest+path.sep))throw Error('Outside checkout');
 if(!fs.existsSync(source))continue;
 if(fs.lstatSync(source).isSymbolicLink())throw Error('Review source link before copying');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
 if(name.startsWith('client/')||name.startsWith('server/'))canonical.push({path:name,sha256:createHash('sha256').update(fs.readFileSync(source)).digest('hex')});
}
for(const sub of ['node_modules','verification/step18/node_modules'])fs.cpSync(path.join(deps,sub),path.join(dest,sub),{recursive:true,dereference:true});
for(const selected of member==='all'?['sadat','faraaz','sahir']:[member])fs.writeFileSync(path.join(dest,'server/test/viva-'+selected+'.test.js'),`import {runVivaCase} from '../../verification/step42/cases.mjs';\nrunVivaCase('${selected}');\n`);
const hashName=name==='Rehearsal_Source'?'canonical-app-hashes.json':'canonical-app-hashes-'+name+'.json';
fs.writeFileSync(path.join(review,hashName),JSON.stringify({source:root,rehearsal:dest,member,dependenciesCopiedFrom:deps,files:canonical},null,2)+'\n');
console.log(JSON.stringify({rehearsal:dest,member,canonicalApplicationFilesHashed:canonical.length,dependencies:'copied from already installed lockfile-tested tools; no new clean-install claim',mode:'unmodified baseline application plus selected isolated tests; default expected 80 will fail until the student implements the exercise'}));
