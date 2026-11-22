# MediMate Module 1 — review and submission guide

Prepared 21 November 2026, Asia/Dhaka. Scope: Sadat A1, Faraaz B1, Sahir C1.
**Technical preparation passed; full Module 1 acceptance remains open.** This is
an evidence pack for review, not a claim of student demonstration or submission.

**Live C1 update:** [Actual Telegram delivery verified](MODULE_1_TELEGRAM_DELIVERY.md)
on the user's PC with @Medi911_bot at23:50 Dhaka, followed by a separate app
acknowledgement at23:51. The earlier disabled-transport tests below retain their
original meaning. The verified supplement is `MediMate_Module1_Telegram_Verified.zip`;
the earlier review pack is preserved. This is technical receipt evidence, not a
student/evaluator pass.

## 1. What is prepared

- Current Express/MongoDB/Vite implementation, including A1 current-draft-only
  deletion, B1 filters/archive and C1 author-only handover-note edit/deletion.
- Fresh production build, **62 focused API/provider tests** (zero failed/skipped),
  compiled UI integration and actual public RxNorm nine-checkpoint scenario.
- Three importable Module 1-only Postman collections, retaining their setup and
  intermediate requests. Actual helper/Newman runs: Sadat 20 requests/30 assertions,
  Faraaz 23/37, Sahir 41/60: **84 requests, 127 assertions, zero failures**.
- Existing real Postman captures, checked against their original manifest and
  revised Word embedded images: **A1 10, B1 11, C1 14**. These are evidence counts,
  not faculty-specified screenshot quotas. Capture dates remain historical.
- A tested startup fix: default local runs disable Telegram; explicit opt-in loads
  only the two bot settings from a private file. Syntax validation and dummy-token
  startup probes are not live bot validation or proof of message receipt.
- Member walkthroughs, exact Postman order, a human assessment sheet, three Jira
  ticket drafts, review patch, current source export and per-file checksums.
- Selected native Chrome desktop controls reviewed with five saved captures:
  A1 draft/history and confirmation boundary, B1 name filter, C1 author-only note
  controls across owner/caregiver sessions and truthful disabled Telegram state.
  This does not replace the students' full demonstration or a fresh device/OCR run.

The source export retains the full project and shared dependencies. The assessment
scope of this pack is A1/B1/C1; later feature menus are still present. Original
Assignment 03 reports/collections and dated Step 40–43 archives remain unchanged.
No new final project Word report is required by the available Module 1 material;
confirm faculty format rather than treating a sample final report as the rubric.

## 2. Start the tested local checkout

