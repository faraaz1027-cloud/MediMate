// Reference solutions only. Students first attempt their own changes independently.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const review=path.resolve(root,'../Support/Step42_Review'),dest=path.join(review,'Rehearsal_Source');
if(!fs.existsSync(path.join(review,'canonical-app-hashes.json')))throw Error('Prepare the isolated rehearsal first.');
function once(text,old,value){if(text.split(old).length!==2)throw Error('Expected one exact exercise anchor: '+old.slice(0,60));return text.replace(old,value);}
function field(text,model,name){const start=text.indexOf(`model("${model}", {`),end=text.indexOf('\n});',start)+4;if(start<0||end<4)throw Error('Model anchor missing');const block=once(text.slice(start,end),`  ${name}: String,`,`  ${name}: { type: String, maxlength: 80 },`);return text.slice(0,start)+block+text.slice(end);}
const specs=[
 {member:'sadat',client:'client/src/PrescriptionReview.jsx',label:'Prescription title',input:'name="title"\n                      value={title}\n                      required\n                      maxLength={200}',replacement:'name="title"\n                      value={title}\n                      required\n                      maxLength={80}',api:'server/v1/prescriptions.js',edits:[['text(b.title, "title");','text(b.title, "title", 80);']],model:'Prescription',property:'title'},
 {member:'faraaz',client:'client/src/MedicineCabinet.jsx',label:'Strength (optional)',input:'name="strengthText"\n                      maxLength={200}',replacement:'name="strengthText"\n                      maxLength={80}',api:'server/v1/cabinet.js',edits:[['fields[k] = text(b[k], k);','fields[k] = text(b[k], k, k === "strengthText" ? 80 : 200);'],['text(b[k], k, k === "displayName" ? 500 : 200);','text(b[k], k, k === "strengthText" ? 80 : k === "displayName" ? 500 : 200);']],model:'CabinetItem',property:'strengthText'},
 {member:'sahir',client:'client/src/TaskBoard.jsx',label:'Task title',input:'name="title"\n                      required\n                      maxLength={200}',replacement:'name="title"\n                      required\n                      maxLength={80}',api:'server/v1/tasks.js',edits:[['title: text(b.title, "title"),','title: text(b.title, "title", 80),'],['set.title = text(b.title, "title");','set.title = text(b.title, "title", 80);']],model:'Task',property:'title'}
];
const baseline=new Map();for(const name of new Set(specs.flatMap(s=>[s.client,s.api,'server/v1/store.js'])))baseline.set(name,fs.readFileSync(path.join(dest,name),'utf8').replaceAll('\r\n','\n'));
const changes=[];
for(const spec of specs){
 const replacements=new Map([[spec.client,once(baseline.get(spec.client),spec.input,spec.replacement)],[spec.api,spec.edits.reduce((s,[a,b])=>once(s,a,b),baseline.get(spec.api))],['server/v1/store.js',field(baseline.get('server/v1/store.js'),spec.model,spec.property)]]);
 let patch='';
 for(const [name,after] of replacements){
  const old=path.join(review,'Reference',spec.member,'Before',name),next=path.join(review,'Reference',spec.member,'After',name);
  fs.mkdirSync(path.dirname(old),{recursive:true});fs.mkdirSync(path.dirname(next),{recursive:true});fs.writeFileSync(old,baseline.get(name));fs.writeFileSync(next,after);
  const d=spawnSync('git',['diff','--no-index','--no-ext-diff','--',old.replaceAll('\\','/'),next.replaceAll('\\','/')],{encoding:'utf8'});if(![0,1].includes(d.status))throw Error(d.stderr);
  patch+=d.stdout.replaceAll('a/'+old.replaceAll('\\','/'),'a/'+name).replaceAll('b/'+next.replaceAll('\\','/'),'b/'+name);
  if(name==='server/v1/store.js'){const current=fs.readFileSync(path.join(dest,name),'utf8');fs.writeFileSync(path.join(dest,name),field(current,spec.model,spec.property));}
  else fs.writeFileSync(path.join(dest,name),after);
 }
 fs.writeFileSync(path.join(review,spec.member+'-reference.patch'),patch);
 changes.push({member:spec.member,field:spec.property,oldLimit:200,practiceLimit:80,paths:[spec.client,spec.api,'server/v1/store.js']});
}
// Exercise the real compiled inputs using the existing integration fixture.
const uiFile=path.join(dest,'verification/step18/run.mjs');let ui=fs.readFileSync(uiFile,'utf8');
for(const [label,anchor] of [
 ['Prescription title','  await u.type(getByLabelText(body, "Prescription title"), "DOM prescription");'],
 ['Task title','  await u.type(getByLabelText(body, "Task title"), "DOM task");'],
 ['Strength (optional)','  await u.type(getByLabelText(body,"Strength (optional)",{exact:true}),"500 MG");']
]){
 const input=`getByLabelText(body, ${JSON.stringify(label)}, {exact:true})`;
 const check=`  assert.equal(${input}.maxLength,80);\n  await u.type(${input},'X'.repeat(81));\n  assert.equal(${input}.value.length,80);\n  await u.clear(${input});\n  console.log('Step 42 rendered input passed: '+${JSON.stringify(label)});\n`;
 ui=once(ui,anchor,check+anchor);
}
fs.writeFileSync(uiFile,ui);
for(const spec of specs){const checked=spawnSync('git',['apply','--no-index','--reverse','--check',path.join(review,spec.member+'-reference.patch')],{cwd:dest,encoding:'utf8'});if(checked.status)throw Error(checked.stderr);}
fs.writeFileSync(path.join(review,'reference-changes.json'),JSON.stringify({type:'isolated reference rehearsal; not production or student evidence',rehearsal:dest,changes,ui:'Three actual compiled inputs test 81 typed characters result in length 80; existing UI workflows then continue.'},null,2)+'\n');
console.log(JSON.stringify({appliedOnlyIn:dest,referencePatchesReverseChecked:3,changes}));
