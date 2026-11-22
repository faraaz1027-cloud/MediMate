// Reference regression cases. Only rehearsal copies install the test entrypoints.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {createHttpApp} from '../../server/http-app.js';
import {runtimeConfig} from '../../server/runtime-config.js';
import {db} from '../../server/v1/store.js';
const specs={
 sadat:{name:'Ihfaz Rashid Sadat',model:'Prescription',collection:'prescriptions',route:'prescriptions',field:'title',related:['prescriptions','prescriptionVersions','prescriptionInstructions']},
 faraaz:{name:'Faraaz Jamil Chowdhury',model:'CabinetItem',collection:'cabinetItems',route:'cabinet-items',field:'strengthText',related:['cabinetItems','cabinetRevisions','sourceRecords']},
 sahir:{name:'Sahir Jawad Chowdhury',model:'Task',collection:'careTasks',route:'tasks',field:'title',related:['careTasks','taskEvents','taskNotes','notificationJobs']}
};
export function runVivaCase(member){
 const spec=specs[member];if(!spec)throw Error('Unknown member');
 test('Step 42 reference exercise for '+spec.name,{timeout:30000},async t=>{
  const limit=Number(process.env.VIVA_EXPECT_LIMIT||80),mode=limit===200?'baseline':'modified';
  assert.ok([80,200].includes(limit));
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:'viva_'+member+'_'+randomUUID().replaceAll('-','')});await db.init();
  let server,origin,cookie='',csrf='';const observations=[];
  async function start(){const http=createHttpApp({db,config:runtimeConfig({NODE_ENV:'test'}),readiness:async()=>true,services:{telegram:{enabled:false}}});server=http.finish().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));origin='http://127.0.0.1:'+server.address().port;}
  await start();t.after(async()=>{await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect();});
  async function call(method,path,body){
   const r=await fetch(origin+'/api/v1'+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});
   if(r.headers.get('set-cookie'))cookie=r.headers.get('set-cookie').split(';')[0];
   const b=await r.json();if(b.data?.csrfToken)csrf=b.data.csrfToken;
   return {status:r.status,body:b};
  }
  await call('GET','/auth/csrf');
  const registration=await call('POST','/auth/register',{email:member+'@example.test',displayName:'Synthetic viva '+member,password:'Synthetic-viva-123!'});
  assert.equal(registration.status,201);
  const patientId=registration.body.data.patientId,ownerId=registration.body.data.user.id,base='/patients/'+patientId+'/'+spec.route;
  function payload(value){return member==='sadat'?{title:value,instructions:[{lineNumber:1,medicineText:'Synthetic viva entry',instructionsText:'Synthetic transcription only',clarificationRequired:true}]}:member==='faraaz'?{entryType:'manual',displayName:'Synthetic viva cabinet',strengthText:value,form:'tablet'}:{title:value,assigneeUserId:ownerId,type:'general'};}
  let saved;
  for(const length of [limit-1,limit]){const r=await call('POST',base,payload('A'.repeat(length)));assert.equal(r.status,201);saved=r.body.data.prescription||r.body.data;observations.push({operation:'create',length,status:r.status});}
  const counts=async()=>Object.fromEntries(await Promise.all(spec.related.map(async name=>[name,await mongoose.connection.db.collection(name).countDocuments()])));
  const beforeCounts=await counts();
  let r=await call('POST',base,payload('B'.repeat(limit+1)));assert.equal(r.status,422);assert.ok(r.body.error.fields.some(x=>x.path===spec.field));assert.deepEqual(await counts(),beforeCounts);
  observations.push({operation:'create',length:limit+1,status:r.status,noPartialDomainWrites:true});
  const stored=await db.one(spec.model,{_id:saved.id});assert.equal(stored[spec.field].length,limit);
  if(member!=='sadat'){
   const detail=(await call('GET',base+'/'+saved.id)).body.data;
   r=await call('PATCH',base+'/'+saved.id,{expectedRevision:stored.revision,[spec.field]:'C'.repeat(limit+1),...(member==='faraaz'?{reason:'Synthetic boundary exercise'}:{})});
   assert.equal(r.status,422);assert.deepEqual((await call('GET',base+'/'+saved.id)).body.data,detail);
   observations.push({operation:'edit',length:limit+1,status:r.status,unchangedRecord:true});
  }
  const modelDocument={patientId:new mongoose.Types.ObjectId(patientId),[spec.field]:'D'.repeat(limit+1),...(member==='faraaz'?{displayName:'Synthetic schema fixture',entryType:'manual',status:'active'}:{}),...(member==='sahir'?{createdByUserId:new mongoose.Types.ObjectId(ownerId),assigneeUserId:new mongoose.Types.ObjectId(ownerId),type:'general',status:'open'}:{})};
  if(mode==='modified')await assert.rejects(db.insert(spec.model,modelDocument),e=>e.name==='ValidationError'&&!!e.errors?.[spec.field]);
  else assert.equal((await db.insert(spec.model,modelDocument))[spec.field].length,201);
  observations.push({operation:'Mongoose document insert',length:limit+1,rejectedByFieldValidator:mode==='modified'});
  await new Promise(r=>server.close(r));await start();
  assert.equal((await call('GET',base+'/'+saved.id)).status,200);assert.equal((await db.one(spec.model,{_id:saved.id}))[spec.field].length,limit);
  r=await call('POST',base,payload('E'.repeat(limit+1)));assert.equal(r.status,422);
  const anonymous=await fetch(origin+'/api/v1'+base);assert.equal(anonymous.status,401);
  observations.push({operation:'after HTTP restart',persistedLength:limit,overlongStatus:r.status,anonymousReadStatus:anonymous.status});
  fs.mkdirSync('docs/evidence/step42',{recursive:true});
  fs.writeFileSync('docs/evidence/step42/'+mode+'-'+member+'.json',JSON.stringify({at:new Date().toISOString(),member:spec.name,actor:'Codex reference rehearsal, not the student',mode,field:spec.field,expectedLimit:limit,passed:true,synthetic:true,observations,limitation:'Mongoose document validation is not a MongoDB collection validator. Update routes still need explicit validation.'},null,2)+'\n');
 });
}
