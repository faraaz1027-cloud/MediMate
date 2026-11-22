# MediMate
Medication management and caregiver coordination — CSE471, Section 01, Fall 2026.

Module 1 review pack: [current setup, tests, member demonstrations and remaining
acceptance gates](docs/MODULE_1_SUBMISSION_GUIDE.md). Run `npm run verify:module1`
for the scoped technical checks. Local Telegram remains disabled by default;
explicit private opt-in and the task-worker helper are documented in that guide.

[C1 real Telegram receipt is now verified](docs/MODULE_1_TELEGRAM_DELIVERY.md) with
@Medi911_bot on the user's PC, including separate app acknowledgement. Other live
channel flows and individual student demonstrations remain separate open gates.

MediMate is a classroom web application for reviewing prescriptions, organizing medicine schedules, recording doses, tracking stock and coordinating caregivers. Its 13th function adds emergency contact alerts and assistance coordination.

**Status:** all 13 function paths are implemented, with connected synthetic scenarios,
backend regressions and dated browser evidence. The refined Module 1 interface is
integrated. [The publication record](docs/PUBLICATION_REVIEW.md) identifies the
review branch, PR and exact-revision checks; `main` remains subject to team merge.
C1 actual Telegram receipt is verified; other live channel flows, successful live
Overpass scenarios, student demonstrations, deployment and faculty acceptance
remain open. This is a classroom prototype.

[Complete project handoff](docs/MEDIMATE_COMPLETE_PROJECT_HANDOFF.md) covers features,
architecture, setup, report/collection locations and the remaining acceptance work.

Full-window native captures and duplicate generated reports are retained locally
and ignored for publication. Safe summaries and reviewed Lighthouse JSON retain
their original dates; they are not fresh results for later source revisions.

## Install and verify

Use Node 24, Git and a compatible MongoDB 7 binary. For the automatic verification
runner, the test library obtains MongoDB 7.0.24 when no `MONGOMS_SYSTEM_BINARY`
override is set. It creates an isolated replica set; no cloud database or provider
secret is required. Package installation and a first binary download need network.

```powershell
npm ci --include=dev
npm ci --prefix verification/step18
npm run verify
```

This builds Vite, runs the database/API/worker tests, then the compiled UI integration.
Logs and the exit summary are in ignored `.local-data/verification`. A frontend build
alone does not verify reminders, transactions or access control.

For a persistent local rehearsal, use the repository-contained helper in separate
terminals, with MongoDB installed or `MONGOMS_SYSTEM_BINARY` pointing to `mongod`:

```powershell
./scripts/local.ps1 -Mode Mongo
# Terminal 2:
./scripts/local.ps1 -Mode Initialize
./scripts/local.ps1 -Mode Server -Port 1499
# Terminal 3:
npm run seed:demo -- http://127.0.0.1:1499
```

Open http://127.0.0.1:1499. The labelled fixture accounts are
`handover-owner@example.test` and `handover-caregiver@example.test`, with the
synthetic password `Synthetic-handover-123!`. These are local test credentials,
not production secrets. Seed twice without duplicating records; no database is
cleared, password reset or existing grant silently changed. Separate profiles are
needed for owner/caregiver sessions. Use port 1205 or 1212 for the other member's
separate database, or use the same server for interacting accounts.

For a disposable rehearsal with controlled public-source fixtures and Telegram
disabled, run `npm run demo:module2 -- --serve`. Its synthetic clock and fixtures
are explicit, and its data is removed on exit. See the handover guide for workers,
Linux/macOS startup, actual clone/release status and outstanding gates.

## Project documents
- [13 functional requirements and acceptance criteria](docs/REQUIREMENTS.md)
- [Ordered development and submission checklist](docs/DEVELOPMENT_CHECKLIST.md)
- [Team contribution workflow](CONTRIBUTING.md)
- [Project update log](CHANGELOG.md)

## Team and delivery
| Member | Functions | Module 1 | Module 2 | Module 3 |
|---|---|---|---|---|
| Ihfaz Rashid Sadat | A1–A4 | A1 | A2 | A3, A4 |
| Faraaz Jamil Chowdhury | B1–B4 | B1 | B2 | B3, B4 |
| Sahir Jawad Chowdhury | C1–C5 | C1 | C2 | C3, C4, C5 |

The original 12 functions remain unchanged; C5 is additional. Invitations were reported sent; acceptance is not yet verified.

## Proposed stack
- Frontend: React, JavaScript and native CSS; Vite build.
- Backend: Node.js and Express.
- Data: MongoDB and Mongoose.
- OCR: local Tesseract.js with manual review.
- Planned integrations: RxNorm, openFDA, OpenStreetMap Overpass and Telegram.
- Development tracking: Jira; source control: GitHub.

The project has a zero-cost constraint. Integration terms and deployment options must be checked before adoption. Hosting and reminder execution arrangements are still to be decided.

## Emergency SOS scope
Notify linked, consenting contacts and track acknowledgements. Use a clearly labelled simulated hospital/provider dashboard for classroom demonstrations until a participating provider is secured. A notification does not establish ambulance dispatch.

## Next milestone
After Step 41 technical handover validation, Step 42 is each member's individual viva
and live modifications, followed by Step 43 final audit/submission. Earlier numbered
sections below are historical milestone records; use the current step guides for
implemented behavior. Individual contribution, live integration and faculty gates
are not closed by automation.

## Links to add
- Jira project: pending.
- [Figma detailed designs](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=2-2409); [Step 14 deliverables](docs/STEP_14_DESIGN_SUBMISSION.md).
- Deployment: pending.
- Calendar deadlines and confirmed collaborator handles: pending.

