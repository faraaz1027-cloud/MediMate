# MediMate execution roadmap after Step 18

**Status at handoff (1 November 2026):** The repository checklist marks Steps 14–18 design, data/API contract, six database-connected APIs and their React integration as prepared/implemented subsets. This is **not** a claim that all 13 feature workflows or the external integrations are complete. Read the current code and `docs/DEVELOPMENT_CHECKLIST.md` before updating status. Steps 1–18 are not repeated here.

**Read first:** [lab instructions](CODEX_LAB_INSTRUCTIONS.md), [requirements](REQUIREMENTS.md), [acceptance criteria](STEP_11_ACCEPTANCE.md), [design](STEP_13_DESIGN_MODELS.md), [data model](STEP_15_DATA_MODEL.md), [API contracts](STEP_16_API_CONTRACTS.md), [Step 17 proof](STEP_17_API_IMPLEMENTATION.md), [Step 18 UI](STEP_18_FRONTEND_INTEGRATION.md). The original 43-step plan names Steps 19–43 below. It predates the added C5, so this roadmap explicitly includes SOS in Module 3 and final checks.

## Operating rules for Codex

- **Freedom to change:** Improve technical design, endpoint shape, schema, UI or step order when actual code, tests or constraints justify it. State the reason and migration impact in the PR; update contracts, docs and tests together. If a proposed change affects feature scope, ownership, faculty requirement, zero-cash constraint or a real emergency integration, surface it for team/faculty decision rather than silently substituting it.
- **Lab compliance:** Each person needs four demonstrable features, at least one external API integration and individual commits. C5 is a fifth Sahir feature. Login/profile/admin are shared workflows. Real CRUD and a database are mandatory; responsive UI and ability to explain/modify code in the viva matter. AI supplies partial implementation/debugging support; owners must understand, review and contribute their code.
- **One step at a time:** Check current repo status and uncommitted work; create a scoped branch/PR; implement a vertical slice; run relevant tests and inspect the rendered UI; document real evidence; update the checklist only for verified outcomes. Preserve other members' changes.
- **Medical/SOS boundaries:** Use synthetic data; require human review of OCR and ambiguity; never infer a missed dose from lack of response; distinguish sent/acknowledged/acted; simulated hospital is visibly labelled and cannot imply dispatch. Do not contact real emergency services in tests.

## Shared foundation and Module 1

### Step 19 — Complete account and access workflows
Implementation update (1 November 2026): the [shared local slice](STEP_19_ACCOUNT_ACCESS.md) adds editable account/patient profiles, owner-administered direct grants to registered caregiver IDs, named permissions and revoke/restore. API, DOM, Postman and browser evidence are recorded. Email/pending invitations, scale pagination and comprehensive accessibility remain explicitly open; no faculty submission or individual feature credit is claimed. Technical decisions and contracts are documented alongside the implementation.

Build signup/login/logout, profile and patient profile selection, invitation/grant/revocation of caregiver access, roles and any necessary admin path. Reconcile with Step 17's existing session/CSRF/authorization code rather than duplicating it. Specify who may confirm a prescription, edit tasks, record a dose and view an SOS. Persist grants and audit state; enforce permission on every server read/write, including a previously authorized caregiver after revocation. Test another patient's ID, expired session, CSRF failure and grant revocation. **Evidence:** working UI/API, DB records and access tests. These are shared infrastructure, not assessed A/B/C features.

### Step 20 — Finish shared UI/backend behavior
Implementation update (1 November 2026): [shared behavior and evidence](STEP_20_SHARED_BEHAVIOR.md) records reconnect/retry, field-associated validation, permission-aware navigation, stale-response guards and desktop/mobile/keyboard/controlled-fault checks. This is shared infrastructure, not a claim that later feature screens or a comprehensive accessibility/performance audit are complete.

