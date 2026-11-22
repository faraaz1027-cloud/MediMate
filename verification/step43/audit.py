"""Final audit of the real working source; no student assessment is inferred."""
from pathlib import Path
import argparse, csv, hashlib, json, re, shutil, subprocess, zipfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT.parent
REVIEW = BASE / 'Support/Step43_Review'
CANDIDATE = REVIEW / 'Candidate_Source'
OUT = BASE / 'Final_Readiness'
EVIDENCE = ROOT / 'docs/evidence/step43'

def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def dump(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, capture_output=True, check=True).stdout
def names():
    result = []
    for name in sorted(set(git('ls-files', '--cached', '--others', '--exclude-standard', '-z').decode().split('\0'))):
        if not name or not (ROOT/name).is_file(): continue
        parts = Path(name).parts
        if '__pycache__' in parts or name.endswith(('.pyc','.pyo')): continue
        assert not set(parts) & {'node_modules', '.git', '.local-data', '.runtime', 'output', 'dist'}, name
        assert not re.search(r'(^|/)\.env($|\.)', name) or name.endswith('.env.example'), name
        assert not (ROOT/name).is_symlink(), name
        result.append(name)
    return result
def runtime(name):
    return name.startswith(('client/', 'server/', 'scripts/', 'verification/step18/', '.github/')) or name in ['package.json', 'package-lock.json', 'verification/assignment03-init-replica.mjs', '.nvmrc']

def prepare():
    assert not CANDIDATE.exists(), 'Use a new reviewed candidate; never overwrite a rehearsal.'
    CANDIDATE.mkdir(parents=True)
    listed = names()
    for name in listed:
        target = CANDIDATE/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT/name, target)
    tested = BASE/'Support/Step41_Review/source-initial'
    matched = [name for name in listed if runtime(name)]
    for name in matched: assert (tested/name).is_file() and sha(ROOT/name) == sha(tested/name), name
    canonical = json.loads((BASE/'Support/Step42_Review/canonical-app-hashes.json').read_text())['files']
    for row in canonical: assert sha(ROOT/row['path']) == row['sha256'], row['path']
    for relative in ['node_modules', 'verification/step18/node_modules']:
        assert (tested/relative).is_dir(), relative
        shutil.copytree(tested/relative, CANDIDATE/relative, symlinks=False)
    dump(REVIEW/'candidate-manifest.json', {'at': datetime.now(timezone.utc).isoformat(), 'source':str(ROOT), 'candidate':str(CANDIDATE), 'base':git('rev-parse','HEAD').decode().strip(), 'files':[{'path':n,'sha256':sha(ROOT/n)} for n in listed], 'matchedFreshInstallRuntimeFiles':len(matched), 'matchedCanonicalApplicationFiles':len(canonical), 'dependencies':'Reused installed locked dependencies from actual Step41 fresh-install export; no new install claimed'})
    print(json.dumps({'candidate':str(CANDIDATE), 'files':len(listed), 'runtimeMatched':len(matched), 'canonicalMatched':len(canonical)}))

def requests(items):
    for item in items:
        if 'item' in item: yield from requests(item['item'])
        elif 'request' in item: yield item

