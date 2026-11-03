import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import mongoose from 'mongoose';
import { db } from '../v1/store.js';
import { createV1 } from '../v1/app.js';
import { createDoseWorker } from '../v1/doseReminders.js';
import { generateOccurrences } from '../v1/schedule-time.js';
import { seedDoseSchedule, expectStatus as ok, syntheticPassword } from '../../verification/step27/fixture.mjs';

test('Step 28 timezone, delayed execution and actual process restart integration', {timeout: 120000}, async t => {
  const dbName = 'restart_' + randomUUID().replaceAll('-', '');
  await mongoose.connect(process.env.MONGODB_TEST_URI, {dbName});
  await db.init();
  let clock = new Date('2026-11-04T17:49:00Z'), server, base, calls = 0;
  const now = () => new Date(clock);
  const telegram = {enabled:true, username:'Synthetic_Test_Bot', updates:async()=>[],
    sendDoseNotice:async()=>({messageId:String(++calls)})};
  const worker = () => createDoseWorker({db, telegram, now});
  async function start() {
    const app = express(); app.use('/api/v1', createV1({db,telegram,now}));
    server = app.listen(0,'127.0.0.1');
    await new Promise(r=>server.once('listening',r));
    base = `http://127.0.0.1:${server.address().port}/api/v1`;
  }
  await start();
  const children = new Set();
  t.after(async()=>{
    for (const child of children) child.kill('SIGKILL');
    await new Promise(r=>server.close(r));
    // The parent runner owns this disposable replica set. A killed open
    // transaction can delay dropDatabase until Mongo's transaction timeout.
    await mongoose.disconnect();
  });
  let cookie='', csrf='';
  const owner={async call(method,path,body,key=randomUUID()){
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':key},...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(r.headers.get('set-cookie')) cookie=r.headers.get('set-cookie').split(';')[0];
    const b=await r.json(); if(b.data?.csrfToken) csrf=b.data.csrfToken;
    return {status:r.status,body:b};
  }};
  await owner.call('GET','/auth/csrf');
  const account=ok(await owner.call('POST','/auth/register',{email:'restart-owner@example.test',password:syntheticPassword,displayName:'Synthetic restart owner'}),201);
  await db.insert('ChannelLink',{userId:account.user.id,chatId:'synthetic-private-chat',telegramUserId:'synthetic-private-user',consentedAt:now(),revokedAt:null});
  async function fixture(label) {
    await owner.call('GET','/auth/csrf');
    ok(await owner.call('POST','/auth/login',{email:'restart-owner@example.test',password:syntheticPassword}));
    const patient=ok(await owner.call('POST','/patients',{displayName:label,timezone:'Asia/Dhaka'}),201);
    const path='/patients/'+patient.id;
    const seed=await seedDoseSchedule(owner,path,clock,label);
    return {path,seed,patientId:patient.id,dose:seed.occurrences[0]};
  }
  async function enable(ctx) {ok(await owner.call('PUT',ctx.path+'/dose-reminder-settings',{expectedRevision:null,enabled:true,consent:true}));}
  async function disable(ctx) {
    const settings=ok(await owner.call('GET',ctx.path+'/dose-reminder-settings'));
    if(settings.enabled) ok(await owner.call('PUT',ctx.path+'/dose-reminder-settings',{expectedRevision:settings.revision,enabled:false}));
  }
  async function detail(ctx,dose=ctx.dose) {return ok(await owner.call('GET',`${ctx.path}/doses/${dose.id}`));}
  const act=(ctx,dose,kind,body,key=randomUUID())=>owner.call('POST',`${ctx.path}/doses/${dose.id}/${kind}`,{...body,clientRequestId:key},key);
  async function drain(w=worker()) {for(let i=0;i<100;i++) if(!await w.deliverOne()) return; throw Error('Worker did not drain within bound');}
  async function childPass({stopAt,disabled=false,tz='UTC',outcome='accepted'}={}) {
    const child=spawn(process.execPath,['server/test/fixtures/dose-worker-child.js'],{
      cwd:fileURLToPath(new URL('../../',import.meta.url)),
      env:{...process.env,MONGODB_TEST_URI:process.env.MONGODB_TEST_URI,SYNTHETIC_DB_NAME:dbName,SYNTHETIC_NOW:clock.toISOString(),SYNTHETIC_STOP_AT:stopAt||'',SYNTHETIC_DISABLED:disabled?'1':'0',SYNTHETIC_OUTCOME:outcome,TZ:tz,TELEGRAM_BOT_TOKEN:'',TELEGRAM_BOT_USERNAME:''},
      stdio:['ignore','ignore','pipe','ipc'],
    });
    children.add(child);
    let error='', done, accepted=0, reached=false;
    child.stderr.on('data',b=>{error+=b;});
    const result=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Child phase timeout: '+(stopAt||'done')));},20000);
      child.on('message',m=>{
        if(m.phase==='provider_accepted') accepted++;
        if(m.done) done=m;
        if(stopAt && m.phase===stopAt) {reached=true;child.kill('SIGKILL');}
      });
      child.once('error',e=>{clearTimeout(timer);reject(e);});
      child.once('exit',(code)=>{
        clearTimeout(timer);children.delete(child);
        if(stopAt ? !reached : code!==0 || !done) reject(Error('Unexpected child exit: '+error));
        else resolve({done,accepted});
      });
    });
    return result;
  }

  await t.test('Asia/Dhaka midnight partitions saved events once and retains UTC snapshots through API/connection restart',async()=>{
    const ctx=await fixture('Synthetic midnight');
    clock=new Date('2026-11-04T17:59:59.999Z');
    let list=await owner.call('GET',ctx.path+'/doses');ok(list);
    assert.equal(list.body.meta.date,'2026-11-04');assert.equal(list.body.data.length,1);
    clock=new Date('2026-11-04T18:00:00.001Z');
    list=await owner.call('GET',ctx.path+'/doses');ok(list);
    assert.equal(list.body.meta.date,'2026-11-05');assert.equal(list.body.data.length,11);
    assert.equal(list.body.meta.summary.overdueUnconfirmed,1);
    assert.equal(list.body.meta.fromUTC,'2026-11-04T18:00:00.000Z');
    const before=ok(await owner.call('GET',ctx.path+'/doses?date=2026-11-04'));
    const after=ok(await owner.call('GET',ctx.path+'/doses?date=2026-11-05'));
    assert.equal(new Set([...before,...after].map(d=>d.id)).size,12);
    const utc=ok(await owner.call('GET',ctx.path+'/doses?date=2026-11-04&timezone=UTC'));
    assert.equal(utc.length,12);
    await new Promise(r=>server.close(r));await mongoose.disconnect();
    await mongoose.connect(process.env.MONGODB_TEST_URI,{dbName});await start();
    const reloaded=ok(await owner.call('GET',ctx.path+'/doses?date=2026-11-05'));
    assert.deepEqual(reloaded,after);
    const fixed={timingMode:'fixed_times',timezone:'Asia/Dhaka',localTimes:['00:00','23:59'],effectiveFromUTC:'2026-11-04T18:00:00Z',endAtUTC:'2026-11-05T18:00:00Z'};
    assert.deepEqual(generateOccurrences(fixed),['2026-11-04T18:00:00.000Z','2026-11-05T17:59:00.000Z']);
    assert.throws(()=>generateOccurrences({...fixed,timezone:'America/New_York',localTimes:['01:30'],effectiveFromUTC:'2026-11-01T00:00:00Z',endAtUTC:'2026-11-02T00:00:00Z'}),/Ambiguous|multiple|local time/i);
  });
  await t.test('queue transaction crash rolls back, committed queue survives process restart and host timezone cannot duplicate sends',async()=>{
    clock=new Date('2026-11-06T00:00:00Z');const ctx=await fixture('Synthetic queue restart');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);
    await childPass({stopAt:'queue_transaction_open'});
    assert.equal(await db.count('DoseReminderJob',{patientId:ctx.patientId}),0);
    assert.equal((await db.one('DoseOccurrence',{_id:ctx.dose.id})).reminderQueuedRevision,undefined);
    await childPass({stopAt:'queue_committed',tz:'America/New_York'});
    assert.equal(await db.count('DoseReminderJob',{patientId:ctx.patientId}),1);
    assert.equal((await detail(ctx)).reminders[0].status,'pending');
    const first=await childPass({tz:'Asia/Dhaka'});assert.equal(first.accepted,1);
    const second=await childPass({tz:'America/New_York'});assert.equal(second.accepted,0);
    assert.equal((await detail(ctx)).reminders[0].attemptCount,1);
    assert.equal((await detail(ctx)).dose.state,'pending');await disable(ctx);
  });
  await t.test('actual process deaths before provider and after controlled acceptance preserve uncertainty without resend',async()=>{
    for(const phase of ['before_provider','provider_accepted']) {
      clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic crash '+phase);await enable(ctx);
      clock=new Date(ctx.seed.start.getTime()+1000);
      const killed=await childPass({stopAt:phase});assert.equal(killed.accepted,phase==='provider_accepted'?1:0);
      let d=await detail(ctx);assert.equal(d.reminders[0].status,'processing');
      clock=new Date(clock.getTime()+60001);
      const restarted=await childPass();assert.equal(restarted.accepted,0);
      d=await detail(ctx);assert.equal(d.reminders[0].status,'unknown');
      assert.equal(d.reminders[0].attempts[0].errorCode,'WORKER_INTERRUPTED');
      assert.equal(d.reminders[0].attemptCount,1);assert.equal(d.dose.state,'pending');
      assert.equal(d.actions.length,0);
      assert.equal((await owner.call('POST',`${ctx.path}/doses/${ctx.dose.id}/reminders/${d.reminders[0].id}/retry`,{expectedRevision:d.reminders[0].revision})).status,409);
      await disable(ctx);
    }
  });
  await t.test('bounded late catch-up sends only within window, expires at exact end and leaves every dose unconfirmed',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic delayed');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+60*60000);
    const pass=await childPass();assert.equal(pass.done.queued,7);assert.equal(pass.accepted,6);
    const d=await detail(ctx);assert.equal(d.reminders[0].status,'expired');
    assert.equal(d.reminders[0].attemptCount,0);
    assert.equal(await db.count('DoseOccurrence',{patientId:ctx.patientId,state:'pending'}),12);
    assert.equal(await db.count('DoseAction',{patientId:ctx.patientId}),0);
    const replay=await childPass();assert.equal(replay.accepted,0);await disable(ctx);
  });
  await t.test('queued work reconciles after restart with configuration removed, without an attempt or later implicit resend',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic disabled restart');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);await worker().queueDue();
    const pass=await childPass({disabled:true});assert.equal(pass.accepted,0);
    let d=await detail(ctx);assert.equal(d.reminders[0].status,'disabled');
    assert.equal(d.reminders[0].errorCode,'NOT_CONFIGURED');assert.equal(d.reminders[0].attemptCount,0);
    assert.equal((await childPass()).accepted,0);
    d=await detail(ctx);assert.equal(d.dose.state,'pending');await disable(ctx);
  });
  await t.test('expired pending work reconciles even when configuration is disabled',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic expired restart');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);await worker().queueDue();
    clock=new Date(ctx.seed.start.getTime()+60*60000);
    await childPass({disabled:true});const d=await detail(ctx);
    assert.equal(d.reminders[0].status,'expired');assert.equal(d.reminders[0].errorCode,'WINDOW_EXPIRED');
    assert.equal(d.reminders[0].attemptCount,0);assert.equal(d.dose.state,'pending');await disable(ctx);
  });
  await t.test('future schedule replacement preserves due history and cancelled events after restart',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic schedule edit');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);
    const future=new Date(ctx.seed.start.getTime()+20*60000);
    // Seed schedule replacement is a real reviewed A2 preview, effective after its first event.
    const preview=ok(await owner.call('POST',ctx.path+'/schedule-previews',{
      scheduleId:ctx.seed.schedule.id,expectedRevision:ctx.seed.schedule.revision,
      prescriptionInstructionId:ctx.seed.schedule.prescriptionInstructionId,cabinetItemId:ctx.seed.cabinet.id,
      timingMode:'interval',timezone:'Asia/Dhaka',doseQuantity:'1',doseUnit:'tablet',effectiveFromUTC:future.toISOString(),
      endAtUTC:ctx.seed.end.toISOString(),intervalMinutes:20,anchorAtUTC:future.toISOString(),reviewedAgainstSource:true,
    }));
    const saved=ok(await owner.call('POST',`${ctx.path}/schedules/${ctx.seed.schedule.id}/versions`,{expectedRevision:ctx.seed.schedule.revision,previewToken:preview.previewToken,confirmed:true}),201);
    const oldFuture=await detail(ctx,ctx.seed.occurrences[2]);assert.equal(oldFuture.dose.state,'cancelled');
    const pass=await childPass();assert.equal(pass.accepted,1);
    assert.equal((await detail(ctx)).dose.state,'pending');
    assert.equal(await db.count('DoseOccurrence',{scheduleVersionId:ctx.seed.version.id}),12);
    assert.equal(saved.version.versionNumber,2);await disable(ctx);
  });
  await t.test('one disabled restart drains multiple interrupted leases and never fabricates provider attempts',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic recovery backlog');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+10*60000+1000);
    await childPass({stopAt:'before_provider'});
    await childPass({stopAt:'before_provider'});
    assert.equal(await db.count('DoseReminderJob',{patientId:ctx.patientId,status:'processing'}),2);
    clock=new Date(clock.getTime()+60001);
    const recovered=await childPass({disabled:true});assert.equal(recovered.accepted,0);
    assert.equal(await db.count('DoseReminderJob',{patientId:ctx.patientId,status:'unknown'}),2);
    assert.equal(await db.count('DoseReminderAttempt',{patientId:ctx.patientId,providerCallAt:{$exists:true}}),0);
    assert.equal(await db.count('DoseAction',{patientId:ctx.patientId}),0);await disable(ctx);
  });
  await t.test('failed channel persists across restart; concurrent explicit retry claims one new attempt',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic outage retry');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);
    const failure=await childPass({outcome:'failed'});assert.equal(failure.done.calls,1);
    assert.equal((await detail(ctx)).reminders[0].status,'failed');
    assert.equal((await childPass()).done.calls,0);
    const job=(await detail(ctx)).reminders[0];
    const retries=await Promise.all([1,2].map(()=>owner.call('POST',`${ctx.path}/doses/${ctx.dose.id}/reminders/${job.id}/retry`,{expectedRevision:job.revision})));
    assert.deepEqual(retries.map(r=>r.status).sort(),[200,409]);
    assert.equal((await childPass()).accepted,1);
    assert.equal((await childPass()).done.calls,0);
    assert.equal((await detail(ctx)).reminders[0].attemptCount,2);await disable(ctx);
  });
  await t.test('clock rollback cannot deliver a queued future reminder early or duplicate it after catching up',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic clock rollback');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);await worker().queueDue();
    clock=new Date(ctx.seed.start.getTime()-1000);
    assert.equal((await childPass()).accepted,0);
    assert.equal((await detail(ctx)).reminders[0].status,'pending');
    clock=new Date(ctx.seed.start.getTime()+1000);
    assert.equal((await childPass()).accepted,1);
    assert.equal((await childPass()).accepted,0);await disable(ctx);
  });
  await t.test('pause suppresses a snoozed past-due reminder; resume retains history and requires explicit retry',async()=>{
    clock=new Date(clock.getTime()+86400000);const ctx=await fixture('Synthetic pause snooze');await enable(ctx);
    clock=new Date(ctx.seed.start.getTime()+1000);
    const snoozed=ok(await act(ctx,ctx.dose,'snoozes',{expectedRevision:0,minutes:10})).dose;
    const paused=ok(await owner.call('POST',`${ctx.path}/schedules/${ctx.seed.schedule.id}/pause`,{expectedRevision:ctx.seed.schedule.revision}));
    clock=new Date(snoozed.reminderDueAtUTC);
    assert.equal((await childPass()).accepted,0);
    let d=await detail(ctx);assert.equal(d.reminders[0].errorCode,'RECORD_INACTIVE');
    ok(await owner.call('POST',`${ctx.path}/schedules/${ctx.seed.schedule.id}/resume`,{expectedRevision:paused.revision,effectiveFromUTC:new Date(clock.getTime()+60000).toISOString()}));
    assert.equal((await childPass()).accepted,0);
    d=await detail(ctx);assert.equal(d.dose.dueAtUTC,ctx.dose.dueAtUTC);assert.equal(d.actions.length,1);
    ok(await owner.call('POST',`${ctx.path}/doses/${ctx.dose.id}/reminders/${d.reminders[0].id}/retry`,{expectedRevision:d.reminders[0].revision}));
    assert.equal((await childPass()).accepted,1);await disable(ctx);
  });
  await t.test('snooze across midnight persists original due day, later recording/replay survives API restart without stock writes',async()=>{
    clock=new Date('2026-11-20T17:58:00Z');const ctx=await fixture('Synthetic midnight snooze');
    clock=new Date('2026-11-20T17:59:30Z');
    const snoozed=ok(await act(ctx,ctx.dose,'snoozes',{expectedRevision:0,minutes:10}));
    assert.equal(snoozed.dose.dueAtUTC,'2026-11-20T17:59:00.000Z');
    assert.equal(snoozed.dose.reminderDueAtUTC,'2026-11-20T18:09:30.000Z');
    clock=new Date('2026-11-20T18:01:00Z');
    assert.equal(ok(await owner.call('GET',ctx.path+'/doses?date=2026-11-21')).some(d=>d.id===ctx.dose.id),false);
    const key=randomUUID(), body={expectedRevision:1,action:'taken'};
    const first=ok(await act(ctx,ctx.dose,'actions',body,key));
    await new Promise(r=>server.close(r));await start();
    const replay=ok(await act(ctx,ctx.dose,'actions',body,key));assert.equal(replay.actionId,first.actionId);
    assert.equal((await detail(ctx)).actions.length,2);assert.equal(first.stockSyncStatus,'not_implemented');
    assert.equal(await mongoose.connection.db.collection('stockTransactions').countDocuments({}),0);
    assert.equal(await mongoose.connection.db.collection('stockSyncJobs').countDocuments({}),0);
  });
});
