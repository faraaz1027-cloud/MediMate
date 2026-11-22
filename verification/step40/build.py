"""Build the Step 40 report and portable documentation evidence package.
Run with the Codex bundled Python (reportlab, Pillow, pypdf, python-docx).
No application database, credentials, node_modules or Git metadata are packaged.
"""
from pathlib import Path
import csv, hashlib, json, re, shutil, subprocess, zipfile
from html import escape
from xml.etree import ElementTree as ET
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage
from pypdf import PdfReader
from docx import Document

ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT.parent
OUT=BASE/'Final_Documentation'
OUT.mkdir(exist_ok=True)
QA=ROOT/'output'/'step40'; QA.mkdir(parents=True,exist_ok=True)
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyReport',fontName='Helvetica',fontSize=10.2,leading=14.5,spaceAfter=8,textColor=colors.HexColor('#20222a')))
styles.add(ParagraphStyle(name='ReportTitle',fontName='Helvetica-Bold',fontSize=27,leading=33,spaceAfter=20,textColor=colors.black))
styles.add(ParagraphStyle(name='ReportH1',fontName='Helvetica-Bold',fontSize=19,leading=24,spaceAfter=14,textColor=colors.black))
styles.add(ParagraphStyle(name='ReportH2',fontName='Helvetica-Bold',fontSize=12,leading=16,spaceBefore=10,spaceAfter=7,textColor=colors.black))
styles.add(ParagraphStyle(name='CellReport',fontName='Helvetica',fontSize=9,leading=12,spaceAfter=0))
styles.add(ParagraphStyle(name='CaptionReport',fontName='Helvetica',fontSize=9,leading=12,spaceAfter=10,textColor=colors.HexColor('#494952')))
styles.add(ParagraphStyle(name='CodeReport',fontName='Courier',fontSize=8.5,leading=12,spaceAfter=8))
story=[]; md=[]; sections=[]
def p(text):
    formatted=re.sub(r'https://[^\s]+',lambda m:'<link href="'+m.group(0)+'" color="#234f85">'+m.group(0)+'</link>',escape(text))
    story.append(Paragraph(formatted,styles['BodyReport']));md.append(text+'\n')
def h(text):
    story.append(Paragraph(escape(text),styles['ReportH2']));md.append('## '+text+'\n')
def page(title):
    if story:story.append(PageBreak())
    story.append(Paragraph(escape(title),styles['ReportH1']));md.append('# '+title+'\n');sections.append(title)
