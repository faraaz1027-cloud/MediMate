// Deliberately narrow extractive retrieval. Source text is data, never instructions.
export function educationalTopic(question) {
  const q = question.trim().toLowerCase().replace(/[?.!]+$/, "");
  const topics = {
    "what warnings are in the label": "warnings",
    "how does the label say to store this medicine": "storage_and_handling",
    "what is the labelled purpose": "purpose",
    "what active ingredients does the label list": "active_ingredient",
  };
  return topics[q] || null;
}
export function extractEducation(question, passages) {
  const topic = educationalTopic(question);
  if (!topic) return { outcome: "insufficient_evidence", reason: "unsupported_question", passages: [] };
  const matches = passages.filter(p => p.key === topic && typeof p.text === "string" && p.text.trim());
  if (!matches.length) return { outcome: "insufficient_evidence", reason: "passage_missing", passages: [] };
  // Multiple different excerpts can qualify or contradict each other. Display them
  // for review without choosing or synthesizing a conclusion.
  return { outcome: new Set(matches.map(p => p.text)).size === 1 ? "answered" : "insufficient_evidence", reason: new Set(matches.map(p => p.text)).size === 1 ? "exact_source_excerpt" : "multiple_passages_require_review", passages: matches };
}

export function installEducationalAnswers(patient, {db,csrf,scope,mutate,fail,id,object,publicDoc,now,send}) {
  const invalid = () => fail(422,"VALIDATION_ERROR","Use a question of 1–2000 characters and current revisions.");
  const lookup = async (req,s) => {
    const row = await db.one("EducationalAnswer",{_id:id(req.params.answerId),patientId:req.patient._id},s);
    if (!row || row.deletedAt) fail(404,"NOT_FOUND","Saved answer not found.");
    return row;
  };
  patient.post("/educational-answers",csrf,scope("cabinet.write"),async(req,res) => {
    object(req.body,["cabinetItemId","question"],["cabinetItemId","question"]);
    const itemId=id(req.body.cabinetItemId), q=req.body.question;
    if(typeof q !== "string" || !q.trim() || q.length>2000) invalid();
    await mutate(req,res,"cabinet.write",async s => {
      const item=await db.one("CabinetItem",{_id:itemId,patientId:req.patient._id},s);
      if(!item) fail(404,"NOT_FOUND","Medicine not found.");
      await db.fence("CabinetItem",{_id:itemId,patientId:req.patient._id},s);
      const card=await db.one("MedicineCard",{cabinetItemId:itemId,patientId:req.patient._id},s);
      const identity=item.sourceRecordId && await db.one("SourceRecord",{_id:item.sourceRecordId,provider:"rxnorm",matchStatus:"selected"},s);
      let answer={outcome:"insufficient_evidence",reason:"current_label_unavailable",passages:[]}, citations=[];
      if(item.status === "active" && identity && card?.availability === "available" && card.itemSnapshot?.revision === item.revision && card.itemSnapshot?.rxcui === identity.externalId) {
        const source=await db.one("SourceRecord",{_id:card.sourceRecordId,provider:"openfda"},s);
        if(!source) answer={outcome:"error",reason:"saved_source_unavailable",passages:[]};
        else {
          answer=extractEducation(q,card.selectedPassages);
          citations=answer.passages.map(p=>({sourceRecordId:String(source._id),provider:source.provider,sourceUrl:source.sourceUrl,retrievedAt:source.retrievedAt,contentHash:source.contentHash,sourceVersion:source.sourceVersion,key:p.key,index:p.index,text:p.text}));
        }
      }
      if(Buffer.byteLength(JSON.stringify(citations))>256*1024) {answer={outcome:"insufficient_evidence",reason:"source_too_large",passages:[]};citations=[];}
      const row=await db.insert("EducationalAnswer",{patientId:req.patient._id,cabinetItemId:itemId,cabinetRevision:item.revision,medicineName:item.displayName,question:q.trim(),outcome:answer.outcome,reason:answer.reason,citations,createdBy:req.actorId},s);
      // Receipts keep IDs only so deletion cannot expose old text through replay.
      return {id:String(row._id)};
    });
  });
  patient.get("/educational-answers",scope("cabinet.read"),async(req,res)=>{
    const filter={patientId:req.patient._id,deletedAt:null};
    if(Object.keys(req.query).some(k=>k!=="before")) fail(400,"INVALID_QUERY","Use the history cursor only.");
    if(req.query.before) filter._id={$lt:id(req.query.before)};
    const rows=await db.list("EducationalAnswer",filter,21,undefined,{_id:-1});
    send(req,res,{answers:rows.slice(0,20).map(publicDoc),next:rows.length>20?String(rows[19]._id):null});
  });
  patient.get("/educational-answers/:answerId",scope("cabinet.read"),async(req,res)=>{
    const row=await lookup(req), item=await db.one("CabinetItem",{_id:row.cabinetItemId,patientId:req.patient._id});
    send(req,res,{...publicDoc(row),itemChanged:!item || item.status!=="active" || item.revision!==row.cabinetRevision});
  });
  patient.patch("/educational-answers/:answerId/feedback",csrf,scope("cabinet.write"),async(req,res)=>{
    object(req.body,["expectedRevision","rating","comment"],["expectedRevision","rating"]);
    if(!Number.isInteger(req.body.expectedRevision)||req.body.expectedRevision<0||!["helpful","unhelpful"].includes(req.body.rating)||req.body.comment!==undefined&&(typeof req.body.comment!=="string"||req.body.comment.length>2000)) invalid();
    await mutate(req,res,"cabinet.write",async s=>{
      const row=await lookup(req,s); if(row.revision!==req.body.expectedRevision) fail(409,"REVISION_CONFLICT","Reload the answer before saving feedback.");
      await db.update("EducationalAnswer",{_id:row._id,revision:row.revision},{rating:req.body.rating,comment:req.body.comment?.trim()||""},s);
      return {id:String(row._id)};
    },200);
  });
  patient.delete("/educational-answers/:answerId",csrf,scope("cabinet.write"),async(req,res)=>{
    object(req.body,["expectedRevision"],["expectedRevision"]);
    if(!Number.isInteger(req.body.expectedRevision)||req.body.expectedRevision<0) invalid();
    await mutate(req,res,"cabinet.write",async s=>{
      const row=await lookup(req,s);if(row.revision!==req.body.expectedRevision) fail(409,"REVISION_CONFLICT","Reload before deleting.");
      await db.update("EducationalAnswer",{_id:row._id,revision:row.revision},{question:"",medicineName:"",citations:[],rating:null,comment:"",deletedAt:now()},s);
      return {id:String(row._id),deleted:true};
    },200);
  });
}
