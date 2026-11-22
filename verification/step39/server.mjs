// Loopback-only measurement harness. Never imported by the production entrypoint.
import {createRequire} from "node:module";
import fs from "node:fs";
import mongoose from "mongoose";
import express from "express";
import {randomUUID} from "node:crypto";
import {createHttpApp} from "../../server/http-app.js";
import {runtimeConfig} from "../../server/runtime-config.js";
import {db} from "../../server/v1/store.js";
const require=createRequire(new URL("../step18/package.json",import.meta.url));
const {MongoMemoryReplSet}=require("mongodb-memory-server");
const replica=await MongoMemoryReplSet.create({binary:{version:"7.0.24"},replSet:{count:1}});
await mongoose.connect(replica.getUri(),{dbName:"step39_synthetic"});await db.init();
const origin="http://127.0.0.1:17339",dataDir=".local-data/step39";fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync("docs/evidence/step39",{recursive:true});
let sessionCookie="",cookie="",csrf="",server;
const exchanges=[];let phase="seed";const host=express();
const app=createHttpApp({db,config:runtimeConfig({NODE_ENV:"test",SERVE_CLIENT:"true",ALLOWED_ORIGINS:origin}),readiness:async()=>true,services:{telegram:{enabled:false},rxnorm:{search:async()=>({candidates:[]}),resolve:async()=>{throw Error("Live lookup disabled in measurement harness");}},openfda:{search:async()=>{throw Error("Live lookup disabled");}},overpass:{search:async()=>{throw Error("Live lookup disabled");}},hospitals:{search:async()=>{throw Error("Live lookup disabled");}}}});
host.use((req,res,next)=>{const at=performance.now(),safePath=req.originalUrl.split("?")[0],requestPhase=phase;res.on("finish",()=>{if(safePath.startsWith("/api/")){exchanges.push({phase:requestPhase,method:req.method,path:safePath,status:res.statusCode,durationMs:Number((performance.now()-at).toFixed(2)),contentType:res.getHeader("Content-Type"),cacheControl:res.getHeader("Cache-Control")});fs.writeFileSync("docs/evidence/step39/server-exchanges.json",JSON.stringify({recordedAt:new Date().toISOString(),synthetic:true,exchanges},null,2));}});next();});
// Only this harness grants its existing synthetic session. No credential in URL
// or persisted evidence. It avoids automating an authentication dialog.
host.get("/__step39/session",(_req,res)=>{if(!sessionCookie)return res.sendStatus(503);res.set("Set-Cookie",sessionCookie).redirect("/");});
host.use(app.finish());const http=host;server=http.listen(17339,"127.0.0.1");await new Promise(r=>server.once("listening",r));
async function call(method,path,body){const r=await fetch(origin+"/api/v1"+path,{method,headers:{"Content-Type":"application/json",Cookie:cookie,"X-CSRF-Token":csrf,"Idempotency-Key":randomUUID()},body:body===undefined?undefined:JSON.stringify(body)});if(r.headers.get("set-cookie")){sessionCookie=r.headers.get("set-cookie");cookie=sessionCookie.split(";")[0];}const b=await r.json();if(b.data?.csrfToken)csrf=b.data.csrfToken;if(!r.ok)throw Error("Synthetic setup failed: "+r.status);return b.data;}
await call("GET","/auth/csrf");const account=await call("POST","/auth/register",{email:"browser-check@example.test",password:"Synthetic-browser-123!",displayName:"Synthetic browser review"}),p="/patients/"+account.patientId;
for(const displayName of ["Synthetic cabinet medicine A","Synthetic cabinet medicine B","Synthetic test medicine with a longer descriptive name for responsive layout"]){await call("POST",p+"/cabinet-items",{entryType:"manual",displayName,strengthText:"Synthetic strength",form:"tablet"});}
await call("POST",p+"/prescriptions",{title:"Synthetic review draft",instructions:[{lineNumber:1,medicineText:"Synthetic cabinet medicine A",instructionsText:"Synthetic example only; manual clarification required",clarificationRequired:true}]});
phase="browser";console.log("Step 39 isolated synthetic app ready: "+origin+"/__step39/session");
let stopping=false;async function stop(){if(stopping)return;stopping=true;await new Promise(r=>server.close(r));await mongoose.disconnect();await replica.stop();process.exit();}process.on("SIGINT",stop);process.on("SIGTERM",stop);