Canonical checkout: `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`.
Initialize **each** PowerShell terminal on this device:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$medimateNodeDir = (Get-Content -LiteralPath '.local-data\step41-runtime\selected.txt').Trim()
$env:PATH = $medimateNodeDir + ';' + $env:PATH
$env:MONGOMS_SYSTEM_BINARY = 'C:\Users\jfaar\Documents\Codex\2026-11-01\github-plugin-github-openai-curated-remote\work\mongodb-binaries\mongod-x64-win32-7.0.24.exe'
node --version
```

On a different device or fresh extracted source, install Node 24 and MongoDB, put
them on PATH (or set that device's `MONGOMS_SYSTEM_BINARY`), then from `Source` run:

```powershell
npm ci --include=dev
npm ci --prefix verification/step18
npm run build
```

The device-local runtime/cache paths above are deliberately excluded from the ZIP.
For the optional Windows helper/Newman verifier, install the packaged sibling
tooling with `npm ci --prefix ../assignment03-tools`.

Terminal 1, leave MongoDB running:

```powershell
./scripts/local.ps1 -Mode Mongo
```

Terminal 2, initialize once and start Sadat's server:

```powershell
./scripts/local.ps1 -Mode Initialize
./scripts/local.ps1 -Mode Server -Port 1499
```

Separate initialized terminals for the other standalone collection runs:

```powershell
# Faraaz: http://127.0.0.1:1205
./scripts/local.ps1 -Mode Server -Port 1205
```

```powershell
# Sahir: http://127.0.0.1:1212
./scripts/local.ps1 -Mode Server -Port 1212
```

Each port has its own database `assignment03_device_PORT`. For a **connected team
demonstration**, choose one port (1499 is the example) and use separate patient and
caregiver browser profiles/sessions against that same origin/database. Three
independent databases do not share patient records.

Optional synthetic seed, while port 1499 is running:

```powershell
npm run seed:demo -- http://127.0.0.1:1499
```

Synthetic owner: `handover-owner@example.test`; caregiver:
`handover-caregiver@example.test`; fixture password: `Synthetic-handover-123!`.
The seed creates three manual cabinet items, an unconfirmed draft, a task/note and
task/dose access. It does not reset an existing account/password or grant extra
prescription/cabinet access. Review those permissions explicitly before the team
demo; the negative revocation case must use an actually permitted caregiver.

## 3. Run and capture the member Postman collections

| Member | File in Source/postman/module1 | Port | Run all requests | Numbered captures |
| --- | --- | ---: | ---: | ---: |
| Sadat | MediMate_Module1_Sadat.postman_collection.json | 1499 | 20 | 10 |
| Faraaz | MediMate_Module1_Faraaz.postman_collection.json | 1205 | 23 | 11 |
| Sahir | MediMate_Module1_Sahir.postman_collection.json | 1212 | 41 | 14 |

1. Import the member's `.postman_collection.json` from this pack or canonical Source.
2. Use the collection's own `baseUrl`; ensure no active environment overrides it.
3. Run from the **first setup request**, retaining cookies/CSRF/runtime variables
   between requests. Do not jump directly to a numbered capture request.
4. Follow `Postman_Run_Order.csv` in order, including unnumbered setup, reads and
   access checks. Capture only rows with a capture code if reproducing screenshots.
5. Show method/URL, relevant request body, response status/JSON and test results.
   Exclude session cookies, CSRF values, tokens and real patient/contact information.
6. Existing verified captures are already supplied in each member's folder. Reuse
   their original dates; new Newman execution does not make them new UI captures.
7. Sahir's automated collection expects Telegram **disabled** and intentionally
   does not send messages. Run it in the default configuration. The live Telegram
   test below is separate; don't relabel disabled results as successful delivery.

## 4. Connected human demonstration order

Use only synthetic records. Suggested order, not a faculty-imposed time limit:

1. **Faraaz B1:** search live RxNorm, inspect alternative candidates, select and
   save explicitly. Show source/retrieval details, labelled manual fallback,
   name/source/status filters, edit, archive and retained revisions.
2. **Sadat A1:** enter a manual draft and upload a synthetic printed PNG/JPEG.
   Review/correct OCR, choose the saved cabinet item, enter complete quantity,
   unit/timing/duration and clear clarification. Show incomplete confirmation
   blocked, then explicitly review/confirm. Reload, replace, compare and reopen
   the unchanged old version. Delete a separate unconfirmed draft; confirmed
   history cannot be deleted through that route. Keep the original test image
   separately: the app stores source metadata, not image bytes.
3. **Sahir C1:** create/assign to the registered caregiver, sign in separately,
   add/edit/delete the author's own handover note, and prove another actor cannot
   change it. Acknowledge, accept, complete, reopen and inspect history. Task
   description references to cabinet/prescription IDs are text, not structured
   foreign keys or automatic medication matching.
4. **Persistence and access:** reload, restart the API and reopen the records;
   compare persisted IDs/state. Revoke the caregiver's relevant permissions,
   demonstrate rejected reads/writes in A1/B1/C1, then restore the intended grant.
   Show a real no-match/failure state and distinguish an injected test outage from
   a live provider outage.
5. **Individual understanding:** follow the member sheet, explain UI → API → DB,
   answer questions, make actual frontend/backend edits in an isolated practice
   copy and run the affected regression. Save the real owner/evaluator evidence.
6. **Telegram:** complete the real test below when a team-owned test bot exists.
   An app acknowledgement, mocked send, syntax check or provider acceptance alone
   is not proof that the recipient actually received the message.

## 5. Real Telegram test and future reproduction

The earlier no-account blocker is resolved. A team-owned bot now exists, its token
was replaced/stored privately, and the real C1 notice/receipt/acknowledgement passed.
See the linked delivery addendum for evidence and current running-service details.
The following setup procedure applies when configuring or restoring a test bot;
do not overwrite the existing private configuration or start a second poller.

When a team member can create a dedicated bot through the official BotFather:

```powershell
Copy-Item -LiteralPath 'server/telegram.env.example' -Destination 'server/.env.telegram.local'
notepad 'server/.env.telegram.local'
```

Enter only `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` in that ignored file.
Do not paste the token in chat or screenshots. Then:

```powershell
# Syntax only; no database or Telegram request:
./scripts/local.ps1 -Mode CheckTelegram

