// Export the current source including required untracked work, never local secrets.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const label=process.argv[2]||'initial';if(!/^[a-z0-9-]+$/.test(label))throw Error('Use a simple unique export label.');
const destination=path.resolve(root,'../Support/Step41_Review/source-'+label);
if(fs.existsSync(destination))throw Error('Export directory already exists; use a new label.');
const names=[...new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean))].sort();
fs.mkdirSync(destination,{recursive:true});const files=[];
for(const name of names){
 if(name.startsWith('docs/evidence/step41/'))continue;
 if(name.split('/').some(p=>['node_modules','.git','.runtime','.local-data','output'].includes(p))||/(^|\/)\.env($|\.)/.test(name)&&!name.endsWith('.env.example'))throw Error('Private/generated path selected: '+name);
 const source=path.resolve(root,name);if(!source.startsWith(path.resolve(root)+path.sep))throw Error('Outside source checkout.');
 if(!fs.existsSync(source))continue;
 if(fs.lstatSync(source).isSymbolicLink())throw Error('Review symbolic link before export: '+name);
 const target=path.resolve(destination,name);if(!target.startsWith(destination+path.sep))throw Error('Outside export.');
 fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
 files.push({path:name,sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')});
}
const manifest={at:new Date().toISOString(),type:'uncommitted working-source export, not a published Git clone',source:root,destination,baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),files};
fs.writeFileSync(path.resolve(destination,'../manifest-'+label+'.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({destination,files:files.length}));