def finish():
    OUT.mkdir(exist_ok=True); EVIDENCE.mkdir(parents=True,exist_ok=True)
    candidate = json.loads((REVIEW/'candidate-manifest.json').read_text())
    for row in candidate['files']:
        if runtime(row['path']): assert sha(ROOT/row['path']) == sha(CANDIDATE/row['path']) == row['sha256'], row['path']
    logs = CANDIDATE/'.local-data/verification'
    summary = json.loads((logs/'summary.json').read_text())
    assert summary['node'] == 'v24.22.3' and len(summary['results']) == 3 and all(r['exitCode']==0 for r in summary['results'])
    api = (logs/'api.txt').read_text(encoding='utf-8')
    assert re.search(r'\bpass 187\b',api) and re.search(r'\bfail 0\b',api) and re.search(r'\bskipped 0\b',api)
    for n in ['build.txt','api.txt','ui.txt','summary.json']: shutil.copy2(logs/n,EVIDENCE/n)
    for n in ['step37-scenario.json','step37-exchanges.json']:
        shutil.copy2(CANDIDATE/'docs/evidence'/n,EVIDENCE/n)
    scenario = json.loads((EVIDENCE/'step37-scenario.json').read_text())
    assert len(scenario['checks'])==14 and all(r['passed'] for r in scenario['checks']) and scenario['exchangeCount']==81
    assert {r['feature'] for r in scenario['checks']} >= set(['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','C5'])
    archives = []
    for stem in ['MediMate_Step40_Documentation','MediMate_Step41_Handover','MediMate_Step42_Viva_Pack']:
        f=BASE/(stem+'.zip'); checksum=BASE/(stem+'.sha256')
        assert sha(f)==checksum.read_text().split()[0],f
        with zipfile.ZipFile(f) as z: assert z.testzip() is None
        archives.append({'path':f.name,'bytes':f.stat().st_size,'sha256':sha(f),'checksumMatched':True,'zipCrcPassed':True})
    dump(OUT/'Archive_Audit.json',archives)
    index=list(csv.DictReader((BASE/'Final_Documentation/Evidence_Index.csv').open(encoding='utf-8-sig')))
    for row in index: assert sha(BASE/'Final_Documentation'/row['Package_path'])==row['SHA256'].lower(),row['Package_path']
    captures=list(csv.DictReader((BASE/'Inventory/Postman_Capture_Map.csv').open(encoding='utf-8-sig')))
    assert len(captures)==59
    members=[('Ihfaz_Rashid_Sadat',19,1499),('Faraaz_Jamil_Chowdhury',16,1205),('Sahir_Jawad_Chowdhury',24,1212)]
    assignment=[]
    for member,count,port in members:
        folder=BASE/'Members'/member
        report=folder/f'MediMate_Assignment03_{member}_Revised_Final.docx'
        collection=folder/f'MediMate_Assignment03_{member}.postman_collection.json'
        data=json.loads(collection.read_text(encoding='utf-8-sig'))
        assert data['info']['schema']=='https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        numbered=[x for x in requests(data['item']) if re.match(r'^[ABC][12]-\d\d(?:\b|\s)',x['name'])]
        rows=[r for r in captures if r['Member']==member]
        assert len(numbered)==len(rows)==count,(member,len(numbered),len(rows))
        variables={v['key']:str(v.get('value','')) for v in data.get('variable',[])}
        assert any(f':{port}' in v for v in variables.values()),(member,variables)
        with zipfile.ZipFile(report) as z:
            media={hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/')}
            document=z.read('word/document.xml').decode()
            text=''.join(re.findall(r'<w:t(?:\s[^>]*)?>(.*?)</w:t>',document))
            for row in rows:
                image=BASE/row['File']; digest=sha(image)
                assert digest==row['SHA256'].lower() and digest in media,row['File']
                assert row['Request'] in text and any(re.match(r'^'+re.escape(row['Request'])+r'\b',n['name']) for n in numbered),row['Request']
        assignment.append({'member':member,'report':str(report.relative_to(BASE)),'collection':str(collection.relative_to(BASE)),'port':port,'numberedRequests':count,'captureSlotsWithEmbeddedVerifiedImage':count,'reportSha256':sha(report),'collectionSha256':sha(collection),'newPostmanUiCapture':False})
    dump(OUT/'Assignment03_Audit.json',assignment)
    features=list(csv.DictReader((BASE/'Final_Documentation/Feature_Traceability.csv').open(encoding='utf-8-sig')))
    assert len(features)==13
    tests=dict(zip(['A1','A2','A3','A4','B1','B2','B3','B4','C1','C2','C3','C4','C5'],['prescriptions','schedules','inventory','pharmacies','cabinet','information-cards','ingredient-reviews','educational-answers','tasks','doses','followups','reports','sos']))
    for row in features:
        row['Step11_criteria']='Source/docs/STEP_11_ACCEPTANCE.md (table row '+row['ID']+'; shared conditions apply)'
        row['Focused_regression']='Source/server/test/'+tests[row['ID']]+'.test.js'
        assert (ROOT/'server/test'/(tests[row['ID']]+'.test.js')).is_file()
        for n in row['Code_components_and_modules'].split('; '): assert (ROOT/n).is_file(),n
        row['Technical_status']='PASS_CONTROLLED_SCENARIO_AND_REGRESSION'
        row['Recorded_acceptance']='Step43 candidate: 187 API tests; compiled UI/build; 14 connected checkpoints / 81 HTTP exchanges; prior feature-specific evidence'
        row['Human_status']='NOT_RUN'
        row['Remaining_gate']='Owner demo, failure/permission/restart evidence, genuine commit/Jira and viva/live edit'
        if row['ID']=='A4': row['Remaining_gate']+='; successful live Overpass listing'
        if row['ID'] in ['B1','B2']: row['Remaining_gate']+='; owner repeats real outgoing RxNorm/openFDA request (dated evidence exists)'
        if row['ID'] in ['C1','C2','C3','C5']: row['Remaining_gate']+='; actual consenting recipient Telegram receipt'
        if row['ID']=='C5': row['Remaining_gate']+='; faculty assessment decision; provider is simulation only'
    with (OUT/'Feature_Readiness.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=list(features[0]));writer.writeheader();writer.writerows(features)
    gates=[
      ('Four assessed features per member','TECHNICAL_SCOPE_PRESENT_HUMAN_OPEN','Team','A1-A4 / B1-B4 / C1-C4 plus extra C5; shared auth excluded'),
      ('Faculty additions / C5 assessment','PENDING_CONFIRMATION','Team/faculty','No faculty acceptance inferred from roadmap'),
      ('Sadat external API','OPEN','Sadat','Live Overpass success and owner demonstration needed; local OCR does not count'),
      ('Faraaz external API','DATED_TECHNICAL_EVIDENCE_HUMAN_OPEN','Faraaz','RxNorm/openFDA prior live proof; repeat owner demonstration'),
      ('Sahir external API','NOT_CONFIGURED','Sahir','Dedicated Telegram bot and consenting account, actual receipt; controlled fixtures insufficient'),
      ('All 13 local acceptance behaviors','PASS_CONTROLLED','Team','187 candidate API tests + build/UI; 14 checkpoints/81 exchanges; native human acceptance separate'),
      ('Six API assignment evidence','VERIFIED_PREPARED','All three','Three final collections/revised reports; 19/16/24 embedded captures; dated Newman results, not rerun live here'),
      ('Figma and interface design','PREPARED_HUMAN_ACCEPTANCE_OPEN','All three','Step14 six detailed screens and native navigation review; implementation has later additions'),
      ('Responsive / performance','PARTIAL','All three','Step39 native browser evidence; mobile LCP3.312s; other screens/accessibility/real-device checks open'),
      ('Final report','PREPARED_FORMAT_CONFIRMATION_OPEN','Team','19-page Step40 PDF/Markdown and original Assignment03 Word reports; Lab7 samples not final rubric'),
      ('Deployment or faculty exception','PENDING_CONFIRMATION','Team/faculty','No cloud MongoDB; no verified public workflow/worker arrangement or explicit local-demo approval'),
      ('Module1/2/3 final human demonstration','NOT_RUN','All three','Run final demo and record actual evidence per feature'),
      ('Individual viva and live frontend/backend/schema edit','NOT_RUN','Each member','Step42 assistant rehearsal is reference only; assessment CSV has 40 NOT_RUN rows'),
      ('Individual Git contributions / collaborator acceptance','UNVERIFIED','Each member','Do not assign assistant changes to a student without genuine review and contribution'),
      ('Jira board and feature evidence','UNVERIFIED','Each member','No board/ticket/evaluator evidence supplied'),
      ('Reviewed published ref and current hosted CI','OPEN','Team','Remote main behind; PR14 draft historical CI passed; local Steps32-43 unpublished'),
      ('Another member clean clone','NOT_RUN','Another member','Run exact reviewed published SHA on another device'),
      ('Source and documentation backup','LOCAL_VERIFIED_COPY_PENDING','Team','Current source + dated archives hash/CRC checked; off-device copy/restore not performed'),
      ('Deadline, portal and required final format','UNKNOWN','Team/faculty','Do not infer a deadline or portal from sample report dates'),
      ('Faculty submission / receipt','NOT_SUBMITTED','Team','Only after blocking gates and exact deadline/channel are confirmed')]
    with (OUT/'Course_Gates.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f);w.writerow(['Requirement','Status','Owner','Evidence_or_next_action']);w.writerows(gates)
    assessment=list(csv.DictReader((BASE/'Support/Step42_Review/Viva_Pack/Assessment_Record.csv').open(encoding='utf-8-sig')))
    human_pending=sum(r['Human_status']=='NOT_RUN' for r in assessment)
    git_files={'Git_Status.txt':['status','--short'],'Git_History.txt':['log','--all','-50','--format=%h %ad %an %s','--date=iso-strict'],'Git_Refs.txt':['show-ref'],'Working_Source.patch':['diff','--binary','HEAD']}
    for filename,args in git_files.items(): (OUT/filename).write_bytes(git(*args))
    guide=(ROOT/'docs/STEP_43_FINAL_READINESS.md').read_text(encoding='utf-8')
    guide=re.sub(r'\((([A-Z][A-Z_0-9]+)\.md)\)',r'(Source/docs/\1)',guide)
    (OUT/'Final_Readiness.md').write_text(guide,encoding='utf-8')
    shutil.copy2(ROOT/'docs/STEP_43_SUBMISSION_CHECKLIST.md',OUT/'Submission_Checklist.md')
    shutil.copy2(BASE/'START_HERE.md',OUT/'Delivery_Start_Here.md')
    shutil.copy2(EVIDENCE/'github-review.json',OUT/'GitHub_Review.json')
    validation={'at':datetime.now(timezone.utc).isoformat(),'localDate':'2026-11-21 Asia/Dhaka','branch':git('branch','--show-current').decode().strip(),'baseCommit':git('rev-parse','HEAD').decode().strip(),'finalSubmissionReady':False,'submitted':False,'canonicalRuntimeFilesMatchedStep41':candidate['matchedFreshInstallRuntimeFiles'],'canonicalApplicationFilesMatchedStep42':candidate['matchedCanonicalApplicationFiles'],'candidateDependenciesReusedFromStep41':True,'newFreshInstall':False,'backendPassed':187,'backendFailed':0,'backendSkipped':0,'buildPassed':True,'compiledUiPassed':True,'connectedCheckpoints':14,'httpExchanges':81,'controlledProvidersOnly':True,'freshConnectedScenarioRunAt':scenario['runAt'],'featureRows':len(features),'captureCounts':{m:c for m,c,_ in members},'capturesEmbeddedAndHashVerified':59,'datedDocumentationIndexedFilesMatched':len(index),'datedArchivesChecksumAndCrcPassed':3,'humanAssessmentNotRunRows':human_pending,'humanFinalDemo':'NOT_RUN','deadline':'UNKNOWN','submissionPortal':'UNKNOWN','deploymentOrFacultyException':'PENDING_CONFIRMATION','newHostedCiRun':False,'newPostmanUiScreenshots':False,'offDeviceRestore':'NOT_RUN','noApplicationChangesInStep43':True}
    dump(EVIDENCE/'validation.json',validation);dump(OUT/'Validation.json',validation)
    dump(EVIDENCE/'candidate-manifest.json',candidate)
    # Re-export the final docs/audit, but never mutable dependency/build/DB directories.
    source_names=names()
    for name in source_names:
        target=OUT/'Source'/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/name,target)
    files=[]
    for p in sorted(OUT.rglob('*')):
        if p.is_file() and p.name!='Manifest.json': files.append({'path':p.relative_to(OUT).as_posix(),'bytes':p.stat().st_size,'sha256':sha(p)})
    for entry in archives:
        for name in [entry['path'],Path(entry['path']).with_suffix('.sha256').name]:
            p=BASE/name;files.append({'path':'Checkpoints/'+name,'bytes':p.stat().st_size,'sha256':sha(p)})
    dump(OUT/'Manifest.json',{'type':'uncommitted working-source backup and dated evidence; NOT final course approval','at':validation['at'],'files':files})
    archive=BASE/'MediMate_Step43_Readiness_Backup.zip'
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for entry in files:
            name=entry['path'];p=BASE/Path(name).name if name.startswith('Checkpoints/') else OUT/name
            assert sha(p)==entry['sha256'];z.write(p,'MediMate_Step43_Readiness/'+name)
        z.write(OUT/'Manifest.json','MediMate_Step43_Readiness/Manifest.json')
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for row in files: assert hashlib.sha256(z.read('MediMate_Step43_Readiness/'+row['path'])).hexdigest()==row['sha256'],row['path']
        assert not any(set(Path(n).parts)&{'node_modules','.git','.local-data','dist'} or re.search(r'(^|/)\.env($|\.)',n) and not n.endswith('.env.example') for n in z.namelist())
    archive.with_suffix('.sha256').write_text(sha(archive)+'  '+archive.name+'\n',encoding='utf-8')
    print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive),'indexedFilesVerified':len(files),'sourceFiles':len(source_names),'finalSubmissionReady':False,'backendPassed':187,'humanAssessmentNotRunRows':human_pending},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['prepare','finish']);args=parser.parse_args()
    prepare() if args.mode=='prepare' else finish()