# Restart the chosen server in one terminal:
./scripts/local.ps1 -Mode Server -Port 1499 -EnableTelegram

# In another initialized terminal, same patient database/port selection:
./scripts/local.ps1 -Mode TaskWorker -Port 1499 -EnableTelegram
```

Run only one poller for the bot. The recipient signs in to their own MediMate
account, creates a link challenge, opens their private bot chat, presses Start,
refreshes MediMate and explicitly confirms consent. Assign a synthetic task;
record actual generic Telegram receipt/time, the persisted attempt and separate
MediMate acknowledgement. Test unlink/revocation before a later send. An existing
webhook/poller conflict must be resolved deliberately by the bot owner.
Details: [Step 23](STEP_23_CAREGIVER_TASKS.md).

## 6. Git, Jira, review and remaining acceptance

`Jira_Task_Drafts.csv` is a draft for three feature tasks; it is not an existing
board or completed work log. Map its Summary/Issue Type/Description/Labels columns
when importing and assign to the actual member accounts. Attach real evidence.
No Jira connector/project link is available in the current workspace.

The actual checked-out history contains Faraaz commits; this does not establish
Sadat's/Sahir's individual contributions or prove they never contributed elsewhere.
Each student must personally review/understand/modify their code and commit under
their actual identity. The focused patch in this pack is **already applied** and
identifies this preparation change only. The full source export also preserves
earlier uncommitted work. Do not blindly stage all local changes or fabricate
student authorship. Review/integrate the existing stacked branches and record the
exact published SHA and actual CI results before the showcase.

Use `Human_Assessment.csv` to record the three students' actual demonstration,
questions, live edits, permission test, regression, contribution and Jira evidence.
All entries start NOT_RUN. The available course instructions require personal
understanding and frontend/backend modification; the sheet is a preparation aid,
not a newly issued faculty marking rubric.

Still needed for full acceptance: each member's personal
demonstration/live edits/contributions; genuine Git/Jira evidence; current reviewed
published revision/CI; faculty Module 1 deadline, portal and exact format/rubric.
Public deployment is not established as a Module 1 requirement by the available
material. Sadat's A4 external integration belongs to the later project allocation;
local OCR itself is not external API credit. Faculty amendments take priority.

## 7. Verify and restore this pack

`MediMate_Module1_Review_Pack.zip` has a companion `.sha256`. Its root contains
`Manifest.json`, current Source, tooling lockfiles, member collections/captures,
guides, technical evidence, draft assessment/Jira records and a review patch.
No private environment/database, dependencies, build output or `.git` is included.
Install dependencies and rebuild after extraction. Copy the ZIP/checksum off-device
and verify/extract there; that second-device restore remains a team action.

Commands from Source:

```powershell
npm run verify:module1
node verification/module1/startup-newman.mjs
```

The second command is a Windows-only disposable helper/Newman check, needs the
sibling `assignment03-tools` install, and refuses to take over occupied member
ports. Native browser captures in this pack are labelled with their actual coverage
and any interrupted checks; they are assistant review evidence, not student passes.
