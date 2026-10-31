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
- [ ] Prepare use-case diagram, architecture and database design.
- [ ] Design two Figma pages per member and prepare the DOC submission.
- [ ] Define shared patient, medicine and permission identifiers.
- [ ] Agree API requests, responses, authorization and errors.
- [ ] Document two database-connected APIs per member, with Postman evidence.

## 3. Development foundation
- [ ] Install compatible Node.js, Git, editor and Postman versions.
- [ ] Scaffold client/ and server/; commit dependency lockfiles.
- [ ] Add environment placeholders and setup instructions.
- [x] Connect a React form through Express to MongoDB and verify refresh and restart persistence (reported by the owner).
- [ ] Add authentication and patient/caregiver authorization.
- [ ] Add shared navigation, validation, loading and error states.
- [ ] Test each planned external integration and its failure state independently.

## 4. Module 1 — Lab 5
- [ ] A1: manual prescription workflow, confirmation/history, then OCR review.
- [ ] B1: search, candidate selection and persistent personal cabinet.
- [ ] C1: caregiver tasks, handover history and Telegram linking/notifications.
- [ ] Integrate all three using shared patient data.
- [ ] Test persistence, invalid input, external failure and revoked access.
- [ ] Update Jira and collect individual contribution evidence.
- [ ] Rehearse the Module 1 demonstration.

## 5. Module 2 — Lab 6
- [ ] A2: confirmed schedule builder.
- [ ] B2: source-linked information cards.
- [ ] C2: reminders and dose recording using A2.
- [ ] Test timezone boundaries, duplicate actions and backend restarts.
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
