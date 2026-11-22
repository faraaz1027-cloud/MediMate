// Identical sequence locally and in CI. No cloud DB or live provider secret needed.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
if(!process.env.npm_execpath)throw Error('Run this script with npm run verify.');
fs.mkdirSync('.local-data/verification',{recursive:true});
const results=[];
for(const [name,args] of [
 ['build',[process.env.npm_execpath,'run','build']],
 ['api',['verification/step18/api.mjs']],
 ['ui',['--experimental-vm-modules','verification/step18/run.mjs']]
]){
 const started=Date.now(),log=fs.createWriteStream('.local-data/verification/'+name+'.txt');
 const child=spawn(process.execPath,args,{cwd:root,env:{...process.env,TELEGRAM_BOT_TOKEN:'',TELEGRAM_BOT_USERNAME:''},stdio:['ignore','pipe','pipe']});
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{process.stdout.write(chunk);log.write(chunk);});
 const exitCode=await new Promise(resolve=>{child.once('error',()=>resolve(1));child.once('exit',code=>resolve(code??1));});
 await new Promise(resolve=>log.end(resolve));
 results.push({name,exitCode,elapsedMs:Date.now()-started});
 fs.writeFileSync('.local-data/verification/summary.json',JSON.stringify({at:new Date().toISOString(),node:process.version,platform:process.platform,controlledProviders:true,results},null,2)+'\n');
 if(exitCode){process.exitCode=exitCode;break;}
}