def table(headers,rows,widths):
    data=[[Paragraph(escape(str(c)),styles['CellReport']) for c in row] for row in [headers]+rows]
    t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7eaf0')),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('VALIGN',(0,0),(-1,-1),'MIDDLE'),('GRID',(0,0),(-1,-1),0.5,colors.HexColor('#d9d9d9')),('LEFTPADDING',(0,0),(-1,-1),7),('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
    story.extend([t,Spacer(1,10)])
    md.append('| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*len(headers))+' |\n'+'\n'.join('| '+' | '.join(map(str,r))+' |' for r in rows)+'\n')
def code(text):
    for line in text.splitlines():story.append(Paragraph(escape(line).replace(' ','&nbsp;'),styles['CodeReport']))
    md.append('```powershell\n'+text+'\n```\n')
def fig(file,width,caption):
    im=PILImage.open(file);height=width*im.height/im.width
    story.append(KeepTogether([Image(str(file),width=width,height=height,hAlign='LEFT'),Spacer(1,5),Paragraph(escape(caption),styles['CaptionReport'])]))
    md.append('!['+caption+']('+str(file.relative_to(BASE)).replace('\\','/')+')\n')
def crop(name,box,label):
    src=ROOT/'docs/evidence/step39'/name
    dest=QA/label
    PILImage.open(src).crop(box).save(dest)
    return dest

# Verify archived capture counts independently of the old screenshot-slot plans.
capture_map=list(csv.DictReader((BASE/'Inventory/Postman_Capture_Map.csv').open(encoding='utf-8-sig')))
capture_checks=[]; member_rows=[]
for folder,short,student,port,expected in [('Ihfaz_Rashid_Sadat','Ihfaz Rashid Sadat','23301499',1499,19),('Faraaz_Jamil_Chowdhury','Faraaz Jamil Chowdhury','24241205',1205,16),('Sahir_Jawad_Chowdhury','Sahir Jawad Chowdhury','23301212',1212,24)]:
    base=BASE/'Members'/folder
    report=next(base.glob('*Revised_Final.docx')); coll=next(base.glob('*.postman_collection.json'))
    doc=Document(report);text='\n'.join(x.text for x in doc.paragraphs)
    assert student in text and 'Group Number  5' in text
    captures=list((base/'Postman_Captures').glob('*.png'));assert len(captures)==expected
    with zipfile.ZipFile(report) as z:
        media={hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith('word/media/')}
    for image in captures:
        digest=hashlib.sha256(image.read_bytes()).hexdigest()
        row=next(x for x in capture_map if x['Member']==folder and x['Request']==image.stem)
        assert digest.upper()==row['SHA256'].upper() and digest in media
    data=json.loads(coll.read_text(encoding='utf-8-sig'))
    numbered=[]
    def walk(items):
        for item in items:
            if 'item' in item:walk(item['item'])
            elif re.match(r'^[ABC][12]-\d\d\b',item['name']):numbered.append(item['name'])
    walk(data['item']);assert len(numbered)==expected
    member_rows.append([short,student,str(port),str(expected)])
    capture_checks.append({'member':short,'report':str(report.relative_to(BASE)),'collection':str(coll.relative_to(BASE)),'captures':expected,'numberedRequests':len(numbered),'allCaptureHashesMatchManifestAndEmbeddedMedia':True})

page('MediMate project report')
p('CSE471 System Analysis and Design | Section 01 | Fall 2026 | Group 5')
p('Prepared 21 November 2026, Asia/Dhaka. Documentation checkpoint: Step 40.')
table(['Member','Student ID','Local port','API captures'],member_rows,[210,88,75,110])
h('Project outcome')
p('MediMate is a local classroom application for reviewed prescription records, medicine information, schedules, stock and caregiver coordination. Its React interface, Express API and MongoDB persistence have recorded integration evidence across 13 functions. The evidence supports a tested prototype, not clinical effectiveness or a completed course assessment. [S01-S05]')
p('Public deployment is unresolved. No cloud database or verified ambulance provider is configured, and no live Telegram delivery is demonstrated. SOS provider requests use an explicit classroom simulation. The zero-cash target does not establish free always-on infrastructure. Each member must still explain, modify and demonstrate their own work. [S01, S06, S07]')
h('Report navigation')
p('System request and feasibility; functional requirements; technology and architecture; backend and data; API and Postman; interface and frontend; user manual for A, B and C functions; testing; performance; repository and deployment; individual contributions; limitations; references and operation appendix.')
p('Technical evidence is dated and labelled by origin. Existing Assignment 03 reports and captures are historical submissions; November 21 test outputs and browser observations describe later local changes. No new test, interview, deployment or student contribution is implied by assembling this report.')

page('Contents')
p('The chapter structure follows both supplied Lab 7 samples. Page numbers below refer to this MediMate report. The samples are examples of presentation, not evidence about this project. [S17]')
toc_position=len(story);story.append(Spacer(1,1))
md.append('The PDF contents page provides verified page numbers.\n')

page('1 System request and feasibility')
h('Business need and intended users')
p('Patients and household organizers can lose track of changed instructions, medicine stock and caregiver handovers when these are scattered across paper and messages. MediMate proposes a shared record for an organizer and expressly authorized caregivers. This is the project hypothesis from Step 12; no prevalence survey, user interview, market size or measured health benefit is claimed. [S02]')
h('Business requirements and value')
p('Retain reviewed prescription versions; build explicit schedules; keep cabinet and source passages; record doses and stock movements; coordinate tasks, refills and follow-up; produce a visit report; and support deliberate SOS contact coordination. Expected value is traceability: one confirmed source, recorded actors and a distinction between a notice attempt and a recipient response. [S02, S03]')
table(['Dimension','Current assessment','Remaining condition'],[
['Technical','Local API, database, workers and compiled UI have automated evidence.','Cloud operation and broad real-device coverage remain unverified.'],
['Operational','Named actors, permission grants and consent are implemented.','Target-user feedback and each student demonstration are pending.'],
['Economic','Local resources and no paid API commitment support a zero-cash prototype.','Always-on workers and hosting must fit an approved arrangement.'],
['Schedule','All 13 function paths have a connected synthetic scenario.','Faculty deadlines, C5 assessment and final rubric need confirmation.'],
['Data and source quality','Synthetic records and explicit source/unknown states are used.','Coverage, privacy and reliability require separate work before a real pilot.']],[78,201,204])
h('Constraints and feasibility conclusion')
p('The three-member team retains A1-A4, B1-B4 and C1-C4, plus additional C5. Accounts and profile/permission controls are shared infrastructure, not extra assessed features. Each member needs four assessed functions and a feature-level external API integration. Local OCR does not count as an external API. The local prototype is technically supported; operational feasibility and course readiness remain conditional. [S01-S03]')

page('2 Functional requirements and ownership')
p('This is the agreed project allocation. Assignment scope and faculty acceptance are separate from local implementation status. C5 adds a fifth Sahir function and does not replace any original requirement. [S01, S03]')
features=[
('A1','Sadat','1','Prescription import, editable OCR drafts, explicit review and immutable change history.'),
('A2','Sadat','2','Confirmed-source schedules, previews, versioning and effective pause boundaries.'),
('A3','Sadat','3','Stock ledger, exactly-once taken debit, coverage and refill checklist.'),
('A4','Sadat','3','Overpass pharmacy search, saved preferences and linked collection tasks.'),
('B1','Faraaz','1','RxNorm search, reviewed identity, manual fallback, cabinet filters and archive.'),
('B2','Faraaz','2','Applicable openFDA label passages, source dates and separate personal notes.'),
('B3','Faraaz','3','Reviewed ingredient overlap, evidence, insufficient-information states and acknowledgement.'),
('B4','Faraaz','3','Four supported source-section questions, exact citations, abstention, feedback and deletion.'),
('C1','Sahir','1','Task assignment, acceptance, handover author controls and notice history.'),
('C2','Sahir','2','Persisted reminders and taken, skipped, snoozed and corrected dose actions.'),
('C3','Sahir','3','Consented overdue-unconfirmed follow-up with acknowledgement and resolution.'),
('C4','Sahir','3','Date-range analytics, revised health notes and private frozen PDF exports.'),
('C5','Sahir','3','Recipient-consented SOS, acknowledgement, closure and labelled provider simulation.')]
table(['ID','Owner','Module','Required behavior'],features,[32,50,44,357])
p('All rows are exercised in the Step 37 controlled-provider scenario, with API/database assertions and a restart checkpoint. This does not prove all screens on all devices, successful live providers or individual assessment. See the machine-readable feature traceability file. [S04]')

page('3 Technology and system architecture')
p('The implemented stack is React with JavaScript and native CSS, Vite for the client build, Node.js with Express for HTTP, and MongoDB with Mongoose for persistence. Tesseract.js runs local OCR. Server PDF export uses PDFKit; explicit timezone handling uses the Temporal polyfill. Tailwind was proposed earlier but the present client uses the established CSS directly. [S08]')
table(['Layer','Responsibility','Implementation reference'],[
['Browser','Forms, explicit review, responsive work areas, local OCR and loading/error states.','client/src/App.jsx and feature components'],
['Same-origin HTTP','Serve compiled Vite files and relative /api/v1 requests; readiness and errors.','server/http-app.js; runtime-config.js'],
['Domain API','Authorize patient/actor, validate state and revisions; commit history/operations.','server/v1/app.js and domain modules'],
['Database','Patient-scoped records, immutable versions, durable work and deduplication.','server/v1/store.js'],
['Workers','Task notices, due reminders, overdue follow-up and SOS delivery attempts.','worker.js; dose/followup/sos-worker.js'],
['External adapters','RxNorm identity, openFDA label, Overpass listings and optional Telegram.','server/v1 adapters; source snapshots']],[78,223,182])
h('Data flow and integration')
p('Browser -> same-origin Express -> validation and authorization -> MongoDB transaction -> JSON response. Background workers independently read persisted due work and record attempts. External services supply reference data or transport; they never authorize access to a patient record. A sleeping computer or worker cannot guarantee reminder delivery. [S06, S08]')
p('A1 confirmed instruction -> A2 schedule -> C2 dose occurrence/action -> A3 stock ledger. A3 refill -> A4 pharmacy preference -> C1 collection task. C3 follows unanswered C2 events; C4 summarizes stored facts. B1 identity -> B2 source snapshot -> B3 comparison/B4 educational lookup. C5 is deliberately activated, independent of a missed-dose inference. [S03, S04]')
h('Architecture decisions')
p('The combined Express/Vite origin preserves relative API calls and existing session/CSRF behavior. MongoDB must support transactions; a standalone server is rejected for operational deployment. B4 uses deterministic retrieval over saved source passages rather than an unverified local language model. These changes preserve function ownership and are documented in the contracts and step guides. [S06-S09]')

page('4 Backend development and persistent data')
table(['Relationship','Retained records and invariant'],[
['Identity -> patient access','users, sessions, patients, accessGrants; active permission checks on each protected operation.'],
['Prescription -> versions -> instructions','Confirmed records freeze; replacement drafts preserve prior sources. Only the current unconfirmed draft can be deleted.'],
['Schedule -> versions -> occurrences','Preview/confirmation identifies a source; effective pause preserves earlier dose history.'],
['Cabinet -> source -> evidence','cabinetItems/revisions, sourceRecords, medicineCards, ingredientConfirmations/reviews, educationalAnswers.'],
['Dose -> action -> stock','doseOccurrences/actions and stockTransactions; replay cannot debit the same intake twice.'],
['Task -> notes -> events','careTasks, taskNotes and taskEvents retain authorship and history; completion does not assert a refill.'],
['Follow-up and reports','doseFollowups, settings, healthNotes/revisions and reportExports retain outcomes and snapshot metadata.'],
['SOS -> jobs -> attempts -> responses','sosIncidents/jobs/attempts/acknowledgements/events/providerRequests keep delivery, acknowledgement and simulated provider states distinct.']],[145,338])
h('Contracts and security behavior')
p('ObjectId references serialize as hexadecimal strings. Patient-owned records carry patientId; actor identity and effective permissions are established on the server. Mutable records use revisions and mutation operations; stale writes and duplicate requests have distinct handling. Quantities retain explicit units, and timestamps use UTC with a separately declared IANA timezone. [S08, S09]')
p('The session is cookie based. Writes require the expected CSRF/origin flow and applicable authorization. Responses use data/meta or error envelopes. Validation, access denial, stale revisions and upstream outages remain explicit outcomes. Confirmed prescription deletion, cross-patient references, revoked grants and SOS closure replay are covered by recorded tests. [S05, S09]')
p('The original data model included possible server image assets. Current A1 OCR runs in the browser and does not upload or retain the original image; unimplemented asset routes must not be presented as working APIs. Confirmation records human review, not clinician verification. [S09]')

page('Backend API and Postman evidence')
p('The six Assignment 03 feature areas are A1/A2, B1/B2 and C1/C2. Final collections include setup, numbered capture requests, persisted read-backs and negative cases. Run in collection order so identifiers and revisions are current; captured IDs belong to historical synthetic databases. [S10]')
validation=json.loads((BASE/'Recorded_Validation/final-collections.json').read_text(encoding='utf-8-sig'))
rows=[]
for item in validation['results']:
    rows.append([item['name'],str(item['port']),str(item['requests']['total']),str(item['assertions']['total']),str(item['requests']['failed'])+'/'+str(item['assertions']['failed'])])
table(['Member','Port','Requests','Assertions','Failures req/assert'],rows,[183,48,65,70,117])
p('These totals are from the recorded run dated '+validation['date']+'. RxNorm/openFDA were live and Telegram disabled. They were not rerun to create this report. The later delivery contains 19 Sadat, 16 Faraaz and 24 Sahir PNGs: all 59 hashes match the delivery capture map and corresponding embedded report media. Inline image totals also include one non-capture image per report. [S10]')
table(['Feature','Representative operation','Evidence boundary'],[
['A1 / A2','Draft create/edit/confirm/delete; schedule preview/confirm/effective pause.','Draft-only deletion and effective-date pause are retained in the final sequence.'],
['B1 / B2','Candidate search, cabinet save/filter/archive; label and personal note controls.','Manual versus external identity and label versus note removal stay separate.'],
['C1 / C2','Task/handover author edits/deletion; taken/skipped/snooze and correction.','Non-author note writes are denied; notice state does not prove intake.']],[65,220,198])
h('Capture provenance and review')
p('Members/ contains the three unchanged revised final Word reports, three importable Postman JSON collections and their original capture directories. Their screenshot order is the filename prefix A1-01 onward, A2-01 onward, B1/B2 and C1/C2 respectively; the exact ordered request names are in each collection. No new Postman UI capture was made in Step 40. [S10]')
p('Assignment03_Verification.json records report identity fields, capture counts, numbered-request counts and embedded-media hash matches. Earlier 19/13/21 slot plans are superseded by the later delivered 19/16/24 evidence; the reports have not been overwritten to conceal that history.')

page('5 User interface design')
p('Step 14 records six feature screens: A1/A2 for Sadat, B1/B2 for Faraaz and C1/C2 for Sahir, plus mobile/error/success and SOS states. The recorded Figma file is linked below; the repository retains the design submission and local prototype. Step 40 did not recheck remote Figma access or claim pixel parity. [S11]')
p('https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=2-2409')
p('React replaces illustrative prototype outcomes with real request state, permission-aware work areas, explicit confirmation and retry controls. Forms distinguish transcription, manual identity and source evidence; permission failures and missing data do not display a successful clinical result. The purple shared header and navigation are retained in CSS. [S08, S11]')
mobile=crop('native-mobile-360.png',(823,895,1183,1370),'manual-prescription-crop.png')
offline=crop('native-offline-retry.png',(823,700,1183,1370),'manual-offline-crop.png')
im1=Image(str(mobile),width=200,height=200*475/360); im2=Image(str(offline),width=200,height=200*670/360)
figure_table=Table([[im1,im2]],colWidths=[241,242],hAlign='LEFT');figure_table.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP')]))
story.append(figure_table)
story.append(Paragraph('Figure 1. Genuine Step 39 Chrome excerpts from a 360 px viewport: prescription entry and the cabinet offline/retry state. Synthetic records. Crops omit browser chrome, without changing application content.',styles['CaptionReport']))
md.append('Figure 1: Source/docs/evidence/step39/native-mobile-360.png and native-offline-retry.png; original native screenshots, cropped to the application viewport.\n')

page('6 Frontend development')
p('The React work areas implement the design as database-connected interactions. App.jsx obtains CSRF/session state, selects the permitted patient and renders the allowed feature components. The navigation is shared across members while the backend remains authoritative for every protected action. The repository uses React state/effects and native CSS rather than a drag-and-drop page builder. [S08, S11]')
table(['Component','Concrete behavior'],[
['App.jsx and request.js','Same-origin API calls, session recovery, expected JSON/PDF response checks and safe network messages.'],
['ValidatedForm.jsx','Field validation, accessible error feedback and explicit submit handling.'],
['ConfirmAction.jsx','Review before consequential actions; dismissal does not silently submit a mutation.'],
['PrescriptionReview.jsx','Editable local OCR output, explicit confirmation and immutable-history workflows.'],
['MedicineCabinet.jsx and MedicineInformation.jsx','Reviewed candidate selection, source/notes separation and persistent list/detail states.'],
['TaskBoard.jsx and DoseBoard.jsx','Actor-aware task/handovers and independent dose versus reminder states.'],
['FollowupBoard.jsx, VisitReports.jsx, SosBoard.jsx','Follow-up outcomes, controlled downloads and deliberate consent-aware SOS interaction.']],[179,304])
h('Request lifecycle and failure handling')
p('request.js prefixes /api/v1 and uses credentials: same-origin. It converts network failure into the visible retry message, checks JSON envelopes and accepts a successful PDF download only with the expected content type. App-level recovery handles expired session or CSRF state without silently resubmitting the user\'s write. Stale request responses are guarded in feature components so a previous patient selection does not become the current display. [S08, S09]')
h('Responsive implementation and measured refinement')
p('The layout uses flex/grid, wrapped work-area buttons and single-column mobile forms at the declared breakpoint. Step 39 reserved the header action and scrollbar gutter after actual measurements showed shifts. Native 360 px inspection confirmed the document fits the viewport, and offline/retry produced an observable failure and recovery. Wider keyboard, accessibility and physical-device checks remain release work. [S14]')

page('7 User manual for Sadat functions')
h('Shared account and patient selection')
p('Start MongoDB and the chosen member server using Appendix A. Open its loopback URL, create a synthetic account or sign in, and choose the patient. Account and access manages explicitly scoped caregiver grants. Different ports select separate databases here, but browser cookies are not isolated by port: use separate browser profiles for independent accounts. [S07, S10]')
h('A1 Prescription review')
p('Open Prescriptions. Enter instructions manually or choose an English printed PNG/JPEG. First-use OCR downloads its engine/language files; recognition runs locally. Correct every field and mark ambiguity for clarification. Save the draft; resolve required fields and explicitly confirm review before scheduling. To change instructions, create a replacement draft, compare versions and confirm the new version. Delete only the current unconfirmed draft; confirmed history remains. [S09]')
h('A2 Medication schedules')
p('Choose a confirmed instruction, review medicine/quantity/unit and declared timezone, then enter the schedule boundaries and timing. Preview the full occurrence set before confirmation. To pause, review the chosen effective local and UTC time and the affected pending occurrences. Dismissal changes nothing; confirmation preserves earlier history and handles the effective boundary. Do not use synthetic test intervals as medication advice. [S09, S10]')
h('A3 Inventory and refills')
p('Open Inventory and refills and select the medicine. Record an opening quantity with a unit; use explicit refill/correction operations with reasons. A confirmed taken event can create one stock debit; replay cannot debit twice. Inspect needs-review states when a baseline or compatible unit is missing. Generate a refill list from configured thresholds and review coverage only when calculable. Completing a collection task does not add stock; record the received refill separately. [S04]')
h('A4 Pharmacy coordination')
p('From refill coordination, submit a public area/radius for pharmacy search or use the manual area fallback. Review the listing and source date, save a preference and link a collection task to the refill checklist. A listing does not verify stock, opening status or service availability. The latest recorded public search timed out; controlled demonstrations remain available with clear labels. [S04, S12]')
h('Recovery and expected results')
p('After a successful mutation, refresh the saved record and check the revised state/history. Resolve stale-revision messages by reloading before an explicit retry. When offline, use the visible retry action after restoring the connection. A failed request is not proof that a mutation never happened; read the current record before repeating an uncertain action.')

page('User manual for Faraaz functions')
h('B1 Medicine cabinet')
p('Search by medicine or ingredient. Review the complete RxNorm candidate before saving; no candidate is selected automatically. When no supported match exists, add a labelled manual entry. Filter saved records by name, status and entry source; view/edit or archive as allowed. Archive preserves references needed by prescription and dose history. Public search terms should contain no patient details. [S09, S10]')
h('B2 Medicine information')
p('Choose an externally identified cabinet item, retrieve label candidates and confirm applicability yourself. Review original passages, source link and retrieval date. A personal note is separate from label evidence: removing either must preserve the other. If retrieval fails, retain and identify the saved snapshot rather than claiming a fresh lookup. A label match is not a clinical assessment. [S09, S10]')
h('B3 Ingredient review')
p('Review and confirm available ingredient identities, then compare selected medicines, including combination products. Read overlap and cited label evidence separately. Missing ingredients or unmatched sources produce insufficient information, never a safe result. Acknowledge the review and add follow-up notes without treating them as a prescribing decision. [S13]')
h('B4 Educational assistant')
p('Select a medicine with a current, applicability-confirmed B2 source card. Ask one of the four supported questions: label warnings, storage, purpose or active ingredients. Read the exact passages and citations. Other questions, missing sections and ambiguous evidence abstain. Feedback and conversation-payload deletion are available. The implementation uses deterministic saved-source retrieval; no model, personal treatment answer or question upload is claimed. [S07]')
p('The recovered long cabinet label in Figure 2 remains within the mobile viewport. The screenshot demonstrates layout and a successful retry, not a live RxNorm result; these cabinet items are synthetic manual entries. [S14]')
recovered=crop('native-recovered.png',(839,1068,1167,1370),'manual-recovered-crop.png')
fig(recovered,230,'Figure 2. Crop from the native Chrome recovery screenshot showing a long synthetic medicine name and its view control.')

page('User manual for Sahir functions')
h('C1 Caregiver tasks and handover')
p('Grant the caregiver only the needed patient permissions. Create/assign the task; the caregiver acknowledges, accepts and completes it. Append handover notes and retain transition history. Only the note author may edit/delete its current text; past text remains in history. Telegram linking requires the recipient to complete the challenge and consent flow; it is currently unconfigured, and no delivery should be claimed. [S09, S10]')
h('C2 Reminders and dose recording')
p('Open Today\'s doses and apply the desired date/status filter. Review the medicine, quantity and scheduled time. Explicitly record taken or skipped; snooze changes the reminder time without rewriting the prescription schedule. Corrections require a reason and preserve earlier actions. Keep notification attempt state separate from dose state. Workers and connectivity must remain available for real notifications. [S06, S09]')
h('C3 Unconfirmed dose follow up')
p('The owner enables follow-up and chooses the permitted caregiver/delay. After an unanswered occurrence reaches the threshold, review its overdue-unconfirmed record and linked task. A caregiver can acknowledge and record an outcome. Resolution or access revocation suppresses pending work as documented. Silence and unable-to-contact do not prove that a medicine was missed. [S15]')
h('C4 Analytics and visit report')
p('Select the date range and inspect taken, skipped and unconfirmed counts. Add or revise a health/visit note with its history. Request an export, then download the permitted, unexpired PDF and compare its totals with recorded events. The frozen export preserves its generated contents; revoked access blocks later download. This is a factual visit aid, not a diagnosis. [S15]')
h('C5 SOS and assistance coordination')
p('Invite an emergency contact by their app account ID. The recipient independently accepts in Emergency inbox; this grants no patient-chart access. The authorized activator may provide a callback number and optional permitted location, reviews the activation and explicitly confirms. Contacts acknowledge independently. Review failed/disabled/unknown notice states; do not equate a notice or acknowledgement with help arriving. Cancel/resolve with a reason. [S07]')
p('Hospital search is explicitly requested and may be unavailable. Phone links require a deliberate user action. Only the labelled classroom provider simulation is available in development/test; no real provider request, acceptance or dispatch is implemented. Use independent test accounts and synthetic incidents. [S07, S12]')

page('Testing and evidence quality')
table(['Evidence','Recorded result','Interpretation'],[
['Step 37 scenario','14 checkpoints; 81 HTTP exchanges; all 13 functions plus restart.','Actual Express/MongoDB operations with controlled external adapters.'],
['Step 38 backend','186 passed, zero failed or skipped.','Historical full-suite transcript; not rerun while writing this report.'],
['Step 38 OCR','Actual Tesseract clear confidence 77; blurred confidence 0.','Synthetic local engine check; not a medical OCR accuracy study.'],
['Step 39 frontend','Build and compiled-app DOM integration passed.','API-connected workflow rehearsal; DOM tests are separate from native browser evidence.'],
['Step 39 Chrome','Elements, Console, Network, Performance, 360px, Slow 4G and offline/retry.','Genuine native observations on specified pages and this device.'],
['Assignment 03','Three recorded Newman runs and 59 capture hashes reconciled.','Older artifacts; do not present as newly executed Postman UI checks.']],[104,173,206])
h('Connected integration result')
p('The Step 37 fixture shares one patient, one caregiver and a separately consenting contact. A1/B1 link a confirmed instruction to a cabinet item; A2 creates 12 occurrences. Taken/skip actions persist, and one stock debit survives replay. The stock balance reconciles as opening 2 minus intake 1 plus refill 5 equals 6. Task completion does not change stock. Follow-up resolution leaves the unanswered dose pending; SOS closure and report bytes survive server/database-client restart. [S04]')
h('Failure and authorization result')
p('Step 38 exercises patient isolation, revoked grants, invalid/stale state, replay and failure boundaries. It tightened SOS closure-receipt authorization and phone validation. The OCR check degrades on blurred input and unresolved clarification cannot confirm. These are scoped tests with explicit fixtures, not an exhaustive security audit. [S05]')
h('External source provenance')
p('Recorded RxNorm/openFDA live calls succeeded in the Module 2 rehearsal; November 21 ingredient retrieval also succeeded. Overpass pharmacy and hospital attempts recorded timeouts. Telegram transport was controlled/disabled, with no real receipt. Historical source availability must be rechecked for an actual demonstration. [S06, S12, S13]')

page('8 Performance and network analysis')
p('Step 39 used Windows 10.0.26200, Ryzen 5 5600X, 12 logical CPUs and 16 GiB RAM, Chrome 158 and Lighthouse 13.6.0. The page was the synthetic authenticated prescription dashboard, served on loopback with a disposable replica set. These are individual local measurements, not internet-hosting or field performance. [S14]')
table(['Audit','Performance','LCP','CLS','Accessibility / BP'],[
['Mobile before','68','3.314 s','0.926','100 / 96'],
['Mobile reviewed','92','3.312 s','0.043','100 / 100'],
['Desktop header fix only','76','0.686 s','0.802','100 / 100'],
['Desktop reviewed','100','0.688 s','0.018','100 / 100']],[145,74,65,62,137])
p('Mobile Lighthouse simulates a 412x823 viewport, 4x CPU slowdown, 150 ms RTT and 1638.4 Kbps throughput. Desktop uses its desktop preset. Each reviewed run has nine requests and about 407 kB transferred, including the verification-only session redirect. Raw settings and timestamps remain in the JSON reports. Total blocking time was 0 ms. [S14]')
h('Measured corrections')
p('Reserving Sign out space stopped session restoration from changing header geometry. Reserving the scrollbar gutter prevented desktop centered content from moving when data made the page scroll. A local SVG favicon removed a 404 Console error. These explain the recorded CLS and score improvements; mobile LCP stayed near 3.31 seconds, above the lab\'s illustrative 2.5-second target. [S14]')
h('Native observations and limitations')
p('With DevTools cache disabled, the native unthrottled load showed DOMContentLoaded 110 ms, load 150 ms and finish 199 ms. Actual Slow 4G reload showed 3.46 s, 3.50 s and 5.25 s respectively; the four API reads took 592/581/586/586 ms. Eleven requests include extension activity. Native Performance, without throttling, showed LCP 0.16 s and CLS 0 during a 5.17 s capture. It is distinct from the simulated Lighthouse score. [S14]')
p('The native Console reported document width 360 equal to viewport width 360, zero local/session storage entries and zero script-visible cookies. Response headers showed JSON, no-store and nosniff, with cookie-bearing request headers collapsed in the saved screenshot. This is not a complete cookie/security or physical-device audit. [S14]')

page('9 Repository link')
h('Repository and implementation boundary')
p('Repository: https://github.com/faraaz1027-cloud/MediMate')
p('Tested local checkout: C:\\Users\\jfaar\\Documents\\Codex\\MediMate-A3\\Source. Step 40 branch: feature/step40-final-documentation. Base commit: 5a920e455a4d7651cc515d34a30206bedad4c49c. Assignment 03 and Steps 32-39 include local uncommitted changes; the GitHub main branch must not be represented as already containing this entire working tree. No Step 40 commit or PR was created. [S16]')
h('10 Deployed project status')
p('Public project URL: not available in the recorded evidence. No cloud MongoDB is configured, and faculty\'s public-deployment versus local-demo rule remains unconfirmed. A same-origin combined Node/Vite deployment and Render Blueprint are prepared, but a page loading would not prove worker availability. Pricing/free-tier statements in the older Step 29 guide are historical and require a fresh check before use. No paid resource or billing commitment is authorized by this report. [S06]')
h('11 Individual contribution')
table(['Member','Assigned feature responsibility','Evidence still required from owner'],[
['Ihfaz Rashid Sadat','A1-A4; prescription, schedule, stock and pharmacy.','Explain own UI/API/database and actual A4 external call; genuine frontend/backend live edits.'],
['Faraaz Jamil Chowdhury','B1-B4; cabinet, sources, ingredient review and education.','Explain matching/evidence/abstention; own commits and live modifications.'],
['Sahir Jawad Chowdhury','C1-C5; caregiver work, doses, follow-up, report and SOS.','Explain workers/consent and demonstrate configured external integration; clarify C5 assessment.']],[114,174,195])
p('The local Git log lists Faraaz Jamil Chowdhury as author of the five most recent base commits, including Steps 27-31. That metadata does not establish that he authored every assigned feature, nor substitute for Sadat\'s or Sahir\'s contribution evidence. No hours, percentages, Jira activity or student understanding are invented. Codex-assisted changes require owner review and truthful attribution under the lab rule. [S01, S16]')

page('Limitations and completion gates')
table(['Priority','Open gate','Completion evidence required'],[
['High','Individual ownership and assessment','Each student explains and modifies their feature code; authentic commits/Jira and demonstration.'],
['High','Faculty submission requirements','Confirm final rubric, section deadlines, deployment rule and treatment of additional C5.'],
['High','Working deployment','Approved cloud or local arrangement with API, replica database and reliably operating workers.'],
['High','Sahir external integration','Configure a test bot and consenting account; record real linked delivery/receipt separately from controlled tests.'],
['High','Sadat external integration','Demonstrate a successful live pharmacy lookup and outage fallback; current live record is a timeout.'],
['Medium','Mobile loading performance','Measured LCP improvement from 3.31 s; recheck after justified optimization and real deployment.'],
['Medium','Broader usability and devices','Native checks of remaining feature screens, physical mobile devices, keyboard/accessibility and export/download behavior.'],
['Medium','Release reproducibility','Step 41 clean-clone/CI handover, Step 42 viva rehearsal and Step 43 final audit.']],[48,165,270])
h('Scope boundaries carried into submission')
p('No clinical validation, adherence guarantee, verified pharmacy stock, live hospital capacity or real ambulance dispatch is supplied. B4 answers only four supported source questions. A missing label/ingredient is insufficient evidence. Telegram is not configured. The provider simulation is excluded from production and must remain labelled in screenshots and demonstrations. [S01, S07, S12]')
h('Documentation readiness')
p('This package completes the Step 40 document assembly and evidence indexing for review. It does not close the open gates or assert university submission. The two supplied Lab 7 samples are CollegeSpace (41 pages) and Project Manager Application (51 pages), both Fall 2024 examples. Both use the same 12 core chapters; the report follows that sequence while retaining MediMate limitations and appendices. They do not establish a current deadline or an additional rubric. The separate P2 thesis report in Downloads is unrelated and was not used. [S17]')
p('Before submission, each member should review factual statements about their functions, replace any missing human evidence with genuine work, confirm faculty requirements and repeat demonstrations against the exact release checkout. Keep the current historical evidence and record new dates/results separately.')

page('12 References and evidence index')
refs=[
('S01','Course rules and report structure','Source_Documents/CODEX_LAB_INSTRUCTIONS.md'),
('S02','System request and feasibility baseline','Source_Documents/STEP_12_SYSTEM_REQUEST_FEASIBILITY.md'),
('S03','Requirements and Step 11 acceptance','Source_Documents/REQUIREMENTS.md; STEP_11_ACCEPTANCE.md'),
('S04','Connected scenario with checkpoints and exchanges','Source_Documents/STEP_37_COMPLETE_SCENARIO.md; Evidence/step37-*'),
('S05','Failure audit, 186-test transcript and OCR output','Source_Documents/STEP_38_FAILURE_PERMISSION_AUDIT.md; Evidence/step38-*'),
('S06','Deployment preparation and historical live sources','Source_Documents/STEP_29_DEPLOYMENT_MODULE2.md; Evidence/step29-*'),
('S07','Deterministic education and SOS boundaries','Source_Documents/STEP_33_EDUCATIONAL_ASSISTANT.md; STEP_36_SOS_MODULE3.md'),
('S08','Architecture and current code inventory','Source_Documents/STEP_13_DESIGN_MODELS.md; Source_Snapshot_Index.csv'),
('S09','Data/API contracts and feature guides','Source_Documents/STEP_15_DATA_MODEL.md; STEP_16_API_CONTRACTS.md; STEP_21 through STEP_28 guides'),
('S10','Assignment 03 reports, collections and provenance','Members/; Recorded_Validation/; Inventory/Postman_Capture_Map.csv; Assignment03_Verification.json'),
('S11','Recorded design submission and implementation crosswalk','Source_Documents/STEP_14_DESIGN_SUBMISSION.md; Figma URL in chapter 5'),
('S12','Public-map timeout observations','Evidence/step31-live.json; step36-hospitals-live.json'),
('S13','Ingredient implementation and live reference result','Source_Documents/STEP_32_INGREDIENT_REVIEW.md; Evidence/step32-live.json'),
('S14','Native browser and measured performance','Source_Documents/STEP_39_BROWSER_PERFORMANCE.md; Evidence/step39/'),
('S15','Follow-up and report implementations','Source_Documents/STEP_34_DOSE_FOLLOWUPS.md; STEP_35_VISIT_REPORTS.md'),
('S16','Local Git metadata captured during document assembly','Git_Provenance.txt; Source_Snapshot_Index.csv'),
('S17','Both user-supplied Lab 7 report samples','Samples/; Sample_Structure_Crosswalk.csv; Sample_Provenance.json')]
for key,title,path in refs:
    p(key+'  '+title+'. '+path)
p('The report structure follows both supplied Lab 7 samples and the lab-guide crosswalk. Sample_Provenance.json identifies their page counts and hashes; Sample_Structure_Crosswalk.csv maps all 12 chapters. Project facts come from the sources above. External URLs are recorded references, not newly verified service availability. Evidence_Index.csv lists packaged paths, hashes and evidence classification.')

page('Appendix A Local startup and rehearsal')
p('Use the canonical checkout below. Install Node 22 or later and a compatible local MongoDB binary. The existing helper uses the PATH mongod or this device\'s cached MongoDB 7.0.24. If port 27028 is already occupied, inspect the existing process before starting another replica. [S10]')
code("Set-Location 'C:\\Users\\jfaar\\Documents\\Codex\\MediMate-A3\\Source'\nnpm ci\nnpm run build")
p('Terminal 1 starts MongoDB. Keep it open:')
code("Set-Location 'C:\\Users\\jfaar\\Documents\\Codex\\MediMate-A3'\n./Start-MediMate.ps1 -Mode Mongo")
p('Terminal 2 initializes/checks the replica and starts Sadat:')
code("Set-Location 'C:\\Users\\jfaar\\Documents\\Codex\\MediMate-A3'\n./Start-MediMate.ps1 -Mode Initialize\n./Start-MediMate.ps1 -Mode Server -Port 1499")
p('In separate terminals at the same directory, start Faraaz or Sahir:')
code('./Start-MediMate.ps1 -Mode Server -Port 1205\n# Sahir uses another terminal\n./Start-MediMate.ps1 -Mode Server -Port 1212')
p('Open http://127.0.0.1:1499, :1205 or :1212 respectively. These use assignment03_device_1499, _1205 and _1212 within the assignment03 replica set. Use one server/database for interacting owner, caregiver and SOS-contact accounts; separate profiles keep their sessions independent.')
p('Workers require their own terminals using the same chosen database. Example for Sahir; run each command in a separate terminal, with these variables set in each:')
code("Set-Location 'C:\\Users\\jfaar\\Documents\\Codex\\MediMate-A3\\Source'\n$env:NODE_ENV = 'development'\n$env:MONGODB_URI = 'mongodb://127.0.0.1:27028/' +\n  'assignment03_device_1212?replicaSet=assignment03'\n$env:TELEGRAM_BOT_TOKEN = ''\n$env:TELEGRAM_BOT_USERNAME = ''\nnpm run worker --workspace server\n# Or, in independent terminals:\nnpm run dose-worker --workspace server\nnpm run followup-worker --workspace server\nnpm run sos-worker --workspace server")
p('Empty Telegram configuration deliberately prevents live delivery. Ctrl+C stops a local process; do not delete the persistent .local-data/mongo folder to reset a demonstration.')

page('Appendix B Package contents and reproduction')
p('MediMate_Project_Report.pdf is the readable report; MediMate_Project_Report.md is its editable text source. The build script in Source/verification/step40/build.py generates both from the same content. This package includes original Assignment 03 artifacts without claiming a new Word rendering or Postman capture. The PDF was rendered separately for visual QA.')
table(['Location','Contents'],[
['Members/','Three final reports, three importable Postman collections and 59 original captures.'],
['Evidence/','Step 37/38 results, selected historical source checks and Step 39 audits/screenshots.'],
['Source_Documents/','Lab guidance, requirements, roadmap and implementation guides.'],
['Recorded_Validation/ and Inventory/','Historical test provenance and original capture hashes.'],
['Feature_Traceability.csv','13 function IDs mapped to owner, code and recorded checks.'],
['Evidence_Index.csv','Classification, byte length and SHA-256 for packaged files.'],
['Submission_Gaps.md','Explicit outstanding human, faculty, live-provider and deployment gates.'],
['Source_Snapshot_Index.csv','Hashes of local code/specification files; no copied secrets or dependencies.']],[157,326])
h('Reproduction and review')
p('Report generation reads evidence and writes only documentation outputs. It does not start an app, mutate a database or rerun the historical tests. Use the individual step guides for their reproducible test commands. The full code remains in the canonical Source checkout; this is a documentation package, not a clean-clone release archive.')
code('node verification/step18/api.mjs\nnode --experimental-vm-modules verification/step18/run.mjs\n./verification/step37/run.ps1')
p('Install the existing verification/step18 dependencies and build first; set MONGOMS_SYSTEM_BINARY to a compatible binary where needed. These commands intentionally generate new dated evidence and can take time; they are review instructions, not a claim of execution in Step 40.')
p('The final assessed release still requires Steps 41-43. Keep the no-cost assumption, provider simulation labels, external-availability limitations and genuine individual ownership evidence visible when adapting this report to any later faculty template.')

def footer(canvas,doc):
    canvas.setFont('Helvetica',8);canvas.setFillColor(colors.HexColor('#626773'))
    canvas.drawString(54,29,'MediMate | CSE471 Group 5 | 21 November 2026')
    canvas.drawRightString(541,29,str(doc.page))
pdf=OUT/'MediMate_Project_Report.pdf'
toc_rows=[[Paragraph('Section',styles['CellReport']),Paragraph('Page',styles['CellReport'])]]
for number,title in enumerate(sections,1):
    if title not in ['MediMate project report','Contents']:
        toc_rows.append([Paragraph(escape(title),styles['CellReport']),Paragraph(str(number),styles['CellReport'])])
    if title=='9 Repository link':
        for extra in ['10 Deployed project status','11 Individual contribution']:
            toc_rows.append([Paragraph(extra,styles['CellReport']),Paragraph(str(number),styles['CellReport'])])
toc=Table(toc_rows,colWidths=[430,53],hAlign='LEFT');toc.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#e7eaf0')),('GRID',(0,0),(-1,-1),0.5,colors.HexColor('#d9d9d9')),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
story[toc_position]=toc
SimpleDocTemplate(str(pdf),pagesize=(595,842),rightMargin=54,leftMargin=54,topMargin=48,bottomMargin=48,title='MediMate project report',author='MediMate team documentation with Codex assistance').build(story,onFirstPage=footer,onLaterPages=footer)
(OUT/'MediMate_Project_Report.md').write_text('\n'.join(md),encoding='utf-8')
(OUT/'Assignment03_Verification.json').write_text(json.dumps(capture_checks,indent=2)+'\n',encoding='utf-8')
# Select evidence explicitly. Never recurse through private runtime/data folders.
for folder in ['Members','Recorded_Validation']:
    shutil.copytree(BASE/folder,OUT/folder,dirs_exist_ok=True)
(OUT/'Inventory').mkdir(exist_ok=True)
shutil.copy2(BASE/'Inventory/Postman_Capture_Map.csv',OUT/'Inventory/Postman_Capture_Map.csv')
(OUT/'Source_Documents').mkdir(exist_ok=True)
for f in (ROOT/'docs').glob('*.md'):shutil.copy2(f,OUT/'Source_Documents'/f.name)
(OUT/'Evidence').mkdir(exist_ok=True)
for pattern in ['step37-*','step38-*','step32-live.json','step31-live.json','step36-hospitals-live.json','step29-module2-live-sources.json']:
    for f in (ROOT/'docs/evidence').glob(pattern):shutil.copy2(f,OUT/'Evidence'/f.name)
shutil.copytree(ROOT/'docs/evidence/step39',OUT/'Evidence/step39',dirs_exist_ok=True)
visit=ROOT/'output/pdf/step37-synthetic-visit.pdf'
if visit.is_file():shutil.copy2(visit,OUT/'Evidence/step37-synthetic-visit.pdf')
(OUT/'Design_Reference').mkdir(exist_ok=True)
for src in [ROOT/'docs/submission/MediMate_Step14_Design_Submission.docx',ROOT/'design/step14/MediMate_Step14_Prototype.html']:
    if src.is_file():shutil.copy2(src,OUT/'Design_Reference'/src.name)
markdown=(OUT/'MediMate_Project_Report.md').read_text(encoding='utf-8').replace('Source/docs/evidence/','Evidence/').replace('Source/output/step40/','Figures/')
(OUT/'MediMate_Project_Report.md').write_text(markdown,encoding='utf-8')
(OUT/'Figures').mkdir(exist_ok=True)
for f in QA.glob('manual-*-crop.png'):shutil.copy2(f,OUT/'Figures'/f.name)
gitlog=subprocess.run(['git','log','-5','--format=%h %an %s'],cwd=ROOT,text=True,capture_output=True,check=True).stdout
(OUT/'Git_Provenance.txt').write_text('Captured 21 November 2026\nBranch: feature/step40-final-documentation\nBase: 5a920e455a4d7651cc515d34a30206bedad4c49c\nWorking tree includes earlier uncommitted implementation; no Step 40 commit/PR.\n'+gitlog,encoding='utf-8')
def write_csv(name,headers,rows):
    with (OUT/name).open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f);w.writerow(headers);w.writerows(rows)
