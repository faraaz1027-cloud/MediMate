// Synthetic, loopback-only review fixture. Never imported by production code.
// Session routes below are test-only and must not be deployed.
import fs from 'node:fs';
import express from 'express';
import mongoose from 'mongoose';
import {createRequire} from 'node:module';
import {createHttpApp} from '../../server/http-app.js';
import {runtimeConfig} from '../../server/runtime-config.js';
import {db} from '../../server/v1/store.js';
import {seedDemo} from '../../scripts/seed-demo.mjs';
import {createTelegram} from '../../server/v1/telegram.js';
const require=createRequire(new URL('../step18/package.json',import.meta.url));
const {MongoMemoryReplSet}=require('mongodb-memory-server');
const replica=await MongoMemoryReplSet.create({binary:{version:'7.0.24'},replSet:{count:1}});
await mongoose.connect(replica.getUri(),{dbName:'module1_browser_synthetic'});await db.init();
const origin='http://127.0.0.1:17361';
const host=express(),sessions={},exchanges=[];
fs.mkdirSync('docs/evidence/module1-readiness/browser',{recursive:true});
host.use((req,res,next)=>{res.on('finish',()=>{if(req.path.startsWith('/api/')){
  exchanges.push({method:req.method,path:req.path,status:res.statusCode});
  fs.writeFileSync('docs/evidence/module1-readiness/browser/exchanges.json',JSON.stringify({synthetic:true,actor:'Codex native browser check; not a student demonstration',telegram:'disabled',exchanges},null,2)+'\n');
}});next();});
host.get('/__module1/session/:actor',(req,res)=>{
  if(!sessions[req.params.actor])return res.sendStatus(404);
  res.set('Set-Cookie',sessions[req.params.actor]).redirect('/');
});
const app=createHttpApp({db,config:runtimeConfig({NODE_ENV:'test',SERVE_CLIENT:'true',ALLOWED_ORIGINS:origin}),readiness:async()=>true,services:{telegram:createTelegram({token:'',username:''})}});
host.use(app.finish());const server=host.listen(17361,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try{
  const fixture=await seedDemo(origin);
  for(const [actor,email] of [['owner','handover-owner@example.test'],['caregiver','handover-caregiver@example.test']]){
    const csrfResponse=await fetch(origin+'/api/v1/auth/csrf');const csrf=(await csrfResponse.json()).data.csrfToken;
    const response=await fetch(origin+'/api/v1/auth/login',{method:'POST',headers:{Cookie:csrfResponse.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({email,password:'Synthetic-handover-123!'})});
    if(!response.ok)throw Error('Synthetic session setup failed.');sessions[actor]=response.headers.get('set-cookie');
  }
  fs.writeFileSync('.local-data/module1-readiness/browser-fixture.json',JSON.stringify({...fixture,origin,mode:'Synthetic review only; production auth is not bypassed by any production route.'},null,2)+'\n');
  console.log('Synthetic Module 1 browser ready: '+origin+'/__module1/session/owner');
}catch(error){await new Promise(r=>server.close(r));await mongoose.disconnect();await replica.stop();throw error;}
let stopping=false;
async function stop(){
  if(stopping)return;stopping=true;
  const cleanup={at:new Date().toISOString(),syntheticDatabase:'module1_browser_synthetic'};
  await new Promise(r=>server.close(r));
  try {await mongoose.connection.dropDatabase();cleanup.databaseDropped=true;}
  catch(error){
    // Windows Ctrl+C can reach the disposable mongod before this parent handles
    // SIGINT. Still disconnect and stop/remove the owned temporary replica.
    cleanup.databaseDropped=false;cleanup.shutdownCode=error.code;
    if(error.code!==91 && error.code!==11600)console.error('Synthetic browser database cleanup was interrupted.');
  } finally {
    await mongoose.disconnect();await replica.stop();cleanup.replicaStopped=true;
    fs.writeFileSync('.local-data/module1-readiness/browser-cleanup.json',JSON.stringify(cleanup,null,2)+'\n');
  }
  process.exit(0);
}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
process.stdin.setEncoding('utf8');
process.stdin.on('data',input=>{if(input.trim()==='stop')void stop();});
