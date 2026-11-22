"""Package the reference rehearsal separately from each student's human record."""
from pathlib import Path
import csv, hashlib, json, re, shutil, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent
REVIEW=BASE/'Support/Step42_Review';PRACTICE=REVIEW/'Rehearsal_Source'
OUT=REVIEW/'Viva_Pack';OUT.mkdir(exist_ok=True)
EVIDENCE=ROOT/'docs/evidence/step42';EVIDENCE.mkdir(parents=True,exist_ok=True)
baseline=json.loads((REVIEW/'canonical-app-hashes.json').read_text(encoding='utf-8'))
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for item in baseline['files']:assert sha(ROOT/item['path'])==item['sha256'],item['path']
for member in ['sadat','faraaz','sahir']:
    for mode,limit in [('baseline',200),('modified',80)]:
        source=PRACTICE/'docs/evidence/step42'/f'{mode}-{member}.json'
        result=json.loads(source.read_text());assert result['passed'] and result['expectedLimit']==limit
        shutil.copy2(source,EVIDENCE/source.name)
    patch=REVIEW/(member+'-reference.patch')
    subprocess.run(['git','apply','--no-index','--reverse','--check',str(patch)],cwd=PRACTICE,check=True,capture_output=True)
for name in ['build.txt','api.txt','ui.txt','summary.json','viva-baseline.txt']:
    shutil.copy2(PRACTICE/'.local-data/verification'/name,EVIDENCE/name)
starter=REVIEW/'sadat-practice/.local-data/verification'
for name in ['student-starter-check.json','student-before-change.txt','student-baseline.txt']:
    shutil.copy2(starter/name,EVIDENCE/name)
starter_result=json.loads((EVIDENCE/'student-starter-check.json').read_text(encoding='utf-8-sig'))
assert starter_result['default80CaseFailedAsExpected'] and starter_result['baseline200Passed']
summary=json.loads((EVIDENCE/'summary.json').read_text())
assert summary['node']=='v24.22.3' and all(r['exitCode']==0 for r in summary['results'])
api=(EVIDENCE/'api.txt').read_text(encoding='utf-8');ui=(EVIDENCE/'ui.txt').read_text(encoding='utf-8')
assert 'pass 190' in api and 'fail 0' in api
for label in ['Prescription title','Task title','Strength (optional)']:assert 'Step 42 rendered input passed: '+label in ui
checks={'date':'2026-11-21 Asia/Dhaka','branch':'feature/step42-viva-rehearsal','actor':'Codex reference rehearsal only','baselineCasesPassed':3,'modifiedBackendTestsPassed':190,'modifiedBackendFailed':0,'buildPassed':True,'compiledUiPassed':True,'typed81Observed80Fields':['Prescription title','Task title','Strength (optional)'],'referencePatchesReverseChecked':3,'canonicalApplicationFilesUnchanged':len(baseline['files']),'humanVivaStatus':{'Sadat':'NOT_RUN','Faraaz':'NOT_RUN','Sahir':'NOT_RUN'},'noIndividualCommitsOrJiraActionsPerformed':True,'limitations':['DOM checks are not native browser demonstrations.','Schema insert validation does not apply universally to update/raw database writes.','Shared model producers and legacy data require review before production changes.','No real Telegram, provider or clinical actions were performed.']}
checks['unmodifiedStudentStarterCheck']='Expected 80 case fails before implementation; original 200 case passes. Assistant check only.'
(EVIDENCE/'validation.json').write_text(json.dumps(checks,indent=2)+'\n',encoding='utf-8')
shutil.copy2(REVIEW/'reference-changes.json',EVIDENCE/'reference-changes.json')