codes={'A1':'PrescriptionReview.jsx / prescriptions.js','A2':'ScheduleBuilder.jsx / schedules.js','A3':'InventoryBoard.jsx / inventory.js','A4':'PharmacyCoordination.jsx / pharmacies.js','B1':'MedicineCabinet.jsx / cabinet.js','B2':'MedicineInformation.jsx / information-cards.js','B3':'IngredientReview.jsx / ingredient-reviews.js','B4':'EducationalAssistant.jsx / educational-answers.js','C1':'TaskBoard.jsx / tasks.js','C2':'DoseBoard.jsx / doses.js','C3':'FollowupBoard.jsx / followups.js','C4':'VisitReports.jsx / reports.js','C5':'SosBoard.jsx, EmergencyInbox.jsx / sos.js'}
for key,value in codes.items():
    client,server=value.split(' / ')
    paths=['client/src/'+name.strip() for name in client.split(',')]+['server/v1/'+server]
    assert all((ROOT/path).is_file() for path in paths),paths
    codes[key]='; '.join(paths)
write_csv('Feature_Traceability.csv',['ID','Owner','Module','Required_behavior','Code_components_and_modules','Recorded_acceptance','Remaining_gate'],[[*f,codes[f[0]],'Step37 checkpoint; Step38 regression','Individual demonstration; live integration where applicable'] for f in features])
sources=[]
for base,pattern in [(ROOT/'client/src','*'),(ROOT/'server','*.js'),(ROOT/'server/v1','*.js'),(ROOT/'docs','*.md')]:
    for f in base.glob(pattern):
        if f.is_file():sources.append([str(f.relative_to(ROOT)),hashlib.sha256(f.read_bytes()).hexdigest()])
