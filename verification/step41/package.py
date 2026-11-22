"""Package and check the already-tested working-source handover without commits."""
from pathlib import Path
import difflib, hashlib, json, subprocess, zipfile
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent;REVIEW=BASE/'Support/Step41_Review'
EVIDENCE=ROOT/'docs/evidence/step41';TESTED=REVIEW/'source-initial'
manifest=json.loads((REVIEW/'manifest-release.json').read_text(encoding='utf-8'))
release=Path(manifest['destination'])
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
# Code and build/lock configuration must match the files actually tested.
checked=[]
for entry in manifest['files']:
    name=entry['path']
    if name.startswith(('client/','server/','scripts/','verification/step18/','.github/')) or name in ['package.json','package-lock.json','verification/assignment03-init-replica.mjs']:
        assert (TESTED/name).is_file() and sha(TESTED/name)==entry['sha256'],name
        checked.append(name)
summary=json.loads((EVIDENCE/'summary.json').read_text())
assert summary['node']=='v24.22.3' and all(stage['exitCode']==0 for stage in summary['results'])
restart=json.loads((EVIDENCE/'persistent-restart.json').read_text())
assert restart['sameIdentifiersAfterSeedReplayAndRestart'] and restart['mongoAndApiRestarted']
assert 'pass 187' in (EVIDENCE/'api.txt').read_text(encoding='utf-8')

# The four tracked files were clean before Step 41, so Git gives their focused diff.
tracked=['README.md','package.json','server/.env.example','.github/workflows/verify.yml']
patch=subprocess.run(['git','diff','--no-ext-diff','--',*tracked],cwd=ROOT,capture_output=True,check=True).stdout.decode('utf-8')
def diff(name,old,new):
    prefix='diff --git a/'+name+' b/'+name+'\n'
    if old=='':prefix+='new file mode 100644\n'
    return prefix+''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name if old else '/dev/null',tofile='b/'+name))
api=(ROOT/'verification/step18/api.mjs').read_text(encoding='utf-8')
old_names=['api','prescriptions','cabinet','rxnorm','tasks','telegram','module1','schedules','openfda','information-cards','doses','dose-worker-cli','timezone-restarts','deployment','module2','inventory','pharmacies','ingredient-reviews','educational-answers','followups','reports','sos','hospitals','end-to-end','failure-audit']
replacement='''  const files = selected.length ? selected : (await readdir(new URL("../../server/test/", import.meta.url)))
    .filter(name => name.endsWith(".test.js")).sort().map(name => "server/test/" + name);
  const child = spawn(process.execPath, ["--test", "--test-concurrency=2", ...files], {'''