(OUT/'docs/viva').mkdir(parents=True,exist_ok=True)
for f in (ROOT/'docs/viva').glob('*.md'):shutil.copy2(f,OUT/'docs/viva'/f.name)
shutil.copy2(ROOT/'docs/STEP_42_INDIVIDUAL_VIVA.md',OUT/'docs/STEP_42_INDIVIDUAL_VIVA.md')
shutil.copytree(ROOT/'verification/step42',OUT/'verification/step42',dirs_exist_ok=True)
shutil.copytree(EVIDENCE,OUT/'Evidence',dirs_exist_ok=True)
shutil.copytree(REVIEW/'Reference',OUT/'Reference',dirs_exist_ok=True)
for member in ['sadat','faraaz','sahir']:shutil.copy2(REVIEW/(member+'-reference.patch'),OUT/(member+'-reference.patch'))
(OUT/'Test_Entrypoints').mkdir(exist_ok=True)
for f in (PRACTICE/'server/test').glob('viva-*.test.js'):shutil.copy2(f,OUT/'Test_Entrypoints'/f.name)
# Keep a student's filled assessment record on later packaging runs.
record=OUT/'Assessment_Record.csv'
if not record.exists():
    with record.open('w',newline='',encoding='utf-8-sig') as stream:
        writer=csv.writer(stream);writer.writerow(['Member','Student_ID','Check_ID','Task','Human_status','Actual_observation','Evidence_link','Reviewed_commit','Jira_link','Evaluator','Performed_at'])
        for name,student,ids in [('Ihfaz Rashid Sadat','23301499',['A1','A2','A3','A4']),('Faraaz Jamil Chowdhury','24241205',['B1','B2','B3','B4']),('Sahir Jawad Chowdhury','23301212',['C1','C2','C3','C4','C5'])]:
            tasks=[(feature,'Demonstrate '+feature+' and explain persisted/failure behavior') for feature in ids]+[(key,text) for key,text in [('TRACE','Trace UI to API to stored record'),('QUESTIONS','Answer the member sheet questions'),('FRONTEND','Make and explain a frontend modification'),('API','Implement validation and demonstrate rejection'),('SCHEMA','Explain/model change, update validation and legacy/shared producers'),('REGRESSION','Run and interpret focused regression and UI results'),('EXTERNAL','Demonstrate actual feature-level external call with truthful outage fallback'),('PERMISSION','Demonstrate unauthorized or revoked access case'),('OWNERSHIP','Review real individual diff, commit and Jira evidence')]]
            for key,text in tasks:writer.writerow([name,student,key,text,'NOT_RUN','','','','','',''])
with (OUT/'Source_Map.csv').open('w',newline='',encoding='utf-8-sig') as stream:
    writer=csv.writer(stream);writer.writerow(['Owner','Exercise_layer','Canonical_path','Anchor_line','Exercise_scope'])
    for owner,client,api_name,model,field in [('Sadat','PrescriptionReview.jsx','prescriptions.js','Prescription','title'),('Faraaz','MedicineCabinet.jsx','cabinet.js','CabinetItem','strengthText'),('Sahir','TaskBoard.jsx','tasks.js','Task','title')]:
        for layer,name,anchor in [('Frontend','client/src/'+client,'name="'+field+'"'),('API','server/v1/'+api_name,'text(b.title' if field=='title' else 'for (const k of ["strengthText", "form"])'),('Model','server/v1/store.js','model("'+model+'", {')]:
            lines=(ROOT/name).read_text(encoding='utf-8').splitlines();line=next(i+1 for i,text in enumerate(lines) if anchor in text)
            writer.writerow([owner,layer,name,line,'Reference exercise only; canonical code unchanged'])
