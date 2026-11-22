import {validArea} from "./overpass.js";
export function installSos(app,patient,{db,authenticated,csrf,scope,access,mutate,fail,id,object,text,publicDoc,now,send,telegram,hospitals,production}) {
  const owner=req=>{if(String(req.patient.ownerUserId)!==String(req.actorId))fail(403,"FORBIDDEN","Only the patient owner manages emergency contacts.");};
  const revision=value=>{if(!Number.isInteger(value)||value<0)fail(422,"VALIDATION_ERROR","Use the current revision.");};
  const phone=value=>{if(value===undefined||value==="")return "";if(typeof value!=="string"||!/^\+?[0-9][0-9 ()-]{4,29}$/.test(value)||value.replace(/\D/g,"").length<5)fail(422,"VALIDATION_ERROR","Use 5–30 characters with at least five digits and at most one leading plus.");return value;};
  async function any(req,perms,s){for(const permission of perms)try{await access(req,permission,s);return permission;}catch(e){if(e.code!=="FORBIDDEN")throw e;}fail(403,"FORBIDDEN","SOS access is required.");}
  async function incident(req,s){const row=await db.one("SosIncident",{_id:id(req.params.incidentId),patientId:req.patient._id},s);if(!row)fail(404,"NOT_FOUND","Incident not found.");return row;}
  async function event(req,row,type,detail,s){await db.insert("SosEvent",{patientId:row.patientId,incidentId:row._id,actorUserId:req.actorId,type,detail,occurredAt:now()},s);}
  async function queue(row,contact,kind,s){
    const link=await db.one("ChannelLink",{userId:contact.recipientUserId,revokedAt:null},s);
    await db.insert("SosJob",{patientId:row.patientId,incidentId:row._id,contactId:contact._id,recipientId:contact.recipientUserId,contactConsentVersion:contact.consentVersion,kind,channelLinkId:link?._id,channelRevision:link?.revision,status:telegram.enabled?"pending":"disabled",errorCode:telegram.enabled?null:"NOT_CONFIGURED",attemptCount:0,runAtUTC:now(),expiresAt:new Date(now().getTime()+(kind==="alert"?30*60000:86400000))},s);
  }
  patient.get("/emergency-contacts",scope("sos.manage"),async(req,res)=>{owner(req);const rows=await db.list("EmergencyContact",{patientId:req.patient._id},101);if(rows.length>100)fail(422,"CONTACT_LIMIT","Contact history exceeds this view; review it with the project owner.");send(req,res,rows.map(publicDoc));});
  patient.post("/emergency-contacts",csrf,scope("sos.manage"),async(req,res)=>{
    owner(req);object(req.body,["displayName","contactPhone","recipientUserId"],["displayName","recipientUserId"]);
    const recipientUserId=id(req.body.recipientUserId),displayName=text(req.body.displayName,"displayName",100),contactPhone=phone(req.body.contactPhone);
    if(String(recipientUserId)===String(req.actorId))fail(422,"VALIDATION_ERROR","Choose a separate consenting recipient account.");
    await mutate(req,res,"sos.manage",async s=>{
      await db.fence("Patient",{_id:req.patient._id},s);
      if(!await db.one("User",{_id:recipientUserId},s))fail(422,"RECIPIENT_UNAVAILABLE","Recipient account is unavailable.");
      const old=await db.one("EmergencyContact",{patientId:req.patient._id,recipientUserId},s);
      if(old&&["active","pending"].includes(old.status)&&old.expiresAt>now())fail(409,"CONTACT_EXISTS","This contact is already active or awaiting consent.");
      if(old?.status==="active")fail(409,"CONTACT_EXISTS","This contact is already active.");
      if((await db.list("EmergencyContact",{patientId:req.patient._id,$or:[{status:"active"},{status:"pending",expiresAt:{$gt:now()}}]},21,s)).length>=20)fail(422,"CONTACT_LIMIT","At most 20 active or pending contacts are supported.");
      const fields={patientId:req.patient._id,recipientUserId,displayName,contactPhone,status:"pending",consentVersion:(old?.consentVersion||0)+1,invitedAt:now(),expiresAt:new Date(now().getTime()+86400000),consentedAt:null,revokedAt:null};
      return publicDoc(old?await db.update("EmergencyContact",{_id:old._id},fields,s):await db.insert("EmergencyContact",fields,s));
    });
  });
  patient.patch("/emergency-contacts/:contactId",csrf,scope("sos.manage"),async(req,res)=>{
    owner(req);object(req.body,["expectedRevision","displayName","contactPhone"],["expectedRevision"]);revision(req.body.expectedRevision);
    const set={};if(req.body.displayName!==undefined)set.displayName=text(req.body.displayName,"displayName",100);if(req.body.contactPhone!==undefined)set.contactPhone=phone(req.body.contactPhone);
    await mutate(req,res,"sos.manage",async s=>{const row=await db.one("EmergencyContact",{_id:id(req.params.contactId),patientId:req.patient._id},s);if(!row)fail(404,"NOT_FOUND","Contact not found.");if(row.revision!==req.body.expectedRevision)fail(409,"REVISION_CONFLICT","Reload contact.");return publicDoc(await db.update("EmergencyContact",{_id:row._id,revision:row.revision},set,s));},200);
  });
  patient.post("/emergency-contacts/:contactId/revoke",csrf,scope("sos.manage"),async(req,res)=>{
    owner(req);object(req.body,["expectedRevision"],["expectedRevision"]);revision(req.body.expectedRevision);
    await mutate(req,res,"sos.manage",async s=>{const row=await db.one("EmergencyContact",{_id:id(req.params.contactId),patientId:req.patient._id},s);if(!row)fail(404,"NOT_FOUND","Contact not found.");if(row.revision!==req.body.expectedRevision)fail(409,"REVISION_CONFLICT","Reload contact.");return publicDoc(await db.update("EmergencyContact",{_id:row._id,revision:row.revision},{status:"revoked",revokedAt:now(),consentVersion:row.consentVersion+1},s));},200);
  });
  patient.post("/sos-incidents",csrf,scope("sos.activate"),async(req,res)=>{
    object(req.body,["confirmed","locationStatus","location","callbackPhone"],["confirmed","locationStatus"]);
    const b=req.body;if(b.confirmed!==true||!["available","denied","unavailable"].includes(b.locationStatus))fail(422,"VALIDATION_ERROR","Explicitly confirm activation and location status.");
    let location;
    if(b.locationStatus==="available"){
      object(b.location,["latitude","longitude","accuracyMeters","capturedAt"],["latitude","longitude","accuracyMeters","capturedAt"]);
      const l=b.location,at=new Date(l.capturedAt);
      if(!validArea(l.latitude,l.longitude,100)||!Number.isFinite(l.accuracyMeters)||l.accuracyMeters<0||l.accuracyMeters>100000||typeof l.capturedAt!=="string"||!Number.isFinite(at.getTime())||Math.abs(now()-at)>5*60000)fail(422,"VALIDATION_ERROR","Use a recent valid location with non-negative accuracy.");
      location={...l,capturedAt:at.toISOString()};
    }else if(b.location!==undefined)fail(422,"VALIDATION_ERROR","Omit coordinates when location is denied or unavailable.");
    const callbackPhone=phone(b.callbackPhone);
    await mutate(req,res,"sos.activate",async s=>{
      await db.fence("Patient",{_id:req.patient._id},s);
      const active=await db.one("SosIncident",{patientId:req.patient._id,status:"active"},s);if(active){await db.fence("SosIncident",{_id:active._id},s);return {id:String(active._id),existing:true};}
      const recent=await db.list("SosIncident",{patientId:req.patient._id,activatedAt:{$gt:new Date(now().getTime()-10*60000)}},5,s);
      if(recent.length>=5){const retry=Math.ceil((recent.at(-1).activatedAt.getTime()+10*60000-now().getTime())/1000);res.set("Retry-After",String(Math.max(1,retry)));fail(429,"SOS_RATE_LIMIT",`Activation limit reached. Retry after ${Math.max(1,retry)} seconds. Existing incidents remain available.`);}
      const row=await db.insert("SosIncident",{patientId:req.patient._id,activatedBy:req.actorId,status:"active",activatedAt:now(),locationStatus:b.locationStatus,location,callbackPhone},s);
      const contacts=await db.list("EmergencyContact",{patientId:req.patient._id,status:"active"},21,s);if(contacts.length>20)fail(422,"CONTACT_LIMIT","Review the supported contact count before activating.");
      for(const c of contacts)await queue(row,c,"alert",s);
      await event(req,row,"activated",contacts.length?"Contact alerts queued":"No consenting contacts available",s);
      return {id:String(row._id),existing:false};
    });
  });
  patient.get("/sos-incidents",scope(null),async(req,res)=>{
    await any(req,["sos.activate","sos.manage"]);const filter={patientId:req.patient._id};if(Object.keys(req.query).some(k=>k!=="before"))fail(400,"INVALID_QUERY","Use the incident-history cursor.");if(req.query.before)filter._id={$lt:id(req.query.before)};
    const list=await db.list("SosIncident",filter,21,undefined,{_id:-1});send(req,res,{incidents:list.slice(0,20).map(publicDoc),next:list.length>20?String(list[19]._id):null});
  });
  patient.get("/sos-incidents/:incidentId",scope(null),async(req,res)=>{
    await any(req,["sos.activate","sos.manage"]);const row=await incident(req),jobs=await db.list("SosJob",{incidentId:row._id},61);if(jobs.length>60)fail(422,"HISTORY_LIMIT","Incident history exceeds the supported size.");const attempts=[];for(const job of jobs)attempts.push(...await db.list("SosAttempt",{jobId:job._id},10));
    send(req,res,{...publicDoc(row),jobs:jobs.map(publicDoc),attempts:attempts.map(publicDoc),acknowledgements:(await db.list("SosAcknowledgement",{incidentId:row._id},20)).map(publicDoc),events:(await db.list("SosEvent",{incidentId:row._id},100)).map(publicDoc),providerRequests:(await db.list("SosProviderRequest",{incidentId:row._id},20)).map(publicDoc),dispatchConfirmed:false,simulationAvailable:!production,telegramConfigured:telegram.enabled});
  });
  for(const action of ["cancel","resolve"])patient.post("/sos-incidents/:incidentId/"+action,csrf,scope(null),async(req,res)=>{
    const permission=await any(req,["sos.manage","sos.activate"]);object(req.body,action==="cancel"?["expectedRevision","reason"]:["expectedRevision","outcome"],action==="cancel"?["expectedRevision","reason"]:["expectedRevision","outcome"]);revision(req.body.expectedRevision);
    const detail=text(req.body[action==="cancel"?"reason":"outcome"],action,500);
    // Role restrictions must protect successful receipt replay as well as a new
    // transition. Generic sos.activate does not authorize closing another actor's incident.
    const current=await incident(req);
    if(permission!=="sos.manage"&&String(current.activatedBy)!==String(req.actorId))fail(403,"FORBIDDEN","Only the activator or SOS manager can close this incident.");
    await mutate(req,res,permission,async s=>{
      const row=await incident(req,s);if(permission!=="sos.manage"&&String(row.activatedBy)!==String(req.actorId))fail(403,"FORBIDDEN","Only the activator or SOS manager can close this incident.");
      if(row.status!=="active"||row.revision!==req.body.expectedRevision)fail(409,"REVISION_CONFLICT","Reload the active incident before closing it.");
      const status=action==="cancel"?"cancelled":"resolved",changed=await db.update("SosIncident",{_id:row._id,revision:row.revision},{status,closedAt:now(),closedBy:req.actorId,[action==="cancel"?"reason":"outcome"]:detail},s);
      await db.updateMany("SosJob",{incidentId:row._id,kind:"alert",status:"pending"},{status:"suppressed",errorCode:"INCIDENT_CLOSED"},s);
      const alerts=await db.list("SosJob",{incidentId:row._id,kind:"alert"},20,s);
      for(const job of alerts){const c=await db.one("EmergencyContact",{_id:job.contactId,status:"active",consentVersion:job.contactConsentVersion},s);if(c)await queue(changed,c,status,s);}
      await event(req,row,status,detail,s);return {id:String(row._id),status};
    },200);
  });
  if(!production)patient.post("/sos-incidents/:incidentId/provider-requests",csrf,scope("sos.manage"),async(req,res)=>{
    owner(req);if(production)fail(404,"NOT_FOUND","Classroom simulation is unavailable in production.");object(req.body,["providerKey","providerMode"],["providerKey","providerMode"]);
    if(req.body.providerMode!=="simulated"||req.body.providerKey!=="classroom_demo")fail(422,"PROVIDER_UNAVAILABLE","Only the classroom simulation is configured; no verified provider request can be sent.");
    await mutate(req,res,"sos.manage",async s=>{const row=await incident(req,s);if(row.status!=="active")fail(409,"INCIDENT_CLOSED","This incident is closed.");await db.fence("SosIncident",{_id:row._id},s);const existing=await db.one("SosProviderRequest",{incidentId:row._id,providerKey:"classroom_demo"},s);if(existing)return publicDoc(existing);const result=await db.insert("SosProviderRequest",{patientId:row.patientId,incidentId:row._id,providerKey:"classroom_demo",providerMode:"simulated",status:"simulated_request_only",requestedAt:now(),requestedBy:req.actorId},s);await event(req,row,"simulated_provider_request","No real provider contacted; no dispatch confirmation",s);return publicDoc(result);},201);
  });
  patient.post("/sos-incidents/:incidentId/jobs/:jobId/retry",csrf,scope("sos.manage"),async(req,res)=>{
    object(req.body,["expectedRevision"],["expectedRevision"]);revision(req.body.expectedRevision);
    await mutate(req,res,"sos.manage",async s=>{const row=await incident(req,s),job=await db.one("SosJob",{_id:id(req.params.jobId),incidentId:row._id,patientId:row.patientId},s);if(!job)fail(404,"NOT_FOUND","Notice not found.");if(job.revision!==req.body.expectedRevision||!["failed","disabled"].includes(job.status)||job.attemptCount>=3||job.expiresAt<=now()||!telegram.enabled||(job.kind==="alert"?row.status!=="active":row.status!==job.kind))fail(409,"RETRY_NOT_ALLOWED","Only a current definitely unsent notice can be retried up to three attempts. Unknown outcomes are not resent.");const contact=await db.one("EmergencyContact",{_id:job.contactId,status:"active",consentVersion:job.contactConsentVersion},s),link=contact&&await db.one("ChannelLink",{userId:contact.recipientUserId,revokedAt:null},s);if(!contact||!link)fail(409,"CONTACT_UNAVAILABLE","Current recipient consent and linked channel are required.");return publicDoc(await db.update("SosJob",{_id:job._id,revision:job.revision},{status:"pending",errorCode:null,channelLinkId:link._id,channelRevision:link.revision},s));},200);
  });
  patient.get("/hospitals",scope(null),async(req,res)=>{
    await any(req,["sos.activate","sos.manage"]);if(Object.keys(req.query).sort().join(",")!=="latitude,longitude,radiusMeters"||Object.values(req.query).some(x=>typeof x!=="string"||!x.trim()))fail(400,"INVALID_QUERY","Enter an area center and radius.");const latitude=Number(req.query.latitude),longitude=Number(req.query.longitude),radiusMeters=Number(req.query.radiusMeters);if(!validArea(latitude,longitude,radiusMeters))fail(422,"VALIDATION_ERROR","Use a valid area and radius of 100–5000 metres.");let result;try{result=await hospitals.search(latitude,longitude,radiusMeters);}catch{fail(503,"HOSPITAL_SOURCE_UNAVAILABLE","Hospital listings are unavailable. A map listing cannot confirm capacity or ambulance availability.");}send(req,res,result);
  });
  // Recipient routes deliberately require their own authenticated session and
  // consent-bound account, granting no access to the patient's chart.
  async function recipientContact(req,s){const row=await db.one("EmergencyContact",{_id:id(req.params.contactId),recipientUserId:req.actorId},s);if(!row||!await db.one("Patient",{_id:row.patientId,status:"active"},s))fail(404,"NOT_FOUND","Invitation unavailable.");return row;}
  app.get("/me/emergency-invitations",authenticated,async(req,res)=>{
    const rows=await db.list("EmergencyContact",{recipientUserId:req.actorId},101);if(rows.length>100)fail(422,"INVITATION_LIMIT","Invitation history exceeds this view.");const result=[];for(const row of rows){const p=await db.one("Patient",{_id:row.patientId,status:"active"});if(p)result.push({id:String(row._id),revision:row.revision,patientName:p.displayName,status:row.status,expired:row.status==="pending"&&row.expiresAt<=now(),expiresAt:row.expiresAt});}send(req,res,result);
  });
  app.post("/me/emergency-invitations/:contactId/respond",authenticated,csrf,async(req,res)=>{
    object(req.body,["expectedRevision","action"],["expectedRevision","action"]);revision(req.body.expectedRevision);if(!["consent","decline","revoke"].includes(req.body.action))fail(422,"VALIDATION_ERROR","Choose consent, decline or revoke.");await recipientContact(req);
    await mutate(req,res,null,async s=>{const c=await recipientContact(req,s);if(c.revision!==req.body.expectedRevision||req.body.action!=="revoke"&&(c.status!=="pending"||c.expiresAt<=now())||req.body.action==="revoke"&&c.status!=="active")fail(409,"INVITATION_UNAVAILABLE","This invitation is expired, used or changed.");const status=req.body.action==="consent"?"active":req.body.action==="decline"?"declined":"revoked";const saved=await db.update("EmergencyContact",{_id:c._id,revision:c.revision},{status,consentVersion:c.consentVersion+1,...(status==="active"?{consentedAt:now()}:{revokedAt:now()})},s);return {id:String(saved._id),status};},200);
  });
  async function recipientIncident(req,s){const row=await db.one("SosIncident",{_id:id(req.params.incidentId)},s);if(!row||!await db.one("Patient",{_id:row.patientId,status:"active"},s))fail(404,"NOT_FOUND","Incident unavailable.");const contact=await db.one("EmergencyContact",{patientId:row.patientId,recipientUserId:req.actorId,status:"active"},s);if(!contact||!await db.one("SosJob",{incidentId:row._id,contactId:contact._id,kind:"alert",contactConsentVersion:contact.consentVersion},s))fail(404,"NOT_FOUND","Incident unavailable.");return {row,contact};}
  app.get("/me/sos-incidents",authenticated,async(req,res)=>{
    const filter={recipientId:req.actorId,kind:"alert"};if(Object.keys(req.query).some(k=>k!=="before"))fail(400,"INVALID_QUERY","Use the inbox cursor.");if(req.query.before)filter._id={$lt:id(req.query.before)};const jobs=await db.list("SosJob",filter,21,undefined,{_id:-1}),result=[];
    for(const j of jobs.slice(0,20)){const c=await db.one("EmergencyContact",{_id:j.contactId,recipientUserId:req.actorId,status:"active",consentVersion:j.contactConsentVersion});if(!c)continue;const row=await db.one("SosIncident",{_id:j.incidentId}),p=row&&await db.one("Patient",{_id:row.patientId,status:"active"});if(!p)continue;result.push({id:String(row._id),revision:row.revision,patientName:p.displayName,status:row.status,activatedAt:row.activatedAt,locationStatus:row.locationStatus,location:row.location||null,callbackPhone:row.callbackPhone,acknowledged:!!await db.one("SosAcknowledgement",{incidentId:row._id,contactId:c._id}),acknowledgementExpired:row.activatedAt.getTime()+30*60000<=now().getTime()});}
    send(req,res,{incidents:result,next:jobs.length>20?String(jobs[19]._id):null});
  });
  app.post("/me/sos-incidents/:incidentId/acknowledge",authenticated,csrf,async(req,res)=>{
    object(req.body,["expectedRevision"],["expectedRevision"]);revision(req.body.expectedRevision);await recipientIncident(req);
    await mutate(req,res,null,async s=>{const {row,contact}=await recipientIncident(req,s);if(row.status!=="active"||row.revision!==req.body.expectedRevision||row.activatedAt.getTime()+30*60000<=now().getTime())fail(409,"ACKNOWLEDGEMENT_UNAVAILABLE","Acknowledgement is expired or the incident changed/closed.");await db.fence("EmergencyContact",{_id:contact._id},s);if(await db.one("SosAcknowledgement",{incidentId:row._id,contactId:contact._id},s))fail(409,"ALREADY_ACKNOWLEDGED","You already acknowledged this incident.");await db.update("SosIncident",{_id:row._id,revision:row.revision},{},s);await db.insert("SosAcknowledgement",{incidentId:row._id,contactId:contact._id,recipientId:req.actorId,acknowledgedAt:now()},s);await db.updateMany("SosJob",{incidentId:row._id,contactId:contact._id,kind:"alert",status:"pending"},{status:"suppressed",errorCode:"ALREADY_ACKNOWLEDGED"},s);await event(req,row,"recipient_acknowledged","Recipient acknowledged; no dispatch claim",s);return {acknowledged:true};},200);
  });
}