Extend Step 18 React screens with navigation, form field validation, loading/empty/error states, mobile responsiveness and accessible labels. Normalize API errors and protect patient routes server-side. Avoid full-page generated templates that owners cannot explain. Test keyboard navigation, small viewport, slow request and stale session. **Evidence:** screenshots of real states and a passing build.

### Step 21 — A1 prescription import, review and change tracking (Ihfaz)
Implementation update (2 November 2026): [implemented A1 scope, technical decision, owner review and evidence](STEP_21_PRESCRIPTION_REVIEW.md) covers manual/printed-image OCR drafts, explicit completeness/review gates, immutable confirmed history, replacement differences and archive. API, DOM, Postman and real Chromium cases passed. Browser-local OCR replaces the earlier proposed server asset/job contract; it is not external API course credit. Individual ownership review and Module 1 integration remain open.

Implement manual prescription draft first; add printed-image OCR as editable suggestions. Confirm only complete, reviewed instructions; retain immutable confirmed versions and field-level differences on replacement. Verify a confirmed version persists after reload and past versions remain accessible. Test blurry image, missing quantity, duplicate submission and unauthorized access. **Dependency:** Step 19 permissions and Step 15 version model. **Demo:** upload or enter → correct → confirm → replace → compare.

### Step 22 — B1 medicine search and personal cabinet (Faraaz)
Implementation update (2 November 2026): [B1 implementation and lab evidence](STEP_22_MEDICINE_CABINET.md) covers live RxNorm search/explicit candidate review, labelled manual fallback, persistent cabinet details/edit/filter/archive and immutable source/revision history. API/provider, DOM, Newman and real Chromium checks passed. Faraaz's personal contribution/live-edit review, faculty acceptance and Module 1 integration remain open.

Integrate RxNorm as a **live external API** with search result IDs, selectable candidate and an honest manual entry fallback for unmatched Bangladesh products. Store source/manual status, strength/form and patient ownership; support view, edit, filter and archive while preserving referenced history. Test outage, ambiguous match, invalid input and cross-patient request. **Demo:** external search → save → reload → edit/archive; show manual fallback.

### Step 23 — C1 caregiver tasks and handover (Sahir)
Implement create/assign/accept/complete/reopen task transitions, handover notes and status history. Link consenting test Telegram account, send task notice and record delivery attempts separately from acknowledgement. Test invalid transition, revoked caregiver, failed notification and duplicate retry. **Demo:** patient assigns, caregiver accepts/completes, patient sees history and a linked test account receives a notification.

### Step 24 — Integrate and demonstrate Module 1
Use one synthetic patient and real shared identifiers across A1/B1/C1. Run manual and OCR review, cabinet and caregiver task flows in the same application. Record screen/API/database evidence, failure handling, each member's own commits and Jira status. Recheck permissions and persistence after integration. Rehearse each member's explanation and live edit. **Gate:** A1/B1/C1 meet Step 11 acceptance checks; no disconnected mock data is presented as working CRUD.

## Module 2

### Step 25 — A2 verified medication schedule (Ihfaz)
Use **confirmed** A1 instructions. Keep medicine strength, quantity per dose, time, interval, duration and timezone distinct; preview and confirm a schedule version, edit/pause future events without erasing past events. Reject ambiguous input until clarified. Test day boundaries, changes after prior events and duplicate event generation. **Gate:** persisted schedule and reproducible upcoming dose events.

### Step 26 — B2 source-linked medicine information cards (Faraaz)
Use the planned openFDA integration to retrieve a relevant label and display source link/identifier, retrieval date and the original relevant passage. Store personal notes separately from source facts. Confirm product/ingredient applicability; show unavailable when no valid label exists. Test source outage and a wrong candidate. **Gate:** cited passage in UI corresponds to a real source response.

### Step 27 — C2 reminders and dose recording (Sahir)
Use A2 occurrences, send reminders and record taken/skipped/snoozed actions. Store notification attempts and dose status as separate objects; repeated action must not create a second effective record. Snooze affects the notification timing, not the prescribed schedule. Test all three actions and a failed channel. **Gate:** accurate, persistent dose history and no double action.

