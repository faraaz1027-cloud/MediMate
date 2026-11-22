# MediMate complete project handoff

**Publication follow-up:** the reviewed consolidation branch is now
`feature/complete-project-review`. See [the publication record](PUBLICATION_REVIEW.md)
for current PR/check status and file exclusions. The snapshot descriptions and
historical SHAs below retain their original context; current Git HEAD and the
published PR checks identify the latest revision. Individual assessment remains open.
The completed source is available in [PR #15](https://github.com/faraaz1027-cloud/MediMate/pull/15).
Its recorded source checkpoint passed fresh Windows/Linux verification with 189
backend tests, build and UI integration. The publication record separates that
checkpoint from the current documentation-follow-up head and its own checks.

**Snapshot date:** 22 November 2026, Asia/Dhaka.  
**Course:** CSE471, Section 01, Fall 2026.  
**Repository:** https://github.com/faraaz1027-cloud/MediMate  
**Canonical working checkout:** `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`  
**Delivery folder:** `C:\Users\jfaar\Documents\Codex\MediMate-A3`  
**Current local branch:** `feature/figma-module1-ui`.

This handoff consolidates the current implementation, course context, working procedures, evidence and unfinished acceptance tasks. It describes the local project and dated evidence, not a submitted or clinically approved product. No tests were rerun solely to write this file. Current source code and its regression tests resolve implementation details; older numbered documents retain the state of their own step and may describe work as future that was implemented later.

## Contents

1. Current overall status
2. Purpose and boundaries
3. Team, ownership and module allocation
4. Course instructions and assessed evidence
5. Technology and architecture
6. Repository structure
7. Accounts, permissions and shared interface
8. Detailed feature descriptions
9. Connected workflows
10. Data model and integrity
11. API design
12. External integrations and workers
13. Figma and frontend implementation
14. Implementation history
15. Tests and actual evidence
16. Setup and startup
17. Postman and report files
18. Documentation, exports and backups
19. Remaining work and priorities
20. Demonstration and submission procedure
21. Known limitations and troubleshooting
22. Continuation instructions and reference index
23. Generated source inventory

## 1. Current overall status

**All 13 feature slices are implemented locally. The project is not yet fully submission-ready.** Implementation completion, controlled automated testing, live provider verification, student assessment, publication and faculty acceptance are different milestones.

| Area | Actual position |
| --- | --- |
| Module 1: A1/B1/C1 | Implemented; focused API/UI/Newman evidence exists; C1 actual Telegram receipt verified; refined Figma interface integrated. Personal assessments remain open. |
| Module 2: A2/B2/C2 | Implemented and technically tested. Personal demonstration, live reminder delivery and deployment acceptance remain open. |
| Module 3: A3/A4/B3/B4/C3/C4/C5 | Implemented with controlled connected tests. Outstanding live-provider evidence, personal demonstrations and C5 assessment confirmation remain. |
| Latest frontend | Production build and production-bundle DOM integration passed on 22 November after the mobile fix. Native review has limited, recorded screen coverage. |
| Full backend baseline | Step 43 recorded 187 passed, zero failed/skipped on 21 November. This is a dated full-suite result, not a claim that it reran after every subsequent edit. |
| Cloud deployment | Configuration prepared; no verified complete cloud UI/API/database/worker deployment in the available evidence. |
| Git publication | Significant local changes remain uncommitted. Historical hosted checks do not cover the exact current local checkout. |
| Course submission | No final submission receipt or faculty acceptance is recorded. Deadline, channel and exact final rubric remain unconfirmed. |

The latest C1 Telegram evidence supersedes Step 43's earlier statement that no bot/recipient was configured. The latest Figma work supersedes older screenshots for current visual appearance. Neither change automatically closes other modules' live or human gates.

## 2. Purpose and boundaries

MediMate helps a patient or household organizer and authorized caregivers manage medicine information, reviewed prescription instructions, schedules, dose records, stock, refill coordination, tasks and follow-up. Its main value is continuity: the same persisted patient and medicine records connect the features, with histories and explicit responsibility.

Typical users are the organizer/record owner, permitted caregivers, and consenting emergency contacts. A contact does not automatically receive access to the patient's chart. A real pharmacy, clinician or ambulance operator is not assumed to be a participating service.

The system does not diagnose or prescribe. Prescription confirmation means the user reviewed their transcription, not that a clinician verified it. OCR output remains editable and unconfirmed. Medicine-source gaps produce unavailable or insufficient-evidence states. A recorded dose is a user report, not proof of ingestion. A pharmacy or hospital map listing does not prove stock, opening status, service availability or dispatch. No real ambulance integration is implemented.

All course demonstrations should use synthetic records. No measured health benefit, market-size estimate, genuine user interview or real healthcare partnership should be invented from the feasibility proposal.

## 3. Team, ownership and module allocation

| Member | Student ID | Module 1 | Module 2 | Module 3 | Standalone demo port |
| --- | --- | --- | --- | --- | --- |
| Ihfaz Rashid Sadat | 23301499 | A1 prescriptions | A2 schedules | A3 inventory; A4 pharmacies/refill coordination | 1499 |
| Faraaz Jamil Chowdhury | 24241205 | B1 medicine cabinet | B2 medicine information | B3 ingredient review; B4 educational assistant | 1205 |
| Sahir Jawad Chowdhury | 23301212 | C1 caregiver tasks | C2 reminders/dose records | C3 follow-up; C4 analytics/report; extra C5 SOS | 1212 |

The original 12 assessed functions are preserved: four per member. C5 adds a fifth Sahir function. Its treatment in assessment and any additional faculty-assigned work need confirmation. Login, profile management and common permissions support the application but do not replace assessed features.

External API allocation: Sadat uses Overpass in A4; Faraaz uses RxNorm/openFDA in B1/B2; Sahir uses Telegram. Local Tesseract OCR is not an external API integration.

## 4. Course instructions and assessed evidence

The governing local interpretation is `docs/CODEX_LAB_INSTRUCTIONS.md`, based on the uploaded guideline and Labs 1–6 plus Lab 7 sample reports. Faculty amendments and the actual rubric take priority. The Lab 4 Flask/SQLite example does not require rewriting this Express/MongoDB project. The Lab 6 frontend hosting example does not establish that a deployed static page meets this application's backend/worker needs. Lab 7 samples supply report structure, not MediMate facts or measured results.

| Lab | MediMate application |
| --- | --- |
| 1 requirements | Named functions, numbered subrequirements, actors, retained records, acceptance cases. |
| 2 DevTools | Actual Elements/Network/Console/storage observations, slow/offline behavior, responsive preview, performance and Lighthouse measurements. |
| 3 Figma | Feature-related screens, prototype, desktop/mobile layouts and implementation comparison. |
| 4 APIs/Postman | Real Express operations, MongoDB persistence, request/response/status/validation/failure and actual external integration. |
| 5 Git | Existing repository, focused branches, individual identities, genuine commits and reviewed integration. |
| 6 deployment | Agreed target environment with working UI/API/database/background processing, or explicit local-demo approval. |
| 7 report | Project-specific system request, requirements, architecture, APIs, interface, user manual, measured analysis, links, contributions and limitations. |

AI-assisted code must be understood by its owner. Students must personally explain and modify frontend/backend code during assessment. Assistant-operated tests, reference exercise patches and synthetic account activity are not evidence that a student performed a viva or contributed independently. Course guidance restricts AI to partial generation/debugging support; substantial assistant preparation must be reviewed against that rule rather than relabelled as student authorship.

Technical choices can change for a documented reason if affected contracts, tests and documentation are updated. Assessed scope/ownership changes require team or faculty agreement. Never fabricate Git history, interviews, screenshots, provider receipt, performance scores or submission receipts.

## 5. Technology and architecture

### 5.1 Stack

| Layer | Implementation |
| --- | --- |
| Frontend | React 19, JavaScript, Vite 8.3.5, authored CSS, Inter/Manrope variable fonts. |
| OCR | Tesseract.js 7 in the browser; engine/language downloads may occur on first use. |
| Backend | Node.js, Express 5, ES modules. The verified device runtime is Node 24.22.3; root package declares Node >=22. Use the verified Node 24 setup for reproduction. |
| Database | MongoDB with Mongoose 8; a replica set is required for cross-document transactions. Cached local test binary is MongoDB 7.0.24. |
| Date/time | UTC instants, IANA timezones and the Temporal polyfill for schedule calculations. |
| PDF | PDFKit/fontkit, bounded private report generation and download. |
| Testing | Node API/provider tests, MongoDB test replica sets, JSDOM/Testing Library production-bundle tests, Newman/Postman, native Chrome checks. |
| Hosting preparation | Same-origin Express/Vite deployment configuration and Render Blueprint; not a proven complete cloud deployment. |

Versions above identify manifests and verified runtime records, not an instruction to update dependencies. `package-lock.json` defines the reproducible dependency tree. Styling is authored CSS; a historical plan mentioning Tailwind is not proof that Tailwind is used.

### 5.2 Request and job flow

```text
Browser React UI
  -> shared request helper, cookies, CSRF, idempotency key
  -> Express HTTP entrypoint and /api/v1 router
  -> authentication + current patient permission checks
  -> feature validation, revision checks and transaction
  -> MongoDB durable records/history/jobs

Separate workers
  -> claim committed eligible jobs / inspect current occurrence state
  -> recheck permissions, consent, revisions and expiry
  -> provider adapter
  -> persist accepted/failed/unknown/disabled result
  -> UI displays attempt separately from human acknowledgement
```

Express can serve the compiled Vite frontend and API from one origin. The Vite development server is a separate development option. MongoDB persistence belongs to the backend; the UI is not a collection of hardcoded feature results. Theme preference is device-local storage and does not replace domain persistence.

## 6. Repository structure

Paths in this section are relative to the canonical checkout.

| Path | Purpose |
| --- | --- |
| `client/src/App.jsx` | Authentication, account/access work, current patient, permission-aware feature navigation and shared workspace. |
| `client/src/request.js` | Shared HTTP behavior, session/error recovery and request coordination. |
| `client/src/PrescriptionReview.jsx` | A1. |
| `client/src/ScheduleBuilder.jsx` | A2. |
| `client/src/InventoryBoard.jsx` | A3 stock, reconciliation and refill lists. |
| `client/src/PharmacyCoordination.jsx` | A4 pharmacy preference and linked collection-task interface. |
| `client/src/MedicineCabinet.jsx` | B1. |
| `client/src/MedicineInformation.jsx` | B2. |
| `client/src/IngredientReview.jsx` | B3. |
| `client/src/EducationalAssistant.jsx` | B4. |
| `client/src/TaskBoard.jsx` | C1. |
| `client/src/DoseBoard.jsx` | C2. |
| `client/src/FollowupBoard.jsx` | C3. |
| `client/src/VisitReports.jsx` | C4. |
| `client/src/SosBoard.jsx`, `EmergencyInbox.jsx` | C5 owner/activator and recipient workflows. |
| `client/src/ConfirmAction.jsx` | Shared confirmation interface. |
| `client/src/figma.css`, `App.css`, `index.css` | Current theme/layout and existing component styling. |
| `client/public/design` | Downloaded Figma capsule/prescription SVG assets, used locally. |
| `server/index.js`, `http-app.js`, `runtime-config.js` | HTTP entrypoint, static/API routing, runtime validation and database startup. |
| `server/v1/app.js` | Auth/session and feature routing. |
| `server/v1/store.js` | Mongoose models, indexes and persistence support. |
| `server/v1/*.js` | Feature services, provider adapters, ledgers and worker logic. |
| `server/*worker.js` | Separate process entrypoints. |
| `server/test` | Backend/provider/regression tests. |
| `scripts/local.ps1`, `local-telegram.mjs` | Local replica/server/C1 worker startup and private Telegram configuration loading. |
| `scripts/verify.mjs`, `seed-demo.mjs` | Verification orchestration and synthetic demo seeding. |
| `verification/step18` | Isolated API/UI verification tools and lockfile. |
| `verification/step19` through later step folders, where present | Step-specific helpers; see generated inventory rather than assuming every numbered folder exists. |
| `verification/module1` | Focused verifier, collections/package helpers, browser fixture and real Telegram test helpers. |
| `postman/module1` | Importable A1/B1/C1-only collections. |
| `docs/evidence` | Dated, scoped verification outputs and native captures. |
| `docs/viva`, `docs/module1` | Individual explanation/live-edit/demo preparation. |
| `.github/workflows/verify.yml` | Prepared Windows/Linux CI matrix. |
| `.local-data` | Ignored device runtimes, DBs and private operational state; not portable source. |

Other shared frontend files include `AccountAccess.jsx`, `ValidatedForm.jsx` and `main.jsx`. The sibling `assignment03-tools` has its own locked Postman/Newman tooling; it is not a second application backend.

The generated inventory at the end lists actual files and avoids treating an illustrative path as an implemented component. Test-only bootstrap/session routes in verification fixtures must never be moved into the production app.

## 7. Accounts, permissions and shared interface

Registration, login/logout, profile updates, patient creation and discovery, and grant management are common foundations. Passwords use salted scrypt hashes. Sessions use opaque cookies and server-side records; cookie settings include HttpOnly, SameSite=Lax and Secure in production. CSRF protects mutations. Patient IDs and client-supplied user IDs never establish authorization.

The owner controls a patient's grants. Caregivers receive explicit permission subsets such as prescription read/write/confirm, cabinet read/write, schedule read/write, dose read/record, stock read/write, task read/write, report read/write and SOS permissions. Current backend grants are authoritative; hiding a button is not sufficient. Revocation blocks later reads/writes and queued work at its next authorization check. It cannot recall information already viewed or a message already in flight.

Shared UI handles loading/empty/error states, stale requests, field errors, session expiry, retry and preservation of displayed records during recoverable failures. Account/access and emergency inbox remain available separately from feature navigation. The sidebar shows permitted features and the selected patient. Light/dark preference is stored on the device with a safe fallback if storage is unavailable.

## 8. Detailed feature descriptions

### A1 — Prescription import, review and change tracking

**Owner:** Sadat; Module 1. **Primary code:** `PrescriptionReview.jsx`, `server/v1/prescriptions.js`.

The user manually enters a prescription or extracts English printed text from a PNG/JPEG in the browser. The user corrects the editable draft, links the intended cabinet record, and reviews dose quantity, unit, timing and duration. Ambiguity remains a clarification state; OCR never auto-confirms. The original image is not uploaded or retained by this workflow. PDF OCR is not implemented by the latest interface update.

Confirmation freezes the reviewed version and instructions. Later changes create replacement versions, preserving confirmed history and comparison. Current-draft-only deletion was specifically checked against the Assignment 02 scope; confirmed history cannot be deleted through that draft action. A2 consumes confirmed instructions rather than arbitrary OCR output. Confirmation is a transcription acknowledgement, not clinical validation.

### A2 — Verified medication schedule builder

**Owner:** Sadat; Module 2. **Primary code:** `ScheduleBuilder.jsx`, `schedules.js`, `schedule-time.js`.

A2 turns eligible confirmed A1 instructions and cabinet identity into an explicit schedule preview. Quantity per dose and strength remain distinct. The user reviews timezone, dates, wall-clock timing and resulting UTC occurrences before confirming. Preview tokens are actor/patient/source-bound, expiring and single-use; changed sources invalidate stale confirmation.

Confirmed schedule versions and dose occurrences persist. Editing is a reviewed replacement from an explicit effective boundary, retaining history. Pause uses an explicit effective date/time; pending future events are cancelled without rewriting earlier records. Resume restores eligible paused-version events at/after the reviewed future boundary without multiplying rows. Daylight-saving ambiguity/nonexistent-time cases are validated; UI display does not silently redefine stored UTC facts.

### A3 — Inventory and refill planning

**Owner:** Sadat; Module 3. **Primary code:** `inventory.js`, `stockLedger.js`, related inventory UI.

Users record an opening balance, positive refill or explained correction, with explicit units. An immutable ledger and revision-controlled balance support reconciliation. A taken C2 action deducts stock once; replay must not double-deduct. Corrections use compensating reversals rather than erasing the ledger. Insufficient/incompatible stock leaves the dose recorded and flags stock for review.

Coverage uses the confirmed schedule where calculable; unknown coverage is not zero. Thresholds produce refill lists. Marking a checklist collected/completed does not silently add stock: the actual refill must be recorded. Controlled connected arithmetic includes opening 2, taken deduction 1 and refill 5, resulting in 6.

### A4 — Pharmacy search and refill coordination

**Owner:** Sadat; Module 3. **Primary code:** `pharmacies.js`, `overpass.js`, linked refill/task UI.

The user grants location or supplies an area centre, then deliberately searches bounded nearby OpenStreetMap pharmacy listings through Overpass. The UI displays available listing details and provenance. A returned short-lived selection token binds a selected listing; saved preference snapshots can become stale and need refresh. A refill list can create one linked C1 collection task using the chosen preference.

Map results are not stock checks, prescriptions or proof a pharmacy is open. Controlled tests demonstrate behavior. Successful live pharmacy listing evidence for Sadat remains an open acceptance item in the audited records; later service availability must be observed rather than inferred from tests.

### B1 — Medicine search and personal cabinet

**Owner:** Faraaz; Module 1. **Primary code:** `MedicineCabinet.jsx`, `cabinet.js`, `rxnorm.js`.

B1 searches RxNorm and requires explicit candidate selection. No returned name is silently treated as the correct medicine. Users may add a clearly labelled manual, unverified entry if no appropriate match exists, especially where local brand coverage is absent. Users save, view, edit and filter by name/source/status, then archive records while preserving references and revisions.

Cabinet identity supports A1/A2 and B2/B3. Editing display fields does not make source evidence clinically verified. Native review checked filtering and retained records. Dated actual RxNorm evidence exists; each member still demonstrates their own integration.

### B2 — Source-linked medicine information cards

**Owner:** Faraaz; Module 2. **Primary code:** `MedicineInformation.jsx`, `information-cards.js`, `openfda.js`.

The user searches/selects label evidence for the current cabinet identity and explicitly reviews its applicability. Saved cards retain source URL, retrieval metadata, exact passages and identity snapshots. Personal notes are separate editable text and cannot rewrite the source quotation. Missing fields, mismatches and provider outages remain explicit. Removing a selected source does not erase immutable historical source evidence.

Coverage depends on the public label dataset. A US label is not automatically applicable to a Bangladesh product. Source selection is not an interaction or prescribing engine.

### B3 — Duplicate-ingredient and label evidence review

**Owner:** Faraaz; Module 3. **Primary code:** `IngredientReview.jsx`, `ingredient-reviews.js`.

B3 compares explicitly confirmed ingredient evidence, including combination products. It distinguishes overlap, no overlap among the confirmed ingredient identities, and insufficient information. It retains selected-item snapshots, evidence references, acknowledgements and notes. Mixing unknown/manual identity with confirmed identity cannot produce a blanket safe result.

This is a narrow evidence review, not comprehensive interaction checking or a recommendation to stop/change medicine.

### B4 — Source-grounded educational assistant

**Owner:** Faraaz; Module 3. **Primary code:** `EducationalAssistant.jsx`, `educational-answers.js`.

The implemented assistant is deterministic source search, not an unrestricted chatbot or local language model. It searches saved applicability-confirmed B2 passages using a narrow supported question mapping and returns exact quotations with source URL, retrieval/version/hash and passage identifiers. No patient question is sent to an external model.

Supported questions, ignoring case/trailing punctuation, concern label warnings, storage, labelled purpose and active ingredients. Unsupported/personal treatment questions and absent evidence abstain. Differing passages do not become an invented clinical conclusion. Users can save feedback and delete questions/excerpts. Untrusted source text renders as text, not executable markup.

This documented choice avoids model cost and unsupported summaries. Broader conversational/LLM behavior is not implemented and must not be claimed.

### C1 — Caregiver tasks and handover board

**Owner:** Sahir; Module 1. **Primary code:** `TaskBoard.jsx`, `tasks.js`, `taskNotifications.js`, `channels.js`, `telegram.js`.

Users create and assign permitted tasks. Assignees accept, complete and reopen tasks through recorded transitions. Handover notes retain history; their author can edit/delete their own notes while another caregiver cannot. Manager/assignee permissions and patient scope are checked server-side. Tasks can originate from refill coordination and follow-up.

Telegram linking proves private chat ownership through an expiring challenge and separate explicit consent. The task worker polls the bot and processes committed notices. Attempts, channel acceptance, actual receipt, app acknowledgement and task completion are distinct facts.

**Actual live evidence:** @Medi911_bot received a single generic synthetic task notice on 21 November at 23:50:24.613 Dhaka; native Telegram showed receipt at 11:50 PM. A separate authenticated app acknowledgement occurred at 23:51:47.707. The task remained open. This was an authorized technical test on the user's PC, not Sahir's personal assessment. The exposed token was replaced and the replacement stored privately. No token belongs in this handoff.

### C2 — Reminders and dose recording

**Owner:** Sahir; Module 2. **Primary code:** `DoseBoard.jsx`, `doses.js`, `doseReminders.js`, `server/dose-worker.js`.

C2 uses persisted A2 occurrences. Users record taken/skipped, snooze a reminder, and make reasoned corrections with immutable action history and revisions. Snooze changes reminder timing, not the prescription schedule. An idempotent replay does not create another dose action or stock deduction.

Owner reminder consent is separate from C1 task-channel consent. Dedicated jobs record pending/processing/sent/failed/unknown/disabled/suppressed/expired states. A default 60-minute window bounds reminder validity after its current reminder time. Expired reminders do not turn pending doses into skipped doses. Unknown interrupted sends are not blindly resent. Restart scans reconcile committed jobs, including explicitly disabled configuration.

Controlled behavior is tested. C1 receipt does not prove C2 live delivery; an actual consenting recipient C2 run remains required if claimed.

### C3 — Unconfirmed-dose follow-up

**Owner:** Sahir; Module 3. **Primary code:** `FollowupBoard.jsx`, `followups.js`, `followup-policy.js`, `followup-worker.js`.

The owner enables follow-up and chooses a currently authorized caregiver. After the configured delay, eligible unanswered occurrences become overdue-unconfirmed in a separate follow-up record; the underlying C2 dose remains pending. A later snooze defers escalation appropriately. Unique occurrence linkage prevents duplicate escalation. Durable C1 task/notification infrastructure carries the generic caregiver notice.

Authorized actors acknowledge and resolve outcomes such as contacted patient or unable to contact. Dose recording, schedule cancellation, consent changes, revocation or resolution suppress ineligible pending work. Resolution never fabricates taken/skipped. Real C3 notification receipt remains separate from the verified C1 notice.

### C4 — Analytics and visit report

**Owner:** Sahir; Module 3. **Primary code:** `VisitReports.jsx`, `reports.js`, `report-pdf.js`.

Date-filtered analytics derive from recorded occurrences/actions. Taken, skipped, pending and overdue-unconfirmed remain distinct; cancelled events are excluded from relevant totals. The interval is half-open [from,to), with explicit timezone and a saved cutoff. Zero describes the recorded dataset, not perfect adherence.

Health notes have revision/reason history. Exports freeze metrics, selected history, refill/task context and notes into a private snapshot/PDF. Generation is bounded and synchronous (201), refining an earlier proposed asynchronous contract. Oversized exports fail explicitly. Downloads expire after 24 hours and recheck current access; expiry is not a promise to purge all database backups. Unsupported glyphs fail rather than corrupting the document silently. Later changes require regeneration.

### C5 — Emergency SOS and assistance coordination

**Owner:** Sahir; extra Module 3 feature. **Primary code:** `SosBoard.jsx`, `EmergencyInbox.jsx`, `sos.js`, `sos-worker.js`.

Owners invite contacts; recipients authenticate and explicitly consent/decline/revoke without receiving chart access. Chat linking is separate. Deliberate confirmed activation creates one active incident per patient, even with denied/unavailable location or no consenting contacts. Location is client-reported, validated and optional. Repeated activation does not multiply incidents/alerts. Recipients acknowledge through authenticated recipient-bound actions. Cancellation/resolution records closure and suppresses eligible unsent work.

The dedicated worker rechecks bound consent, expiry and current state. Hospital lookup is a separate deliberate action. The classroom provider mode is visibly simulated and development/test-only; real verified-partner mode/dispatch is not implemented. No route can manufacture actual ambulance confirmation. Live C5 transport and contact receipt remain unverified by the C1 test, and C5's assessed scope still needs faculty confirmation.

## 9. Connected workflows

### Normal medicine/care workflow

1. Organizer registers and creates/selects a patient; grants a caregiver the necessary permissions.
2. B1 searches/selects an external identity or saves a manual item; B2 separately selects applicable label evidence.
3. A1 imports/types, corrects and confirms instructions for the intended item.
4. A2 previews/confirms schedule occurrences with timezone and explicit source/version.
5. C2 records a dose or snoozes its reminder; a taken event drives one A3 ledger deduction.
6. A3 low stock leads to a refill checklist; A4 can link a selected pharmacy and C1 collection task.
7. C1 records acceptance/completion/handover. Completing collection is not the same as recording a stock refill.
8. C3 tracks eligible unanswered doses without inventing skipped doses.
9. B3 compares confirmed evidence and B4 quotes supported passages.
10. C4 summarizes recorded data and exports a private report.

SOS is a separate C5 branch with explicit contact consent and incident lifecycle. A normal medicine workflow does not automatically activate it.

### What must stay consistent

The same patient/database must connect these steps. Historical prescriptions, schedule versions, source snapshots and ledger entries remain readable without silently replacing old facts with current display values. Permission changes are checked in backend requests and workers. Notification acceptance, acknowledgement and domain completion never collapse into a single success label.

## 10. Data model and integrity

`server/v1/store.js` is the implemented schema/index reference. `STEP_15_DATA_MODEL.md` contains the design and later refinements; its opening proposed collection tables are not a literal current database dump.

| Record family | Purpose |
| --- | --- |
| Users/sessions/patients/grants | Identity, ownership, sessions and explicit access. |
| Prescriptions/versions/instructions | Draft and immutable confirmed content with replacement lineage. |
| Cabinet/revisions/source records | Selected/manual medicine identities, change history and public source provenance. |
| Information cards/ingredient reviews/educational answers | Selected label passages, personal notes, reviewed evidence and saved educational interactions. |
| Schedules/versions/previews/occurrences/actions | Reviewed plans, UTC due facts, current dose state and immutable action history. |
| Inventory settings/stock transactions/refill lists/pharmacy preferences | Transactional quantities, immutable ledger and collection coordination. |
| Tasks/events/notes/channel links/jobs/attempts/acknowledgements | Durable work, chat consent and observable delivery states. |
| Follow-up settings/records | Caregiver escalation and outcomes separate from dose state. |
| Health notes/report exports | Revisioned notes, frozen report data and private expiry-controlled access. |
| Emergency contacts/incidents/jobs/events/provider requests | Consent-bound alerts, incident history and explicit simulation. |

Important mechanisms:

- Internal ObjectIds are not external provider identifiers. All referenced records must match the patient server-side.
- Mutations compare revisions. A stale editor receives a conflict instead of silently overwriting later work.
- UUID idempotency keys bind operations and payloads; successful retries reuse receipts after current access checks. A different payload under the same key conflicts.
- Cross-document workflows use MongoDB transactions and unique indexes. A standalone MongoDB process is insufficient.
- Quantities use explicit units and fixed precision; no implicit conversion among tablet, mg and mL.
- UTC instants and IANA timezone names have different jobs. Calendar display and due-event history must remain consistent through restart/DST.
- Histories grow in separate records or bounded snapshots; lists are paginated/bounded. Expiry checks occur in application logic, not just MongoDB TTL cleanup.
- Archival/replacement/compensating records preserve references. Not every feature should use destructive deletion merely to demonstrate CRUD.

## 11. API design

The same-origin API root is `/api/v1`. Most feature routes are under `/api/v1/patients/:patientId`. Account/channel/emergency-recipient routes use the global root. Public `/api/health` checks bounded database reachability; it does not certify workers or provider delivery.

Representative route groups:

| Area | Route families |
| --- | --- |
| Identity | `/auth/csrf`, `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/me`, `/patients`, patient grants. |
| A1 | `/prescriptions`, versions, review/confirm/replacement/history/draft deletion. |
| B1/B2 | Medicine search/cabinet records, label search/selection, information cards and notes. |
| A2/C2 | Schedule preview/confirmation/version actions, occurrences/doses/actions, reminder settings/retries. |
| A3/A4 | `/inventory-items`, cabinet stock/settings/transactions/reconciliation, `/refill-lists`, `/pharmacies`, `/pharmacy-preferences`, collection task. |
| B3/B4 | Ingredient reviews, saved educational questions/answers/feedback/deletion. |
| C1/C3 | Tasks/transitions/handover, channel links, notification state, follow-up settings/records/actions. |
| C4 | `/analytics`, `/health-notes`, `/report-exports` and export content. |
| C5 | Emergency contacts, incidents, hospital search; `/me/emergency-invitations` and `/me/sos-incidents` recipient actions. |

Use `STEP_16_API_CONTRACTS.md`, current route source and the generated route inventory for exact paths/bodies. Historical examples may retain earlier placeholder behavior (for example an old stockSyncStatus example); current feature implementation/tests supersede those examples.

Typical request sequence: obtain CSRF/session, authenticate, choose a patient, fetch current record/revision, send the validated body with CSRF and a new UUID idempotency key, inspect response/error, then reread persisted state. Replaying an ambiguous network result should use its original key/body, not invent another logical action. Mutation errors can include validation, unauthenticated/forbidden, missing reference, stale revision/conflicting idempotency, provider unavailable, expired resource or bounded-rate/size rejection. Exact status and error codes belong to each current contract/test.

## 12. External integrations and workers

| Integration | Purpose | Verified boundary and remaining work |
| --- | --- | --- |
| RxNorm | B1 medicine search/identity candidates | Actual dated provider evidence and controlled tests exist; coverage is incomplete and explicit selection/manual fallback remain necessary. |
| openFDA | B2 label passages, reused by B3/B4 | Dated live source evidence exists; identity applicability and passage gaps remain explicit. It is not universal medicine knowledge. |
| Overpass/OSM | A4 pharmacies; C5 hospital listings | Controlled tests and outage behavior exist. Successful live pharmacy/hospital scenarios remain open in the audited records. |
| Telegram | C1 task notices, C2 reminders, C3 follow-up, C5 contact alerts | C1 actual receipt verified. C2/C3/C5 actual receipt is not established by that test. |
| Tesseract | Local A1 printed-image OCR | Actual engine check exists; this is local processing, not per-member external API credit. |

Provider adapters run server-side except browser OCR. Public-source requests should not include private notes or clinical records. B4 searches already selected source passages rather than transmitting patient questions to a model.

| Process | Start command from root | Responsibility |
| --- | --- | --- |
| API/static frontend | `npm start` | HTTP and MongoDB operations; does not start every background worker. |
| C1 task/channel worker | `npm run worker -w server` | Bot polling/linking and committed task notices. Run only one poller for the bot. |
| C2 worker | `npm run dose-worker -w server` | Due reminder jobs, restart/expiry handling. |
| C3 worker | `npm run followup-worker -w server` | Eligible overdue follow-up creation/processing policy, using C1 notice infrastructure. |
| C5 worker | `npm run sos-worker -w server` | Consent-bound incident alert/closure jobs. |

All workers must share the intended API database and private runtime configuration. A configured token or a healthy webpage is not proof of processing. Unknown provider outcomes require review rather than blind duplicate sends. Normal local helper startup disables Telegram even if credentials were inherited, unless explicitly enabled.

The team bot is **@Medi911_bot**. Private configuration is at `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source\server\.env.telegram.local`. This path may be named; its contents must never be printed, committed or packaged. Existing bot configuration should not be overwritten to follow an older fresh-install example.

## 13. Figma and frontend implementation

Design file: https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB  
Supplied folder: https://www.figma.com/files/team/1698606945457517251/folder/681893704?fuid=1698606944085357049

The refined frames are on page `70:2`. A1 desktop is `70:3`, B1 `106:3168`, C1 `106:3551`; dark/mobile variants are indexed in `FIGMA_MODULE1_UI.md`. The separately named Faraaz/Sahir page was empty at inspection; useful frames were on the shared refinement page.

The latest implementation adds the navy sidebar, active navigation, owner lines, patient selector, gradient summaries, rounded cards/fields, cyan actions, locally bundled fonts and exact capsule/prescription SVG assets. Theme preference persists. Mobile cards stack and nav scrolls; reduced-motion preferences are respected. A native mobile issue where floated account links squeezed the owner line was fixed before the final build.

This is a functional integration rather than an exact copy of all prototype states. Real forms, histories, source attribution, permissions, empty states and validation remain. All 13 feature destinations remain accessible according to permissions. Fake prototype records were not made into apparent live clinical data. A1 retains the working draft editor rather than an upload-only mock, and no PDF OCR was added.

**Coverage:** Module 1 layouts and the common shell were reviewed. Other modules inherit shared styling, but their individual layouts have not all been rebuilt/checked against refined Figma. Fresh full mobile/accessibility/physical-device and performance review of the new shell remains work; older Lighthouse figures describe the older measured page.

## 14. Implementation history

These are milestones, not proof that each student personally completed them. Read each step document for its dated code decisions, commands and evidence.

| Step | Work |
| --- | --- |
| 10 | Initial local setup/connectivity/persistence demonstration. |
| 11 | Acceptance criteria for features. |
| 12 | System request, feasibility, constraints and risks. |
| 13 | Logical design/models. |
| 14 | Detailed Figma/interface submission. |
| 15 | Shared data-model conventions and transaction strategy. |
| 16 | HTTP contracts, permissions, revision/idempotency/error rules. |
| 17 | Initial database-connected authenticated APIs. |
| 18 | Integrated frontend/API/MongoDB verification foundation. |
| 19 | Accounts, profiles, patient discovery and access grants. |
| 20 | Shared request/error/session/offline/permission behavior. |
| 21 | A1 review, confirmation, replacement and history. |
| 22 | B1 external identity selection, manual fallback, filters/archive/history. |
| 23 | C1 transitions/handover/Telegram job infrastructure. |
| 24 | Module 1 connected integration. |
| 25 | A2 confirmed schedules, preview, pause/resume/versioning. |
| 26 | B2 source-linked information and personal notes. |
| 27 | C2 dose actions/reminders/worker. |
| 28 | Timezone, restart, expiry and unknown-outcome audit. |
| 29 | Module 2/deployment preparation; production health/static/topology checks. |
| 30 | A3 ledger/reconciliation/coverage/refill lists. |
| 31 | A4 public pharmacy preferences and collection-task link. |
| 32 | B3 ingredient evidence review. |
| 33 | B4 deterministic source-grounded educational search. |
| 34 | C3 overdue-unconfirmed follow-up. |
| 35 | C4 analytics, notes and private PDF exports. |
| 36 | C5 SOS/contact consent/hospital lookup/simulation; Module 3 rehearsal. |
| 37 | Connected 14-checkpoint synthetic scenario. |
| 38 | Failure/permission audit; confirmed SOS authorization/phone validation fixes. |
| 39 | Actual DevTools/performance observations and focused layout/favicon fixes. |
| 40 | Final documentation/report package from supplied sample structure. |
| 41 | Reproducible Node 24 handover, startup, restart and prepared CI. |
| 42 | Individual viva preparation and isolated reference modifications; no human pass. |
| 43 | Final readiness audit, evidence/source backup and unresolved gate list. |
| Later Module 1 preparation | Assignment-scope checks, focused collections, 62 tests, helper/Newman verification and selected native controls. |
| 21 November Telegram follow-up | Exposed token replaced; actual C1 delivery/receipt and separate acknowledgement verified. |
| 22 November Figma follow-up | Updated Module 1/shared UI, fonts/assets/theme/mobile fix, build/UI checks and focused review supplement. |

There is no required invented Step 44. The next work is closing the actual remaining gates.

## 15. Tests and actual evidence

| Evidence | Actual result | Interpretation |
| --- | --- | --- |
| Step 43 full candidate verification, 21 November | Build, 187 backend tests and compiled UI passed; zero backend failed/skipped. | Dated local controlled-provider baseline, not current hosted CI. |
| Step 43 connected scenario | 14 checkpoints and 81 HTTP exchanges. | Shared synthetic patient/caregiver/contact integration; not all real providers. |
| Module 1 scoped verifier | Build, 62 focused API/provider tests, compiled UI and nine-checkpoint actual RxNorm scenario passed. | Technical Module 1 preparation. |
| Helper/Newman | Sadat 20 requests/30 assertions; Faraaz 23/37; Sahir 41/60; total 84/127, zero failures. | Standalone disposable MongoDB/member-port requests; Telegram disabled. |
| C1 live Telegram, 21 November | Provider accepted, native received notice, separate app acknowledgement. | Actual technical receipt; no inferred C2/C3/C5 receipt or student pass. |
| Latest Figma build/UI, 22 November | `npm run build` and `npm run test:ui` passed after final mobile correction. | Current frontend bundle; no new full backend rerun implied. |
| Latest native visuals | A1/B1 light desktop, B1/C1 dark desktop, C1 light desktop, A1/B1 390px preview; seven saved captures. | Limited screen review, not exhaustive native end-to-end/accessibility. |
| Step 39 Lighthouse | Mobile performance 92, LCP 3.312s, CLS 0.043; desktop 100, LCP 0.688s, CLS 0.018. | Historical local-loopback page/conditions, not latest UI or public deployment performance. Mobile LCP exceeded illustrative 2.5s target. |
| Assignment 03 audit | 59 embedded numbered captures match manifests: 19/16/24. | Historical report evidence; not a new faculty quota. |

Core locations: `docs/evidence/step43/{summary,validation}.json`, `docs/evidence/module1-readiness`, `docs/evidence/module1-telegram`, `docs/evidence/figma-module1-ui/verification.json`, `docs/evidence/step39` and the earlier feature-specific evidence. Native captures and provider observations are not interchangeable with automated test results.

The UI suite uses the production bundle and real MongoDB via a test harness; it is not a native browser automation pass. Test-only session bootstrap or injected clocks do not exist as production auth shortcuts. Each evidence file should retain its actual date, actor, provider mode and runtime.

Prepared CI runs Windows 2022 and Ubuntu 22.04 on Node 24, installs locked workspace/test dependencies and runs `npm run verify`. It intentionally blanks Telegram credentials. Its existence locally is not a green hosted run on this unpublished source.

## 16. Setup and startup

### 16.1 Correct checkout

Use `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`. Do not use an old ZIP extraction or the isolated `Support/Step42_Review/Rehearsal_Source` practice tree as the current app. Device-local `.local-data` references do not travel with a source ZIP.

Initialize every PowerShell terminal on this PC:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$medimateNodeDir = (Get-Content -LiteralPath '.local-data\step41-runtime\selected.txt').Trim()
$env:PATH = $medimateNodeDir + ';' + $env:PATH
$env:MONGOMS_SYSTEM_BINARY = 'C:\Users\jfaar\Documents\Codex\2026-11-01\github-plugin-github-openai-curated-remote\work\mongodb-binaries\mongod-x64-win32-7.0.24.exe'
node --version
```

On a fresh device install a compatible Node 24 and MongoDB, use that device's paths, then:

```powershell
npm ci --include=dev
npm ci --prefix verification/step18
npm run build
```

Do not reinstall just because dependencies already exist. Dependency installation may require network access. MongoDB must support the required replica-set transactions.

### 16.2 Persistent local services

Before starting, check whether these ports/processes are already running. Do not start duplicate MongoDB processes on the same data directory or another Telegram poller.

Terminal 1, MongoDB on 27028:

```powershell
./scripts/local.ps1 -Mode Mongo
```

Terminal 2, initialize the replica set once and start a chosen member server:

```powershell
./scripts/local.ps1 -Mode Initialize
./scripts/local.ps1 -Mode Server -Port 1499
```

Other standalone member servers, each in a separately initialized terminal:

```powershell
./scripts/local.ps1 -Mode Server -Port 1205
./scripts/local.ps1 -Mode Server -Port 1212
```

Open `http://127.0.0.1:1499`, `:1205` or `:1212`. Use the same hostname consistently because cookies/origins matter. The helper creates database names `assignment03_device_1499`, `assignment03_device_1205`, `assignment03_device_1212`. Different ports mean different patient databases under this helper. For a connected team demo choose one port/database and use separate owner/caregiver/contact sessions on that same origin.

At the latest UI task, the persistent project at `http://127.0.0.1:1212` was opened and displayed sign-in; that observation is not a guarantee processes remain alive after shutdown. `/api/health` should report connected before a demo. MongoDB health alone does not prove workers are running.

Optional synthetic seed against the selected running origin:

```powershell
npm run seed:demo -- http://127.0.0.1:1499
```

The seed uses normal APIs, does not reset existing passwords/records, and does not establish real Telegram receipt. Review actual grants before testing caregiver operations.

### 16.3 Telegram-enabled C1

Existing private configuration should be retained. Syntax validation does not send a message or prove receipt:

```powershell
./scripts/local.ps1 -Mode CheckTelegram
./scripts/local.ps1 -Mode Server -Port 1212 -EnableTelegram
```

In another initialized terminal, only if the existing single poller is not already running:

```powershell
./scripts/local.ps1 -Mode TaskWorker -Port 1212 -EnableTelegram
```

The default private file is `server/.env.telegram.local`. C2/C3/C5 workers are separate entrypoints and must be configured with the same exact database/environment as their API; the local PowerShell helper's TaskWorker mode is only C1. Follow the feature-specific operating guide rather than assuming it starts all workers or enables every consent.

### 16.4 Verification commands

```powershell
npm run build
npm run test:api
npm run test:ui
npm run verify
npm run verify:module1
node verification/module1/startup-newman.mjs
```

Choose the command appropriate to a change instead of repeatedly running every suite. The last Windows helper/Newman command requires the sibling `assignment03-tools` dependencies (`npm ci --prefix ../assignment03-tools`) and refuses to take over occupied member ports. Suites create disposable test databases/replicas; distinguish them from persistent demonstration data.

## 17. Postman and report files

### 17.1 Final Assignment 03 reports and full collections

All paths below are under `C:\Users\jfaar\Documents\Codex\MediMate-A3\Members`.

| Member folder | Revised Word report | Final collection | Port | Numbered report captures |
| --- | --- | --- | --- | --- |
| `Ihfaz_Rashid_Sadat` | `MediMate_Assignment03_Ihfaz_Rashid_Sadat_Revised_Final.docx` | `MediMate_Assignment03_Ihfaz_Rashid_Sadat.postman_collection.json` | 1499 | 19 |
| `Faraaz_Jamil_Chowdhury` | `MediMate_Assignment03_Faraaz_Jamil_Chowdhury_Revised_Final.docx` | `MediMate_Assignment03_Faraaz_Jamil_Chowdhury.postman_collection.json` | 1205 | 16 |
| `Sahir_Jawad_Chowdhury` | `MediMate_Assignment03_Sahir_Jawad_Chowdhury_Revised_Final.docx` | `MediMate_Assignment03_Sahir_Jawad_Chowdhury.postman_collection.json` | 1212 | 24 |

These supersede the earlier 19/13/21 plan: final verified counts are 19/16/24, total 59. Sadat's full collection contains both A1 and A2. These reports are Assignment 03 documents, not newly created final-project Word reports. Actual verification/hashes are in `Final_Readiness/Assignment03_Audit.json` and corresponding Step 43 evidence.

### 17.2 Module 1-only collections

Under `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source\postman\module1`:

- `MediMate_Module1_Sadat.postman_collection.json`: A1, 20 requests, 10 numbered captures.
- `MediMate_Module1_Faraaz.postman_collection.json`: B1, 23 requests, 11 numbered captures.
- `MediMate_Module1_Sahir.postman_collection.json`: C1, 41 requests, 14 numbered captures.

The 35 Module 1 capture count is a subset of historical evidence, not the full Assignment 03 count or a newly imposed faculty quota. Run each collection from its first setup request and preserve cookies/CSRF/runtime variables. Do not jump to A1-01 before setup. Check that an active environment does not override `baseUrl`. Capture method/URL, safe body, response and test results; omit cookies, CSRF, secrets and real private records.

Exact member order is in the member walkthroughs and `Postman_Run_Order.csv` in the Module 1 packages. Sahir's automated collection expects Telegram disabled; actual live receipt is separate evidence and should not be mixed into that run.

## 18. Documentation, exports and backups

### 18.1 Main delivery locations

All paths in this subsection are under `C:\Users\jfaar\Documents\Codex\MediMate-A3`.

| Item | Meaning and age boundary |
| --- | --- |
| `Source` | Canonical current working application, including current uncommitted changes. |
| `Members` | Revised Assignment 03 reports, full collections and member evidence. |
| `Final_Documentation/MediMate_Project_Report.md` and `.pdf` | Step 40 editable report and 19-page PDF based on supplied samples; predates later Telegram/UI updates. |
| `Final_Readiness` | Step 43 feature/course gates, audit, source manifest and submission checklist; dated before later follow-ups. |
| `Module1_Submission` | Earlier focused review export. |
| `Module1_Telegram_Verified` | Source/evidence export after C1 real receipt, before latest Figma update. |
| `Figma_Module1_Review` | Latest focused updated files, screenshots/verification and already-applied patch; supplement, not a complete fresh-install source export. |
| `MediMate_Assignment03_Detailed_Handoff.md` | Earlier detailed Assignment 03 handoff. |
| `Support`, `History`, `Recorded_Validation`, `Inventory` | Supporting/dated material; do not assume each is the current runtime checkout. |

### 18.2 Archives

- `MediMate_Step40_Documentation.zip`: dated report/documentation checkpoint.
- `MediMate_Step41_Handover.zip`: dated reproducible handover checkpoint.
- `MediMate_Step42_Viva_Pack.zip`: rehearsal/reference exercises, not student assessment completion.
- `MediMate_Step43_Readiness_Backup.zip`: dated full readiness/source backup.
- `MediMate_Module1_Review_Pack.zip`: earlier Module 1 preparation.
- `MediMate_Module1_Telegram_Verified.zip`: adds actual C1 transport/receipt evidence.
- `MediMate_Figma_Module1_Review.zip`: latest UI supplement with seven native captures and verified already-applied patch.

Preserve old archives and evidence dates. None of the older full source ZIPs automatically contains the latest Figma changes or this handoff. The latest UI patch was reverse-check validated against the current checkout and is based on the preserved Telegram-verified source, not the much older Git HEAD. Do not apply it again to the current checkout.

Before final delivery create a new coherent full-source export after review/tests, with updated report/addendum and a SHA-256 manifest. Exclude `.env`, tokens, `.local-data`, DB files, dependencies, build caches, cookies and real personal data. Preserve necessary lockfiles/example templates and label synthetic test credentials as synthetic. Do not remove old package-builder integrity checks merely to force a new archive after intentional source changes; update the baseline with explicit provenance.

Checksum verification example:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\MediMate_Figma_Module1_Review.zip'
```

A local ZIP/checksum is not an off-device restore. Copy, verify, extract and run on another machine before claiming portability.

## 19. Remaining work and priorities

### Priority 1 — Real assessment and ownership

- [ ] Each student personally demonstrates their allocated features, success/failure/history/access boundaries and persistence.
- [ ] Each explains React → HTTP → Express → MongoDB, validation, source integration and worker behavior.
- [ ] Each performs actual frontend/backend/schema practice or assessed changes and runs affected checks; reference answer patches are not personal evidence.
- [ ] Record real evaluator observations, dates, screenshots/video and student commits/Jira links in the assessment sheets. Module 1's human sheet begins NOT_RUN; Step 42/43 also records unperformed final assessments.
- [ ] Confirm C5's assessed role and any faculty-added functions.

### Priority 2 — Live integration evidence

- [x] C1 actual Telegram notice receipt plus separate app acknowledgement technically verified.
- [ ] Demonstrate Sadat's successful live A4 pharmacy search/selection/collection-task scenario and its failure alternative.
- [ ] Demonstrate Faraaz's own RxNorm/openFDA requests, applicability decision, saved source and outage/manual fallback, despite existing dated technical results.
- [ ] If claiming working live C2 reminders, verify actual consenting recipient receipt, separate action/acknowledgement, expiry and restart behavior.
- [ ] If claiming live C3/C5 alerts, run scoped synthetic tests with explicit consent, actual recipient receipt, cancellation/revocation and safe evidence. Do not assume the C1 test validates them.
- [ ] Verify the required live hospital lookup and clearly retain simulated provider status. Do not test by contacting actual emergency providers.

### Priority 3 — Exact source review, publication and CI

- [ ] Review all preserved uncommitted Assignment 03 and later feature changes with their owners. Do not blindly stage the entire checkout.
- [ ] Make authentic focused commits under the real contributing identities, integrate the branch stack and review a concrete final revision.
- [ ] Run hosted Windows/Linux CI on that exact SHA and address actual failures.
- [ ] Record final PR/revision/workflow links. Historical success does not validate unpublished source.
- [ ] Another member clones that SHA on another machine, installs/builds/tests and demonstrates persistence/restart.

Historical GitHub position from the 21 November audit: main was `21f5053eb6f2111bd28973e6d54ed0a67f1edf37`; draft [PR 14](https://github.com/faraaz1027-cloud/MediMate/pull/14) had Step 31 head `5a920e455a4d7651cc515d34a30206bedad4c49c`. Its [historical successful run](https://github.com/faraaz1027-cloud/MediMate/actions/runs/42128812382) was not a check of later unpublished work. Those remote facts were not refreshed to write this handoff; inspect GitHub before acting on present PR status. No current failing check is assumed.

### Priority 4 — Deployment decision and operation

- [ ] Faculty confirms public deployment requirement or explicitly approves local demonstration.
- [ ] If public hosting is required, provision/configure a transaction-capable MongoDB replica set privately, exact allowed origin, HTTPS and the reviewed source build.
- [ ] Establish reliable separate worker operation. A static frontend or sleeping web service is insufficient evidence of scheduled delivery.
- [ ] Verify deployed authentication, CRUD, persistence, health, restarts, all required worker paths and external provider behavior.
- [ ] Recheck current host terms before committing to a cost/availability claim. No cloud DB or paid always-on arrangement is established here.

Render was prepared as one candidate because same-origin Express/Vite fits the app. The dated hosting analysis identified web sleep/ephemeral storage and no free always-on worker arrangement. These are historical planning facts; current prices/terms must be checked before deployment. No billing commitment is authorized by this handoff.

### Priority 5 — Interface, device and documentation completion

- [ ] Review individual Module 2/3 layouts against relevant Figma, not just the shared theme.
- [ ] Complete native success/error/empty/permission flows, keyboard/focus/accessibility and physical-device checks across required screens.
- [ ] Measure performance of the new UI; retain earlier scores as historical and address material mobile delays.
- [ ] Confirm whether faculty needs fresh current-UI or Telegram receipt screenshots; capture safe views where required.
- [ ] Update report/addendum and screenshot references with actual later Telegram/UI/revision evidence. Keep older observed claims dated.
- [ ] Record genuine user/usability feedback if faculty requires it; none is established by the feasibility proposal.

### Priority 6 — Final logistics and package

- [ ] Obtain actual deadline/timezone, portal, rubric, file formats/naming and report-template requirements.
- [ ] Confirm whether the prepared PDF/Markdown is accepted or a new final-project Word report is required.
- [ ] Build one consistent current submission export, verify source/evidence/collections/lockfiles, checksum and off-device restore.
- [ ] Upload through the confirmed channel and record the actual receipt/time/link.

There is no truthful single number of remaining numbered implementation steps: Step 43 is already the audit milestone. The open items above are acceptance tasks with distinct owners and evidence requirements.

## 20. Demonstration and submission procedure

1. Confirm the exact checkout/revision, build and database. Use synthetic patient, caregiver and contact accounts on one shared origin for the connected scenario.
2. Faraaz demonstrates B1 search, explicit candidate/manual entry, filters, editing/archive and history. Sadat demonstrates A1 OCR/manual review, ambiguity, draft-only deletion, confirmation/replacement. Sahir demonstrates C1 assignment, transitions, author-only handover controls and truthful channel states.
3. Sadat demonstrates A2 complete preview, confirmation, effective pause and retained events. Faraaz demonstrates B2 source selection, citations and separate personal notes. Sahir demonstrates C2 taken/skipped/snooze/correction, duplicate replay and configured delivery evidence if available.
4. Demonstrate A3 stock/ledger/refill reconciliation; A4 chosen listing and linked task; B3 overlap/insufficient evidence; B4 supported quote and abstention; C3 follow-up without invented skipped status; C4 matching analytics/PDF; C5 explicit contact consent, location denial, activation/acknowledgement/closure and obvious simulation.
5. Reload and restart services to prove persisted IDs/state. Show invalid input, denied/revoked permission and provider outage cases.
6. Each student explains and modifies their own code. Record actual results rather than copying prepared answers into a pass sheet.
7. Review/publish the final SHA, hosted CI, second-machine run, faculty requirements and final package before submission.

The prepared walkthroughs and capture CSVs supply request-level order. This suggested team sequence is not an invented faculty time limit or marking rubric.

## 21. Known limitations and troubleshooting

| Symptom or risk | Check/action |
| --- | --- |
| Old UI after a build | Confirm canonical checkout/origin, rebuild and Ctrl+F5. Old source ZIPs predate the refined UI. |
| Blank/missing built frontend | Run the root build and check `client/dist/index.html`; default local helper requires it. |
| Node/Vite tool failure | Use the selected verified Node 24 runtime in that terminal; shell PATH changes are per process. |
| MongoDB reachable but transactions fail | Start/init the intended replica set, not standalone MongoDB. Check selected URI/database. |
| Member cannot see another's data | Different helper ports use different DBs. Connected team work needs one origin/database and appropriate grants. |
| Caregiver buttons absent or requests forbidden | Verify active patient grants and the current actor; do not bypass authorization to make a demo pass. |
| Stale revision/conflict | Refresh the record and review changes before resubmitting. Do not blindly increment revisions. |
| Reminder not delivered | Check dedicated worker, same DB, consent, channel link, configuration, due/expiry window and attempt state. API health is insufficient. |
| Telegram poll conflict | Ensure only one bot poller; inspect bot ownership/webhook arrangement before changes. Do not run duplicate workers blindly. |
| Disabled notification | Default local startup deliberately disables Telegram. Enable only the intended consenting test arrangement. |
| Unknown send outcome | Do not blindly resend; inspect state/history and current eligibility. Accepted/in-flight messages cannot be recalled by revocation. |
| No RxNorm/openFDA result | Use explicit manual/unavailable path; do not infer identity or invent evidence. |
| Overpass unavailable | Show the actual outage/empty state, retry within policy; do not display a fixture as a live result. |
| OCR poor or first use slow | Printed English PNG/JPEG only; engine/language download and image quality matter. Review/correct or use manual entry. |
| B4 refuses a question | It intentionally supports narrow label-section questions and abstains otherwise; it is not general chat. |
| PDF expired/too large/unsupported glyph | Regenerate within documented bounds or resolve content/font support; do not claim a partial/corrupted file is complete. |
| SOS displays no dispatch | Correct behavior: provider simulation is not real ambulance dispatch. |
| Package builder rejects changed hashes | Preserve dated baseline; prepare a new reviewed manifest/version rather than deleting integrity checks. |

No audit establishes clinical safety, regulatory approval, production hardening, universal medicine coverage, guaranteed delivery, complete accessibility or a real emergency partnership. Those are substantive limits of the prototype, not missing screenshot decorations.

## 22. Continuation instructions and reference index

For a future assistant or team member:

1. Read this file, `CODEX_LAB_INSTRUCTIONS.md`, `REQUIREMENTS.md`, `STEP_43_SUBMISSION_CHECKLIST.md`, `MODULE_1_TELEGRAM_DELIVERY.md` and `FIGMA_MODULE1_UI.md`.
2. Inspect current `git status`, branch, files and runtime before edits. Preserve existing uncommitted work and private configuration; do not reset/reinitialize the repository.
3. Identify the next concrete open gate and its authorization/dependencies. Do useful authorized preparation; ask only for genuinely missing faculty/account information.
4. Review source/contracts/tests relevant to the change. Keep ownership/scope stable and explain technical adaptations.
5. Run meaningful affected checks; label exact provider mode, actor/date/runtime and result. Do not turn earlier green runs into current blanket claims.
6. Update focused evidence/docs and prepare reviewable changes. Never manufacture student commits, evaluation passes, partner dispatch or submission receipts.
7. Export a new dated package when justified, preserving older checkpoints and excluding secrets/private data.

### Primary reference map

| Subject | Canonical reference under Source/docs |
| --- | --- |
| Course interpretation | `CODEX_LAB_INSTRUCTIONS.md` |
| Feature allocation/criteria | `REQUIREMENTS.md`, `STEP_11_ACCEPTANCE.md` |
| Planned sequence | `CODEX_ROADMAP_AFTER_STEP_18.md` |
| Problem/feasibility | `STEP_12_SYSTEM_REQUEST_FEASIBILITY.md` |
| Architecture/data/API | `STEP_13_DESIGN_MODELS.md`, `STEP_15_DATA_MODEL.md`, `STEP_16_API_CONTRACTS.md` |
| Original design submission | `STEP_14_DESIGN_SUBMISSION.md` |
| Feature implementation | `STEP_19_*` through `STEP_36_*`, as listed in generated inventory |
| Integration/failures | `STEP_37_COMPLETE_SCENARIO.md`, `STEP_38_FAILURE_PERMISSION_AUDIT.md` |
| Measured performance | `STEP_39_BROWSER_PERFORMANCE.md` |
| Report/setup/viva | `STEP_40_FINAL_DOCUMENTATION.md`, `STEP_41_REPRODUCIBLE_HANDOVER.md`, `STEP_42_INDIVIDUAL_VIVA.md` |
| Final open gates | `STEP_43_FINAL_READINESS.md`, `STEP_43_SUBMISSION_CHECKLIST.md` |
| Module 1 practical guide | `MODULE_1_SUBMISSION_GUIDE.md`, `module1` member sheets |
| Superseding live result | `MODULE_1_TELEGRAM_DELIVERY.md`, `evidence/module1-telegram` |
| Superseding UI result | `FIGMA_MODULE1_UI.md`, `evidence/figma-module1-ui` |

This handoff is also copied to the delivery root as `MediMate_Complete_Project_Handoff.md` for sharing. Both copies describe the same dated snapshot. Future updates should synchronize the copies and preserve the difference between implementation, technical proof and course acceptance.

## 23. Generated source inventory

The following appendices are generated from the checked-out files when this handoff is assembled. They list actual code/document locations and route declarations, not observed production records or live service status.


### 23.1 Actual frontend and backend source files

**client/src**

```text
AccountAccess.jsx
App.css
App.jsx
ConfirmAction.jsx
DoseBoard.jsx
EducationalAssistant.jsx
EmergencyInbox.jsx
FollowupBoard.jsx
IngredientReview.jsx
InventoryBoard.jsx
MedicineCabinet.jsx
MedicineInformation.jsx
PharmacyCoordination.jsx
PrescriptionReview.jsx
ScheduleBuilder.jsx
SosBoard.jsx
TaskBoard.jsx
ValidatedForm.jsx
VisitReports.jsx
figma.css
index.css
main.jsx
request.js
style.css
```

**server**

```text
dose-worker.js
followup-worker.js
http-app.js
index.js
runtime-config.js
sos-worker.js
worker.js
```

**server/v1**

```text
app.js
cabinet.js
channels.js
doseReminders.js
doses.js
educational-answers.js
followup-policy.js
followup-worker.js
followups.js
information-cards.js
ingredient-reviews.js
inventory.js
openfda.js
overpass.js
pharmacies.js
prescriptions.js
report-pdf.js
reports.js
rxnorm.js
schedule-time.js
schedules.js
sos-worker.js
sos.js
stockLedger.js
store.js
taskNotifications.js
tasks.js
telegram.js
```

### 23.2 Implemented model names

Names below are extracted from model declarations in `server/v1/store.js`; Mongoose collection naming and exact field/index definitions remain in that source.

```text
AccessGrant
Acknowledgement
AuditEvent
CabinetItem
CabinetRevision
ChannelChallenge
ChannelLink
DoseAction
DoseFollowup
DoseOccurrence
DoseReminderAttempt
DoseReminderJob
DoseReminderSettings
EducationalAnswer
EmergencyContact
FollowupSettings
HealthNote
HealthNoteRevision
IngredientConfirmation
IngredientReview
InventorySettings
MedicineCard
NotificationAttempt
NotificationJob
Operation
Patient
PharmacyPreference
Prescription
PrescriptionInstruction
PrescriptionVersion
RefillList
ReportExport
Schedule
SchedulePreview
ScheduleVersion
Session
SosAcknowledgement
SosAttempt
SosEvent
SosIncident
SosJob
SosProviderRequest
SourceRecord
StockTransaction
Task
TaskEvent
TaskNote
TelegramReceipt
User
WorkerState
```

### 23.3 Literal route declarations

This source index records literal method/path declarations, including multiline declarations. `patient` routes inherit `/api/v1/patients/:patientId`; global `app` routes in the v1 router inherit `/api/v1`. Root HTTP routes have their own mount. This is a navigation aid, not a replacement for middleware/permission checks or request schemas. Dynamic/generated route patterns may require reading the source.

**server/http-app.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| app | GET | `/api/health` | 15 |

**server/v1/app.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| app | GET | `/auth/csrf` | 226 |
| app | POST | `/auth/register` | 231 |
| app | POST | `/auth/login` | 270 |
| app | POST | `/auth/logout` | 288 |
| app | GET | `/auth/me` | 316 |
| app | PATCH | `/me` | 348 |
| app | POST | `/patients` | 358 |
| patient | GET | `/` | 393 |
| patient | PATCH | `/` | 468 |
| patient | GET | `/access-grants` | 479 |
| patient | PATCH | `/access-grants/:grantId` | 486 |
| patient | POST | `/access-grants` | 500 |
| patient | POST | `/access-grants/:grantId/revoke` | 533 |
| patient | GET | `/` | 594 |

**server/v1/cabinet.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/medicine-search` | 109 |
| patient | GET | `/medicine-search/:externalId` | 156 |
| patient | GET | `/cabinet-items` | 167 |
| patient | GET | `/cabinet-items/:itemId` | 199 |
| patient | POST | `/cabinet-items` | 214 |
| patient | PATCH | `/cabinet-items/:itemId` | 294 |
| patient | POST | `/cabinet-items/:itemId/archive` | 372 |
| patient | DELETE | `/cabinet-items/:itemId` | 420 |
| patient | GET | `/cabinet-items/:itemId/revisions` | 440 |

**server/v1/channels.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| app | GET | `/me/channel-links` | 19 |
| app | POST | `/me/channel-link-challenges` | 58 |
| app | POST | `/me/channel-link-challenges/:challengeId/confirm` | 131 |
| app | DELETE | `/me/channel-links/:linkId` | 212 |

**server/v1/doses.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | POST | `/doses/:doseId/actions` | 321 |
| patient | POST | `/doses/:doseId/snoozes` | 327 |
| patient | POST | `/doses/:doseId/corrections` | 333 |
| patient | GET | `/doses` | 339 |
| patient | GET | `/doses/:doseId` | 475 |
| patient | GET | `/doses/:doseId/actions` | 494 |
| patient | GET | `/doses/:doseId/reminders` | 504 |
| patient | GET | `/dose-reminder-settings` | 536 |
| patient | PUT | `/dose-reminder-settings` | 544 |
| patient | POST | `/doses/:doseId/reminders/:jobId/retry` | 613 |

**server/v1/educational-answers.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | POST | `/educational-answers` | 29 |
| patient | GET | `/educational-answers` | 54 |
| patient | GET | `/educational-answers/:answerId` | 61 |
| patient | PATCH | `/educational-answers/:answerId/feedback` | 65 |
| patient | DELETE | `/educational-answers/:answerId` | 74 |

**server/v1/followups.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/followup-settings` | 7 |
| patient | PUT | `/followup-settings` | 16 |
| patient | GET | `/followups` | 36 |
| patient | GET | `/followups/:followupId` | 45 |
| patient | POST | `/followups/:followupId/` | 52 |

**server/v1/information-cards.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/cabinet-items/:itemId/label-candidates` | 105 |
| patient | GET | `/cabinet-items/:itemId/information-card` | 180 |
| patient | PUT | `/cabinet-items/:itemId/information-card` | 193 |
| patient | PATCH | `/cabinet-items/:itemId/information-card/note` | 332 |

**server/v1/ingredient-reviews.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/cabinet-items/:itemId/ingredient-candidates` | 30 |
| patient | GET | `/cabinet-items/:itemId/ingredient-confirmation` | 31 |
| patient | PUT | `/cabinet-items/:itemId/ingredient-confirmation` | 35 |
| patient | POST | `/ingredient-reviews` | 56 |
| patient | GET | `/ingredient-reviews` | 90 |
| patient | GET | `/ingredient-reviews/:reviewId` | 97 |
| patient | POST | `/ingredient-reviews/:reviewId/acknowledge` | 102 |

**server/v1/inventory.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/inventory-items` | 196 |
| patient | GET | `/cabinet-items/:itemId/stock` | 211 |
| patient | GET | `/cabinet-items/:itemId/stock-reconciliation` | 237 |
| patient | GET | `/cabinet-items/:itemId/stock-transactions` | 250 |
| patient | PUT | `/cabinet-items/:itemId/inventory-settings` | 263 |
| patient | POST | `/cabinet-items/:itemId/stock-transactions` | 319 |
| patient | POST | `/cabinet-items/:itemId/stock-reconciliation/:doseId` | 385 |
| patient | GET | `/refill-lists` | 463 |
| patient | POST | `/refill-lists` | 478 |
| patient | PATCH | `/refill-lists/:listId/items/:entryId` | 648 |
| patient | POST | `/refill-lists/:listId/complete` | 654 |

**server/v1/pharmacies.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/pharmacies` | 87 |
| patient | GET | `/pharmacy-preferences` | 129 |
| patient | POST | `/pharmacy-preferences` | 140 |
| patient | POST | `/refill-lists/:listId/collection-task` | 204 |

**server/v1/prescriptions.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | POST | `/prescriptions` | 250 |
| patient | GET | `/prescriptions/:prescriptionId` | 297 |
| patient | POST | `/prescriptions/:prescriptionId/versions` | 316 |
| patient | DELETE | `/prescriptions/:prescriptionId/versions/:versionId` | 373 |
| patient | PATCH | `/prescriptions/:prescriptionId/versions/:versionId` | 396 |
| patient | POST | `/prescriptions/:prescriptionId/versions/:versionId/confirm` | 462 |
| patient | GET | `/prescriptions/:prescriptionId/versions` | 549 |
| patient | GET | `/prescriptions/:prescriptionId/comparison` | 604 |
| patient | POST | `/prescriptions/:prescriptionId/archive` | 642 |

**server/v1/reports.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/analytics` | 71 |
| patient | GET | `/health-notes` | 76 |
| patient | POST | `/health-notes` | 81 |
| patient | PATCH | `/health-notes/:noteId` | 91 |
| patient | POST | `/report-exports` | 102 |
| patient | GET | `/report-exports` | 113 |
| patient | GET | `/report-exports/:reportId` | 120 |
| patient | GET | `/report-exports/:reportId/content` | 123 |

**server/v1/schedules.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | POST | `/schedule-previews` | 193 |
| patient | POST | `/schedules` | 343 |
| patient | POST | `/schedules/:scheduleId/versions` | 391 |
| patient | POST | `/schedules/:scheduleId/pause` | 444 |
| patient | POST | `/schedules/:scheduleId/resume` | 490 |
| patient | GET | `/schedules` | 616 |
| patient | GET | `/schedules/:scheduleId` | 634 |
| patient | GET | `/schedules/:scheduleId/versions` | 647 |
| patient | GET | `/schedules/:scheduleId/occurrences` | 659 |

**server/v1/sos.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/emergency-contacts` | 13 |
| patient | POST | `/emergency-contacts` | 14 |
| patient | PATCH | `/emergency-contacts/:contactId` | 29 |
| patient | POST | `/emergency-contacts/:contactId/revoke` | 34 |
| patient | POST | `/sos-incidents` | 38 |
| patient | GET | `/sos-incidents` | 61 |
| patient | GET | `/sos-incidents/:incidentId` | 65 |
| patient | POST | `/sos-incidents/:incidentId/` | 69 |
| patient | POST | `/sos-incidents/:incidentId/provider-requests` | 86 |
| patient | POST | `/sos-incidents/:incidentId/jobs/:jobId/retry` | 91 |
| patient | GET | `/hospitals` | 95 |
| app | GET | `/me/emergency-invitations` | 101 |
| app | POST | `/me/emergency-invitations/:contactId/respond` | 104 |
| app | GET | `/me/sos-incidents` | 109 |
| app | POST | `/me/sos-incidents/:incidentId/acknowledge` | 114 |

**server/v1/tasks.js**

| Router | Method | Declared path | Source line |
| --- | --- | --- | --- |
| patient | GET | `/task-assignees` | 21 |
| patient | GET | `/tasks` | 183 |
| patient | GET | `/tasks/:taskId` | 206 |
| patient | POST | `/tasks` | 212 |
| patient | PATCH | `/tasks/:taskId` | 241 |
| patient | POST | `/tasks/:taskId/transitions` | 318 |
| patient | POST | `/tasks/:taskId/notes` | 392 |
| patient | GET | `/tasks/:taskId/notes` | 416 |
| patient | POST | `/tasks/:taskId/acknowledgements` | 454 |
| patient | GET | `/tasks/:taskId/history` | 506 |
| patient | GET | `/tasks/:taskId/notifications` | 519 |
| patient | POST | `/tasks/:taskId/notifications/:jobId/retry` | 569 |

### 23.4 Actual backend test files

```text
api.test.js
cabinet.test.js
deployment.test.js
dose-worker-cli.test.js
doses.test.js
educational-answers.test.js
end-to-end.test.js
failure-audit.test.js
followups.test.js
handover.test.js
hospitals.test.js
information-cards.test.js
ingredient-reviews.test.js
inventory.test.js
local-telegram.test.js
module1.test.js
module2.test.js
openfda.test.js
pharmacies.test.js
prescriptions.test.js
reports.test.js
rxnorm.test.js
schedules.test.js
sos.test.js
tasks.test.js
telegram.test.js
timezone-restarts.test.js
```

### 23.5 Top level project guides

```text
CODEX_LAB_INSTRUCTIONS.md
CODEX_ROADMAP_AFTER_STEP_18.md
DEVELOPMENT_CHECKLIST.md
FIGMA_MODULE1_UI.md
MEDIMATE_COMPLETE_PROJECT_HANDOFF.md
MODULE_1_PREPARATION_PROGRESS.md
MODULE_1_SUBMISSION_GUIDE.md
MODULE_1_TELEGRAM_DELIVERY.md
MODULE_1_TELEGRAM_PROGRESS.md
REQUIREMENTS.md
STEP_10_SETUP.md
STEP_11_ACCEPTANCE.md
STEP_12_SYSTEM_REQUEST_FEASIBILITY.md
STEP_13_DESIGN_MODELS.md
STEP_14_DESIGN_SUBMISSION.md
STEP_15_DATA_MODEL.md
STEP_16_API_CONTRACTS.md
STEP_17_API_IMPLEMENTATION.md
STEP_18_FRONTEND_INTEGRATION.md
STEP_19_ACCOUNT_ACCESS.md
STEP_20_SHARED_BEHAVIOR.md
STEP_21_PRESCRIPTION_REVIEW.md
STEP_22_MEDICINE_CABINET.md
STEP_23_CAREGIVER_TASKS.md
STEP_24_MODULE_1_INTEGRATION.md
STEP_25_CONFIRMED_SCHEDULES.md
STEP_26_MEDICINE_INFORMATION.md
STEP_27_DOSE_REMINDERS.md
STEP_28_TIMEZONE_RESTARTS.md
STEP_29_DEPLOYMENT_MODULE2.md
STEP_30_INVENTORY_REFILLS.md
STEP_31_PHARMACY_COORDINATION.md
STEP_32_INGREDIENT_REVIEW.md
STEP_33_EDUCATIONAL_ASSISTANT.md
STEP_34_DOSE_FOLLOWUPS.md
STEP_35_VISIT_REPORTS.md
STEP_36_SOS_MODULE3.md
STEP_37_COMPLETE_SCENARIO.md
STEP_38_FAILURE_PERMISSION_AUDIT.md
STEP_39_BROWSER_PERFORMANCE.md
STEP_40_FINAL_DOCUMENTATION.md
STEP_41_REPRODUCIBLE_HANDOVER.md
STEP_42_INDIVIDUAL_VIVA.md
STEP_43_FINAL_READINESS.md
STEP_43_SUBMISSION_CHECKLIST.md
```

### 23.6 Documentation snapshot metadata

- Local branch observed: `feature/figma-module1-ui`.
- HEAD observed: `5a920e455a4d7651cc515d34a30206bedad4c49c`; the checkout includes substantial uncommitted/untracked work, so this SHA alone does not identify the complete delivered source.
- Literal route declarations indexed: 127.
- Assembly date: 22 November 2026, Asia/Dhaka.
- This handoff contains no private environment contents, bot token, session cookie or one-time linking code.
