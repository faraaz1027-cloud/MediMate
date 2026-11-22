import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {execFileSync} from "node:child_process";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { createRxNorm } from "../v1/rxnorm.js";
import {createFollowupWorker} from "../v1/followup-worker.js";
import { db } from "../v1/store.js";
import { expectStatus as ok, syntheticPassword, seedDoseSchedule } from "../../verification/step27/fixture.mjs";

test("Step 34 overdue-unconfirmed follow-up and caregiver escalation",{timeout:90000},async t => {
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:"b3_"+randomUUID().replaceAll("-","")}); await db.init();
  let clock=new Date("2026-11-21T00:00:00Z"), sends=0;
  const telegram={enabled:true,sendTaskNotice:async()=>{sends++;return {messageId:String(sends)};}};
  let outage = false;
  const source = createRxNorm({spacingMs:0,fetchImpl:async url => {
    if (outage) throw Error("Synthetic outage");
    const product = /rxcui\/(\d+)/.exec(url)[1];
    if (url.includes("properties.json")) return Response.json({properties:{rxcui:product,name: product === "2" ? "Synthetic brand acetaminophen plus caffeine" : product === "3" ? "Synthetic ibuprofen" : "Synthetic paracetamol product",tty:"SCD",suppress:"N"}});
    const ids = product === "2" ? ["161","1886"] : product === "3" ? ["5640"] : product === "4" ? [] : ["161"];
    return Response.json({relatedGroup:{rxcui:product,conceptGroup:[{tty:"IN",conceptProperties:ids.map(rxcui => ({rxcui,name:rxcui === "161" ? "acetaminophen" : rxcui === "1886" ? "caffeine" : "ibuprofen",tty:"IN",suppress:"N"}))}]}});
  }});
  const app = express(); app.use("/api/v1",createV1({db,rxnorm:source,telegram,now:()=>new Date(clock)}));
  const server = app.listen(0,"127.0.0.1"); await new Promise(r => server.once("listening",r));
  t.after(async () => {await new Promise(r => server.close(r)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();});
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function client() { let cookie="",csrf=""; return {async call(method,path,body,key=randomUUID()) {
    const r = await fetch(base+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":key},body:body === undefined ? undefined : JSON.stringify(body)});
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await r.json(); if (b.data?.csrfToken) csrf=b.data.csrfToken; return {status:r.status,body:b};
  }}; }
  async function register(c) {ok(await c.call("GET","/auth/csrf")); return ok(await c.call("POST","/auth/register",{email:randomUUID()+"@example.test",password:syntheticPassword,displayName:"Synthetic B3 user"}),201);}
  const owner=client(), stranger=client(); const user=await register(owner); const foreign=await register(stranger); const p="/patients/"+user.patientId;
  const caregiver=client(), person=await register(caregiver);
  const grant=ok(await owner.call("POST",p+"/access-grants",{userId:person.user.id,permissions:["dose.read","dose.record","task.read","task.write"]}),201);
  await db.insert("ChannelLink",{userId:person.user.id,chatId:"synthetic",telegramUserId:"synthetic",consentedAt:clock,revokedAt:null});
  const seed=await seedDoseSchedule(owner,p,clock), worker=()=>createFollowupWorker({db,telegram,now:()=>new Date(clock)});
  let pref,first;
  const list=async(who=owner)=>ok(await who.call("GET",p+"/followups")).followups;
  await t.test("owner consent and eligible caregiver required; default off",async()=>{
    assert.equal(ok(await owner.call("GET",p+"/followup-settings")).settings.enabled,false);
    ok(await caregiver.call("GET",p+"/followup-settings"),403);
    ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:null,enabled:true,delayMinutes:10,caregiverUserId:person.user.id}),422);
    ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:null,enabled:true,delayMinutes:10,caregiverUserId:foreign.user.id,consent:true}),422);
    pref=ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:null,enabled:true,delayMinutes:10,caregiverUserId:person.user.id,consent:true}));
    clock=new Date(seed.start.getTime()+9*60000);await worker().queueDue();assert.equal((await list()).length,0);
  });
  await t.test("boundary creates one task/job/follow-up, restart and concurrent scans deduplicate",async()=>{
    clock=new Date(seed.start.getTime()+10*60000);
    await Promise.all([worker().queueDue(),worker().queueDue()]);await worker().queueDue();
    const rows=await list();assert.equal(rows.length,1);first=rows[0];assert.equal(first.status,"overdue-unconfirmed");
    assert.equal((await db.one("DoseOccurrence",{_id:first.occurrenceId})).state,"pending");
    assert.equal(await db.count("Task",{followupId:first.id}),1);assert.equal(await db.count("NotificationJob",{taskId:first.taskId}),1);
    await worker().deliverOne();assert.equal(sends,1);await worker().deliverOne();assert.equal(sends,1);
    const detail=ok(await caregiver.call("GET",p+"/followups/"+first.id));assert.equal(detail.notices[0].status,"sent");assert.equal(detail.attempts.length,1);assert.ok(!detail.acknowledgedAt);
    assert.equal(detail.medicineText,"Synthetic C2 medicine");
  });
  await t.test("assigned acknowledgement, outcome and replay never infer skipped",async()=>{
    ok(await stranger.call("GET",p+"/followups/"+first.id),404);
    const path=p+"/followups/"+first.id;
    const key=randomUUID(),body={expectedRevision:first.revision};
    const ack=ok(await caregiver.call("POST",path+"/acknowledge",body,key));assert.equal(ack.status,"acknowledged");assert.equal(ok(await caregiver.call("POST",path+"/acknowledge",body,key)).revision,ack.revision);
    const done=ok(await caregiver.call("POST",path+"/resolve",{expectedRevision:ack.revision,outcome:"unable_to_contact",note:"Synthetic follow-up"}));assert.equal(done.status,"resolved");
    assert.equal((await db.one("DoseOccurrence",{_id:first.occurrenceId})).state,"pending");
    assert.equal((await db.one("Task",{_id:first.taskId})).status,"completed");
    await db.update("AccessGrant",{_id:grant.id},{permissions:["dose.read","dose.record"]});
    ok(await caregiver.call("POST",path+"/acknowledge",body,key),403);
    await db.update("AccessGrant",{_id:grant.id},{permissions:["dose.read","dose.record","task.read","task.write"]});
  });
  await t.test("failed job insert rolls back dose link, follow-up and task",async()=>{
    clock=new Date(seed.start.getTime()+20*60000);const original=db.insert;
    db.insert=async function(name,...args){if(name==="NotificationJob")throw Error("Synthetic job failure");return original.call(this,name,...args);};
    try{await assert.rejects(worker().queueDue());}finally{db.insert=original;}
    assert.equal(await db.count("DoseFollowup",{}),1);assert.equal(await db.count("Task",{}),1);
    await worker().queueDue();assert.equal((await list()).length,2);
  });
  await t.test("revocation suppresses queued delivery and denies follow-up access",async()=>{
    await db.update("AccessGrant",{_id:grant.id},{revokedAt:clock});await worker().deliverOne();assert.equal(sends,1);
    const second=(await list()).find(x=>x.id!==first.id);
    assert.equal((await db.one("NotificationJob",{taskId:second.taskId})).status,"suppressed");
    ok(await caregiver.call("GET",p+"/followups/"+second.id),404);
    clock=new Date(seed.start.getTime()+30*60000);await worker().queueDue();assert.equal((await list()).length,2);
    await db.update("AccessGrant",{_id:grant.id},{revokedAt:null});
  });
  await t.test("terminal recording suppresses before reconciliation; scan resolves without second dose write",async()=>{
    await worker().queueDue();const third=(await list()).find(x=>x.occurrenceId===seed.occurrences[2].id);assert.ok(third);
    const key=randomUUID();ok(await owner.call("POST",p+"/doses/"+third.occurrenceId+"/actions",{expectedRevision:0,action:"taken",clientRequestId:key},key));
    await worker().deliverOne();assert.equal(sends,1);await worker().queueDue();
    const saved=ok(await owner.call("GET",p+"/followups/"+third.id));assert.equal(saved.status,"resolved");assert.equal(saved.outcome,"dose_recorded");assert.equal(saved.doseState,"taken");
  });
  await t.test("opt-out suppresses queued notice and disabled Telegram records zero delivery",async()=>{
    clock=new Date(seed.start.getTime()+40*60000);await worker().queueDue();
    pref=ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:pref.revision,enabled:false,delayMinutes:10,caregiverUserId:person.user.id}));
    await worker().deliverOne();assert.equal(sends,1);
    pref=ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:pref.revision,enabled:true,delayMinutes:10,caregiverUserId:person.user.id,consent:true}));
    clock=new Date(seed.start.getTime()+50*60000);const disabled=createFollowupWorker({db,telegram:{enabled:false},now:()=>new Date(clock)});await disabled.queueDue();
    const jobs=await db.list("NotificationJob",{status:"disabled"},10);assert.ok(jobs.length);assert.equal(jobs[0].attemptCount,0);assert.equal(sends,1);
  });
  await t.test("actual worker process restart preserves existing rows with settings disabled",async()=>{
    pref=ok(await owner.call("PUT",p+"/followup-settings",{expectedRevision:pref.revision,enabled:false,delayMinutes:10,caregiverUserId:person.user.id}));
    const count=await db.count("DoseFollowup",{}),uri=new URL(process.env.MONGODB_TEST_URI);uri.pathname="/"+mongoose.connection.name;
    const output=execFileSync(process.execPath,["server/followup-worker.js","--once"],{encoding:"utf8",timeout:20000,env:{...process.env,MONGODB_URI:uri.href,TELEGRAM_BOT_TOKEN:"",TELEGRAM_BOT_USERNAME:""}});
    assert.ok(output.includes('"telegramConfigured":false'));assert.equal(await db.count("DoseFollowup",{}),count);
    assert.equal((await db.one("DoseOccurrence",{_id:first.occurrenceId})).state,"pending");
  });
});
