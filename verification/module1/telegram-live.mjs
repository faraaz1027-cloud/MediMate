// Authorized real C1 test through normal loopback auth/API. Cookies and CSRF
// values stay in memory; the one-time link is kept only in ignored .local-data.
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {seedDemo,demoPassword} from '../../scripts/seed-demo.mjs';
const origin='http://127.0.0.1:1212',directory='.local-data/module1-telegram';
fs.mkdirSync(directory,{recursive:true});const filename=directory+'/state.json';
const mode=process.argv[2];
async function login(email){
  let cookie='',csrf='';
  async function api(method,path,body,key=randomUUID()){
    const response=await fetch(origin+'/api/v1'+path,{method,signal:AbortSignal.timeout(15000),headers:{Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':key},body:body===undefined?undefined:JSON.stringify(body)});
    if(response.headers.get('set-cookie'))cookie=response.headers.get('set-cookie').split(';')[0];
    const json=await response.json();if(json.data?.csrfToken)csrf=json.data.csrfToken;
    if(!response.ok)throw Error('Local API '+response.status+' '+(json.error?.code||'REQUEST_FAILED'));
    return json.data;
  }
  await api('GET','/auth/csrf');await api('POST','/auth/login',{email,password:demoPassword});
  return api;
}
function save(state){fs.writeFileSync(filename,JSON.stringify(state,null,2)+'\n');}
try{
  if(!['prepare','status','confirm','send','ack','evidence'].includes(mode))throw Error('Use prepare|status|confirm|send|ack|evidence.');
  let state=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):{};
  if(mode==='prepare'){
    const fixture=await seedDemo(origin);state={...state,patientId:fixture.patientId,ownerId:fixture.ownerId,caregiverId:fixture.caregiverId};
  }else if(!state.patientId)throw Error('Run prepare first.');
  const caregiver=await login('handover-caregiver@example.test');
  let channel=await caregiver('GET','/me/channel-links');
  if(!channel.configured||channel.botUsername!=='Medi911_bot')throw Error('The local API must use the configured dedicated Medi911_bot.');
  if(mode==='prepare'){
    if(!channel.links.length){
      const current=channel.challenges.find(c=>c.id===state.challengeId);
      if(!current){const challenge=await caregiver('POST','/me/channel-link-challenges',{provider:'telegram'});state.challengeId=challenge.id;state.challengeUrl=challenge.challengeUrl;state.expiresAt=challenge.expiresAt;}
    }
    state.taskCreateKey||=randomUUID();state.testCreatedAt||=new Date().toISOString();save(state);
    console.log(JSON.stringify({prepared:true,bot:channel.botUsername,challengePrepared:Boolean(state.challengeUrl),alreadyLinked:channel.links.length>0,oneTimeLink:'Saved privately; omitted from output',expiresAt:state.expiresAt},null,2));
  }else if(mode==='confirm'){
    if(!channel.links.length){
      const proposed=channel.challenges.find(c=>c.id===state.challengeId&&c.status==='proposed');
      if(!proposed)throw Error('Open the one-time link/start the bot first; no consent was recorded.');
      await caregiver('POST','/me/channel-link-challenges/'+proposed.id+'/confirm',{expectedRevision:proposed.revision,consent:true});
    }
    delete state.challengeUrl;save(state);
    console.log(JSON.stringify({linked:true,consent:'Recorded via normal authenticated API under the user-authorized test recipient',actor:'Synthetic caregiver; signed-in Telegram account on user PC'},null,2));
  }else if(mode==='send'){
    if(!channel.links.length)throw Error('No active consenting channel link; no task notice sent.');
    const owner=await login('handover-owner@example.test');
    if(!state.taskId){
      const task=await owner('POST','/patients/'+state.patientId+'/tasks',{title:'Synthetic Module 1 Telegram receipt test '+state.testCreatedAt,type:'general',assigneeUserId:state.caregiverId,handoverNote:'Synthetic classroom delivery check; no medical information.'},state.taskCreateKey);
      state.taskId=task.id;save(state);
    }
    console.log(JSON.stringify({taskId:state.taskId,queuedViaNormalTaskCreate:true,recipient:'Linked synthetic caregiver; user-authorized Telegram account',actualReceipt:'Not yet verified; inspect actual Telegram message'},null,2));
  }else{
    if(mode==='ack'){
      if(!state.taskId)throw Error('Create the test task first.');
      const task=await caregiver('GET','/patients/'+state.patientId+'/tasks/'+state.taskId);
      if(!task.acknowledgedAt)await caregiver('POST','/patients/'+state.patientId+'/tasks/'+state.taskId+'/acknowledgements',{expectedRevision:task.revision});
    }
    channel=await caregiver('GET','/me/channel-links');
    const report={at:new Date().toISOString(),bot:channel.botUsername,configured:channel.configured,activeLinks:channel.links.length,workerLastActiveAt:channel.workerLastActiveAt,challengeStates:channel.challenges.map(c=>({id:c.id,status:c.status})),taskId:state.taskId||null,synthetic:true,actor:'Codex-operated user-authorized real transport check; not Sahir individual viva/contribution evidence'};
    if(state.taskId){
      report.task=await caregiver('GET','/patients/'+state.patientId+'/tasks/'+state.taskId);
      report.notifications=await caregiver('GET','/patients/'+state.patientId+'/tasks/'+state.taskId+'/notifications');
    }
    if(mode==='evidence'){
      const output='docs/evidence/module1-telegram';fs.mkdirSync(output,{recursive:true});
      fs.writeFileSync(output+'/delivery-api.json',JSON.stringify(report,null,2)+'\n');
    }
    console.log(JSON.stringify(report,null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}
