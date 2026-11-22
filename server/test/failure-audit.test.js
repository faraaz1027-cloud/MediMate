import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {randomUUID} from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import {createV1} from "../v1/app.js";
import {db} from "../v1/store.js";
import {createFollowupWorker} from "../v1/followup-worker.js";
import {expectStatus as ok,seedDoseSchedule,syntheticPassword} from "../../verification/step27/fixture.mjs";

test("Step 38 adversarial patient/permission/CSRF/OCR and SOS boundary audit",{timeout:90000},async t=>{
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:"audit_"+randomUUID().replaceAll("-","")});await db.init();
  let clock=new Date("2026-11-21T00:00:00Z");const checks=[],exchanges=[];
  const app=express();app.use("/api/v1",createV1({db,telegram:{enabled:false},now:()=>new Date(clock)}));
  const server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));
  t.after(async()=>{fs.writeFileSync("docs/evidence/step38-audit.json",JSON.stringify({runAt:new Date().toISOString(),synthetic:true,transport:"Local Express/MongoDB; no real alerts",checks,exchanges,databaseLifecycle:"Disposable database removed after assertions"},null,2)+"\n");await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect();});
  const base=`http://127.0.0.1:${server.address().port}/api/v1`;
  function client(){let cookie="",csrf="";return {async call(method,path,body,key=randomUUID(),headers={}){
    const r=await fetch(base+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":key,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    if(r.headers.get("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];const b=await r.json();if(b.data?.csrfToken)csrf=b.data.csrfToken;exchanges.push({method,path,status:r.status});return {status:r.status,body:b};
  }};}
  async function account(role){const c=client();ok(await c.call("GET","/auth/csrf"));const data=ok(await c.call("POST","/auth/register",{email:`audit-${role}@example.test`,password:syntheticPassword,displayName:`Synthetic audit ${role}`}),201);return {...c,...data};}
  async function check(name,fn){await t.test(name,async()=>{try{await fn();checks.push({name,status:"passed"});}catch(e){checks.push({name,status:"failed",failure:String(e.message).slice(0,300)});throw e;}});}
  const owner=await account("owner"),caregiver=await account("caregiver"),recipient=await account("recipient");
  const p="/patients/"+owner.patientId,second=ok(await owner.call("POST","/patients",{displayName:"Synthetic second owned patient",timezone:"UTC"}),201),other="/patients/"+second.id;
  let grant=ok(await owner.call("POST",p+"/access-grants",{userId:caregiver.user.id,permissions:["dose.read","dose.record","task.read","task.write","report.read","sos.activate","sos.manage"]}),201);
  const seed=await seedDoseSchedule(owner,p,clock);clock=new Date(seed.start.getTime()+10*60000);
  const extra=ok(await owner.call("POST",p+"/cabinet-items",{entryType:"manual",displayName:"Synthetic second medicine"}),201);
  const review=ok(await owner.call("POST",p+"/ingredient-reviews",{cabinetItemIds:[seed.cabinet.id,extra.id]}),201);
  const answer=ok(await owner.call("POST",p+"/educational-answers",{cabinetItemId:seed.cabinet.id,question:"What warnings are in the label?"}),201);
  let note=ok(await owner.call("POST",p+"/health-notes",{text:"Synthetic original note",recordedAt:clock.toISOString()}),201);
  const report=ok(await owner.call("POST",p+"/report-exports",{fromUTC:seed.start.toISOString(),toUTC:seed.end.toISOString(),displayTimezone:"UTC"}),201);
  ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:null,enabled:true,delayMinutes:10,caregiverUserId:caregiver.user.id,consent:true}));
  await createFollowupWorker({db,telegram:{enabled:false},now:()=>new Date(clock)}).queueDue();const followup=ok(await caregiver.call("GET",p+"/followups")).followups[0];
  let contact=ok(await owner.call("POST",p+"/emergency-contacts",{displayName:"Synthetic consenting contact",recipientUserId:recipient.user.id}),201);
  ok(await recipient.call("POST",`/me/emergency-invitations/${contact.id}/respond`,{expectedRevision:contact.revision,action:"consent"}));
  const activation={confirmed:true,locationStatus:"unavailable"};let incident=ok(await owner.call("POST",p+"/sos-incidents",activation),201);
  await check("resource IDs stay patient-scoped even when the caller owns both patients",async()=>{
    for(const path of [`/cabinet-items/${seed.cabinet.id}`,`/prescriptions/${seed.prescription.id}`,`/schedules/${seed.schedule.id}`,`/doses/${seed.occurrences[0].id}`,`/tasks/${followup.taskId}`,`/followups/${followup.id}`,`/ingredient-reviews/${review.id}`,`/educational-answers/${answer.id}`,`/report-exports/${report.id}`,`/report-exports/${report.id}/content`,`/sos-incidents/${incident.id}`])ok(await owner.call("GET",other+path),404);
    ok(await owner.call("PATCH",`${other}/health-notes/${note.id}`,{expectedRevision:0,text:"wrong patient",reason:"scope test"}),404);
    ok(await owner.call("PATCH",`${other}/emergency-contacts/${contact.id}`,{expectedRevision:1,displayName:"wrong patient"}),404);
  });
  await check("wrong CSRF cannot write a note, activate SOS or revoke recipient consent",async()=>{
    const notes=await db.count("HealthNote",{}),incidents=await db.count("SosIncident",{}),headers={"X-CSRF-Token":"invalid-synthetic-csrf"};
    ok(await owner.call("POST",p+"/health-notes",{text:"rejected",recordedAt:clock.toISOString()},randomUUID(),headers),403);
    ok(await owner.call("POST",p+"/sos-incidents",activation,randomUUID(),headers),403);
    contact=ok(await owner.call("GET",p+"/emergency-contacts"))[0];ok(await recipient.call("POST",`/me/emergency-invitations/${contact.id}/respond`,{expectedRevision:contact.revision,action:"revoke"},randomUUID(),headers),403);
    assert.equal(await db.count("HealthNote",{}),notes);assert.equal(await db.count("SosIncident",{}),incidents);assert.equal((await db.one("EmergencyContact",{_id:contact.id})).status,"active");
  });
  await check("blurred OCR remains an unconfirmed clarification draft",async()=>{
    const enginePath="docs/evidence/step38-ocr.json",engine=fs.existsSync(enginePath)?JSON.parse(fs.readFileSync(enginePath,"utf8")):null;
    const blurred=engine?.status==="passed"?engine.recognitions.find(x=>x.kind==="blurred"):null;
    const source=blurred?{fileName:"blurred.png",mimeType:"image/png",sizeBytes:blurred.sizeBytes,sha256:blurred.sha256,ocrText:blurred.text.slice(0,30000),confidence:blurred.confidence,ocrStatus:blurred.text.trim()?"succeeded":"failed"}:{fileName:"controlled-low-confidence.png",mimeType:"image/png",sizeBytes:100,sha256:"a".repeat(64),ocrText:"unreadable controlled suggestion",confidence:3,ocrStatus:"failed"};
    const before=await db.count("DoseOccurrence",{}),draft=ok(await owner.call("POST",p+"/prescriptions",{title:"Synthetic blurry-source review",instructions:[{lineNumber:1,medicineText:"Unclear synthetic input",strengthText:"Unverified synthetic strength",instructionsText:"Requires manual clarification",doseQuantity:"1",doseUnit:"tablet",frequencyText:"Synthetic timing requires clarification",durationText:"Synthetic duration requires clarification",clarificationRequired:true}],source}),201);
    assert.equal(draft.draftVersion.source.confidence,source.confidence);assert.ok(!draft.prescription.currentVersionId);
    const rejected=await owner.call("POST",`${p}/prescriptions/${draft.prescription.id}/versions/${draft.draftVersion.id}/confirm`,{expectedRevision:0,reviewed:true});ok(rejected,422);assert.ok(rejected.body.error.fields.some(x=>x.path.includes("clarificationRequired")));assert.equal(await db.count("DoseOccurrence",{}),before);
  });
  await check("concurrent health-note revisions commit one winner and preserve history",async()=>{
    const results=await Promise.all(["A","B"].map(x=>owner.call("PATCH",`${p}/health-notes/${note.id}`,{expectedRevision:0,text:"Synthetic edit "+x,reason:"Concurrent review"})));
    assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(await db.count("HealthNoteRevision",{noteId:note.id}),2);
    note=await db.one("HealthNote",{_id:note.id});assert.equal(note.revision,1);
  });
  await check("forged SOS delivery/provider fields cannot manufacture dispatch or closure",async()=>{
    ok(await owner.call("POST",p+"/sos-incidents",{...activation,dispatchConfirmed:true,status:"resolved"}),422);
    ok(await owner.call("POST",`${p}/sos-incidents/${incident.id}/resolve`,{expectedRevision:0,outcome:"synthetic",dispatchConfirmed:true}),422);
    ok(await owner.call("POST",`${p}/sos-incidents/${incident.id}/provider-requests`,{providerKey:"unconfigured",providerMode:"verified_partner"}),422);
    const row=ok(await owner.call("GET",p+"/sos-incidents/"+incident.id));assert.equal(row.status,"active");assert.equal(row.dispatchConfirmed,false);
  });
  await check("losing SOS manager access blocks another activator's closure, including receipt replay",async()=>{
    const path=`${p}/sos-incidents/${incident.id}/cancel`,key=randomUUID(),body={expectedRevision:0,reason:"Synthetic manager closure"};ok(await caregiver.call("POST",path,body,key));
    incident=ok(await owner.call("POST",p+"/sos-incidents",activation),201);
    grant=ok(await owner.call("PATCH",`${p}/access-grants/${grant.id}`,{expectedRevision:grant.revision,permissions:grant.permissions.filter(x=>x!=="sos.manage")}));
    ok(await caregiver.call("POST",`${p}/sos-incidents/${incident.id}/cancel`,{expectedRevision:0,reason:"Unauthorized non-originator"}),403);
    ok(await caregiver.call("POST",path,body,key),403);
    // An activator retaining sos.activate can still close/replay their own incident.
    ok(await owner.call("POST",`${p}/sos-incidents/${incident.id}/cancel`,{expectedRevision:0,reason:"Prepare originator check"}));
    const own=ok(await caregiver.call("POST",p+"/sos-incidents",activation),201),ownKey=randomUUID(),ownBody={expectedRevision:0,reason:"Originator closure"};
    ok(await caregiver.call("POST",`${p}/sos-incidents/${own.id}/cancel`,ownBody,ownKey));ok(await caregiver.call("POST",`${p}/sos-incidents/${own.id}/cancel`,ownBody,ownKey));
    incident=ok(await owner.call("POST",p+"/sos-incidents",activation),201);
  });
  await check("partial caregiver permission loss also protects old follow-up receipts",async()=>{
    const path=`${p}/followups/${followup.id}/acknowledge`,key=randomUUID(),body={expectedRevision:followup.revision};ok(await caregiver.call("POST",path,body,key));
    grant=ok(await owner.call("PATCH",`${p}/access-grants/${grant.id}`,{expectedRevision:grant.revision,permissions:grant.permissions.filter(x=>x!=="task.write")}));
    ok(await caregiver.call("POST",path,body,key),403);ok(await caregiver.call("GET",`${p}/followups/${followup.id}`),403);
  });
  await check("consent revoked during acknowledgement cannot commit a stale recipient acknowledgement",async()=>{
    const original=db.fence;let ready,release;const reached=new Promise(r=>{ready=r;}),gate=new Promise(r=>{release=r;});let held=false;
    db.fence=async function(name,...args){if(name==="EmergencyContact"&&!held){held=true;ready();await gate;}return original.call(this,name,...args);};
    try{
      const ack=recipient.call("POST",`/me/sos-incidents/${incident.id}/acknowledge`,{expectedRevision:0});await reached;
      contact=ok(await owner.call("GET",p+"/emergency-contacts"))[0];ok(await owner.call("POST",`${p}/emergency-contacts/${contact.id}/revoke`,{expectedRevision:contact.revision}));release();ok(await ack,404);
    }finally{release();db.fence=original;}
    assert.equal(await db.count("SosAcknowledgement",{incidentId:incident.id}),0);assert.equal(ok(await recipient.call("GET","/me/sos-incidents")).incidents.length,0);
  });
  await check("malformed plus placement is rejected consistently with the UI call controls",async()=>{
    contact=ok(await owner.call("GET",p+"/emergency-contacts"))[0];
    ok(await owner.call("PATCH",`${p}/emergency-contacts/${contact.id}`,{expectedRevision:contact.revision,contactPhone:"++8801700000000"}),422);
    ok(await owner.call("PATCH",`${p}/emergency-contacts/${contact.id}`,{expectedRevision:contact.revision,contactPhone:"88+01700000000"}),422);
    assert.equal(ok(await owner.call("PATCH",`${p}/emergency-contacts/${contact.id}`,{expectedRevision:contact.revision,contactPhone:"+880 1700-000000"})).contactPhone,"+880 1700-000000");
  });
  await check("expired session rejects old writes, and fresh CSRF/login restores authorized access",async()=>{
    const expiring=await account("expiry"),path="/patients/"+expiring.patientId+"/cabinet-items",key=randomUUID(),body={entryType:"manual",displayName:"Synthetic expiry item"};const first=ok(await expiring.call("POST",path,body,key),201);
    clock=new Date(clock.getTime()+8*3600000+1);ok(await expiring.call("POST",path,body,key),401);
    ok(await expiring.call("GET","/auth/csrf"));ok(await expiring.call("POST","/auth/login",{email:"audit-expiry@example.test",password:syntheticPassword}));
    assert.equal(ok(await expiring.call("POST",path,body,key)).id,first.id);assert.equal(await db.count("CabinetItem",{patientId:expiring.patientId}),1);
  });
});
