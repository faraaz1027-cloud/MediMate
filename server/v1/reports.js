import {renderVisitPDF,ReportPDFError} from "./report-pdf.js";
import {decimalQuantity} from "./stockLedger.js";
export function installReports(patient,{db,csrf,scope,mutate,access,fail,id,object,text,publicDoc,now,send}) {
  const invalid=message=>fail(422,"VALIDATION_ERROR",message);
  function instant(value){
    if(typeof value!=="string"||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))invalid("Use valid explicit UTC timestamps ending in Z.");
    return new Date(value);
  }
  function range(fromUTC,toUTC,displayTimezone){
    const from=instant(fromUTC),to=instant(toUTC);
    if(to<=from||to-from>366*86400000)invalid("Choose a positive range of at most 366 days.");
    if(typeof displayTimezone!=="string"||displayTimezone.length>100)invalid("Choose an IANA display timezone.");
    try{new Intl.DateTimeFormat("en",{timeZone:displayTimezone}).format();}catch{invalid("Choose a valid IANA display timezone.");}
    return {from,to,displayTimezone};
  }
  const rev=value=>{if(!Number.isInteger(value)||value<0)invalid("Use the current revision.");};
  async function rows(name,filter,s,limit=500,sort={createdAt:1,_id:1}) {
    const result=await db.list(name,filter,limit+1,s,sort);
    if(result.length>limit)invalid("This range exceeds the report record limit. Choose a shorter range; records are never silently omitted.");
    return result;
  }
  async function snapshot(req,r,s,details=false){
    await access(req,"report.read",s);
    const patientId=req.patient._id,cutoff=now();
    const doses=await rows("DoseOccurrence",{patientId,dueAtUTC:{$gte:r.from,$lt:r.to}},s,details?500:20000,{dueAtUTC:1,_id:1});
    const pref=await db.one("FollowupSettings",{patientId},s),delayMinutes=pref?.delayMinutes??30;
    const result={patientId:String(patientId),patientName:req.patient.displayName,fromUTC:r.from.toISOString(),toUTC:r.to.toISOString(),displayTimezone:r.displayTimezone,dataCutoffUTC:cutoff.toISOString(),metricDefinitionVersion:"c4-v1",delayMinutes,delaySource:pref?"Current saved follow-up delay":"Default delay (no saved follow-up preference)",followupEnabled:pref?.enabled??false,taken:0,skipped:0,pending:0,overdueUnconfirmed:0,cancelled:0};
    for(const d of doses){
      if(d.state==="pending") {
        const boundary=Math.max(d.dueAtUTC.getTime()+delayMinutes*60000,d.reminderDueAtUTC?.getTime()??0);
        result[boundary<=cutoff.getTime()?"overdueUnconfirmed":"pending"]++;
      }else if(["taken","skipped","cancelled"].includes(d.state))result[d.state]++;
      else fail(503,"REPORT_SOURCE_UNAVAILABLE","An occurrence has an unsupported state; report totals are unavailable.");
    }
    result.scheduled=doses.length-result.cancelled;
    result.coverage=result.scheduled?"recorded_occurrences_only":"no_scheduled_occurrences";
    if(!details)return result;
    const timed=field=>({patientId,[field]:{$gte:r.from,$lt:r.to,$lte:cutoff}});
    const notes=await rows("HealthNote",timed("recordedAt"),s,200,{recordedAt:1,_id:1});
    const versions=await rows("PrescriptionVersion",timed("confirmedAt"),s);
    const stock=await rows("StockTransaction",{...timed("recordedAt"),reason:"refill"},s);
    const activity=await rows("TaskEvent",timed("occurredAt"),s);
    const actions=await rows("DoseAction",timed("recordedAt"),s);
    const versionCache=new Map(),cabinetCache=new Map(),prescriptionCache=new Map();
    const get=async(name,key,cache)=>{if(!cache.has(String(key)))cache.set(String(key),await db.one(name,{_id:key,patientId},s));return cache.get(String(key));};
    result.doses=[];
    for(const d of doses){const v=await get("ScheduleVersion",d.scheduleVersionId,versionCache);if(!v)fail(503,"REPORT_SOURCE_UNAVAILABLE","A saved dose source is unavailable.");result.doses.push({occurrenceId:String(d._id),dueAtUTC:d.dueAtUTC.toISOString(),medicineText:v.sourceSnapshot?.medicineText||"Medicine source text unavailable",state:d.state});}
    // Include the confirmed prescription sources of selected occurrences even
    // when confirmation predates the report range; label their inclusion basis.
    const prescriptionVersions=new Map(versions.map(v=>[String(v._id),{...v,inclusion:"confirmed_in_range"}]));
    for(const v of versionCache.values()) {
      const sourceId=v.sourceSnapshot?.prescriptionVersionId;
      if(sourceId&&!prescriptionVersions.has(sourceId)){
        const source=await db.one("PrescriptionVersion",{_id:id(sourceId),patientId},s);
        if(!source)fail(503,"REPORT_SOURCE_UNAVAILABLE","A prescription source is unavailable.");
        prescriptionVersions.set(sourceId,{...source,inclusion:"source_for_selected_doses"});
      }
    }
    result.prescriptions=[];
    for(const v of prescriptionVersions.values()){const p=await get("Prescription",v.prescriptionId,prescriptionCache);if(!p||!v.confirmedAt)fail(503,"REPORT_SOURCE_UNAVAILABLE","A prescription source is unavailable.");result.prescriptions.push({id:String(v._id),at:v.confirmedAt.toISOString(),title:p.title,versionNumber:v.versionNumber,status:v.status,inclusion:v.inclusion});}
    result.refills=[];
    for(const x of stock){const c=await get("CabinetItem",x.cabinetItemId,cabinetCache);result.refills.push({id:String(x._id),recordedAt:x.recordedAt.toISOString(),medicineText:c?.displayName||"Medicine unavailable",quantity:decimalQuantity(x.deltaMicros),unit:x.unit});}
    result.healthNotes=notes.map(x=>({id:String(x._id),text:x.text,recordedAt:x.recordedAt.toISOString(),revision:x.revision}));
    // This is the report projection: workflow metadata only, no handover text,
    // private medicine notes, contact information or unrestricted record dump.
    result.caregiverActivity=activity.map(x=>({id:String(x._id),taskId:String(x.taskId),eventType:x.eventType,occurredAt:x.occurredAt.toISOString(),fromStatus:x.fromStatus,toStatus:x.toStatus,actorUserId:x.actorUserId?String(x.actorUserId):null}));
    result.actions=actions.map(x=>({id:String(x._id),occurrenceId:String(x.occurrenceId),action:x.action,recordedAt:x.recordedAt.toISOString(),isCorrection:!!x.isCorrection}));
    if(result.doses.length+notes.length+result.prescriptions.length+stock.length+activity.length+actions.length>1000||Buffer.byteLength(JSON.stringify(result))>1024*1024)invalid("This report exceeds the record/size limit. Choose a shorter range.");
    return result;
  }
  patient.get("/analytics",scope("report.read"),async(req,res)=>{
    if(Object.keys(req.query).some(k=>!["fromUTC","toUTC","timezone"].includes(k)))fail(400,"INVALID_QUERY","Unsupported analytics query.");
    const r=range(req.query.fromUTC,req.query.toUTC,req.query.timezone);
    send(req,res,await db.transaction(s=>snapshot(req,r,s)));
  });
  patient.get("/health-notes",scope("report.read"),async(req,res)=>{
    if(Object.keys(req.query).some(k=>!["fromUTC","toUTC","timezone"].includes(k)))fail(400,"INVALID_QUERY","Unsupported note query.");
    const r=range(req.query.fromUTC,req.query.toUTC,req.query.timezone);
    send(req,res,(await rows("HealthNote",{patientId:req.patient._id,recordedAt:{$gte:r.from,$lt:r.to}},undefined,200,{recordedAt:-1,_id:-1})).map(publicDoc));
  });
  patient.post("/health-notes",csrf,scope("report.write"),async(req,res)=>{
    object(req.body,["text","recordedAt"],["text","recordedAt"]);
    const value=text(req.body.text,"text",2000),recordedAt=instant(req.body.recordedAt);
    if(recordedAt>now())invalid("Health notes cannot be future dated.");
    await mutate(req,res,"report.write",async s=>{
      const row=await db.insert("HealthNote",{patientId:req.patient._id,text:value,recordedAt,authorUserId:req.actorId},s);
      await db.insert("HealthNoteRevision",{patientId:req.patient._id,noteId:row._id,revisionNumber:0,text:value,reason:"Created",actorUserId:req.actorId,recordedAt:now()},s);
      return publicDoc(row);
    });
  });
  patient.patch("/health-notes/:noteId",csrf,scope("report.write"),async(req,res)=>{
    object(req.body,["expectedRevision","text","reason"],["expectedRevision","text","reason"]);rev(req.body.expectedRevision);
    const value=text(req.body.text,"text",2000),reason=text(req.body.reason,"reason",500);
    await mutate(req,res,"report.write",async s=>{
      const old=await db.one("HealthNote",{_id:id(req.params.noteId),patientId:req.patient._id},s);
      if(!old)fail(404,"NOT_FOUND","Note not found.");if(old.revision!==req.body.expectedRevision)fail(409,"REVISION_CONFLICT","Reload the note before editing.");
      const row=await db.update("HealthNote",{_id:old._id,revision:old.revision},{text:value,editedAt:now()},s);
      await db.insert("HealthNoteRevision",{patientId:req.patient._id,noteId:row._id,revisionNumber:row.revision,text:value,reason,actorUserId:req.actorId,recordedAt:now()},s);
      return publicDoc(row);
    },200);
  });
  patient.post("/report-exports",csrf,scope("report.read"),async(req,res)=>{
    object(req.body,["fromUTC","toUTC","displayTimezone"],["fromUTC","toUTC","displayTimezone"]);
    const r=range(req.body.fromUTC,req.body.toUTC,req.body.displayTimezone);
    await mutate(req,res,"report.read",async s=>{
      const data=await snapshot(req,r,s,true);let pdf;
      try{pdf=await renderVisitPDF(data);}catch(e){if(e instanceof ReportPDFError)invalid(e.message);throw e;}
      const generatedAt=now(),row=await db.insert("ReportExport",{patientId:req.patient._id,createdBy:req.actorId,status:"ready",snapshot:data,pdfBytes:pdf,generatedAt,expiresAt:new Date(generatedAt.getTime()+86400000)},s);
      return {id:String(row._id),status:"ready"};
    },201);
  });
  async function report(req){const row=await db.one("ReportExport",{_id:id(req.params.reportId),patientId:req.patient._id});if(!row)fail(404,"NOT_FOUND","Report not found.");if(row.expiresAt<=now())fail(410,"REPORT_EXPIRED","This report expired. Generate a new export.");return row;}
  patient.get("/report-exports",scope("report.read"),async(req,res)=>{
    const filter={patientId:req.patient._id};
    if(Object.keys(req.query).some(k=>k!=="before"))fail(400,"INVALID_QUERY","Use the export-history cursor only.");
    if(req.query.before)filter._id={$lt:id(req.query.before)};
    const list=await db.list("ReportExport",filter,21,undefined,{_id:-1});
    send(req,res,{exports:list.slice(0,20).map(x=>({id:String(x._id),generatedAt:x.generatedAt,expiresAt:x.expiresAt,expired:x.expiresAt<=now(),fromUTC:x.snapshot.fromUTC,toUTC:x.snapshot.toUTC})),next:list.length>20?String(list[19]._id):null});
  });
  patient.get("/report-exports/:reportId",scope("report.read"),async(req,res)=>{
    const row=await report(req);send(req,res,{id:String(row._id),status:row.status,snapshot:row.snapshot,generatedAt:row.generatedAt,expiresAt:row.expiresAt});
  });
  patient.get("/report-exports/:reportId/content",scope("report.read"),async(req,res)=>{
    const row=await report(req);await access(req,"report.read");
    res.set({"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="MediMate-visit-${String(row._id)}.pdf"`,"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"});
    const bytes=row.pdfBytes;res.send(Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes.buffer));
  });
}
