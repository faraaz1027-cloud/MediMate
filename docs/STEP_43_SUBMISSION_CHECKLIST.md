# MediMate final submission checklist

**Current publication work:** [source review and exact-revision checks](PUBLICATION_REVIEW.md)
supersede the historical publication status below. C1 actual Telegram receipt is
verified separately; this does not complete student assessment or C2/C3/C5 delivery.
No deployment, team merge or coursework submission is implied.

21 November 2026 (Asia/Dhaka). **NOT READY / NOT SUBMITTED.** This is the working
checklist accompanying the Step 43 backup; it is not faculty acceptance.
Deadline: **UNKNOWN**. Submission portal: **UNKNOWN**. Final rubric/format:
**PENDING FACULTY CONFIRMATION**. Public deployment or approved local exception:
**PENDING FACULTY CONFIRMATION**. Record actual announcements and links here.

## 1. Open the correct source and start the synthetic local demonstration

Canonical checkout: `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`.
Use this checkout, not `Support/Step42_Review/Rehearsal_Source`, whose 80-character
exercise changes are isolated training references.

On this device, initialize the verified Node 24 runtime in **each** PowerShell terminal:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$medimateNodeDir = (Get-Content -LiteralPath '.local-data\step41-runtime\selected.txt').Trim()
$env:PATH = $medimateNodeDir + ';' + $env:PATH
$env:MONGOMS_SYSTEM_BINARY = 'C:\Users\jfaar\Documents\Codex\2026-11-01\github-plugin-github-openai-curated-remote\work\mongodb-binaries\mongod-x64-win32-7.0.24.exe'
node --version
```

The `.local-data` runtime selector and cached binary are device-local and deliberately
excluded from the backup. On another device install Node 24 and MongoDB, put their
binaries on PATH (or set `MONGOMS_SYSTEM_BINARY` to that device's `mongod.exe`), then
follow the portable Step 41 guide. Do not copy a private database.

Build once; on a new source export first run both locked installs:

```powershell
npm ci --include=dev
npm ci --prefix verification/step18
npm run build
```

Start MongoDB in terminal 1 and leave it running:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local.ps1 -Mode Mongo
```

Initialize the replica set in terminal 2; wait for the success message:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local.ps1 -Mode Initialize
```

Run one server in each of three initialized terminals and leave them running:

```powershell
# Sadat — http://127.0.0.1:1499
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local.ps1 -Mode Server -Port 1499
```

```powershell
# Faraaz — http://127.0.0.1:1205
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local.ps1 -Mode Server -Port 1205
```

```powershell
# Sahir — http://127.0.0.1:1212
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\local.ps1 -Mode Server -Port 1212
```

Each port has its own database `assignment03_device_PORT`. For the connected team
demonstration use **one selected port/database** with separate actor sessions;
three separate databases do not share a patient's workflow. The optional seed uses
normal loopback HTTP and synthetic accounts, does not reset existing records, and
does not set up real Telegram delivery:

```powershell
npm run seed:demo -- http://127.0.0.1:1499
```

Demo workers are separate processes; follow
the C2/C3/C5 worker commands in Steps 27, 34 and 36 with the **same selected MongoDB
URI and patient database**. A running Express server alone does not run workers.

## 2. Close assessed feature and ownership gates

- [ ] Sadat demonstrates A1–A4, including draft-only deletion, effective pause
  boundary, stock reconciliation and successful live Overpass request.
- [ ] Faraaz demonstrates B1–B4, including filters/archive, source evidence,
  ingredient review, educational abstention and his own live RxNorm/openFDA request.
- [ ] Sahir demonstrates C1–C4 plus C5 if approved, including note controls,
  duplicate-safe dose handling, overdue-unconfirmed wording, PDF counts and SOS
  consent/simulation wording. Configure a test bot and consenting recipient and
  prove actual Telegram receipt; record failed/disabled delivery accurately.
- [ ] Every owner supplies frontend/API/database explanation, invalid-input,
  access/revocation, restart and integration-failure evidence, plus genuine
  contribution commits/Jira tickets. Complete all 40 assessment rows from Step 42
  using actual observations/evaluator details; no blanket assistant pass.
- [ ] Rehearse the full Module 1 → 2 → 3 sequence in the Step 43 audit guide and
  retain the actual human demonstration recording/screenshots.

## 3. Confirm faculty, design and deployment requirements

- [ ] Confirm C5 assessment, any additional assigned functions, deadline with
  timezone, submission channel/link and final report format/rubric.
- [ ] Confirm public deployment or get an explicit recorded local-demo exception.
  If public deployment is required, configure a MongoDB replica set, reviewed
  environment settings and a reliable worker arrangement, then prove the actual
  deployed UI/API/data/notification flows. No cloud database is configured yet.
- [ ] Review the Step 14 design submission against current screens; complete
  remaining native screen/accessibility/physical-device checks. Record the mobile
  LCP limitation (3.312s measured) or measure and document a justified fix.
- [ ] Confirm faculty acceptance of the prepared 19-page PDF/Markdown final report;
  the Word files are the original revised Assignment 03 reports, not a new final
  project Word report. Add current audit/evidence and final reviewed revision.

## 4. Publish the reviewed revision and verify another device

- [ ] Review preserved Assignment 03 and Steps 32–43 changes with their owners.
  Make authentic focused commits and integrate the stacked PR history. PR 14 is
  draft and its historical successful workflow does not cover current local work.
- [ ] Run the current hosted Windows/Linux verification on the exact proposed SHA.
  Record the PR, workflow run and final reviewed commit links; address real failures.
- [ ] Another member clones that exact published revision, installs dependencies,
  builds, runs `npm run verify`, starts services and demonstrates persisted records.
  Record device/runtime/results. An assistant source export is not this check.

## 5. Check package contents, backup and submission receipt

- [x] Three revised Assignment 03 reports/collections are available and hash-checked;
  final embedded capture counts are **Sadat 19, Faraaz 16, Sahir 24**. Their exact
  paths, ports and hashes are recorded in `Assignment03_Audit.json`.
- [x] Dated Step 40/41/42 ZIP checksums/CRC and the current canonical candidate are
  verified in the Step 43 audit. Retain original evidence dates and actor labels.
- [ ] After all gates are closed, update report/addendum and feature matrix with
  actual results and the exact final SHA. Make a new dated backup; do not overwrite
  earlier evidence to imply it was tested on a later revision.
- [ ] Copy the backup and `.sha256` to a second/off-device location, verify checksum,
  extract to a fresh folder and prove restore. Only the local ZIP is verified here.
- [ ] Upload the required source/report/collections/design/demo evidence through
  the confirmed faculty channel before the confirmed deadline. Record submission
  receipt/time/link. Nothing has been submitted by this audit.

Local checksum command for the prepared backup:

```powershell
$medimateBackup = 'C:\Users\jfaar\Documents\Codex\MediMate-A3\MediMate_Step43_Readiness_Backup.zip'
$medimateExpected = (Get-Content -LiteralPath ([IO.Path]::ChangeExtension($medimateBackup, '.sha256'))).Split(' ')[0]
if ((Get-FileHash -LiteralPath $medimateBackup -Algorithm SHA256).Hash.ToLowerInvariant() -ne $medimateExpected) { throw 'Backup checksum mismatch' }
```
