import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { createRxNorm } from "../v1/rxnorm.js";
import fs from "node:fs";
import { db } from "../v1/store.js";
import { expectStatus as ok, syntheticPassword, seedDoseSchedule } from "../../verification/step27/fixture.mjs";

test("Step 35 report counts, source projections, notes and private PDF",{timeout:90000},async t => {
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:"b3_"+randomUUID().replaceAll("-","")}); await db.init();
  let clock=new Date("2026-11-21T00:00:00Z");
  let outage = false;
  const source = createRxNorm({spacingMs:0,fetchImpl:async url => {
    if (outage) throw Error("Synthetic outage");
    const product = /rxcui\/(\d+)/.exec(url)[1];
    if (url.includes("properties.json")) return Response.json({properties:{rxcui:product,name: product === "2" ? "Synthetic brand acetaminophen plus caffeine" : product === "3" ? "Synthetic ibuprofen" : "Synthetic paracetamol product",tty:"SCD",suppress:"N"}});
    const ids = product === "2" ? ["161","1886"] : product === "3" ? ["5640"] : product === "4" ? [] : ["161"];
    return Response.json({relatedGroup:{rxcui:product,conceptGroup:[{tty:"IN",conceptProperties:ids.map(rxcui => ({rxcui,name:rxcui === "161" ? "acetaminophen" : rxcui === "1886" ? "caffeine" : "ibuprofen",tty:"IN",suppress:"N"}))}]}});
  }});
  const app = express(); app.use("/api/v1",createV1({db,rxnorm:source,telegram:{enabled:false},now:()=>new Date(clock)}));
  const server = app.listen(0,"127.0.0.1"); await new Promise(r => server.once("listening",r));
  t.after(async () => {await new Promise(r => server.close(r)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();});
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function client() { let cookie="",csrf=""; return {async raw(path){return fetch(base+path,{headers:{Cookie:cookie}});},async call(method,path,body,key=randomUUID()) {
    const r = await fetch(base+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":key},body:body === undefined ? undefined : JSON.stringify(body)});
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await r.json(); if (b.data?.csrfToken) csrf=b.data.csrfToken; return {status:r.status,body:b};
  }}; }
  async function register(c) {ok(await c.call("GET","/auth/csrf")); return ok(await c.call("POST","/auth/register",{email:randomUUID()+"@example.test",password:syntheticPassword,displayName:"Synthetic B3 user"}),201);}
  const owner=client(), stranger=client(); const user=await register(owner); await register(stranger); const p="/patients/"+user.patientId;
  const seed=await seedDoseSchedule(owner,p,clock);clock=new Date(seed.start.getTime()+45*60000);
  for(const [i,action] of [[0,"taken"],[1,"skipped"]]){const key=randomUUID();ok(await owner.call("POST",p+"/doses/"+seed.occurrences[i].id+"/actions",{action,expectedRevision:0,clientRequestId:key},key));}
  await db.update("DoseOccurrence",{_id:seed.occurrences[4].id},{state:"cancelled",cancellationReason:"Synthetic excluded fixture"});
  const body={fromUTC:seed.start.toISOString(),toUTC:seed.end.toISOString(),displayTimezone:"Asia/Dhaka"},query="?"+new URLSearchParams({fromUTC:body.fromUTC,toUTC:body.toUTC,timezone:body.displayTimezone});
  let saved,note,counts;
  const basic=x=>({taken:x.taken,skipped:x.skipped,pending:x.pending,overdueUnconfirmed:x.overdueUnconfirmed,cancelled:x.cancelled});
  await t.test("disjoint counts, UTC boundaries and default delay match Mongo fixtures",async()=>{
    counts=ok(await owner.call("GET",p+"/analytics"+query));
    assert.deepEqual(basic(counts),{taken:1,skipped:1,pending:9,overdueUnconfirmed:0,cancelled:1});
    // At +50 minutes the occurrence at +20 reaches the default 30-minute threshold.
    clock=new Date(seed.start.getTime()+50*60000);counts=ok(await owner.call("GET",p+"/analytics"+query));
    assert.deepEqual(basic(counts),{taken:1,skipped:1,pending:8,overdueUnconfirmed:1,cancelled:1});
    const empty=ok(await owner.call("GET",p+"/analytics?"+new URLSearchParams({fromUTC:seed.end.toISOString(),toUTC:new Date(seed.end.getTime()+60000).toISOString(),timezone:"UTC"})));
    assert.equal(empty.scheduled,0);assert.equal(empty.coverage,"no_scheduled_occurrences");
    ok(await owner.call("GET",p+"/analytics?"+new URLSearchParams({fromUTC:body.toUTC,toUTC:body.fromUTC,timezone:"UTC"})),422);
    ok(await owner.call("GET",p+"/analytics"+query.replace("Asia%2FDhaka","Invented%2FZone")),422);
  });
  await t.test("notes require write, preserve revisions and reject future dates",async()=>{
    note=ok(await owner.call("POST",p+"/health-notes",{text:"Synthetic visit note: follow-up discussion. বাংলা পরীক্ষা",recordedAt:clock.toISOString()}),201);
    const revised=ok(await owner.call("PATCH",p+"/health-notes/"+note.id,{expectedRevision:0,text:note.text+" Revised.",reason:"Synthetic correction"}));
    assert.equal(revised.revision,1);assert.equal(await db.count("HealthNoteRevision",{noteId:note.id}),2);
    ok(await owner.call("PATCH",p+"/health-notes/"+note.id,{expectedRevision:0,text:"stale",reason:"stale"}),409);
    ok(await owner.call("POST",p+"/health-notes",{text:"future",recordedAt:new Date(clock.getTime()+60000).toISOString()}),422);
  });
  await t.test("report includes history, exact fractional refill and task metadata without private notes",async()=>{
    await db.insert("StockTransaction",{patientId:user.patientId,cabinetItemId:seed.cabinet.id,reason:"refill",recordedAt:clock,deltaMicros:"123456789012345678",unit:"mL",operationKey:randomUUID(),note:"PRIVATE REFILL NOTE"});
    await db.insert("TaskEvent",{patientId:user.patientId,taskId:new mongoose.Types.ObjectId(),eventType:"handover",occurredAt:clock,text:"PRIVATE HANDOVER TEXT"});
    const key=randomUUID();saved=ok(await owner.call("POST",p+"/report-exports",body,key),201);
    assert.equal(ok(await owner.call("POST",p+"/report-exports",body,key)).id,saved.id);
    const meta=ok(await owner.call("GET",p+"/report-exports/"+saved.id));
    assert.deepEqual(basic(meta.snapshot),basic(counts));assert.equal(meta.snapshot.refills[0].quantity,"123456789012.345678");
    assert.equal(meta.snapshot.healthNotes.length,1);assert.equal(meta.snapshot.actions.length,2);assert.ok(meta.snapshot.doses.length);
    assert.equal(meta.snapshot.prescriptions.length,1);assert.equal(meta.snapshot.prescriptions[0].inclusion,"source_for_selected_doses");
    assert.ok(!JSON.stringify(meta).includes("PRIVATE HANDOVER TEXT"));assert.ok(!JSON.stringify(meta).includes("PRIVATE REFILL NOTE"));
    const pdf=await owner.raw(p+"/report-exports/"+saved.id+"/content");assert.equal(pdf.status,200);assert.match(pdf.headers.get("content-type"),/application\/pdf/);assert.match(pdf.headers.get("cache-control"),/no-store/);
    const bytes=Buffer.from(await pdf.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),"%PDF-");
    const regenerated=ok(await owner.call("POST",p+"/report-exports",body),201);
    const again=ok(await owner.call("GET",p+"/report-exports/"+regenerated.id));
    assert.deepEqual(again.snapshot,meta.snapshot);
    const repeated=Buffer.from(await (await owner.raw(p+"/report-exports/"+regenerated.id+"/content")).arrayBuffer());
    assert.deepEqual(repeated,bytes,"Identical source snapshot and cutoff regenerate the same PDF");
    fs.mkdirSync("output/pdf",{recursive:true});fs.writeFileSync("output/pdf/step35-synthetic-visit.pdf",bytes);fs.writeFileSync("output/pdf/step35-snapshot.json",JSON.stringify(meta.snapshot,null,2));
  });
  await t.test("report-read is a bounded projection, cannot write notes; access rechecked on download",async()=>{
    const reader=client(),person=await register(reader),grant=ok(await owner.call("POST",p+"/access-grants",{userId:person.user.id,permissions:["report.read"]}),201);
    ok(await reader.call("GET",p+"/analytics"+query));ok(await reader.call("POST",p+"/health-notes",{text:"unauthorized",recordedAt:clock.toISOString()}),403);
    assert.equal((await reader.raw(p+"/report-exports/"+saved.id+"/content")).status,200);
    await db.update("AccessGrant",{_id:grant.id},{revokedAt:clock});assert.equal((await reader.raw(p+"/report-exports/"+saved.id+"/content")).status,404);
    ok(await stranger.call("GET",p+"/report-exports/"+saved.id),404);
  });
  await t.test("saved counts stay frozen after note/action changes; export expires at 24 hours",async()=>{
    ok(await owner.call("PATCH",p+"/health-notes/"+note.id,{expectedRevision:1,text:"Later note edit",reason:"Later discussion"}));
    const meta=ok(await owner.call("GET",p+"/report-exports/"+saved.id));assert.match(meta.snapshot.healthNotes[0].text,/Revised/);assert.deepEqual(basic(meta.snapshot),basic(counts));
    clock=new Date(new Date(meta.expiresAt));await db.updateMany("Session",{},{expiresAt:new Date(clock.getTime()+3600000)});
    ok(await owner.call("GET",p+"/report-exports/"+saved.id),410);assert.equal((await owner.raw(p+"/report-exports/"+saved.id+"/content")).status,410);
  });
  await t.test("export limits, missing source and unsupported glyph errors leave no partial export",async()=>{
    const before=await db.count("ReportExport",{}),version=await db.one("ScheduleVersion",{_id:seed.version.id});
    await db.remove("ScheduleVersion",{_id:version._id});ok(await owner.call("POST",p+"/report-exports",body),503);await db.insert("ScheduleVersion",version);
    const unsupported=ok(await owner.call("POST",p+"/health-notes",{text:"Unsupported fixture \u{1F680}",recordedAt:seed.start.toISOString()}),201);
    ok(await owner.call("POST",p+"/report-exports",body),422);await db.remove("HealthNote",{_id:unsupported.id});
    assert.equal(await db.count("ReportExport",{}),before);
    const many=Array.from({length:501},(_,i)=>({patientId:user.patientId,scheduleVersionId:new mongoose.Types.ObjectId(),dueAtUTC:new Date(new Date(body.fromUTC).getTime()+i),state:"pending"}));
    await db.insertMany("DoseOccurrence",many);ok(await owner.call("POST",p+"/report-exports",body),422);
    assert.equal(await db.count("ReportExport",{}),before);
  });
});
