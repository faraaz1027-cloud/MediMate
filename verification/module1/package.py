"""Build a hash-verified Module 1 review pack, without inventing student evidence."""
from pathlib import Path
import csv,difflib,hashlib,json,re,shutil,subprocess,zipfile,sys
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent
VERIFIED='--telegram-verified' in sys.argv[1:]
OUT=BASE/('Module1_Telegram_Verified' if VERIFIED else 'Module1_Submission');EVIDENCE=ROOT/'docs/evidence/module1-readiness'
BEFORE=BASE/'Support/Step43_Review/Candidate_Source'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p,data):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
def copy(p,target):target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
def git(*args):return subprocess.run(['git',*args],cwd=ROOT,check=True,capture_output=True).stdout
def write_csv(p,rows,columns=None):
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=columns or list(rows[0]));w.writeheader();w.writerows(rows)
def requests(items):
    for item in items:
        if 'item' in item:yield from requests(item['item'])
        elif 'request' in item:yield item

OUT.mkdir(exist_ok=True)
summary=json.loads((EVIDENCE/'summary.json').read_text())
assert len(summary['results'])==4 and all(x['exitCode']==0 for x in summary['results'])
assert re.search(r'\bpass 62\b',(EVIDENCE/'api.txt').read_text(encoding='utf-8'))
assert re.search(r'\bfail 0\b',(EVIDENCE/'api.txt').read_text(encoding='utf-8'))
newman=json.loads((EVIDENCE/'startup-newman.json').read_text())
assert newman['passed'] and newman['servicesStopped'] and all(not x['failures'] for x in newman['collections'])
assert sum(x['requests'] for x in newman['collections'])==84
assert sum(x['assertions'] for x in newman['collections'])==127
live=json.loads((EVIDENCE/'live-rxnorm.json').read_text())
assert len(live['checks'])==9 and live['externalRequests'] and all(x['status']==200 for x in live['externalRequests'])
baseline=json.loads((BASE/'Support/Step42_Review/canonical-app-hashes.json').read_text())
for row in baseline['files']:assert sha(ROOT/row['path'])==row['sha256'],row['path']
all_captures=list(csv.DictReader((BASE/'Inventory/Postman_Capture_Map.csv').open(encoding='utf-8-sig')))
members=[('Ihfaz_Rashid_Sadat','Sadat','23301499','A1',1499,10,'PrescriptionReview','prescriptions'),('Faraaz_Jamil_Chowdhury','Faraaz','24241205','B1',1205,11,'MedicineCabinet','cabinet'),('Sahir_Jawad_Chowdhury','Sahir','23301212','C1',1212,14,'TaskBoard','tasks')]
orders=[];captures=[];assessment=[];tickets=[];member_audit=[]
for slug,short,student,feature,port,count,component,api in members:
    member_dir=OUT/'Members'/slug
    current=ROOT/f'postman/module1/MediMate_Module1_{short}.postman_collection.json'
    data=json.loads(current.read_text());flat=list(requests(data['item']))
    assert data['info']['schema'].endswith('/v2.1.0/collection.json')
    original=BASE/f'Members/{slug}/MediMate_Assignment03_{slug}.postman_collection.json'
    full=json.loads(original.read_text());group=[g for g in full['item'] if g['name'].startswith(feature+' ')]
    assert data['item']==group and len(group)==1,'Do not drop setup/intermediate requests'
    assert any(f':{port}/api/v1' in v.get('value','') for v in data['variable'])
    copy(current,member_dir/current.name)
    copy(original,member_dir/'Assignment03_Reference'/original.name)
    report=BASE/f'Members/{slug}/MediMate_Assignment03_{slug}_Revised_Final.docx'
    copy(report,member_dir/'Assignment03_Reference'/report.name)
    copy(ROOT/f'docs/module1/{short.upper()}.md',member_dir/'WALKTHROUGH.md')
    with zipfile.ZipFile(report) as z:
        embedded={hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/')}
    member_captures=[c for c in all_captures if c['Member']==slug and c['Request'].startswith(feature+'-')]
    assert len(member_captures)==count
    for c in member_captures:
        source=BASE/c['File'];assert sha(source)==c['SHA256'].lower() and sha(source) in embedded,c['File']
        target=member_dir/'Postman_Captures'/source.name;copy(source,target)
        captures.append({'Member':short,'Capture_code':c['Request'],'Package_path':target.relative_to(OUT).as_posix(),'SHA256':sha(source),'Provenance':'Existing original Postman UI image; not newly captured by this run'})
    for index,item in enumerate(flat,1):
        code=re.match(r'^('+feature+r'-\d\d)\b',item['name'])
        orders.append({'Member':short,'Feature':feature,'Run_order':index,'Request_name':item['name'],'Method':item['request']['method'],'Capture_code':code[1] if code else '', 'Capture_instruction':'Capture method/body/status/JSON/tests; redact secrets' if code else 'Run setup/intermediate request; do not skip'})
    assert len([r for r in orders if r['Member']==short and r['Capture_code']])==count
    for check,task in [('FEATURE','Personally demonstrate '+feature+' success, history and failures'),('TRACE','Explain React to Express to MongoDB records'),('QUESTIONS','Answer the member walkthrough questions'),('FRONTEND','Make and explain own frontend edit'),('API','Make and explain matching backend validation edit'),('REGRESSION','Run affected requests/tests and interpret results'),('PERMISSION','Show unauthorized/revoked access rejection'),('OWNERSHIP','Review real individual contribution and commit/PR'),('TRACKING','Attach actual Jira ticket and feature evidence')]:
        assessment.append({'Member':short,'Student_ID':student,'Feature':feature,'Check':check,'Task':task,'Human_status':'NOT_RUN','Actual_observation':'','Evidence_link':'','Commit_or_PR':'','Jira_link':'','Evaluator':'','Performed_at':''})
    tickets.append({'Summary':f'{feature} Module 1 owner demonstration and evidence — {short}','Issue Type':'Task','Description':f'Owner: {slug.replace("_"," ")} ({student}). Local implementation/test evidence is prepared, not a student pass. Review client/src/{component}.jsx, server/v1/{api}.js and matching models. Checklist: UI/empty/error/mobile; API validation and access; database persistence/history; feature integration and truthful provider failures; tests and original screenshots; individual frontend/backend live edits; genuine commit/PR and evaluator evidence. '+('Complete real Telegram linking, consent and receipt when a team-owned bot is available.' if feature=='C1' else 'Demonstrate actual RxNorm search and source/retrieval metadata.' if feature=='B1' else 'Demonstrate local OCR review, current-draft-only deletion, immutable confirmation and same-patient B1 link. Local OCR is not external API credit.'),'Labels':'medimate,module1,'+feature.lower()})
    result=next(x for x in newman['collections'] if x['id']==feature)
    member_audit.append({'member':short,'feature':feature,'port':port,'postmanRequests':result['requests'],'assertions':result['assertions'],'failures':0,'captureImagesMatchedOriginalAndWord':count,'module1CollectionSha256':sha(current),'originalFullCollectionUnchanged':True,'originalReportSha256':sha(report),'studentDemonstration':'NOT_RUN'})
assert len(captures)==35 and len(orders)==84 and len(assessment)==27
write_csv(OUT/'Postman_Run_Order.csv',orders);write_csv(OUT/'Capture_Map.csv',captures)
write_csv(OUT/'Jira_Task_Drafts.csv',tickets)
if not (OUT/'Human_Assessment.csv').exists():
    existing=BASE/'Module1_Submission/Human_Assessment.csv'
    if VERIFIED and existing.exists():copy(existing,OUT/'Human_Assessment.csv')
    else:write_csv(OUT/'Human_Assessment.csv',assessment)
dump(OUT/'Member_Verification.json',member_audit)

guide=(ROOT/'docs/MODULE_1_SUBMISSION_GUIDE.md').read_text(encoding='utf-8').replace('(STEP_23_CAREGIVER_TASKS.md)','(Reference_Docs/STEP_23_CAREGIVER_TASKS.md)')
(OUT/'START_HERE.md').write_text(guide,encoding='utf-8')
copy(ROOT/'docs/MODULE_1_PREPARATION_PROGRESS.md',OUT/'Preparation_Progress.md')
if VERIFIED:
    copy(ROOT/'docs/MODULE_1_TELEGRAM_DELIVERY.md',OUT/'MODULE_1_TELEGRAM_DELIVERY.md')
    for p in (ROOT/'docs/evidence/module1-telegram').rglob('*'):
        if p.is_file():copy(p,OUT/'Technical_Evidence/Telegram'/p.relative_to(ROOT/'docs/evidence/module1-telegram'))
for name in ['MODULE_1_SUBMISSION_GUIDE.md','STEP_11_ACCEPTANCE.md','STEP_14_DESIGN_SUBMISSION.md','STEP_21_PRESCRIPTION_REVIEW.md','STEP_22_MEDICINE_CABINET.md','STEP_23_CAREGIVER_TASKS.md','STEP_24_MODULE_1_INTEGRATION.md','CODEX_LAB_INSTRUCTIONS.md']:
    copy(ROOT/'docs'/name,OUT/'Reference_Docs'/name)
for name in ['package.json','package-lock.json']:copy(BASE/'assignment03-tools'/name,OUT/'assignment03-tools'/name)
for p in EVIDENCE.rglob('*'):
    if p.is_file() and p.name!='package-validation.json':copy(p,OUT/'Technical_Evidence'/p.relative_to(EVIDENCE))

# Focused patch against the actual pre-preparation working-source checkpoint.
# Earlier uncommitted implementation is backed up separately, not reattributed.
changed=['scripts/local.ps1','package.json','README.md']
new=['scripts/local-telegram.mjs','server/telegram.env.example','server/test/local-telegram.test.js','docs/MODULE_1_SUBMISSION_GUIDE.md','docs/MODULE_1_PREPARATION_PROGRESS.md','docs/MODULE_1_TELEGRAM_PROGRESS.md','docs/MODULE_1_TELEGRAM_DELIVERY.md']
new += [p.relative_to(ROOT).as_posix() for prefix in ['verification/module1','docs/module1','postman/module1'] for p in (ROOT/prefix).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc']
patch=''
for name in changed+new:
    old=(BEFORE/name).read_text(encoding='utf-8') if name in changed else ''
    text=(ROOT/name).read_text(encoding='utf-8')
    patch+='diff --git a/'+name+' b/'+name+'\n'
    if not old:patch+='new file mode 100644\n'
    patch+=''.join(difflib.unified_diff(old.splitlines(True),text.splitlines(True),fromfile='a/'+name if old else '/dev/null',tofile='b/'+name))
patchfile=OUT/'Module1_Preparation_Already_Applied.patch';patchfile.write_text(patch,encoding='utf-8',newline='\n')
subprocess.run(['git','apply','--reverse','--check',str(patchfile)],cwd=ROOT,check=True,capture_output=True)
for filename,args in [('Git_Status.txt',['status','--short']),('Git_History.txt',['log','-40','--format=%h %ad %an %s','--date=iso-strict']),('Working_Source.patch',['diff','--binary','HEAD'])]:
    (OUT/filename).write_bytes(git(*args))
validation={'at':datetime.now(timezone.utc).isoformat(),'date':'2026-11-21 Asia/Dhaka','branch':git('branch','--show-current').decode().strip(),'baseCommit':git('rev-parse','HEAD').decode().strip(),'module1TechnicalPreparation':'PASS','module1FacultySubmissionReady':False,'submitted':False,'backendTestsPassed':62,'backendFailed':0,'backendSkipped':0,'productionBuildPassed':True,'compiledUiPassed':True,'liveRxNormCheckpoints':9,'newmanRequests':84,'newmanAssertions':127,'newmanFailures':0,'existingCaptureImagesVerified':35,'captureCounts':{'Sadat':10,'Faraaz':11,'Sahir':14},'humanAssessmentEntries':27,'humanDemonstrations':'NOT_RUN','telegramActualReceipt':'NOT_RUN_USER_DEFERRED_NO_ACCOUNT','jiraTickets':'DRAFTS_ONLY','newCommitPrMerge':False,'canonicalExistingApplicationHashesUnchanged':len(baseline['files']),'focusedPatchReverseCheck':True,'offDeviceRestore':'NOT_RUN','deadlinePortalRubric':'UNKNOWN','browserReview':json.loads((EVIDENCE/'browser-review.json').read_text()) if (EVIDENCE/'browser-review.json').exists() else {'status':'PARTIAL_INTERRUPTED','coverage':'A1 draft/history/confirmation boundary; B1 page viewed; C1 native review not completed. Compiled UI integration passed.'}}
cleanup=json.loads((EVIDENCE/'browser-cleanup.json').read_text())
assert cleanup['databaseDropped'] and cleanup['replicaStopped']
validation['syntheticBrowserDatabaseDropped']=True;validation['syntheticBrowserReplicaStopped']=True
if VERIFIED:
    telegram=ROOT/'docs/evidence/module1-telegram'
    preflight=json.loads((telegram/'preflight.json').read_text())
    native=json.loads((telegram/'receipt-native.json').read_text())
    delivery=json.loads((telegram/'delivery-api.json').read_text())
    assert preflight['tokenValidatedByGetMe'] and not preflight['webhookConfigured']
    assert native['actualReceiptVerified'] and 'Received at 11:50 PM' in native['nativeReceipt']
    assert delivery['activeLinks']==1 and delivery['task']['acknowledgedAt']
    assert delivery['task']['acknowledgedByUserId']==delivery['task']['assigneeUserId']
    assert delivery['task']['status']=='open'
    notice=delivery['notifications'];assert len(notice)==1 and notice[0]['status']=='sent' and notice[0]['attemptCount']==1
    assert notice[0]['attempts'][0]['status']=='accepted_by_channel'
    assert len(notice[0]['attempts'])==1 and notice[0]['attempts'][0]['errorCode'] is None
    validation['telegramActualReceipt']='VERIFIED_NATIVE_CLIENT_AND_API'
    validation['telegramBot']='Medi911_bot'
    validation['telegramTaskId']=delivery['taskId']
    validation['telegramDeliveryAttemptCount']=1
    validation['separateAppAcknowledgementVerified']=True
    validation['telegramTestActor']='User-authorized signed-in PC account linked to synthetic caregiver; not Sahir individual assessment'
dump(OUT/'Validation.json',validation);dump(EVIDENCE/'package-validation.json',validation)
copy(EVIDENCE/'package-validation.json',OUT/'Technical_Evidence/package-validation.json')

source_files=[]
for name in sorted(set(git('ls-files','--cached','--others','--exclude-standard','-z').decode().split('\0'))):
    if not name or not (ROOT/name).is_file():continue
    parts=Path(name).parts
    if '__pycache__' in parts or name.endswith(('.pyc','.pyo')):continue
    assert not set(parts)&{'node_modules','.git','.local-data','.runtime','output','dist'},name
    assert not re.search(r'(^|/)\.env($|\.)',name) or name.endswith('.env.example'),name
    assert not (ROOT/name).is_symlink(),name
    copy(ROOT/name,OUT/'Source'/name);source_files.append(name)
files=[{'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(OUT.rglob('*')) if p.is_file() and p!=OUT/'Manifest.json']
dump(OUT/'Manifest.json',{'at':validation['at'],'type':'Uncommitted Module 1 review-source snapshot; human/faculty/live Telegram acceptance open','sourceFiles':len(source_files),'files':files})
archive=BASE/('MediMate_Module1_Telegram_Verified.zip' if VERIFIED else 'MediMate_Module1_Review_Pack.zip')
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for row in files:z.write(OUT/row['path'],'MediMate_Module1_Review/'+row['path'])
    z.write(OUT/'Manifest.json','MediMate_Module1_Review/Manifest.json')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for row in files:assert hashlib.sha256(z.read('MediMate_Module1_Review/'+row['path'])).hexdigest()==row['sha256'],row['path']
    assert not any(set(Path(n).parts)&{'node_modules','.git','.local-data','dist'} or re.search(r'(^|/)\.env($|\.)',n) and not n.endswith('.env.example') for n in z.namelist())
archive.with_suffix('.sha256').write_text(sha(archive)+'  '+archive.name+'\n',encoding='utf-8')
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'indexedFilesVerified':len(files),'sourceFiles':len(source_files),'captures':35,'newmanRequests':84,'assertions':127,'module1FacultySubmissionReady':False},indent=2))