write_csv('Source_Snapshot_Index.csv',['Source_relative_path','SHA256'],sources)
gaps='''# Outstanding submission gates

Step 40 packages the technical report; it does not establish final course acceptance.

- Confirm the latest final-report template/rubric, deadline, deployment rule and additional C5 scope with faculty.
- Review all AI-assisted work under the lab requirement for individual understanding and live modification.
- Record authentic individual Git/Jira contributions and demonstrate each member's own features.
- Provision or obtain approval for the API/database/worker operating arrangement; no cloud database/public URL exists in the current evidence.
- Configure a Telegram test bot and consenting recipient before claiming real delivery; no token is requested or stored here.
- Record successful live Overpass feature calls with truthful outage fallback; latest pharmacy/hospital attempts timed out.
- Improve or accept the measured mobile LCP 3.31 s finding, and inspect remaining native/physical-device flows.
- Complete Step 41 CI and reproducible handover, Step 42 viva rehearsal and Step 43 final audit/submission.

No real ambulance provider is integrated. Classroom simulation must remain labelled and production must not imply dispatch.
Both supplied Lab 7 examples (CollegeSpace and Project Manager Application) were checked. They share 12 core chapters and are samples, not a current faculty rubric; deadline/format confirmation remains required.
'''
(OUT/'Submission_Gaps.md').write_text(gaps,encoding='utf-8')
(OUT/'Samples').mkdir(exist_ok=True)
sample_records=[]
for f in BASE.parent.glob('Lab 07*.pdf'):
    shutil.copy2(f,OUT/'Samples'/f.name)
    sample_records.append({'name':f.name,'source':str(f),'pages':len(PdfReader(f).pages),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'use':'Report structure only; sample claims are not MediMate evidence'})
