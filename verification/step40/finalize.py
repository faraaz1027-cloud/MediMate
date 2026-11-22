"""Check the reviewed documentation, then create and validate its portable ZIP."""
from pathlib import Path
import csv, hashlib, json, re, zipfile
import pdfplumber
from pypdf import PdfReader
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT.parent;OUT=BASE/'Final_Documentation'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
index=list(csv.DictReader((OUT/'Evidence_Index.csv').open(encoding='utf-8-sig')))
for entry in index:
    f=OUT/entry['Package_path']
    assert f.is_file() and digest(f)==entry['SHA256'],entry['Package_path']
markdown=(OUT/'MediMate_Project_Report.md').read_text(encoding='utf-8')
for link in re.findall(r'!\[[^\]]*\]\(([^)]+)\)',markdown):assert (OUT/link).is_file(),link
reader=PdfReader(OUT/'MediMate_Project_Report.pdf');assert len(reader.pages)==19
with pdfplumber.open(OUT/'MediMate_Project_Report.pdf') as pdf:
    for i,page in enumerate(pdf.pages,1):
        words=page.extract_words()
        assert len(words)>20,i
        assert not [w for w in words if w['x0']<49 or w['x1']>546 or (791<w['top']<805)],i
        assert '\u25a0' not in page.extract_text(),i
# Verify this documentation step did not modify the final measured frontend.
baseline=json.loads((ROOT/'docs/evidence/step39/manifest.json').read_text())
same_sources=[]
for src in baseline['sources']:
    assert digest(ROOT/src['name'])==src['sha256'],src['name']
    same_sources.append(src['name'])
captures=json.loads((OUT/'Assignment03_Verification.json').read_text())
assert [x['captures'] for x in captures]==[19,16,24]
assert len(list((OUT/'Members').rglob('*.postman_collection.json')))==3
samples=json.loads((OUT/'Sample_Provenance.json').read_text())
assert sorted(x['pages'] for x in samples)==[41,51]
for f in OUT.rglob('*'):
    if f.is_file():
        assert f.name!='.env' and 'node_modules' not in f.parts and '.git' not in f.parts
        assert not f.name.endswith('.devtoolslog.json')
summary={'reviewDate':'2026-11-21 Asia/Dhaka','reportPages':19,'allPagesRenderedAndVisuallyReviewed':True,'visualReview':'All 19 pages inspected; final figure excerpts enlarged for readability and re-inspected.','samplePageCounts':[41,51],'sampleCoreChaptersMatched':12,'captureCounts':{'Sadat':19,'Faraaz':16,'Sahir':24},'captureHashesAndEmbeddedMediaVerified':59,'numberedPostmanRequestsVerified':59,'indexedFilesVerified':len(index),'unchangedStep39SourceHashes':same_sources,'pdfTextAndBoundsChecks':'passed','applicationTestsRerun':False,'reason':'Documentation only; historical tests are labelled as prior evidence.'}
(OUT/'Verification.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
# Add verification metadata to the index without including a self-referential hash.
index=[x for x in index if x['Package_path']!='Verification.json']
index.append({'Package_path':'Verification.json','Classification':'Step40 documentation verification','Bytes':(OUT/'Verification.json').stat().st_size,'SHA256':digest(OUT/'Verification.json')})
with (OUT/'Evidence_Index.csv').open('w',newline='',encoding='utf-8-sig') as f:
    w=csv.DictWriter(f,fieldnames=['Package_path','Classification','Bytes','SHA256']);w.writeheader();w.writerows(index)
archive=BASE/'MediMate_Step40_Documentation.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for f in sorted(OUT.rglob('*')):
        if f.is_file():z.write(f,Path('MediMate_Step40_Documentation')/f.relative_to(OUT))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    for f in OUT.rglob('*'):
        if f.is_file():assert hashlib.sha256(z.read(str(Path('MediMate_Step40_Documentation')/f.relative_to(OUT)).replace('\\','/'))).hexdigest()==digest(f)
checksum=archive.with_suffix('.sha256');checksum.write_text(digest(archive)+'  '+archive.name+'\n',encoding='utf-8')
handoff=BASE/'START_HERE.md';text=handoff.read_text(encoding='utf-8')
entry='''
## Step 40 final documentation package — 21 November 2026
Branch: feature/step40-final-documentation. Report: Final_Documentation/MediMate_Project_Report.pdf (19 pages) plus editable Markdown. Both supplied Lab 7 sample PDFs share the same 12 core chapters; the report follows that structure with factual MediMate evidence and limitations. Package: MediMate_Step40_Documentation.zip and .sha256. Includes original three member reports, three final collections and 59 verified captures (19/16/24), source/sample crosswalks, feature traceability and indexed test/browser evidence. All report pages rendered and visually inspected; package hashes/ZIP validated. No app code changed or application tests rerun, no new commit/PR and no faculty submission/deployment/live delivery claimed. Guide: Source/docs/STEP_40_FINAL_DOCUMENTATION.md. Next numbered step: Step 41 CI/CD and reproducible handover; then Steps 42–43 and outstanding human/external gates.
'''
if '## Step 40 final documentation package' not in text:handoff.write_text(text+entry,encoding='utf-8')
review=BASE/'Support/Step40_Review';review.mkdir(exist_ok=True)
(review/'README.txt').write_text('Step 40 documentation review\n'+str(OUT/'MediMate_Project_Report.pdf')+'\n'+str(archive)+'\nBuilder/verifier: Source/verification/step40/build.py and finalize.py using bundled Python.\nSee Source/docs/STEP_40_FINAL_DOCUMENTATION.md and Final_Documentation/Verification.json.\nPDF visually reviewed; original member Word reports copied unchanged. No new Word layout validation is implied.\nNo app code changed and no tests, external integrations or student actions are fabricated.\nNext step: 41.\n',encoding='utf-8')
print(json.dumps({'reportPages':19,'verifiedFiles':len(index),'zip':str(archive),'zipBytes':archive.stat().st_size,'sha256':digest(archive),'step39SourcesUnchanged':len(same_sources)},indent=2))
