// Current Module 1 evidence, isolated from the dated Step24/Step43 records.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const directory=path.resolve(root,'docs/evidence/module1-readiness');
fs.mkdirSync(directory,{recursive:true});
const npm=process.env.npm_execpath;
if(!npm)throw Error('Run via npm run verify:module1.');
const results=[];
async function stage(name,args){
  const log=fs.createWriteStream(path.join(directory,name+'.txt'));
  const start=Date.now();
  const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,TELEGRAM_BOT_TOKEN:'',TELEGRAM_BOT_USERNAME:''},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{log.write(chunk);process.stdout.write(chunk);});
  child.stderr.on('data',chunk=>{log.write(chunk);process.stderr.write(chunk);});
  const exitCode=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code??1));});
  await new Promise(resolve=>log.end(resolve));
  results.push({name,exitCode,elapsedMs:Date.now()-start});
  fs.writeFileSync(path.join(directory,'summary.json'),JSON.stringify({at:new Date().toISOString(),node:process.version,platform:process.platform,synthetic:true,actor:'Codex technical preparation, not student demonstration',telegram:'disabled; no live receipt',results},null,2)+'\n');
  if(exitCode!==0)throw Error(name+' failed; inspect its recorded log.');
}
await stage('build',[npm,'run','build']);
await stage('api',['verification/step18/api.mjs',...['api','prescriptions','cabinet','rxnorm','tasks','telegram','module1','handover','local-telegram'].map(n=>'server/test/'+n+'.test.js')]);
await stage('ui',['--experimental-vm-modules','verification/step18/run.mjs']);
await stage('live-rxnorm',['verification/step24/run.mjs','--live-rxnorm','--output',path.join(directory,'live-rxnorm.json')]);
