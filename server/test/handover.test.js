import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {randomUUID} from 'node:crypto';
import {createHttpApp} from '../http-app.js';
import {runtimeConfig} from '../runtime-config.js';
import {db} from '../v1/store.js';
import {seedDemo} from '../../scripts/seed-demo.mjs';

test('Step 41 repeatable synthetic seed uses real API and keeps existing history',{timeout:30000},async t=>{
 await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName:'handover_'+randomUUID().replaceAll('-','')});await db.init();
 const http=createHttpApp({db,config:runtimeConfig({NODE_ENV:'test'}),readiness:async()=>true,services:{telegram:{enabled:false}}});
 const server=http.finish().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await mongoose.connection.dropDatabase();await mongoose.disconnect();});
 const origin='http://127.0.0.1:'+server.address().port;
 const first=await seedDemo(origin);
 const counts=async()=>Object.fromEntries(await Promise.all(['users','patients','prescriptions','cabinetItems','careTasks','taskNotes','accessGrants','doseOccurrences','notificationAttempts'].map(async name=>[name,await mongoose.connection.db.collection(name).countDocuments()])));
 const before=await counts(),second=await seedDemo(origin);assert.deepEqual(second,first);assert.deepEqual(await counts(),before);
 assert.deepEqual({users:before.users,cabinet:before.cabinetItems,tasks:before.careTasks,notes:before.taskNotes,doses:before.doseOccurrences,attempts:before.notificationAttempts},{users:2,cabinet:3,tasks:1,notes:1,doses:0,attempts:0});
 for(const bad of ['https://example.test','http://127.0.0.1:1499/api','http://name:password@localhost'])await assert.rejects(seedDemo(bad),/loopback HTTP origin/);
});
