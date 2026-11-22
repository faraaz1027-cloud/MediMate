import {followupCaregiverAllowed} from "./followup-policy.js";
import {closeFollowup} from "./followup-worker.js";
export function installFollowups(patient,{db,csrf,scope,mutate,fail,id,object,publicDoc,now,send,telegram}) {
  const owner=req=>String(req.patient.ownerUserId)===String(req.actorId);
  const invalid=()=>fail(422,"VALIDATION_ERROR","Use current revisions, a delay of 10–1440 minutes and an authorized caregiver.");
  const revision=(v,nullable=false)=>{if(!(nullable&&v===null)&&(!Number.isInteger(v)||v<0))invalid();};
  patient.get("/followup-settings",scope("dose.read"),async(req,res)=>{
    if(!owner(req))fail(403,"FORBIDDEN","Only the owner manages follow-up preferences.");
    const settings=await db.one("FollowupSettings",{patientId:req.patient._id});
    const grants=await db.list("AccessGrant",{patientId:req.patient._id,revokedAt:null},101);
    if(grants.length>100)fail(422,"CAREGIVER_LIMIT","Review the caregiver list before configuring follow-up.");
    const caregivers=[];
    for(const g of grants)if(await followupCaregiverAllowed(db,req.patient._id,g.userId)){const u=await db.one("User",{_id:g.userId});if(u)caregivers.push({id:String(u._id),displayName:u.displayName});}
    send(req,res,{settings:settings?publicDoc(settings):{revision:null,enabled:false,delayMinutes:30,caregiverUserId:null},caregivers,telegramConfigured:telegram.enabled});
  });
  patient.put("/followup-settings",csrf,scope("dose.record"),async(req,res)=>{
    if(!owner(req))fail(403,"FORBIDDEN","Only the owner configures follow-up.");
    object(req.body,["expectedRevision","enabled","delayMinutes","caregiverUserId","consent"],["expectedRevision","enabled","delayMinutes"]);
    const b=req.body;revision(b.expectedRevision,true);
    if(typeof b.enabled!=="boolean"||!Number.isInteger(b.delayMinutes)||b.delayMinutes<10||b.delayMinutes>1440||b.enabled&&b.consent!==true)invalid();
    const caregiver=b.caregiverUserId?id(b.caregiverUserId):null;
    await mutate(req,res,"dose.record",async s=>{
      const old=await db.one("FollowupSettings",{patientId:req.patient._id},s);
      if((old?.revision??null)!==b.expectedRevision)fail(409,"REVISION_CONFLICT","Reload preferences.");
      if(b.enabled&&(!caregiver||!await followupCaregiverAllowed(db,req.patient._id,caregiver,s)))invalid();
      const fields={patientId:req.patient._id,ownerUserId:req.actorId,caregiverUserId:caregiver,enabled:b.enabled,delayMinutes:b.delayMinutes};
      return publicDoc(old?await db.update("FollowupSettings",{_id:old._id,revision:old.revision},fields,s):await db.insert("FollowupSettings",fields,s));
    },200);
  });
  async function lookup(req,s) {
    const f=await db.one("DoseFollowup",{_id:id(req.params.followupId),patientId:req.patient._id},s);
    if(!f)fail(404,"NOT_FOUND","Follow-up not found.");
    if(!owner(req)&&(String(f.caregiverUserId)!==String(req.actorId)||!await followupCaregiverAllowed(db,req.patient._id,req.actorId,s)))fail(403,"FORBIDDEN","Assigned active caregiver access required.");
    return f;
  }
  patient.get("/followups",scope("dose.read"),async(req,res)=>{
    const filter={patientId:req.patient._id};
    if(!owner(req)) {if(!await followupCaregiverAllowed(db,req.patient._id,req.actorId))fail(403,"FORBIDDEN","Active caregiver permissions required.");filter.caregiverUserId=req.actorId;}
    if(Object.keys(req.query).some(k=>!["status","before"].includes(k)))fail(400,"INVALID_QUERY","Unsupported follow-up filter.");
    if(req.query.status){if(!["overdue-unconfirmed","acknowledged","resolved"].includes(req.query.status))fail(400,"INVALID_QUERY","Unknown status.");filter.status=req.query.status;}
    if(req.query.before)filter._id={$lt:id(req.query.before)};
    const rows=await db.list("DoseFollowup",filter,21,undefined,{_id:-1});
    send(req,res,{followups:rows.slice(0,20).map(publicDoc),next:rows.length>20?String(rows[19]._id):null});
  });
  patient.get("/followups/:followupId",scope("dose.read"),async(req,res)=>{
    const row=await lookup(req),dose=await db.one("DoseOccurrence",{_id:row.occurrenceId,patientId:req.patient._id});
    const version=dose&&await db.one("ScheduleVersion",{_id:dose.scheduleVersionId,patientId:req.patient._id});
    const jobs=await db.list("NotificationJob",{taskId:row.taskId},100);
    const attempts=[];for(const job of jobs)attempts.push(...await db.list("NotificationAttempt",{jobId:job._id},20));
    send(req,res,{...publicDoc(row),medicineText:version?.sourceSnapshot?.medicineText||"Saved medicine source unavailable",doseState:dose?.state||"unavailable",notices:jobs.map(publicDoc),attempts:attempts.map(publicDoc)});
  });
  for(const action of ["acknowledge","resolve"])patient.post("/followups/:followupId/"+action,csrf,scope("dose.record"),async(req,res)=>{
    object(req.body,action==="resolve"?["expectedRevision","outcome","note"]:["expectedRevision"],action==="resolve"?["expectedRevision","outcome"]:["expectedRevision"]);
    const b=req.body;revision(b.expectedRevision);
    if(action==="resolve"&&(!["contacted_patient","unable_to_contact","other"].includes(b.outcome)||b.note!==undefined&&(typeof b.note!=="string"||b.note.length>2000)))invalid();
    // Assignment and full caregiver access also protect successful receipt replay.
    await lookup(req);
    await mutate(req,res,owner(req)?"dose.record":["dose.read","dose.record","task.read","task.write"],async s=>{
      const f=await lookup(req,s);
      if(f.revision!==b.expectedRevision||f.status==="resolved"||action==="acknowledge"&&f.status!=="overdue-unconfirmed")fail(409,"REVISION_CONFLICT","Reload the follow-up.");
      if(action==="resolve")return publicDoc(await closeFollowup(db,f,{outcome:b.outcome,note:b.note?.trim()||"",resolvedBy:req.actorId},s,now()));
      const changed=await db.update("DoseFollowup",{_id:f._id,revision:f.revision},{status:"acknowledged",acknowledgedAt:now(),acknowledgedBy:req.actorId},s);
      await db.updateMany("NotificationJob",{taskId:f.taskId,status:"pending"},{status:"suppressed",errorCode:"FOLLOWUP_ACKNOWLEDGED"},s);
      return publicDoc(changed);
    },200);
  });
}
