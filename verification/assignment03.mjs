import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
export const members = [
  { name: "Ihfaz Rashid Sadat", id: "23301499", port: 1499, slug: "Ihfaz_Rashid_Sadat", steps: [21, 25], features: ["A1 Prescription Import Review and Change Tracking", "A2 Verified Medication Schedule Builder"] },
  { name: "Faraaz Jamil Chowdhury", id: "24241205", port: 1205, slug: "Faraaz_Jamil_Chowdhury", steps: [22, 26], features: ["B1 Medicine Search and Personal Cabinet", "B2 Source Linked Medicine Information Cards"] },
  { name: "Sahir Jawad Chowdhury", id: "23301212", port: 1212, slug: "Sahir_Jawad_Chowdhury", steps: [23, 27], features: ["C1 Caregiver Tasks and Handover Board", "C2 Reminder Delivery and Dose Recording"] },
];
const files = {21:"prescriptions",25:"schedules",22:"cabinet",26:"information-cards",23:"tasks",27:"doses"};
const rootUrl = "{{baseUrl}}/patients/{{patientId}}";
const script = (listen, exec) => ({listen,script:{type:"text/javascript",exec}});
function extra(name, method, route, checks, credential = "owner", raw) {
  const cookie = credential === "plain" ? "cookie" : credential + "Cookie";
  const csrf = credential === "plain" ? "csrf" : credential + "Csrf";
  return {
    name,
    protocolProfileBehavior: { disableCookies: true },
    request: {method,url:rootUrl+route,header:raw ? [{key:"Content-Type",value:"application/json"}] : [],
      ...(raw ? {body:{mode:"raw",raw,options:{raw:{language:"json"}}}} : {})},
    event:[
      script("prerequest", [
        `pm.request.headers.upsert({key:'Cookie',value:pm.collectionVariables.get('${cookie}')||''});`,
        ...(raw ? [`pm.request.headers.upsert({key:'X-CSRF-Token',value:pm.collectionVariables.get('${csrf}')||''});`,
          "pm.request.headers.upsert({key:'Idempotency-Key',value:pm.variables.replaceIn('{{$guid}}')});"] : []),
      ]),
      script("test", checks),
    ],
  };
}
function addAfter(items, name, ...added) {
  const index = items.findIndex((item) => item.name === name);
  if (index < 0) throw Error("Missing starter request " + name);
  items.splice(index + 1, 0, ...added);
}
export const prescriptionList = extra("List and verify the saved prescription", "GET", "/prescriptions?status=active&limit=20", [
  "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
  "pm.test('Saved prescription is present', () => pm.expect(pm.response.json().data.some(p => p.id === pm.collectionVariables.get('prescriptionId'))).to.equal(true));",
], "plain");
const listChecks = [
  "pm.test('HTTP 200', () => pm.response.to.have.status(200));",
  "pm.test('Database list returned', () => pm.expect(pm.response.json().data).to.be.an('array'));",
];
function augment(step, items) {
  if (step === 21) {
    const replacement = structuredClone(items.find((r) => r.name === "Create replacement draft"));
    replacement.name = "Create a draft to delete";
    replacement.request.body.raw = replacement.request.body.raw.replace('"expectedRevision":2','"expectedRevision":4').replace("{{v1}}","{{v2}}");
    replacement.event.at(-1).script.exec[1] = "pm.collectionVariables.set('discardId',pm.response.json().data.draftVersion.id);";
    const archive = items.find((r) => r.name === "Archive without deleting history");
    archive.request.body.raw = archive.request.body.raw.replace('"expectedRevision":4','"expectedRevision":6');
    addAfter(items, "Read current version", replacement,
      extra("Delete only the unconfirmed draft", "DELETE", "/prescriptions/{{prescriptionId}}/versions/{{discardId}}", [
        listChecks[0],
        "pm.test('Only draft removed', () => pm.expect(pm.response.json().data.removedDraftId).to.equal(pm.collectionVariables.get('discardId')));",
      ], "plain", '{"expectedRevision":0}'),
      extra("Read retained confirmed prescription", "GET", "/prescriptions/{{prescriptionId}}", [
        listChecks[0],
        "pm.test('Confirmed version retained and draft cleared', () => {const d=pm.response.json().data;pm.expect(d.draftVersion).to.equal(null);pm.expect(d.currentVersion.id).to.equal(pm.collectionVariables.get('v2'));});",
      ], "plain"),
      extra("Reject deleting the confirmed version", "DELETE", "/prescriptions/{{prescriptionId}}/versions/{{v2}}", [
        "pm.test('Confirmed version is protected', () => pm.response.to.have.status(409));",
      ], "plain", '{"expectedRevision":1}'));
  }
  if (step === 25) {
    addAfter(items, "Read persisted events", extra("Read the saved schedule", "GET", "/schedules/{{scheduleId}}", [
      listChecks[0],
      "pm.test('Schedule and confirmed version are present', () => pm.expect(JSON.stringify(pm.response.json().data)).to.include(pm.collectionVariables.get('scheduleId')));",
    ]));
    const pause = items.find((r) => r.name === "Pause future events");
    pause.event[0].script.exec.push("pm.collectionVariables.set('pauseBoundary',new Date(Date.parse(pm.collectionVariables.get('start'))+86400000).toISOString());");
    pause.request.body.raw = JSON.stringify({expectedRevision:2,reason:"Synthetic scheduled pause",effectiveFromUTC:"{{pauseBoundary}}"},null,2);
    pause.event.at(-1).script.exec.push("pm.test('Pause effective time saved',()=>pm.expect(pm.response.json().data.pausedAt).to.equal(pm.collectionVariables.get('pauseBoundary')));");
    const upcoming = items.find((r) => r.name === "Paused upcoming view empty");
    upcoming.name = "Read retained events before the pause boundary";
    upcoming.event.at(-1).script.exec[1] = "pm.test('Earlier upcoming events retained',()=>{const rows=pm.response.json().data;pm.expect(rows.length).to.be.above(0);pm.expect(rows.every(d=>d.dueAtUTC<pm.collectionVariables.get('pauseBoundary'))).to.equal(true);});";
  }
  if (step === 22) {
    const manual = items.find((r) => r.name === "Honest manual fallback");
    manual.event.at(-1).script.exec.push("pm.collectionVariables.set('removableId',pm.response.json().data.id);");
    const statusCheck = (status) => [
      listChecks[0], `pm.test('Saved ${status} item is present',()=>pm.expect(pm.response.json().data.some(d=>d.id===pm.collectionVariables.get('removableId')&&d.usageStatus==='${status}')).to.equal(true));`,
    ];
    addAfter(items, "Active list excludes archive",
      extra("Set cabinet use status to paused","PATCH","/cabinet-items/{{removableId}}",[listChecks[0]],"plain",'{"expectedRevision":0,"usageStatus":"paused","reason":"Synthetic filter check"}'),
      extra("Filter paused cabinet entries","GET","/cabinet-items?status=paused",statusCheck("paused"),"plain"),
      extra("Set cabinet use status to completed","PATCH","/cabinet-items/{{removableId}}",[listChecks[0]],"plain",'{"expectedRevision":1,"usageStatus":"completed","reason":"Synthetic filter check"}'),
      extra("Filter completed cabinet entries","GET","/cabinet-items?status=completed",statusCheck("completed"),"plain"),
      extra("Remove medicine from the cabinet","DELETE","/cabinet-items/{{removableId}}",[listChecks[0],"pm.test('Removed state recorded',()=>pm.expect(pm.response.json().data.status).to.equal('removed'));"],"plain",'{"expectedRevision":2}'),
      extra("Verify removal in all cabinet statuses","GET","/cabinet-items?status=all",[listChecks[0],"pm.test('Removed item hidden from cabinet lists',()=>pm.expect(pm.response.json().data.some(d=>d.id===pm.collectionVariables.get('removableId'))).to.equal(false));"],"plain"));
  }
  if (step === 23) {
    const noteRoute = "/tasks/{{taskId}}/notes";
    items.find(r => r.name === "Append handover note").event.find(e => e.listen === "test").script.exec.push(
      "pm.collectionVariables.set('noteId',pm.response.json().data.id);",
    );
    const readNote = (name, expected) => extra(name, "GET", noteRoute, [listChecks[0],
      `pm.test('Current note persisted',()=>{const n=pm.response.json().data.find(n=>n.id===pm.collectionVariables.get('noteId'));pm.expect(n.text).to.equal('${expected}');});`,
    ]);
    addAfter(items, "Append handover note",
      extra("Read current handover notes", "GET", noteRoute, [listChecks[0],
        "pm.test('Author note exists',()=>pm.expect(pm.response.json().data.some(n=>n.id===pm.collectionVariables.get('noteId'))).to.equal(true));"]),
      extra("Non-author cannot edit note", "PATCH", noteRoute + "/{{noteId}}", [
        "pm.test('Author-only edit rejected',()=>pm.response.to.have.status(403));"], "owner", '{"expectedRevision":0,"text":"Forbidden edit"}'),
      readNote("Read unchanged note after rejected edit", "Synthetic Postman handover"),
      extra("Non-author cannot delete note", "DELETE", noteRoute + "/{{noteId}}", [
        "pm.test('Author-only deletion rejected',()=>pm.response.to.have.status(403));"], "owner", '{"expectedRevision":0}'),
      readNote("Read unchanged note after rejected deletion", "Synthetic Postman handover"),
      extra("Author edits handover note", "PATCH", noteRoute + "/{{noteId}}", [listChecks[0],
        "pm.test('Edited note returned',()=>pm.expect(pm.response.json().data.text).to.equal('Synthetic edited handover'));"], "caregiver", '{"expectedRevision":0,"text":"Synthetic edited handover"}'),
      readNote("Read back edited handover note", "Synthetic edited handover"),
      extra("Reject stale note edit", "PATCH", noteRoute + "/{{noteId}}", [
        "pm.test('Stale revision rejected',()=>pm.response.to.have.status(409));"], "caregiver", '{"expectedRevision":0,"text":"Stale edit"}'),
      extra("Author deletes handover note", "DELETE", noteRoute + "/{{noteId}}", [listChecks[0],
        "pm.test('Deletion recorded',()=>pm.expect(pm.response.json().data.deletedAt).to.be.a('string'));"], "caregiver", '{"expectedRevision":1}'),
      extra("Read back deleted handover note", "GET", noteRoute, [listChecks[0],
        "pm.test('Deleted note absent, initial note retained',()=>{const rows=pm.response.json().data;pm.expect(rows.some(n=>n.id===pm.collectionVariables.get('noteId'))).to.equal(false);pm.expect(rows.some(n=>n.text==='Synthetic initial note')).to.equal(true);});"]),
      extra("Read note edit and deletion audit history", "GET", "/tasks/{{taskId}}/history?limit=100", [listChecks[0],
        "pm.test('Original and previous versions retained',()=>{const h=pm.response.json().data;pm.expect(h.some(e=>e.eventType==='note'&&e.text==='Synthetic Postman handover')).to.equal(true);pm.expect(h.some(e=>e.eventType==='note_edited'&&e.previousText==='Synthetic Postman handover')).to.equal(true);pm.expect(h.some(e=>e.eventType==='note_deleted'&&e.previousText==='Synthetic edited handover')).to.equal(true);});"]),
    );
    addAfter(items, "Grant task access", extra("List eligible task assignees", "GET", "/task-assignees", listChecks));
    addAfter(items, "Delivery state is separate", extra("Retry task notice with Telegram disabled", "POST", "/tasks/{{taskId}}/notifications/{{taskJobId}}/retry", [
      "pm.test('Disabled Telegram returns HTTP 503', () => pm.response.to.have.status(503));",
      "pm.test('Channel unavailable', () => pm.expect(pm.response.json().error.code).to.equal('TELEGRAM_NOT_CONFIGURED'));",
    ], "owner", "{}"));
    items.find((r) => r.name === "Delivery state is separate").event.find((e) => e.listen === "test").script.exec.push(
      "pm.collectionVariables.set('taskJobId', pm.response.json().data[0].id);",
    );
  }
  if (step === 26) {
    const route = "/cabinet-items/{{itemId}}/information-card";
    const read = items.find(r => r.name === "Read persisted card and note");
    read.event.find(e => e.listen === "test").script.exec.push(
      "const card=pm.response.json().data;pm.collectionVariables.set('retainedCardId',card.id);pm.collectionVariables.set('retainedSourceId',card.source.id);",
    );
    addAfter(items, "Read persisted card and note",
      extra("Delete personal note while retaining source", "PATCH", route + "/note", [listChecks[0],
        "pm.collectionVariables.set('revision',pm.response.json().data.revision);",
        "pm.test('Only note cleared',()=>{const c=pm.response.json().data;pm.expect(c.personalNote).to.equal('');pm.expect(c.id).to.equal(pm.collectionVariables.get('retainedCardId'));pm.expect(c.source.id).to.equal(pm.collectionVariables.get('retainedSourceId'));});"], "owner", '{"expectedRevision":{{revision}},"personalNote":""}'),
      extra("Read back deleted personal note and retained source", "GET", route, [listChecks[0],
        "pm.test('Card and source persist without note',()=>{const c=pm.response.json().data;pm.expect(c.personalNote).to.equal('');pm.expect(c.id).to.equal(pm.collectionVariables.get('retainedCardId'));pm.expect(c.source.id).to.equal(pm.collectionVariables.get('retainedSourceId'));pm.expect(c.selectedPassages.length).to.be.above(0);});"]),
      extra("Restore note for reverse independence check", "PATCH", route + "/note", [listChecks[0],
        "pm.collectionVariables.set('revision',pm.response.json().data.revision);"], "owner", '{"expectedRevision":{{revision}},"personalNote":"Synthetic private note, not a label claim."}'),
    );
    addAfter(items, "Remove source association without note loss",
      extra("Read back source removed and note retained", "GET", route, [listChecks[0],
        "pm.test('Source removed independently',()=>{const c=pm.response.json().data;pm.expect(c.source).to.equal(null);pm.expect(c.personalNote).to.equal('Synthetic private note, not a label claim.');});"]));
    items.find(r=>r.name === "Delete personal note while retaining source").capture = true;
  }
  if (step === 22) {
    for (const name of ["Filter paused cabinet entries", "Filter completed cabinet entries"])
      items.find(r=>r.name===name).capture = true;
  }
  if (step === 27) {
    for (const item of items) for (const event of item.event ?? []) {
      event.script.exec = event.script.exec.map((line) => line.replaceAll("not_implemented", "needs_review"));
    }
    addAfter(items, "Read immutable action history",
      extra("List recorded dose actions", "GET", "/doses/{{doseA}}/actions?limit=20", listChecks),
      extra("List reminder jobs for the pending dose", "GET", "/doses/{{doseC}}/reminders?limit=20", listChecks),
      extra("Reject retry for an unknown reminder", "POST", "/doses/{{doseC}}/reminders/000000000000000000000001/retry", [
        "pm.test('Unknown reminder returns HTTP 404', () => pm.response.to.have.status(404));",
        "pm.test('Unknown job response', () => pm.expect(pm.response.json().error.code).to.equal('NOT_FOUND'));",
      ], "owner", '{"expectedRevision":0}'),
    );
    addAfter(items, "Turn off synthetic reminder request before finishing", extra("Read back disabled reminder preference", "GET", "/dose-reminder-settings", [
      listChecks[0], "pm.test('Preference persisted off', () => pm.expect(pm.response.json().data.enabled).to.equal(false));",
    ]));
  }
}
function structure(item) {
  const [base, query] = (item.request.url.raw ?? item.request.url).split("?");
  const parts = base.split("/");
  const params = [...new URLSearchParams(query)].map(([key,value]) => ({key,value}));
  item.request.url = {raw: base + (query ? "?" + query : ""), host:[parts[0]], path:parts.slice(1),
    ...(params.length ? {query:params} : {})};
  if (item.request.body?.mode === "raw") item.request.body.options = {raw:{language:"json"}};
  return item;
}
export function canonical(item) {
  return item.request.method + " " + item.request.url.raw.split("?")[0]
    .replace(rootUrl, "").replace("{{baseUrl}}", "")
    .replace(/\{\{[^}]+\}\}|\/\d{6,}(?=\/|$)/g, (v) => v.startsWith("/") ? "/:id" : ":id");
}
export function owned(step, item) {
  const route = canonical(item).split(" ")[1];
  if (step === 21) return route.startsWith("/prescriptions");
  if (step === 25) return route.startsWith("/schedule");
  if (step === 22) return route.startsWith("/medicine-search") || route.startsWith("/cabinet-items");
  if (step === 26) return /\/(label-candidates|information-card)/.test(route);
  if (step === 23) return /^\/task/.test(route);
  return /^\/dose/.test(route);
}
export function build(member) {
  return {
    info:{name:`MediMate Assignment 03 | ${member.name}`,schema:"https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      description:"Run both folders in order against a disposable MediMate replica-set database. Shared setup and scenario variants accompany the numbered assessed requests. Use local collection values for session data."},
    variable:[{key:"baseUrl",value:`http://127.0.0.1:${member.port}/api/v1`}],
    item:member.steps.map((step,index)=>{
      const input = JSON.parse(fs.readFileSync(path.join(root,`postman/MediMate_Step${step}.postman_collection.json`),"utf8"));
      augment(step,input.item);
      const items = input.item.map(structure);
      const initial = items[0].event.find((e) => e.listen === "prerequest");
      initial.script.exec.unshift(
        "['cookie','csrf','ownerCookie','ownerCsrf','readerCookie','readerCsrf','careCookie','careCsrf'].forEach(k => pm.collectionVariables.unset(k));",
      );
      const assessed = new Map();
      for (const item of items.filter((item) => owned(step,item))) {
        const key = canonical(item);
        const positive = item.event?.find((e) => e.listen === "test")?.script.exec[0]?.match(/status\(20[01]\)/);
        if (!assessed.has(key) || (positive && !assessed.get(key).positive))
          assessed.set(key,{item,positive});
      }
      if (step === 26) assessed.get("GET /cabinet-items/:id/information-card").item =
        items.find((item) => item.name === "Read persisted card and note");
      if (step === 27) assessed.get("GET /doses").item =
        items.find((item) => item.name === "Wait for the real future events, then read due occurrences");
      let number = 0;
      for (const item of items.filter((entry) => entry.capture || assessed.get(canonical(entry))?.item === entry)) {
        item.name = member.features[index].split(" ")[0] + "-" + String(++number).padStart(2,"0") + " " + item.name;
      }
      for (const item of items) delete item.capture;
      return {name:member.features[index],item:items};
    }),
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? "postman");
  fs.mkdirSync(out,{recursive:true});
  const manifest = [];
  for (const member of members) {
    const collection = build(member);
    const filename = `MediMate_Assignment03_${member.slug}.postman_collection.json`;
    fs.writeFileSync(path.join(out,filename),JSON.stringify(collection,null,2)+"\n");
    manifest.push({...member,filename,groups:collection.item.map((folder,i)=>({
      name:folder.name,file:files[member.steps[i]],
      items:folder.item.filter((item)=>/^[ABC]\d-\d\d /.test(item.name)),
    }))});
  }
  if (process.argv[3]) fs.writeFileSync(process.argv[3],JSON.stringify(manifest,null,2));
}
