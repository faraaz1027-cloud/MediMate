# Development checklist
Unchecked items are pending or unverified, not completed. Course milestones below come from the previous project review; confirm exact calendar dates and faculty amendments.

## 1. Confirm and organize
- [x] Create shared GitHub repository.
- [x] Owner reports invitations sent to Sadat and Sahir.
- [ ] Both collaborators accept invitations; record exact GitHub handles.
- [x] Record the 13-function baseline, preserving C3 and adding C5.
- [ ] Confirm faculty approval and any additional assigned functions.
- [ ] Record submission dates and confirm online deployment requirements.
- [ ] Create Jira project, invite all members and add its link to README.
- [ ] Create tasks for each feature: UI, API, database, integration and validation.
- [ ] Assign feature owners and module milestones.

## 2. Analysis and design
- [x] Prepare system request and preliminary technical, economic and operational feasibility ([Step 12 draft](STEP_12_SYSTEM_REQUEST_FEASIBILITY.md)); faculty/user validation pending.
- [ ] Review acceptance criteria in REQUIREMENTS.md.
- [x] Prepare preliminary actor/use-case map, architecture, database relationships and key activity flows ([Step 13 design models](STEP_13_DESIGN_MODELS.md)); confirm required faculty notation.
- [x] Create six detailed Figma screens (two per member), plus mobile/error/success frames.
- [x] Prepare the [Step 14 Word submission and supplemental prototype](STEP_14_DESIGN_SUBMISSION.md).
- [x] Step 14 final pass: completed 46 native frames, checked 142 navigation destinations, reviewed 27 native exports and replaced Word figures; rendered final 16-page document.
- [x] Step 15: define shared identifiers, permissions, data dictionary, lifecycle, indexes and consistency rules ([shared data model](STEP_15_DATA_MODEL.md)); implementation and team validation pending.
- [x] Define API requests, responses, authorization and errors ([Step 16](STEP_16_API_CONTRACTS.md)); team/faculty agreement remains unverified.
- [x] Implement and document two database-connected APIs per allocated member; include automated Postman/Newman evidence ([Step 17](STEP_17_API_IMPLEMENTATION.md)). Individual contribution and faculty-specific screenshot requirements remain to be confirmed.

## 3. Development foundation
- [x] Step 20 shared UI/backend behavior: [implemented slice, tests and limitations](STEP_20_SHARED_BEHAVIOR.md). Verified reconnect/retry, field errors, permission navigation, keyboard/mobile and controlled delayed/failing request states.
- [x] Step 19 shared account/access vertical slice: profile/patient edits, registered-caregiver direct grants, named roles/permissions and revoke/restore; see [scope, tests and remaining limits](STEP_19_ACCOUNT_ACCESS.md). No individual contribution credit or faculty submission is claimed.
- [ ] Install compatible Node.js, Git, editor and Postman versions.
- [x] Scaffold client/ and server/; commit dependency lockfiles.
- [x] Add environment placeholders and setup instructions.
- [x] Connect a React form through Express to MongoDB and verify refresh and restart persistence (reported by the owner).
- [x] Add session authentication, CSRF checks and patient/caregiver authorization for the Step 17 APIs. Full account and grant management remain later work.
- [x] Add shared navigation, validation, loading and error states for the six Step 17 APIs ([Step 18](STEP_18_FRONTEND_INTEGRATION.md)); full workflows and browser layout review remain pending.
- [ ] Test each planned external integration and its failure state independently.

## 4. Module 1 — Lab 5
- [x] A1 implemented slice: manual/printed-image OCR review, confirmation, immutable history, replacement comparison and archive; [Step 21 scope and evidence](STEP_21_PRESCRIPTION_REVIEW.md). Individual owner review and faculty acceptance remain open.
- [x] B1 implemented slice: live RxNorm search, explicit candidate review, manual fallback, persistent cabinet edit/filter/archive and history; [Step 22 evidence](STEP_22_MEDICINE_CABINET.md). Individual owner review and faculty acceptance remain open.
- [x] C1 prepared code: task assignment/edit/transitions, handover/acknowledgement history, Telegram consent/linking and persisted delivery worker; [Step 23 tests and limits](STEP_23_CAREGIVER_TASKS.md). Owner review/personal contribution remain open.
- [ ] C1 real Telegram demonstration: configure a dedicated bot, link a consenting test recipient and record actual receipt. No bot was available; controlled fixtures and CI do not satisfy this gate.
- [x] Verify A1/B1/C1 technical integration using shared patient/caregiver IDs and a persisted instruction-to-cabinet reference; [Step 24 evidence](STEP_24_MODULE_1_INTEGRATION.md). Full Module 1 acceptance remains open.
- [x] Module 1 technical tests: persistence after API restart, invalid/cross-patient references, controlled RxNorm outage/manual fallback, and revocation across A1/B1/C1; see Step 24. Real Telegram receipt is still pending.
- [ ] Update Jira and collect individual contribution evidence.
- [ ] Rehearse the Module 1 demonstration.