oldline='  const child = spawn(process.execPath, ["--test", "--test-concurrency=2", ...(selected.length ? selected : ['+', '.join('"server/test/'+name+'.test.js"' for name in old_names)+'])], {'
assert replacement in api
before=api.replace('import { readdir } from "node:fs/promises";\n','').replace(replacement,oldline)
patch+=diff('verification/step18/api.mjs',before,api)
name='verification/assignment03-init-replica.mjs';init=(ROOT/name).read_text(encoding='utf-8')
before=init.replace("const port=Number(process.env.MEDIMATE_MONGO_PORT||27028);\nif(!Number.isInteger(port)||port<1024||port>65535)throw Error('MEDIMATE_MONGO_PORT must be an integer from 1024 to 65535.');\nconst client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`);",'const client = new MongoClient("mongodb://127.0.0.1:27028/?directConnection=true");').replace('host: `127.0.0.1:${port}`','host: "127.0.0.1:27028"').replace('console.log(`Assignment 03 MongoDB replica set is ready on port ${port}.`);','console.log("Assignment 03 MongoDB replica set is ready on port 27028.");')
assert before!=init;patch+=diff(name,before,init)
new=['.nvmrc','scripts/verify.mjs','scripts/local.ps1','scripts/seed-demo.mjs','server/test/handover.test.js','docs/STEP_41_REPRODUCIBLE_HANDOVER.md','verification/step41/prepare.mjs','verification/step41/package.py']
for name in new:patch+=diff(name,'',(ROOT/name).read_text(encoding='utf-8'))
patchfile=REVIEW/'Step41_Handover_Changes.patch';patchfile.write_text(patch,encoding='utf-8',newline='\n')
subprocess.run(['git','apply','--reverse','--check',str(patchfile)],cwd=ROOT,check=True,capture_output=True)
validation={'at':'2026-11-21 Asia/Dhaka','branch':'feature/step41-reproducible-handover','freshDependencyInstall':True,'runtime':summary['node'],'platform':summary['platform'],'backendPassed':187,'backendFailed':0,'backendSkipped':0,'buildPassed':True,'compiledUiPassed':True,'persistentHelperSeedAndMongoApiRestartPassed':True,'runtimeSourceHashesMatchedTestedExport':len(checked),'workflowYamlStructurallyParsed':True,'localPowerShellSyntaxChecked':True,'focusedPatchReverseCheckPassed':True,'newHostedWorkflowRun':False,'humanCloneOnAnotherDevice':False,'publicationPending':True,'snapshotIsUncommittedWorkingSource':True}
(EVIDENCE/'validation.json').write_text(json.dumps(validation,indent=2)+'\n',encoding='utf-8')
shutil_copy=lambda source,target:target.write_bytes(source.read_bytes())
shutil_copy(REVIEW/'manifest-release.json',EVIDENCE/'source-manifest.json')
archive=BASE/'MediMate_Step41_Handover.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for item in manifest['files']:
        f=release/item['path'];assert sha(f)==item['sha256']
        z.write(f,'MediMate_Step41_Handover/Source/'+item['path'])
    for f in EVIDENCE.iterdir():
        if f.is_file():z.write(f,'MediMate_Step41_Handover/Source/docs/evidence/step41/'+f.name)
    z.write(patchfile,'MediMate_Step41_Handover/Step41_Handover_Changes.patch')
    z.writestr('MediMate_Step41_Handover/START_HERE.txt','Open Source/README.md and Source/docs/STEP_41_REPRODUCIBLE_HANDOVER.md.\nThis is an uncommitted working-source export, not a published Git clone.\nInstall Node 24, npm ci --include=dev, npm ci --prefix verification/step18, npm run verify.\nPersistent helper and synthetic seed are in Source/scripts.\nSource/docs/evidence/step41 contains actual fresh-install, test and restart evidence.\nThe patch is ALREADY applied in Source. No .env, database, node_modules or .git is included.\nNo deployed service, live Telegram/provider transport or individual student demonstration is claimed.\n')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for item in manifest['files']:
        assert hashlib.sha256(z.read('MediMate_Step41_Handover/Source/'+item['path'])).hexdigest()==item['sha256']
    assert not any('/node_modules/' in name or '/.git/' in name or '/.local-data/' in name or name.endswith('/.env') for name in z.namelist())
archive.with_suffix('.sha256').write_text(sha(archive)+'  '+archive.name+'\n',encoding='utf-8')
(REVIEW/'README.txt').write_text('Step 41 review handoff\nBranch: feature/step41-reproducible-handover\n'+str(archive)+'\n'+str(ROOT/'docs/STEP_41_REPRODUCIBLE_HANDOVER.md')+'\nFresh Node 24.22.3 install/build, 187 backend tests and compiled UI passed. Portable helper seed survived actual MongoDB/API restart on isolated ports.\nThe patch is already applied. It contains only Step 41 files/edits; API runner and replica initializer before-copies are reconstructed by reversing these explicit edits of earlier local source. All previous uncommitted changes are preserved.\nRemote main is behind the draft feature stack. No new commit, PR, merge, hosted run or deployment was performed. Another member must still clone a reviewed published ref and demonstrate their own work.\nNext numbered step: Step 42.\n',encoding='utf-8')
start=BASE/'START_HERE.md';text=start.read_text(encoding='utf-8')
entry='''
## Step 41 reproducible handover — 21 November 2026
Branch: feature/step41-reproducible-handover. Guide: Source/docs/STEP_41_REPRODUCIBLE_HANDOVER.md. Source-contained startup/seed, current README/env guidance, automatic test discovery, one verification command and Windows/Linux CI with retained logs are prepared. Fresh locked install on official Node 24.22.3 passed build, 187 backend tests and compiled UI integration. Actual helper/CLI seed retained IDs and exact counts after both MongoDB and API restarted on isolated ports. Evidence: Source/docs/evidence/step41. Portable source candidate: MediMate_Step41_Handover.zip and .sha256; focused already-applied patch: Support/Step41_Review/Step41_Handover_Changes.patch. No secrets, DB, dependencies or Git metadata in the archive. Remote main remains at an earlier roadmap commit; PR14 is a draft whose historical CI passed. Local changes still need owner review/commit/integration, hosted matrix execution and another member's actual clone. No new commit/PR or deployment claimed. Next numbered step: Step 42 individual viva and live modifications.
'''
if '## Step 41 reproducible handover' not in text:start.write_text(text+entry,encoding='utf-8')
print(json.dumps({'sourceFiles':len(manifest['files']),'matchedTestedCodeFiles':len(checked),'archive':str(archive),'bytes':archive.stat().st_size,'sha256':sha(archive)},indent=2))
