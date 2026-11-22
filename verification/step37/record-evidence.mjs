// Generate a review ledger and hashes from an already successful scenario run.
// Credentials, link codes and signed selection tokens are deliberately absent.
import fs from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
const root=fileURLToPath(new URL("../../",import.meta.url));
const read=name=>fs.readFileSync(path.join(root,name));
const report=JSON.parse(read("docs/evidence/step37-scenario.json"));
const exchanges=JSON.parse(read("docs/evidence/step37-exchanges.json"));
if(report.checks.length!==14||report.checks.some(x=>!x.passed)||exchanges.exchanges.length!==report.exchangeCount)throw Error("Incomplete scenario evidence");
const forbidden=new Set(["password","passwordhash","cookie","authorization","csrf","csrftoken","token","tokenhash","chatid","telegramuserid","selectiontoken","challengeurl"]);
function audit(value){if(typeof value==="string"&&(/medimate_session=|https:\/\/t\.me\/[^ ]+[?&]start=/.test(value)))throw Error("Private cookie or linking URL found in evidence");if(value&&typeof value==="object")for(const [key,item] of Object.entries(value)){if(forbidden.has(key.toLowerCase()))throw Error("Credential-bearing field found in evidence: "+key);audit(item);}}
audit(report);audit(exchanges);
const escape=value=>String(value).replaceAll("|","\\|").replaceAll("\n"," ");
let ledger="# Step 37 connected scenario evidence\n\nGenerated from actual successful HTTP/MongoDB assertions. External providers are controlled test adapters. No real contact/provider message was sent. The disposable database is removed after validation; record IDs below are historical synthetic evidence, not a running demonstration dataset.\n\n";
ledger+=`Run: ${report.runAt}. Requests: ${report.exchangeCount}. Checkpoints: ${report.checks.length}.\n\n| Feature | Input | Expected | Observed | Evidence |\n|---|---|---|---|---|\n`;
for(const c of report.checks)ledger+=`| ${escape(c.feature)} | ${escape(JSON.stringify(c.input))} | ${escape(c.expected)} | ${escape(JSON.stringify(c.actual))} | [JSON records](step37-scenario.json), [request indexes ${c.requestIndexes.join(", ")}](step37-exchanges.json) |\n`;
ledger+="\nThe PDF is [the generated synthetic visit report](../../output/pdf/step37-synthetic-visit.pdf). Prior native-UI limitations and open live integrations remain unchanged.\n";
fs.writeFileSync(path.join(root,"docs/evidence/step37-checkpoints.md"),ledger);
const files=["server/test/end-to-end.test.js","verification/step18/api.mjs","verification/step37/run.ps1","verification/step37/record-evidence.mjs","package.json","package-lock.json","server/package.json","client/package.json","server/assets/fonts/NotoSansBengali.ttf","docs/evidence/step37-api.txt","docs/evidence/step37-scenario.json","docs/evidence/step37-exchanges.json","docs/evidence/step37-checkpoints.md","docs/evidence/step36-dom.json","docs/evidence/step36-regression.txt","output/pdf/step37-synthetic-visit.pdf","client/dist/index.html"];
const index=read("client/dist/index.html").toString();const asset=index.match(/<script[^>]+src="([^"]+)"/)[1];files.push("client/dist"+asset);
files.push("docs/STEP_37_COMPLETE_SCENARIO.md");
const qaPath="docs/evidence/step37-pdf-qa.json";
const qa=fs.existsSync(path.join(root,qaPath))?JSON.parse(read(qaPath)):null;
if(qa)files.push(qaPath);
for(const folder of ["server/v1","client/src"]){for(const name of fs.readdirSync(path.join(root,folder)))if(/\.(js|jsx|css)$/.test(name))files.push(folder+"/"+name);}
const manifest={createdAt:new Date().toISOString(),branch:execFileSync("git",["branch","--show-current"],{cwd:root,encoding:"utf8"}).trim(),gitHead:execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),workingTreeDirty:!!execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim(),redactionCheckPassed:true,files:files.map(name=>({path:name,sha256:createHash("sha256").update(read(name)).digest("hex")}))};
manifest.pdfQa={path:qaPath,available:!!qa,matchesCurrentPdf:qa?.sha256===manifest.files.find(x=>x.path==="output/pdf/step37-synthetic-visit.pdf").sha256};
fs.writeFileSync(path.join(root,"docs/evidence/step37-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({checkpoints:report.checks.length,requests:report.exchangeCount,controlledNotices:report.controlledNotices,redactionCheckPassed:true,hashedFiles:files.length}));