## 5. Module 2 — Lab 6
- [x] A2 technical slice prepared: current confirmed source → full preview → explicit confirmation → persisted events, immutable replacement, pause/resume; [Step 25 tests/contracts/review](STEP_25_CONFIRMED_SCHEDULES.md).
- [ ] Ihfaz personally reviews/contributes A2, explains timezone/version logic and completes frontend/backend live edits. Assistant-authored work is not individual course contribution evidence.
- [x] B2 technical slice prepared: exact product candidates, explicit label review, original cited passages/retrieval metadata, independent private notes, unavailable/outage states and live openFDA proof; [Step 26](STEP_26_MEDICINE_INFORMATION.md).
- [ ] Faraaz personally reviews/contributes B2, demonstrates the real external request and performs frontend/backend live edits; assistant work is not individual contribution evidence.
- [x] C2 technical slice prepared: A2 dose taken/skipped/snooze, reasoned correction, immutable history and consent-gated reminder worker; [Step 27 tests and limitations](STEP_27_DOSE_REMINDERS.md).
- [ ] Sahir personally reviews/contributes C2, explains duplicate/worker behavior and performs frontend/backend live edits. Real Telegram receipt remains unverified; controlled fixtures do not close that gate.
- [x] Step 28 technical audit: Dhaka midnight, actual worker crashes/restarts, delayed/disabled/expired reminders, schedule edit/pause/resume, duplicate retry and API/connection restart; [evidence and limits](STEP_28_TIMEZONE_RESTARTS.md). Real Telegram and owner/faculty acceptance remain open; stock deduction is later A3.
- [ ] Complete the agreed deployment arrangement and regression checks.
- [ ] Update Jira and demonstrate all three Module 2 functions.

## 6. Module 3 — Lab 7
- [ ] A3: stock history and exactly-once dose deduction.
- [ ] A4: pharmacy search and refill coordination.
- [ ] B3: ingredient comparison and evidence review.
- [ ] B4: grounded educational assistant with insufficient-evidence handling.
- [ ] C3: overdue–unconfirmed follow-up and escalation cancellation.
- [ ] C4: analytics and PDF export with verified totals.
- [ ] C5: SOS contacts, incidents, acknowledgements and simulated provider workflow.
- [ ] Demonstrate the seven Module 3 functions and their connections.

## 7. Final validation and submission — Labs 8–9
- [ ] Run the complete prescription-to-report scenario with synthetic data.
- [ ] Check cross-patient access, revoked permissions and simultaneous updates.
- [ ] Check unreadable OCR, unmatched medicines and external API outages.
- [ ] Check SOS location failure, accidental cancellation and provider status wording.
- [ ] Measure actual network/performance behaviour using DevTools.
- [ ] Prepare system request, user manual, feasibility and performance/network analysis.
- [ ] Add architecture, database/API documentation, test evidence and limitations.
- [ ] Configure appropriate GitHub Actions checks once application code exists.
- [ ] Verify clean-clone setup on another member's machine.
- [ ] Practise individual viva and live code modifications.
- [ ] Verify all 13 functions, required integrations and individual commits.
- [ ] Submit final report and demonstration materials; keep a tested backup.

## Course milestones to confirm against faculty announcements
| Milestone | Deliverable |
|---|---|
| Before Lab 2 | Draft requirements, Jira and GitHub links |
| Before Lab 3 | Final requirements analysis |
| Before Lab 4 | Figma DOC submission: two pages per student |
| Before Lab 5 | Two database-connected APIs per student with documentation and Postman evidence |
| Lab 5 | Module 1 |
| Lab 6 | Module 2 and deployment activity |
| Lab 7 | Module 3 and final report preparation |
| Labs 8–9 | Final demonstration, viva, live modifications and report |

