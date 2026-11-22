// Only adds labelled synthetic records through the real loopback API.
// Never clears a database or resets an existing password/grant.
import {randomUUID} from 'node:crypto';
export const demoPassword='Synthetic-handover-123!';
export async function seedDemo(origin){
 const url=new URL(origin);
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Synthetic seeding requires a loopback HTTP origin with no path or credentials.');
 const base=url.origin;
 function client(){let cookie='',csrf='';return async(method,path,body)=>{
  const r=await fetch(base+'/api/v1'+path,{method,signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});
  if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
  const result=await r.json();if(result.data?.csrfToken)csrf=result.data.csrfToken;
  if(!r.ok){const error=Error('Synthetic setup failed: '+r.status+' '+(result.error?.code||''));error.status=r.status;throw error;}
  return result.data;
 };}
 async function account(email,displayName){const api=client();await api('GET','/auth/csrf');try{await api('POST','/auth/register',{email,displayName,password:demoPassword});}catch(e){if(e.status!==409)throw e;await api('POST','/auth/login',{email,password:demoPassword});}return {api,user:await api('GET','/auth/me')};}
 const owner=await account('handover-owner@example.test','Synthetic handover owner');
 const caregiver=await account('handover-caregiver@example.test','Synthetic handover caregiver');
 const patient=owner.user.patients.find(p=>p.role==='owner');if(!patient)throw Error('Synthetic owner has no active owned patient; restore it manually instead of silently replacing records.');
 const prefix='/patients/'+patient.id,api=owner.api;
 const grants=await api('GET',prefix+'/access-grants');
 if(!grants.some(g=>g.userId===caregiver.user.id))await api('POST',prefix+'/access-grants',{userId:caregiver.user.id,permissions:['task.read','task.write','dose.read','dose.record']});
 const cabinet=await api('GET',prefix+'/cabinet-items?q=Synthetic%20handover&status=all&limit=100');
 for(const label of ['A','B','C']){const name='Synthetic handover medicine '+label;if(!cabinet.some(x=>x.displayName===name))await api('POST',prefix+'/cabinet-items',{entryType:'manual',displayName:name,strengthText:'Synthetic description only',form:'tablet'});}
 const prescriptions=await api('GET',prefix+'/prescriptions?limit=100');
 if(!prescriptions.some(x=>x.title==='Synthetic handover draft'))await api('POST',prefix+'/prescriptions',{title:'Synthetic handover draft',instructions:[{lineNumber:1,medicineText:'Synthetic handover medicine A',instructionsText:'Demonstration transcription only',clarificationRequired:true}]});
 const tasks=await api('GET',prefix+'/tasks?limit=100');
 if(!tasks.some(x=>x.title==='Synthetic handover review task'))await api('POST',prefix+'/tasks',{title:'Synthetic handover review task',assigneeUserId:caregiver.user.id,type:'general',handoverNote:'Synthetic initial handover note'});
 return {synthetic:true,patientId:patient.id,ownerId:owner.user.id,caregiverId:caregiver.user.id,emails:['handover-owner@example.test','handover-caregiver@example.test'],scope:'Unconfirmed draft, three manual items, caregiver task; no clinical schedule or live message created.'};
}
if(process.argv[1]&&new URL(import.meta.url).pathname.toLowerCase().endsWith(process.argv[1].replaceAll('\\','/').toLowerCase())){
 try{console.log(JSON.stringify(await seedDemo(process.argv[2]||'http://127.0.0.1:1499'),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