Use synthetic demonstration records. Do not commit real medical records, contact details, secrets or environment credentials.

## Step 10 connection demo
The React/Express/Mongoose scaffold is now implemented. Follow [Step 10 setup](docs/STEP_10_SETUP.md) to run it with local MongoDB. The owner reported refresh/restart persistence verification. The older notes routes remain a development-only demo and are disabled in production; the new /api/v1 routes require authentication.

## Step 14 design deliverables
Six detailed desktop designs, six mobile designs and error/success states are created in Figma. The [Word submission](docs/submission/MediMate_Step14_Design_Submission.docx) includes labelled figures and native frame links. A [downloadable HTML prototype](design/step14/MediMate_Step14_Prototype.html) covers supplementary interactions and simulated SOS. The student-account pass completed 46 native frames and verified 142 navigation destinations. The final 16-page Word document uses native exports, including simulated SOS states; see [verification details](docs/STEP_14_DESIGN_SUBMISSION.md).


## Steps 15–17
- [Shared data model](docs/STEP_15_DATA_MODEL.md)
- [Full API contract](docs/STEP_16_API_CONTRACTS.md)
- [Six implemented APIs, local replica-set setup and test results](docs/STEP_17_API_IMPLEMENTATION.md)
- [Importable Postman collection](postman/MediMate_Step17.postman_collection.json)

The six APIs are POST and GET for prescriptions, manual cabinet items and caregiver tasks. Login, session/CSRF handling, patient scope, access grants/revocation, idempotency and transactions support them. This milestone does not implement all 13 functions.

## Step 18 frontend
[Run and verify the integrated React interface](docs/STEP_18_FRONTEND_INTEGRATION.md). Register/sign in, select a patient and create/list prescription drafts, manual cabinet entries and caregiver tasks.

## Step 19 account and access
[Implementation, lab mapping and remaining gates](docs/STEP_19_ACCOUNT_ACCESS.md). Open Account and access to edit your profile, create/select patients, and administer named caregiver grants as a patient owner. Direct grants to registered user IDs take effect immediately; no email invitation is sent. [Step 19 Postman collection](postman/MediMate_Step19.postman_collection.json).

## Step 20 shared behavior
[Reconnect/retry, field validation, permission navigation and validation evidence](docs/STEP_20_SHARED_BEHAVIOR.md). Later assessed feature workflows remain separate roadmap steps.

## Step 21 prescription review
[Manual and printed-image OCR review, explicit confirmation, immutable history and replacement comparison](docs/STEP_21_PRESCRIPTION_REVIEW.md). Images are processed locally and not retained; local OCR is not external API course credit. [Step 21 Postman collection](postman/MediMate_Step21.postman_collection.json). Student contribution/viva and faculty acceptance remain open.

## Step 22 medicine search and cabinet
[Live RxNorm search, explicit selection, manual fallback, editing/filtering and retained archive/history](docs/STEP_22_MEDICINE_CABINET.md). Source identity is separate from user strength/form transcription. [Step 22 Postman collection](postman/MediMate_Step22.postman_collection.json) and real public upstream evidence are included. Faraaz's owner review and faculty acceptance remain open.

## Step 23 caregiver tasks and Telegram preparation
[Task transitions, handover, acknowledgement, delivery worker and the open Telegram gate](docs/STEP_23_CAREGIVER_TASKS.md). [Step 23 Postman collection](postman/MediMate_Step23.postman_collection.json) uses synthetic accounts with Telegram disabled. Configure secrets privately and run the separate worker only when a dedicated bot and consenting test recipient are ready. Sahir's review/contribution and real receipt evidence remain open.

## Step 24 Module 1 integration
[Shared-patient demonstration, saved-medicine references, checks and open acceptance gates](docs/STEP_24_MODULE_1_INTEGRATION.md). Run `node verification/step24/run.mjs` for the controlled HTTP/database scenario, or add `--live-rxnorm` for actual NLM lookup with a labelled test-only outage. [Combined Postman collection](postman/MediMate_Step24.postman_collection.json). No real Telegram receipt or individual student contribution is claimed.

## Step 27 dose records and reminder preparation
[C2 implementation, tests, worker setup and Sahir's owner-review guide](docs/STEP_27_DOSE_REMINDERS.md). [Postman collection](postman/MediMate_Step27.postman_collection.json). Record taken/skipped/snoozed actions and reasoned corrections against real A2 occurrences. The separate dose worker requires a replica-set DB and owner opt-in; Telegram is currently unconfigured and live delivery remains unverified. Stock deduction is later A3 work. Step 28 is the broader timezone/restart audit.

## Step 28 timezone and restart audit
[Findings, actual worker-crash tests, local-day behavior and process availability limits](docs/STEP_28_TIMEZONE_RESTARTS.md). Queued jobs reconcile to disabled/expired after configuration removal, and interrupted leases remain unknown without blind resend. Local build, 109 API/provider tests and production-bundle DOM integration pass. Step 29 deployment/Module 2 demonstration is next; real Telegram, student contribution and faculty acceptance remain open.

## Step 29 deployment preparation and Module 2 rehearsal
[Deployment package, verified source references, local rehearsal and open course gates](docs/STEP_29_DEPLOYMENT_MODULE2.md). The production server can serve the compiled Vite client and API from one origin, validates environment/transaction support and starts without a required local .env. A free-web-only Render Blueprint is prepared. No cloud DB or public MediMate URL exists yet; faculty's online/local requirement and the worker arrangement remain unconfirmed. Run `npm run demo:module2` after the documented installs/build, or add `-- --live-sources --serve` for a local rehearsal with actual public RxNorm/openFDA data and Telegram explicitly disabled. Technical preparation does not mark the course deployment complete.