assert len(sample_records)==2
(OUT/'Sample_Provenance.json').write_text(json.dumps(sample_records,indent=2)+'\n',encoding='utf-8')
chapter_names=['System request','Functional requirements','Technology','Backend development','User interface design','Frontend development','User manual','Performance and network analysis','GitHub repository link','Deployed project link','Individual contribution','References']
write_csv('Sample_Structure_Crosswalk.csv',['Sample_chapter','Shared_sample_heading','MediMate_location','Evidence_note'],[[i+1,name,'Chapter '+str(i+1),'Same core coverage; additional testing, limitations and appendices retained'] for i,name in enumerate(chapter_names)])
(OUT/'README.txt').write_text('MediMate Step 40 documentation package\nOpen MediMate_Project_Report.pdf. Editable source: MediMate_Project_Report.md.\nReport generation: canonical Source/verification/step40/build.py with bundled Python.\nHistorical Assignment03 reports/collections/captures are unchanged. New report is PDF; bundled Word rendering is unavailable.\nNo application .env, database, node_modules or Git metadata is packaged.\nSource_Documents are archived reference copies; their internal relative links describe the original Source/docs layout. Use Evidence_Index.csv for portable package paths.\nSee Submission_Gaps.md before claiming readiness.\n',encoding='utf-8')
# Validate the resulting text and record page count, without substituting for visual QA.
reader=PdfReader(pdf);alltext='\n'.join(pg.extract_text() for pg in reader.pages)
assert all(x in alltext for x in ['23301499','24241205','23301212','186','3.312','Telegram','Appendix B'])
assert len(reader.pages)==len(sections),(len(reader.pages),len(sections))
(QA/'structure.json').write_text(json.dumps({'pages':len(reader.pages),'sections':sections,'allPagesContainText':all(bool(x.extract_text()) for x in reader.pages),'capturesVerified':sum(x['captures'] for x in capture_checks)},indent=2)+'\n')
rows=[]
for f in sorted(OUT.rglob('*')):
    if f.is_file() and f.name!='Evidence_Index.csv':
        rel=str(f.relative_to(OUT)).replace('\\','/')
        kind='historical Assignment03' if rel.startswith(('Members/','Recorded_Validation/','Inventory/')) else 'recorded technical evidence' if rel.startswith('Evidence/') else 'report or reference'
        rows.append([rel,kind,f.stat().st_size,hashlib.sha256(f.read_bytes()).hexdigest()])
write_csv('Evidence_Index.csv',['Package_path','Classification','Bytes','SHA256'],rows)
print(json.dumps({'report':str(pdf),'pages':len(reader.pages),'captureChecks':capture_checks,'files':len(rows)},indent=2))
