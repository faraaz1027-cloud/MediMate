# Development checklist
Unchecked items are pending or unverified, not completed. Course milestones below come from the previous project review; confirm exact calendar dates and faculty amendments.

Latest review: [Step 43 readiness audit](STEP_43_FINAL_READINESS.md), 21 November
2026. Local technical preparation is evidenced; final submission remains NOT READY.
Use the generated `Final_Readiness/Course_Gates.csv` and submission checklist for
current open gates. Prior module entries distinguish code from human acceptance.

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
- [x] C1 technical real Telegram receipt: @Medi911_bot linked with consent; one actual notice received in Telegram Desktop and separately acknowledged in-app on21 November. [Live evidence](MODULE_1_TELEGRAM_DELIVERY.md). This user-authorized PC test does not replace Sahir's personal demonstration.
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
- [x] Step 29 technical preparation: same-origin compiled UI/API, production configuration/topology/health checks, free-web-only Render Blueprint and eight-stage Module 2 rehearsal; [evidence and owner guide](STEP_29_DEPLOYMENT_MODULE2.md). 114 API/provider tests, DOM and real RxNorm/openFDA checks pass.
- [ ] Step 29 course gate: cloud MongoDB, actual live URL/full workflow and reliable worker arrangement or explicitly faculty-approved alternative. User confirmed no cloud DB and unconfirmed faculty requirement. No real Telegram or individual contribution/acceptance is claimed.
- [ ] Update Jira and demonstrate all three Module 2 functions.

## 6. Module 3 — Lab 7
- [x] A3 technical slice prepared with stock history, transactional C2 deduction and reversal, coverage and low-stock checklists. [Step 30](STEP_30_INVENTORY_REFILLS.md).
- [ ] Ihfaz personally reviews and contributes to A3, demonstrates ledger reconciliation and checklist creation, and performs frontend and backend edits.
- [x] A4 technical slice prepared with area search, pharmacy preference and a linked C1 collection task. [Step 31](STEP_31_PHARMACY_COORDINATION.md).
- [ ] Ihfaz records a successful live Overpass listing from the deployed or lab environment, contributes under his Git identity, and demonstrates the A3 → A4 → C1 workflow and frontend/backend edits.
- [x] B3 technical slice: ingredient comparison and evidence review (Step 32); individual demonstration remains open.
- [x] B4 technical slice: grounded educational retrieval with insufficient-evidence handling (Step 33); individual demonstration remains open.
- [x] C3 technical slice: overdue–unconfirmed follow-up and escalation cancellation (Step 34); live delivery and individual demonstration remain open.
- [x] C4 technical slice: analytics and PDF export with verified totals (Step 35); individual demonstration remains open.
- [x] C5 technical slice: consented contacts, incidents, acknowledgements and explicitly simulated provider workflow (Step 36); faculty treatment/live delivery/individual demonstration remain open.
- [ ] Demonstrate the seven Module 3 functions and their connections.

## 7. Final validation and submission — Labs 8–9
- [x] Run the complete synthetic technical scenario (Step 37; repeated in Step 43 candidate); human final demonstration remains open.
- [x] Controlled API checks cover cross-patient access, revoked permissions and simultaneous updates (Steps 38/41/43).
- [x] Actual synthetic OCR clear/blur checks and controlled unmatched-medicine/provider-outage checks recorded (Step 38 and regression).
- [x] Controlled SOS location/cancellation/provider wording tests recorded (Steps 36–38); no real dispatch claimed.
- [x] Measure actual DevTools/network and Lighthouse behavior (Step 39); mobile LCP and remaining device checks stay open.
- [x] Prepare system request, user manual, feasibility and performance/network analysis (Step 40); faculty/user acceptance remains open.
- [x] Prepare architecture, database/API documentation, test evidence and limitations (Step 40 plus Steps 41–43 addenda).
- [x] Configure current Windows/Linux GitHub Actions checks (Step 41); hosted execution of unpublished changes remains open.
- [ ] Verify clean-clone setup on another member's machine.
- [ ] Practise individual viva and live code modifications.
- [ ] Verify all 13 functions, required integrations and individual commits.
- [ ] Submit final report and demonstration materials; keep a tested backup.
- [x] Prepare a local working-source/documentation backup and verify file hashes/ZIP CRC (Step 43); off-device copy/restore and actual submission remain open.

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