### Step 28 — Timezone and restart behavior
Persist due events and processing state. Test Asia/Dhaka date boundary, schedule edits, worker restart, delayed execution, duplicate retry and a notification outage. Define whether overdue reminders are delivered late or marked missed according to recorded time, without inventing a taken/skipped dose. **Gate:** a restart cannot silently lose an event or generate duplicate dose/stock effects. Record process availability limits.

### Step 29 — Deployment and Module 2 demonstration
Confirm faculty's online requirement. The Lab 06 Vercel example deploys a web application, but this system also needs API, DB and scheduled worker. Choose an arrangement with verified current terms under the team's zero-cash rule; if no viable always-on free worker exists, document the limitation and obtain faculty acceptance of the demonstration mode. Set environment variables privately; test frontend, backend, database and reminder behavior at deployed URL, then regression-test Module 1. **Gate:** working online or faculty-approved alternative, actual URL and evidence; avoid claiming deployment from a static frontend alone.

## Module 3, including extra C5

### Step 30 — A3 inventory and refill (Ihfaz)
Add opening stock, refill and correction ledger entries. Link a confirmed C2 taken action to exactly one stock deduction using a domain unique key and atomic update/transaction strategy; corrections must be auditable. Compute remaining coverage from current confirmed schedule only when units and dose quantities are known. Test duplicate action, concurrent requests, invalid quantity and schedule change. **Gate:** balance reconciles with ledger and refill threshold creates a checklist.

### Step 31 — A4 pharmacy search and coordination (Ihfaz)
Use live Overpass lookup for nearby pharmacy listings and explicit location/manual-area fallback. Save preferred listing and link refill checklist to C1 collection task. Keep retrieved contact/location provenance and timestamp. Test denied location, no results, timeout and stale listing. **Gate:** no wording implying medicine stock or ambulance service is verified by a map listing.

### Step 32 — B3 duplicate ingredient and label review (Faraaz)
Compare confirmed ingredient identities, including combination products, across cabinet items. Distinguish overlap, relevant label evidence and insufficient information, with source passages and acknowledgement notes. Test aliases, duplicates, missing ingredient, wrong strength/form and source outage. **Gate:** insufficient evidence cannot be interpreted as a safe result.

### Step 33 — B4 source-grounded educational assistant (Faraaz)
Choose a feasible local or no-cost grounded approach and test it on known passages before integrating. Retrieve relevant sources, cite passage/URL and retrieval date, constrain response to educational content, abstain when evidence is missing and allow feedback/deletion. A model is optional if a transparent source search/answer workflow meets the approved function. Test invented question, contradictory/absent passages and personal treatment request. **Gate:** answers match their cited passages; no invented citations or prescribing decision.

### Step 34 — C3 unconfirmed-dose follow-up (Sahir)
After the configured delay, mark unanswered C2 occurrence **overdue-unconfirmed**, notify active authorized caregiver and track attempts, acknowledgement and follow-up outcome. Prevent duplicate escalation, cease future notices after resolution/revocation, and never relabel silence as skipped. Test worker restart and revoked caregiver. **Gate:** one traceable escalation with correct status transitions.

### Step 35 — C4 analytics and visit report (Sahir)
Compute date-filtered taken/skipped/unconfirmed values from stored events, add visit/health notes and generate a PDF that includes history, refills and caregiver activity as permitted. Check report patient and range authorization, compare on-screen/PDF numbers to DB fixtures and define zero versus unavailable. **Gate:** report can be regenerated accurately from a known synthetic dataset.

