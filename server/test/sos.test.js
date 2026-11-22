import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {execFileSync} from "node:child_process";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { createRxNorm } from "../v1/rxnorm.js";
import {createSosWorker} from "../v1/sos-worker.js";
import { db } from "../v1/store.js";
import { expectStatus as ok, syntheticPassword, seedDoseSchedule } from "../../verification/step27/fixture.mjs";

test("Step 36 C5 recipient consent, SOS incidents and durable notifications",{timeout:90000},async t => {
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:"b3_"+randomUUID().replaceAll("-","")}); await db.init();
  let clock=new Date("2026-11-21T00:00:00Z"), sends=0;
  let failure="",hospitalDown=false,hospitalQueries=0;const kinds=[];
  const telegram={enabled:true,sendSosNotice:async(_,kind)=>{sends++;kinds.push(kind);if(failure)throw {code:failure==="unknown"?"OUTCOME_UNKNOWN":"PROVIDER_REJECTED",uncertain:failure==="unknown"};return {messageId:String(sends)};}};
  const hospitals={search:async()=>{hospitalQueries++;if(hospitalDown)throw Error("Synthetic map outage");return {sourceUrl:"https://overpass-api.de/api/interpreter",retrievedAt:clock.toISOString(),listings:[{externalPlaceKey:"node/1",name:"Synthetic hospital",phone:"+8801700000000",listingUrl:"https://www.openstreetmap.org/node/1"}],limited:false};}};
  let outage = false;
  const source = createRxNorm({spacingMs:0,fetchImpl:async url => {
    if (outage) throw Error("Synthetic outage");
    const product = /rxcui\/(\d+)/.exec(url)[1];
    if (url.includes("properties.json")) return Response.json({properties:{rxcui:product,name: product === "2" ? "Synthetic brand acetaminophen plus caffeine" : product === "3" ? "Synthetic ibuprofen" : "Synthetic paracetamol product",tty:"SCD",suppress:"N"}});
    const ids = product === "2" ? ["161","1886"] : product === "3" ? ["5640"] : product === "4" ? [] : ["161"];
    return Response.json({relatedGroup:{rxcui:product,conceptGroup:[{tty:"IN",conceptProperties:ids.map(rxcui => ({rxcui,name:rxcui === "161" ? "acetaminophen" : rxcui === "1886" ? "caffeine" : "ibuprofen",tty:"IN",suppress:"N"}))}]}});
  }});
  const app = express(); app.use("/api/v1",createV1({db,rxnorm:source,telegram,hospitals,now:()=>new Date(clock)}));
  const server = app.listen(0,"127.0.0.1"); await new Promise(r => server.once("listening",r));
  t.after(async () => {await new Promise(r => server.close(r)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();});
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function client() { let cookie="",csrf=""; return {async call(method,path,body,key=randomUUID(),origin=base) {
    const r = await fetch(origin+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":key},body:body === undefined ? undefined : JSON.stringify(body)});
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await r.json(); if (b.data?.csrfToken) csrf=b.data.csrfToken; return {status:r.status,body:b};
  }}; }
  async function register(c) {ok(await c.call("GET","/auth/csrf")); return ok(await c.call("POST","/auth/register",{email:randomUUID()+"@example.test",password:syntheticPassword,displayName:"Synthetic SOS participant"}),201);}
  const owner=client(), stranger=client(); const user=await register(owner); const foreign=await register(stranger); const p="/patients/"+user.patientId;
  const recipient=client(),person=await register(recipient),worker=()=>createSosWorker({db,telegram,now:()=>new Date(clock)});
  const body={confirmed:true,locationStatus:"denied",callbackPhone:"+8801700000000"};
  const get=async row=>ok(await owner.call("GET",p+"/sos-incidents/"+row.id));
  const activate=async()=>ok(await owner.call("POST",p+"/sos-incidents",body),201);
  const close=async row=>{const current=await get(row);return ok(await owner.call("POST",p+"/sos-incidents/"+row.id+"/cancel",{expectedRevision:current.revision,reason:"Synthetic classroom closure"}));};
  let contact,incident;
  await t.test("owner cannot assert recipient consent; unconsented incident has no recipients",async()=>{
    contact=ok(await owner.call("POST",p+"/emergency-contacts",{displayName:"Synthetic consenting recipient",recipientUserId:person.user.id}),201);
    assert.equal(contact.status,"pending");
    ok(await owner.call("PATCH",p+"/emergency-contacts/"+contact.id,{expectedRevision:contact.revision,status:"active"}),422);
    ok(await owner.call("POST","/me/emergency-invitations/"+contact.id+"/respond",{expectedRevision:contact.revision,action:"consent"}),404);
    const first=await activate();assert.equal((await get(first)).jobs.length,0);await close(first);
    const invite=ok(await recipient.call("GET","/me/emergency-invitations"))[0];
    ok(await recipient.call("POST","/me/emergency-invitations/"+invite.id+"/respond",{expectedRevision:invite.revision,action:"consent"}));
    ok(await recipient.call("POST","/me/emergency-invitations/"+invite.id+"/respond",{expectedRevision:invite.revision,action:"consent"}),409);
    ok(await recipient.call("GET",p+"/sos-incidents"),404);
    await db.insert("ChannelLink",{userId:person.user.id,chatId:"synthetic-chat",telegramUserId:"synthetic-recipient",consentedAt:clock,revokedAt:null});
  });
  await t.test("deliberate activation, denied location and concurrent presses create one durable alert",async()=>{
    ok(await owner.call("POST",p+"/sos-incidents",{...body,confirmed:false}),422);
    ok(await owner.call("POST",p+"/sos-incidents",{...body,location:{latitude:0,longitude:0}}),422);
    const key=randomUUID(),both=await Promise.all([owner.call("POST",p+"/sos-incidents",body,key),owner.call("POST",p+"/sos-incidents",body)]);
    assert.ok(both.every(x=>x.status===201));assert.equal(both[0].body.data.id,both[1].body.data.id);incident=both[0].body.data;
    assert.equal(ok(await owner.call("POST",p+"/sos-incidents",body,key)).id,incident.id);
    const row=await get(incident);assert.equal(row.locationStatus,"denied");assert.ok(!row.location);assert.equal(row.jobs.length,1);assert.equal(row.dispatchConfirmed,false);assert.equal(hospitalQueries,0);
  });
  await t.test("controlled channel acceptance is separate from recipient acknowledgement and provider simulation",async()=>{
    await worker().deliverOne();assert.equal(sends,1);let row=await get(incident);assert.equal(row.jobs[0].status,"sent");assert.equal(row.acknowledgements.length,0);
    ok(await owner.call("POST",p+"/sos-incidents/"+incident.id+"/provider-requests",{providerKey:"unknown",providerMode:"verified_partner"}),422);
    const simulated=ok(await owner.call("POST",p+"/sos-incidents/"+incident.id+"/provider-requests",{providerKey:"classroom_demo",providerMode:"simulated"}),201);assert.equal(simulated.status,"simulated_request_only");assert.equal((await get(incident)).dispatchConfirmed,false);
    const inbox=ok(await recipient.call("GET","/me/sos-incidents"));assert.equal(inbox.incidents[0].id,incident.id);assert.equal(inbox.incidents[0].locationStatus,"denied");assert.ok(!JSON.stringify(inbox).includes("dose"));
    const key=randomUUID(),ack={expectedRevision:row.revision};ok(await stranger.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",ack),404);
    ok(await recipient.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",ack,key));ok(await recipient.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",ack,key));
    row=await get(incident);assert.equal(row.acknowledgements.length,1);await close(incident);await worker().deliverOne();assert.equal(kinds.at(-1),"cancelled");assert.equal(sends,2);
    ok(await recipient.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",{expectedRevision:(await get(incident)).revision}),409);
  });
  await t.test("location validation, active incident privacy and hospital outage are independent",async()=>{
    clock=new Date(clock.getTime()+11*60000);
    ok(await owner.call("POST",p+"/sos-incidents",{confirmed:true,locationStatus:"available",location:{latitude:23.74,longitude:90.37,accuracyMeters:10,capturedAt:new Date(clock.getTime()-6*60000).toISOString()}}),422);
    incident=ok(await owner.call("POST",p+"/sos-incidents",{confirmed:true,locationStatus:"available",location:{latitude:23.74,longitude:90.37,accuracyMeters:0,capturedAt:clock.toISOString()}}),201);
    assert.equal((await get(incident)).location.accuracyMeters,0);ok(await stranger.call("GET",p+"/sos-incidents/"+incident.id),404);
    assert.equal(ok(await owner.call("GET",p+"/hospitals?latitude=23.74&longitude=90.37&radiusMeters=5000")).listings.length,1);hospitalDown=true;
    ok(await owner.call("GET",p+"/hospitals?latitude=23.74&longitude=90.37&radiusMeters=5000"),503);hospitalDown=false;
  });
  await t.test("revocation suppresses pending alert and a later consent cannot expose the old incident",async()=>{
    contact=ok(await owner.call("GET",p+"/emergency-contacts"))[0];ok(await owner.call("POST",p+"/emergency-contacts/"+contact.id+"/revoke",{expectedRevision:contact.revision}));
    await worker().deliverOne();assert.equal(sends,2);assert.equal((await get(incident)).jobs[0].status,"suppressed");assert.equal(ok(await recipient.call("GET","/me/sos-incidents")).incidents.length,0);
    contact=ok(await owner.call("POST",p+"/emergency-contacts",{displayName:"Synthetic recipient re-invite",recipientUserId:person.user.id}),201);
    ok(await recipient.call("POST","/me/emergency-invitations/"+contact.id+"/respond",{expectedRevision:contact.revision,action:"consent"}));
    ok(await recipient.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",{expectedRevision:(await get(incident)).revision}),404);await close(incident);
  });
  await t.test("uncertain send and interrupted lease stay unknown through worker restart; never auto-resend",async()=>{
    clock=new Date(clock.getTime()+11*60000);incident=await activate();failure="unknown";await worker().deliverOne();failure="";
    let row=await get(incident),job=row.jobs[0];assert.equal(job.status,"unknown");const count=sends;
    ok(await owner.call("POST",p+"/sos-incidents/"+incident.id+"/jobs/"+job.id+"/retry",{expectedRevision:job.revision}),409);await worker().deliverOne();assert.equal(sends,count);
    await db.update("SosJob",{_id:job.id},{status:"processing",leaseUntil:new Date(clock.getTime()-1)});await worker().deliverOne();
    job=(await get(incident)).jobs[0];assert.equal(job.status,"unknown");assert.equal(job.errorCode,"WORKER_INTERRUPTED");assert.equal(sends,count);
    const uri=new URL(process.env.MONGODB_TEST_URI);uri.pathname="/"+mongoose.connection.name;
    const out=execFileSync(process.execPath,["server/sos-worker.js","--once"],{encoding:"utf8",timeout:20000,env:{...process.env,MONGODB_URI:uri.href,TELEGRAM_BOT_TOKEN:"",TELEGRAM_BOT_USERNAME:""}});assert.ok(out.includes('"telegramConfigured":false'));assert.equal((await get(incident)).jobs[0].status,"unknown");await close(incident);await worker().deliverOne();
  });
  await t.test("definite failure retries once with durable attempts; cancellation stops queued alerts",async()=>{
    clock=new Date(clock.getTime()+11*60000);incident=await activate();failure="definite";await worker().deliverOne();failure="";let job=(await get(incident)).jobs[0];assert.equal(job.status,"failed");
    ok(await owner.call("POST",p+"/sos-incidents/"+incident.id+"/jobs/"+job.id+"/retry",{expectedRevision:job.revision}));await worker().deliverOne();const row=await get(incident);assert.equal(row.jobs[0].status,"sent");assert.equal(row.attempts.length,2);await close(incident);await worker().deliverOne();
    clock=new Date(clock.getTime()+11*60000);incident=await activate();const count=sends;await close(incident);await worker().deliverOne();assert.equal(sends,count+1);assert.equal(kinds.at(-1),"cancelled");assert.equal((await get(incident)).jobs.find(x=>x.kind==="alert").status,"suppressed");
  });
  await t.test("failed alert insertion rolls back incident; disabled configuration retains zero-attempt notices",async()=>{
    clock=new Date(clock.getTime()+11*60000);const before=await db.count("SosIncident",{}),insert=db.insert;
    db.insert=async function(name,...args){if(name==="SosJob")throw Error("Synthetic alert storage failure");return insert.call(this,name,...args);};
    try{ok(await owner.call("POST",p+"/sos-incidents",body),503);}finally{db.insert=insert;}
    assert.equal(await db.count("SosIncident",{}),before);incident=await activate();const disabled=createSosWorker({db,telegram:{enabled:false},now:()=>new Date(clock)});await disabled.deliverOne();const job=(await get(incident)).jobs[0];assert.equal(job.status,"disabled");assert.equal(job.attemptCount,0);await close(incident);await disabled.deliverOne();
  });
  await t.test("invitation/acknowledgement expire and activation limits give explicit retry guidance",async()=>{
    clock=new Date(clock.getTime()+11*60000);incident=await activate();clock=new Date(clock.getTime()+30*60000);
    ok(await recipient.call("POST","/me/sos-incidents/"+incident.id+"/acknowledge",{expectedRevision:(await get(incident)).revision}),409);await close(incident);
    for(let i=0;i<5;i++){incident=await activate();await close(incident);}
    const limited=await owner.call("POST",p+"/sos-incidents",body);ok(limited,429);assert.match(limited.body.error.message,/Retry after/);
    const second=ok(await owner.call("POST",p+"/emergency-contacts",{displayName:"Synthetic expiring invitation",recipientUserId:foreign.user.id}),201);
    clock=new Date(clock.getTime()+86400000);await db.updateMany("Session",{},{expiresAt:new Date(clock.getTime()+3600000)});
    ok(await stranger.call("POST","/me/emergency-invitations/"+second.id+"/respond",{expectedRevision:second.revision,action:"consent"}),409);
  });
  await t.test("production does not mount classroom provider simulation",async()=>{
    const prior=process.env.NODE_ENV;let prodServer;
    try{
      process.env.NODE_ENV="production";const prod=express();prod.use("/api/v1",createV1({db,telegram:{enabled:false},now:()=>new Date(clock)}));prodServer=prod.listen(0,"127.0.0.1");await new Promise(r=>prodServer.once("listening",r));
      const origin=`http://127.0.0.1:${prodServer.address().port}/api/v1`;
      ok(await owner.call("POST",p+"/sos-incidents/"+incident.id+"/provider-requests",{providerKey:"classroom_demo",providerMode:"simulated"},randomUUID(),origin),404);
    }finally{if(prior===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=prior;if(prodServer)await new Promise(r=>prodServer.close(r));}
  });
});
