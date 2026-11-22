import fs from "node:fs";
import {createHash} from "node:crypto";
const regression=fs.readFileSync("docs/evidence/step38-regression.txt","utf8");
if(!/ℹ fail 0/.test(regression))throw Error("Full audit regression did not pass");
const audit=JSON.parse(fs.readFileSync("docs/evidence/step38-audit.json","utf8"));
if(audit.checks.length!==10||audit.checks.some(x=>x.status!=="passed"))throw Error("Adversarial audit incomplete");
const ocr=JSON.parse(fs.readFileSync("docs/evidence/step38-ocr.json","utf8"));
if(ocr.status!=="passed")throw Error("Actual OCR engine audit unavailable or failed");
const cases=[
  ["Cross-patient identifiers","Caller owning both patients cannot borrow resource IDs",["failure-audit.test.js","api.test.js"],/resource IDs stay patient-scoped/],
  ["Revoked and partial grants","Current permissions protect reads, mutations and receipt replay",["failure-audit.test.js","followups.test.js","sos.test.js","reports.test.js"],/partial caregiver permission loss/],
  ["Expired session and CSRF","Rejected writes have no side effects; fresh sign-in recovers",["failure-audit.test.js","api.test.js"],/expired session rejects old writes/],
  ["Duplicate/concurrent submissions","One committed effect and honest conflicts",["api.test.js","end-to-end.test.js","sos.test.js"],/concurrent duplicate creates/],
  ["Concurrent stock and rollback","Exact balance/debits and transaction rollback",["inventory.test.js"],/concurrent distinct doses and duplicate submissions/],
  ["Blurred OCR","Clear control recognized; blur degrades; clarification blocks confirmation",["failure-audit.test.js","prescriptions.test.js"],/blurred OCR remains an unconfirmed clarification draft/],
  ["Unmatched/unavailable RxNorm","No false identity; malformed/unavailable evidence rejected",["rxnorm.test.js","cabinet.test.js"],/no-match differs from outage/],
  ["Label absence/outage","No invented source passage or activation",["openfda.test.js","information-cards.test.js"],/openFDA no-match is distinct from outage/],
  ["Map outage/partial data","Empty, partial, timeout and outage remain distinct",["pharmacies.test.js","hospitals.test.js"],/Overpass bounds requests/],
  ["Telegram failure/uncertainty","Unknown delivery is preserved without automatic resend",["telegram.test.js","tasks.test.js","doses.test.js","sos.test.js"],/uncertain send and interrupted lease stay unknown/],
  ["Restart/crash boundaries","Persisted state/leases prevent duplicate effects",["timezone-restarts.test.js","followups.test.js","sos.test.js","end-to-end.test.js"],/actual process deaths before provider/],
  ["Historical versions","Confirmed history is immutable and persists",["prescriptions.test.js","schedules.test.js"],/confirmed instructions cannot be patched/],
  ["SOS boundaries","Forged state, expired consent/ack and production simulation rejected",["failure-audit.test.js","sos.test.js"],/production does not mount classroom provider simulation/],
];
const matrix=cases.map(([topic,expectation,files,pattern])=>{if(!pattern.test(regression))throw Error("Missing passed coverage: "+topic);for(const file of files)if(!fs.existsSync("server/test/"+file))throw Error("Missing test file");return {topic,expectation,testFiles:files.map(x=>"server/test/"+x),outcome:"passed",evidence:"docs/evidence/step38-regression.txt"};});
const findings=[{priority:"P2",file:"server/v1/sos.js",finding:"A former SOS manager retaining only sos.activate could replay a previously successful closure of another activator's incident.",impact:"Current-role check was bypassed for a stored receipt; replay returned old success without performing a new closure.",fix:"Check current manager/originator role before receipt lookup and retain the transactional transition check.",status:"fixed"},{priority:"P2",file:"server/v1/sos.js",finding:"Malformed plus placement in contact/callback phone numbers passed server validation while UI call links rejected the format.",impact:"Stored phone could be unusable through the call control.",fix:"Allow at most one leading plus, a leading digit, supported separators and at least five digits within 5–30 characters.",status:"fixed"}];
const evidence={runAt:new Date().toISOString(),matrix,findings,actualOcr:{context:ocr.context,clearConfidence:ocr.recognitions.find(x=>x.kind==="clear").confidence,blurredConfidence:ocr.recognitions.find(x=>x.kind==="blurred").confidence,status:ocr.status},limitations:["Node/WASM synthetic OCR is not a native-browser image-upload or handwriting-accuracy test","No real Telegram alert or emergency-provider request was sent","Live public map source availability and faculty/student/native-browser evidence remain open"]};
fs.writeFileSync("docs/evidence/step38-matrix.json",JSON.stringify(evidence,null,2)+"\n");
let md="# Step 38 failure/permission coverage\n\nRecorded from the successful full backend regression and actual synthetic OCR engine run. No real alerts/providers were contacted.\n\n| Category | Expected behavior | Coverage | Result |\n|---|---|---|---|\n";
for(const row of matrix)md+=`| ${row.topic} | ${row.expectation} | ${row.testFiles.map(x=>"["+x.split("/").at(-1)+"](../../"+x+")").join(", ")} | Passed |\n`;
md+="\nTwo confirmed findings were fixed; see step38-matrix.json and the before/final transcripts. Browser/device and live external gates remain separate.\n";
fs.writeFileSync("docs/evidence/step38-matrix.md",md);
const files=["server/v1/sos.js","server/test/failure-audit.test.js","verification/step18/api.mjs","verification/step38/ocr.mjs","verification/step38/record-evidence.mjs","package-lock.json","docs/STEP_38_FAILURE_PERMISSION_AUDIT.md","docs/evidence/step38-before.txt","docs/evidence/step38-targeted.txt","docs/evidence/step38-regression.txt","docs/evidence/step38-audit.json","docs/evidence/step38-ocr.json","docs/evidence/step38-matrix.json","docs/evidence/step38-matrix.md","output/step38/clear.png","output/step38/blurred.png"];
fs.writeFileSync("docs/evidence/step38-manifest.json",JSON.stringify({runAt:evidence.runAt,files:files.map(path=>({path,sha256:createHash("sha256").update(fs.readFileSync(path)).digest("hex")}))},null,2)+"\n");
console.log({categories:matrix.length,findingsFixed:findings.length,adversarialChecks:audit.checks.length,ocr:ocr.status});
