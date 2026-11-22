// Windows integration check of the actual local helper. Disposable replica,
// normal authenticated HTTP, synthetic credentials, no real Telegram transport.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {root,exportCollections} from './collections.mjs';
const requireTests=createRequire(new URL('../step18/package.json',import.meta.url));
const requireNewman=createRequire(new URL('../../../assignment03-tools/package.json',import.meta.url));
const {MongoMemoryReplSet}=requireTests('mongodb-memory-server'),newman=requireNewman('newman');
if(process.platform!=='win32')throw Error('This helper check uses Windows PowerShell; use the normal cross-platform verifier on Linux.');
const out=path.join(root,'docs/evidence/module1-readiness');fs.mkdirSync(out,{recursive:true});
const local=path.join(root,'.local-data/module1-readiness');fs.mkdirSync(local,{recursive:true});
const privateFile=path.join(local,'synthetic-telegram.env');
fs.writeFileSync(privateFile,'TELEGRAM_BOT_TOKEN=123456789:SYnthetic_Local_Only_Token_123456789\nTELEGRAM_BOT_USERNAME=medimate_test_bot\n');
const report={at:new Date().toISOString(),synthetic:true,realTelegramRequests:0,privateFileContainsOnlySyntheticFixture:true,checks:[],collections:[]};
const servers=[];
let replica;
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function available(port=0){
  const server=net.createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const selected=server.address().port;await new Promise(r=>server.close(r));return selected;
}
async function stop(child){
  if(child.exitCode!==null)return;
  if(!servers.includes(child)||!Number.isInteger(child.pid)||child.pid<=0)throw Error('Unowned process refused.');
  const ended=new Promise(r=>child.once('exit',r));
  spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  await ended;
}
async function start(port,enabled=false){
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local.ps1','-Mode','Server','-Port',String(port),'-MongoPort',String(replica.instanceInfo?.port||mongoPort)];
  if(enabled)args.push('-EnableTelegram','-TelegramEnvFile',privateFile);
  const child=spawn('powershell.exe',args,{cwd:root,windowsHide:true,env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH,TELEGRAM_BOT_TOKEN:'123456789:SYnthetic_Inherited_Only_Token_12345',TELEGRAM_BOT_USERNAME:'inherited_test_bot'},stdio:['ignore','pipe','pipe']});
  servers.push(child);let diagnostic='';child.stdout.on('data',b=>{diagnostic+=b;});child.stderr.on('data',b=>{diagnostic+=b;});
  for(let attempt=0;attempt<120;attempt++){
    if(child.exitCode!==null)throw Error('Local helper stopped before readiness. Check local service configuration.');
    try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok)return child;}catch{}
    await pause(250);
  }
  throw Error('Local helper readiness timed out.');
}
async function channelState(port){
  const base=`http://127.0.0.1:${port}/api/v1`;let cookie='',csrf='';
  async function call(method,url,body){
    const response=await fetch(base+url,{method,headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const json=await response.json();if(json.data?.csrfToken)csrf=json.data.csrfToken;
    if(!response.ok)throw Error('Synthetic authenticated startup probe failed: '+response.status);
    return json.data;
  }
  await call('GET','/auth/csrf');await call('POST','/auth/register',{email:`startup-${randomUUID()}@example.test`,password:'Synthetic-startup-123!',displayName:'Synthetic startup probe'});
  return call('GET','/me/channel-links');
}
const mongoPort=await available();
try{
  for(const member of exportCollections())await available(member.port);
  replica=await MongoMemoryReplSet.create({binary:{version:'7.0.24'},instanceOpts:[{port:mongoPort}],replSet:{name:'assignment03',count:1}});
  const check=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/local.ps1','-Mode','CheckTelegram','-TelegramEnvFile',privateFile],{cwd:root,windowsHide:true,encoding:'utf8',env:{...process.env,PATH:path.dirname(process.execPath)+path.delimiter+process.env.PATH}});
  if(check.status!==0||!check.stdout.includes('syntax validation only'))throw Error('PowerShell Telegram syntax-check bridge failed.');
  report.checks.push({name:'PowerShell private Telegram config check',passed:true,liveValidation:false});
  const port=await available();
  let child=await start(port);let state=await channelState(port);
  if(state.configured)throw Error('Default helper must disable inherited Telegram configuration.');
  await stop(child);report.checks.push({name:'Default real helper clears inherited Telegram credentials',passed:true});
  child=await start(port,true);state=await channelState(port);
  if(!state.configured||state.botUsername!=='medimate_test_bot')throw Error('Opt-in private Telegram settings were not used by the actual API.');
  await stop(child);report.checks.push({name:'Opt-in real helper loads private Telegram-only file; no worker or send',passed:true});
  for(const member of exportCollections()){
    child=await start(member.port);
    const result=await new Promise((resolve,reject)=>newman.run({collection:member.collection,reporters:[],timeoutRequest:30000,timeoutScript:60000},(error,run)=>error?reject(error):resolve(run)));
    const record={member:member.short,id:member.id,port:member.port,requests:result.run.stats.requests.total,assertions:result.run.stats.assertions.total,failures:result.run.failures.map(f=>({request:f.source?.name,error:f.error.message})),telegram:'disabled; no actual receipt',provider:member.id==='B1'?'Actual public RxNorm requests through real server':'No live external credit claimed'};
    report.collections.push(record);await stop(child);
    if(record.failures.length)throw Error('Module 1 Newman collection failed for '+member.short);
  }
  report.passed=true;
}catch(error){report.passed=false;report.error=error.message;process.exitCode=1;}
finally{
  for(const child of servers)await stop(child);
  if(replica)await replica.stop();
  report.servicesStopped=true;
  fs.writeFileSync(path.join(out,'startup-newman.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}