(OUT/'START_HERE.md').write_text('''# MediMate Step 42 viva preparation

Read docs/STEP_42_INDIVIDUAL_VIVA.md, then the member sheet in docs/viva.

All human checks in Assessment_Record.csv start NOT_RUN. These are practice checks,
not a faculty rubric. Do not claim the assistant reference tests as a student pass.

The existing reference copy is at Support/Step42_Review/Rehearsal_Source alongside
the canonical MediMate-A3/Source checkout. It contains all three answers already.
The source/runtime/dependencies are supplied separately by the Step 41 handover.

For another practice checkout, copy docs/ and verification/step42 from this pack
into that checkout after installing its normal dependencies. prepare.mjs creates
an isolated sibling Support/Step42_Review/Rehearsal_Source and refuses overwrite.
Use node verification/step42/prepare.mjs --member sadat (or faraaz/sahir) for an
unmodified per-member starter instead. Existing directories are preserved.
Attempt each change manually before reading/applying an answer-key patch. Do not
apply the patches to the canonical application or another student's current work.

Reference/ includes exact before/after files; Test_Entrypoints/ includes the three
exercise-only server test entrypoints. Evidence/ identifies the actor and actual
baseline/modified results. Source_Map.csv points to the canonical baseline anchors.

There is no .env, database, node_modules or fabricated Git/Jira evidence in this
pack. The 80 limit is not an approved production contract or a data migration.
Step 43 must retain any outstanding student, live-integration and faculty gates.
''',encoding='utf-8')
# Record package hashes without hashing the manifest into itself.
manifest=[]
for f in sorted(OUT.rglob('*')):
    if f.is_file() and f.name!='Manifest.json':manifest.append({'path':str(f.relative_to(OUT)).replace('\\','/'),'bytes':f.stat().st_size,'sha256':sha(f)})
(OUT/'Manifest.json').write_text(json.dumps({'date':'2026-11-21 Asia/Dhaka','files':manifest},indent=2)+'\n',encoding='utf-8')
archive=BASE/'MediMate_Step42_Viva_Pack.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.rglob('*')):
        if f.is_file():z.write(f,'MediMate_Step42_Viva_Pack/'+str(f.relative_to(OUT)).replace('\\','/'))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for item in manifest:assert hashlib.sha256(z.read('MediMate_Step42_Viva_Pack/'+item['path'])).hexdigest()==item['sha256']
archive.with_suffix('.sha256').write_text(sha(archive)+'  '+archive.name+'\n',encoding='utf-8')
(REVIEW/'README.txt').write_text('Step 42 reference rehearsal\nCanonical application unchanged.\n'+str(archive)+'\n'+str(ROOT/'docs/STEP_42_INDIVIDUAL_VIVA.md')+'\n3 baseline API cases and 190 modified backend tests passed; build and compiled input/UI checks passed.\nReference solutions are applied ONLY in Rehearsal_Source. See each member sheet and NOT_RUN human assessment record.\nNo student pass, individual contribution/commit, Jira action or live Telegram/provider delivery is claimed.\nNext numbered step: Step 43 readiness audit, retaining outstanding gates.\n',encoding='utf-8')
start=BASE/'START_HERE.md';text=start.read_text(encoding='utf-8')
entry='''
## Step 42 viva preparation — 21 November 2026
Branch: feature/step42-viva-rehearsal. Guide and three individual sheets: Source/docs/STEP_42_INDIVIDUAL_VIVA.md and Source/docs/viva. Reference rehearsal: Support/Step42_Review/Rehearsal_Source. Three isolated frontend/API/Mongoose field-limit exercises passed 3 baseline cases, 190 modified backend tests, Vite build and compiled-input/UI integration on Node 24.22.3. All canonical client/server hashes are unchanged. Pack: MediMate_Step42_Viva_Pack.zip and .sha256, including answer-key patches, source anchors, reference transcripts and a human assessment record with NOT_RUN entries. No student demonstration, individual commit/Jira action or faculty pass is claimed. Human viva/live edits and live/deployment/faculty gates remain open. Next numbered step: Step 43 final readiness audit.
'''
if '## Step 42 viva preparation' not in text:start.write_text(text+entry,encoding='utf-8')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'canonicalApplicationHashesUnchanged':len(baseline['files']),'referenceBackendTestsPassed':190,'humanChecks':'NOT_RUN','files':len(manifest)},indent=2))
