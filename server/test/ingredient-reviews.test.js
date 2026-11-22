import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import express from "express";
import mongoose from "mongoose";
import { createV1 } from "../v1/app.js";
import { createRxNorm } from "../v1/rxnorm.js";
import { db } from "../v1/store.js";
import { expectStatus as ok, syntheticPassword } from "../../verification/step27/fixture.mjs";

test("Step 32 ingredient identity, combinations, incomplete evidence, immutable reviews and access",{timeout:90000},async t => {
  await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:"b3_"+randomUUID().replaceAll("-","")}); await db.init();
  let outage = false;
  const source = createRxNorm({spacingMs:0,fetchImpl:async url => {
    if (outage) throw Error("Synthetic outage");
    const product = /rxcui\/(\d+)/.exec(url)[1];
    if (url.includes("properties.json")) return Response.json({properties:{rxcui:product,name: product === "2" ? "Synthetic brand acetaminophen plus caffeine" : product === "3" ? "Synthetic ibuprofen" : "Synthetic paracetamol product",tty:"SCD",suppress:"N"}});
    const ids = product === "2" ? ["161","1886"] : product === "3" ? ["5640"] : product === "4" ? [] : ["161"];
    return Response.json({relatedGroup:{rxcui:product,conceptGroup:[{tty:"IN",conceptProperties:ids.map(rxcui => ({rxcui,name:rxcui === "161" ? "acetaminophen" : rxcui === "1886" ? "caffeine" : "ibuprofen",tty:"IN",suppress:"N"}))}]}});
  }});
  const app = express(); app.use("/api/v1",createV1({db,rxnorm:source,telegram:{enabled:false}}));
  const server = app.listen(0,"127.0.0.1"); await new Promise(r => server.once("listening",r));
  t.after(async () => {await new Promise(r => server.close(r)); await mongoose.connection.dropDatabase(); await mongoose.disconnect();});
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  function client() { let cookie="",csrf=""; return {async call(method,path,body,key=randomUUID()) {
    const r = await fetch(base+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":key},body:body === undefined ? undefined : JSON.stringify(body)});
    if (r.headers.get("set-cookie")) cookie = r.headers.get("set-cookie").split(";")[0];
    const b = await r.json(); if (b.data?.csrfToken) csrf=b.data.csrfToken; return {status:r.status,body:b};
  }}; }
  async function register(c) {ok(await c.call("GET","/auth/csrf")); return ok(await c.call("POST","/auth/register",{email:randomUUID()+"@example.test",password:syntheticPassword,displayName:"Synthetic B3 user"}),201);}
  const owner=client(), stranger=client(); const user=await register(owner); await register(stranger); const p="/patients/"+user.patientId;
  const make = async n => ok(await owner.call("POST",p+"/cabinet-items",{entryType:"external",externalId:n,reviewed:true,strengthText:"Synthetic strength",form:"tablet"}),201);
  const a=await make("1"), b=await make("2"), c=await make("3"), empty=await make("4");
  const manual=ok(await owner.call("POST",p+"/cabinet-items",{entryType:"manual",displayName:"Synthetic unverified"}),201);
  async function confirm(row) {
    const url=p+"/cabinet-items/"+row.id;
    const candidate=ok(await owner.call("GET",url+"/ingredient-candidates"));
    const body={expectedRevision:candidate.confirmationRevision,expectedCabinetRevision:candidate.cabinetItem.revision,expectedContentHash:candidate.contentHash,reviewed:true};
    const key=randomUUID(), saved=ok(await owner.call("PUT",url+"/ingredient-confirmation",body,key));
    assert.equal(ok(await owner.call("PUT",url+"/ingredient-confirmation",body,key)).id,saved.id); return {candidate,body};
  }
  const compare = async rows => ok(await owner.call("POST",p+"/ingredient-reviews",{cabinetItemIds:rows.map(x=>x.id)}),201);
  await t.test("unconfirmed and manual identities remain insufficient",async () => {
    assert.equal((await compare([a,b])).result,"insufficient_information");
    assert.equal((await compare([a,manual])).result,"insufficient_information");
    ok(await owner.call("GET",p+"/cabinet-items/"+manual.id+"/ingredient-candidates"),422);
    ok(await owner.call("GET",p+"/cabinet-items/"+empty.id+"/ingredient-candidates"),422);
    ok(await owner.call("POST",p+"/ingredient-reviews",{cabinetItemIds:[a.id,a.id]}),422);
  });
  await confirm(a); await confirm(b); await confirm(c);
  let overlap;
  await t.test("alias names use canonical IDs and combination ingredients are retained",async () => {
    overlap=await compare([a,b]); assert.equal(overlap.result,"overlap"); assert.equal(overlap.overlaps[0].externalId,"161");
    assert.equal(overlap.ingredientSnapshots[1].ingredients.length,2);
    assert.equal(overlap.evidenceRefs.filter(x=>x.kind==="label_unavailable").length,2);
    assert.equal((await compare([a,c])).result,"no_overlap_in_confirmed_ingredients");
    const incomplete=await compare([a,b,manual]); assert.equal(incomplete.result,"insufficient_information"); assert.equal(incomplete.overlaps.length,1);
  });
  await t.test("label passages preserve source text and exclude personal notes",async () => {
    const label=await db.insert("SourceRecord",{provider:"openfda",externalId:"synthetic-label",sourceUrl:"https://api.fda.gov/drug/label.json",retrievedAt:new Date(),snapshot:{rxcui:"1"}});
    await db.insert("MedicineCard",{patientId:user.patientId,cabinetItemId:a.id,sourceRecordId:label._id,availability:"available",selectedPassages:[{key:"warnings",index:0,text:"Synthetic cited passage"}],personalNote:"PRIVATE TEST NOTE",itemSnapshot:{revision:0,rxcui:"1"},applicabilityConfirmedAt:new Date()});
    const review=await compare([a,c]); const evidence=review.evidenceRefs.find(x=>x.kind==="label_passages"); assert.equal(evidence.passages[0].text,"Synthetic cited passage"); assert.ok(!JSON.stringify(review).includes("PRIVATE TEST NOTE"));
  });
  await t.test("changed strength/form invalidates confirmation and flags historical result",async () => {
    ok(await owner.call("PATCH",p+"/cabinet-items/"+a.id,{expectedRevision:0,strengthText:"Changed strength",form:"liquid",reason:"Synthetic strength/form correction"}));
    assert.equal((await compare([a,b])).result,"insufficient_information");
    const historical=ok(await owner.call("GET",p+"/ingredient-reviews/"+overlap.id)); assert.equal(historical.result,"overlap"); assert.equal(historical.itemsChanged,true);
    await confirm(a); assert.equal((await compare([a,b])).result,"overlap");
  });
  await t.test("tampering, stale revisions, acknowledgements and scoped access",async () => {
    const ca=ok(await owner.call("GET",p+"/cabinet-items/"+a.id+"/ingredient-candidates"));
    ok(await owner.call("PUT",p+"/cabinet-items/"+a.id+"/ingredient-confirmation",{expectedRevision:ca.confirmationRevision,expectedCabinetRevision:ca.cabinetItem.revision,expectedContentHash:"0".repeat(64),reviewed:true}),409);
    const url=p+"/ingredient-reviews/"+overlap.id+"/acknowledge",key=randomUUID(),body={expectedRevision:0,note:"Synthetic professional-review follow-up"};
    assert.equal(ok(await owner.call("POST",url,body,key)).revision,1); assert.equal(ok(await owner.call("POST",url,body,key)).revision,1);
    ok(await owner.call("POST",url,body),409);
    ok(await stranger.call("GET",p+"/ingredient-reviews/"+overlap.id),404);
    assert.ok(ok(await owner.call("GET",p+"/ingredient-reviews")).reviews.length>0);
  });
  await t.test("confirmation write failure rolls back source and audit; concurrent review replay creates once",async () => {
    const path=p+"/cabinet-items/"+a.id+"/ingredient-confirmation";
    const ca=ok(await owner.call("GET",p+"/cabinet-items/"+a.id+"/ingredient-candidates"));
    const before=await db.count("SourceRecord",{}), auditBefore=await db.count("AuditEvent",{});
    const original=db.update;
    db.update=async function(name,...args) { if (name === "IngredientConfirmation") throw Error("Synthetic confirmation storage failure"); return original.call(this,name,...args); };
    try {ok(await owner.call("PUT",path,{expectedRevision:ca.confirmationRevision,expectedCabinetRevision:ca.cabinetItem.revision,expectedContentHash:ca.contentHash,reviewed:true}),503);} finally {db.update=original;}
    assert.equal(await db.count("SourceRecord",{}),before); assert.equal(await db.count("AuditEvent",{}),auditBefore);
    const count=await db.count("IngredientReview",{}),key=randomUUID(),body={cabinetItemIds:[a.id,b.id]};
    const results=await Promise.all([owner.call("POST",p+"/ingredient-reviews",body,key),owner.call("POST",p+"/ingredient-reviews",body,key)]);
    assert.ok(results.every(x=>[200,201].includes(x.status)),JSON.stringify(results));
    assert.equal(results[0].body.data.id,results[1].body.data.id); assert.equal(await db.count("IngredientReview",{}),count+1);
  });
  await t.test("source outage leaves saved reviews readable and new identities unconfirmed",async () => {
    const fresh=await make("5"); outage=true;
    ok(await owner.call("GET",p+"/cabinet-items/"+fresh.id+"/ingredient-candidates"),503);
    assert.equal((await compare([fresh,b])).result,"insufficient_information");
    assert.equal(ok(await owner.call("GET",p+"/ingredient-reviews/"+overlap.id)).result,"overlap");
  });
});
