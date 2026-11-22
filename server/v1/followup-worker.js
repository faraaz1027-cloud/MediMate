import {queueTaskNotice,createTaskWorker} from "./taskNotifications.js";
import {followupCaregiverAllowed} from "./followup-policy.js";

export async function closeFollowup(db,f,set,s,at) {
  const changed=await db.update("DoseFollowup",{_id:f._id,revision:f.revision},{...set,status:"resolved",resolvedAt:at},s);
  if(!changed) throw Error("Follow-up revision changed");
  const task=await db.one("Task",{_id:f.taskId,patientId:f.patientId},s);
  if(task) {
    await db.update("Task",{_id:task._id,revision:task.revision},{status:"completed"},s);
    await db.insert("TaskEvent",{patientId:f.patientId,taskId:task._id,eventType:"followup_resolved",occurredAt:at,fromStatus:task.status,toStatus:"completed",text:set.outcome},s);
  }
  await db.updateMany("NotificationJob",{taskId:f.taskId,status:"pending"},{status:"suppressed",errorCode:"FOLLOWUP_RESOLVED"},s);
  return changed;
}
export function createFollowupWorker({db,telegram,now=()=>new Date()}) {
  const notices=createTaskWorker({db,telegram,now});
  async function page(name,collection,filter) {
    let state=await db.one("WorkerState",{name});
    if(!state)try{state=await db.insert("WorkerState",{name,cursor:null});}catch(e){if(e.code!==11000)throw e;state=await db.one("WorkerState",{name});}
    const rows=await db.list(collection,{...filter,...(state.cursor?{_id:{$gt:state.cursor}}:{})},50,undefined,{_id:1});
    await db.update("WorkerState",{_id:state._id},{cursor:rows.length===50?rows.at(-1)._id:null,lastActiveAt:now()});
    return rows;
  }
  async function queueDue() {
    let processed=0;
    for(const f of await page("followup-reconcile","DoseFollowup",{status:{$in:["overdue-unconfirmed","acknowledged"]}})) {
      await db.transaction(async s=>{
        const row=await db.one("DoseFollowup",{_id:f._id,status:{$ne:"resolved"}},s);
        if(!row)return;
        const d=await db.one("DoseOccurrence",{_id:row.occurrenceId},s);
        if(!d||d.state!=="pending") {
          if(d)await db.update("DoseOccurrence",{_id:d._id,revision:d.revision},{},s);
          await closeFollowup(db,row,{outcome:d?.state==="cancelled"?"schedule_cancelled":"dose_recorded"},s,now());processed++;
        }
      });
    }
    for(const pref of await page("followup-settings","FollowupSettings",{enabled:true})) {
      const candidates=await db.list("DoseOccurrence",{patientId:pref.patientId,state:"pending",followupId:null,dueAtUTC:{$lte:new Date(now().getTime()-pref.delayMinutes*60000)},reminderDueAtUTC:{$lte:now()}},50,undefined,{dueAtUTC:1,_id:1});
      for(const candidate of candidates)try {
        const created=await db.transaction(async s=>{
          const setting=await db.one("FollowupSettings",{_id:pref._id,enabled:true},s), patient=await db.one("Patient",{_id:pref.patientId,status:"active"},s);
          if(!setting||!patient||String(setting.ownerUserId)!==String(patient.ownerUserId)||!await followupCaregiverAllowed(db,pref.patientId,setting.caregiverUserId,s))return false;
          const d=await db.one("DoseOccurrence",{_id:candidate._id,state:"pending",followupId:null},s);
          if(!d||d.dueAtUTC.getTime()+setting.delayMinutes*60000>now().getTime()||d.reminderDueAtUTC>now())return false;
          // Fence settings and dose writes against concurrent opt-out/recording.
          await db.fence("FollowupSettings",{_id:setting._id},s);
          const f=await db.insert("DoseFollowup",{patientId:d.patientId,occurrenceId:d._id,caregiverUserId:setting.caregiverUserId,status:"overdue-unconfirmed",dueAtUTC:d.dueAtUTC,overdueAt:now()},s);
          const task=await db.insert("Task",{patientId:d.patientId,createdByUserId:patient.ownerUserId,assigneeUserId:setting.caregiverUserId,title:"Follow up an unconfirmed dose",description:"No dose confirmation was recorded. Check with the patient; silence does not establish taken or skipped.",type:"general",status:"open",dueAtUTC:now(),assignmentGeneration:0,followupId:f._id},s);
          const event=await db.insert("TaskEvent",{patientId:d.patientId,taskId:task._id,eventType:"created",occurredAt:now(),toStatus:"open",text:"Overdue-unconfirmed follow-up created"},s);
          await db.update("DoseFollowup",{_id:f._id},{taskId:task._id},s);
          await db.update("DoseOccurrence",{_id:d._id,revision:d.revision},{followupId:f._id},s);
          await queueTaskNotice(db,task,event,telegram,s,now);return true;
        });if(created)processed++;
      }catch(e){if(e.code!==11000)throw e;}
    }
    return processed;
  }
  return {queueDue,deliverOne:notices.deliverOne};
}