### Step 36 — Module 3 and C5 demonstration (Sahir)
The original step named six Module 3 features. The revised demo includes **seven**: A3/A4, B3/B4, C3/C4 and C5. Build C5 before this gate: contact setup/linking, deliberate SOS activation, incident record, permitted location or unavailable marker, Telegram alert attempts, contact acknowledgements, cancellation/resolution notice, call option and nearby hospital information. Only send provider requests to a verified participant; otherwise use an unmistakably labelled simulated provider dashboard. Test accidental cancellation, denied location, failed Telegram, repeated press and no confirmation. **Gate:** no "ambulance dispatched" state without explicit provider confirmation. Also demonstrate taken → one stock deduction → low stock → pharmacy listing → caregiver collection task.

## Final verification and delivery

### Step 37 — Complete end-to-end scenario
Create a synthetic patient, caregiver and linked test contact. Execute A1 → B1/B2 → A2 → C2 → A3/A4 → C1/C3 → B3/B4 → C4 and a separate C5 branch. Record the input, expected state, actual state and evidence link at each point. Use real DB records, not hardcoded screen fixtures.

### Step 38 — Failure and permission tests
Exercise cross-patient IDs, revoked grant, expired session/CSRF, duplicate clicks, concurrent stock updates, blurry OCR, unmatched RxNorm item, openFDA/Overpass/Telegram outages, backend restart, historical versions and SOS status boundaries. Fix concrete failures; record any accepted limitations. Avoid tests that alert real emergency providers.

### Step 39 — Chrome DevTools and measured performance
Use the Lab 02 procedure on MediMate: Elements/Console/Network Fetch/XHR headers and responses, slow-network throttling, empty-cache reload, Performance, Lighthouse and mobile viewports. Record device, date, connection, page, number of requests, load/response timings, LCP/CLS where available and actual improvements. Compare before/after if changed. Do not copy sample report scores or fabricate metrics.

### Step 40 — Final documentation package
Write the report using the Lab 07 **sample structure**, with MediMate facts only: system request and feasibility; approved functional requirements and ownership; architecture/data/API; Figma and implementation; user manual with real synthetic screenshots; Postman evidence; observed network/performance analysis; repository/deployment links; contributions; limitations and references. Check whether faculty supplied a newer template or rubric. Explain the provider simulation and zero-cash deployment limitations prominently.

### Step 41 — CI/CD and reproducible handover
Add GitHub Actions build and meaningful API/unit/integration checks, with secrets supplied through secure CI settings where needed. Include `.env.example`, scripts and synthetic seed data; verify another member can clone, install, configure local DB, run tests and demonstrate. Do not treat a green frontend build as proof of backend/worker function.

### Step 42 — Individual viva and live modifications
Each owner explains their own UI, API, database updates, external integration and failure cases. Practice a real frontend field/change, backend validation, model/schema change and regression run. Review any AI-assisted code until each member can explain and modify it without Codex. Keep individual contributions identifiable in Git and Jira.

### Step 43 — Final readiness and submission
Audit all 13 IDs and any faculty additions against Step 11 criteria, real demo evidence, per-member external API call and four-feature minimum, Git history, Jira, responsive UI, six API assignment evidence, report, deployment/faculty exception and backup. Rehearse the final demo with synthetic data and record links/deadline. Mark done only what is verifiably done.

## Suggested Codex task format

> Work on **Step N / Function ID** in the current MediMate repository. Read `docs/CODEX_LAB_INSTRUCTIONS.md`, this roadmap, the current requirements, Step 11 acceptance checks, Step 15 data model and Step 16 contracts, then inspect the actual code and Git status. Implement a scoped vertical slice in a feature branch, preserving unrelated changes. You may revise technical choices if justified; explain the change and update affected contracts, tests and docs. Run relevant tests and inspect the UI. Report what works, what remains, changed files, test evidence, any faculty decision needed, and the next step. Do not claim individual student contribution for assistant-authored code.

## Status updates

After each step, record: date, owner, branch/PR/commit, acceptance cases passed, UI/API/DB evidence, external integration proof when applicable, remaining risk, and whether the course milestone was actually submitted. The checklist is an index, not a substitute for proof.
