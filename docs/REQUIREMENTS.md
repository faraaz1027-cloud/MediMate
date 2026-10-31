# MediMate requirements
Status: agreed planning baseline from the project conversation; implementation pending.
Course: CSE471, Section 01, Fall 2026.

## Responsibilities and modules
| ID | Owner | Module | Function |
|---|---|---|---|
| A1 | Ihfaz Rashid Sadat | 1 | Prescription import, review and change tracking |
| A2 | Ihfaz Rashid Sadat | 2 | Verified medication schedule builder |
| A3 | Ihfaz Rashid Sadat | 3 | Inventory and refill planning |
| A4 | Ihfaz Rashid Sadat | 3 | Pharmacy search and refill coordination |
| B1 | Faraaz Jamil Chowdhury | 1 | Medicine search and personal cabinet |
| B2 | Faraaz Jamil Chowdhury | 2 | Source-linked medicine information cards |
| B3 | Faraaz Jamil Chowdhury | 3 | Duplicate-ingredient and label evidence review |
| B4 | Faraaz Jamil Chowdhury | 3 | Source-grounded information assistant |
| C1 | Sahir Jawad Chowdhury | 1 | Caregiver tasks and handover board |
| C2 | Sahir Jawad Chowdhury | 2 | Reminders and dose recording |
| C3 | Sahir Jawad Chowdhury | 3 | Unconfirmed-dose follow-up |
| C4 | Sahir Jawad Chowdhury | 3 | Analytics and visit report |
| C5 | Sahir Jawad Chowdhury | 3 | Emergency SOS and assistance coordination |

All original 12 functions remain. C5 is an additional function: contribution totals are 4, 4 and 5. Faculty approval and any faculty-assigned additions still need confirmation.

## Acceptance criteria
### A1 — Prescription import, review and change tracking
- Support manual entry and printed-image OCR into editable drafts.
- Require user review and confirmation before instructions feed a schedule.
- Save confirmed records and preserve prior versions when replaced.
- Show changes between versions; unreadable input must not silently become confirmed data.

### A2 — Verified medication schedule builder
- Build schedules from confirmed instructions, separating strength, quantity per dose, time, interval and duration.
- Provide preview, confirmation, editing and pausing.
- Request clarification of ambiguous instructions and preserve historical dose events.

### A3 — Inventory and refill planning
- Record opening quantities, refills and corrections with stock history.
- Deduct stock exactly once for a confirmed taken event.
- Calculate coverage from the confirmed schedule when calculable, and produce threshold-based refill lists.

### A4 — Pharmacy search and refill coordination
- Find nearby pharmacies through the planned OpenStreetMap Overpass integration.
- Show available location/contact data and save preferences.
- Connect refill checklists to caregiver collection tasks.
- Map listings do not establish medicine availability.

### B1 — Medicine search and personal cabinet
- Search RxNorm and let the user select a candidate.
- Save, view, edit, filter and archive cabinet records.
- Support clearly labelled manual entries when a match is unavailable.
- Preserve records referenced by history.

### B2 — Source-linked medicine information cards
- Retrieve relevant label information through the planned openFDA integration.
- Show source links, retrieval dates and personal notes.
- Display unavailable information explicitly; summaries must match source passages.

### B3 — Duplicate-ingredient and label evidence review
- Compare confirmed ingredients, including combination products.
- Distinguish ingredient overlap, label evidence and insufficient information.
- Support acknowledgement and follow-up notes.
- Missing evidence must never be represented as a safe result.

### B4 — Source-grounded information assistant
- Retrieve relevant passages for educational questions and display citations or passages.
- Handle insufficient evidence and support feedback and conversation deletion.
- Local language-model selection and hardware feasibility remain undecided.
- Do not generate prescribing decisions or unsupported treatment advice.

### C1 — Caregiver tasks and handover board
- Create, assign, accept, complete and reopen tasks.
- Preserve handover notes and task history.
- Link consenting test Telegram accounts and record notification attempts and acknowledgements.
- Revoke patient-record access when caregiver permission is removed.

### C2 — Reminders and dose recording
- Use A2 schedule data for reminders and taken, skipped and snoozed actions.
- Keep notification status separate from dose status.
- Prevent duplicate records and keep snooze separate from the prescription schedule.
- Handle explicit timezone and backend restart behaviour.

### C3 — Unconfirmed-dose follow-up
- Mark unanswered events overdue–unconfirmed after a configured delay.
- Notify authorized caregivers and record acknowledgements and outcomes.
- Stop pending escalation after resolution or access revocation.
- An unconfirmed event does not prove that the medicine was not taken.

### C4 — Analytics and visit report
- Calculate date-filtered taken, skipped and unconfirmed counts from stored events.
- Record health notes and export a PDF with medication records, changes, refills and activity.
- Exported totals must match the underlying records.

### C5 — Emergency SOS and assistance coordination
- Manage emergency contacts and activate SOS through an accessible deliberate action.
- Create an incident with timestamp, contact details and available, permitted location.
- Notify linked Telegram contacts even when location is unavailable, stating that clearly.
- Track notification attempts, contact acknowledgements and provider responses separately.
- Support cancellation and resolution with preserved history and cancellation notices.
- Provide emergency calling options and nearby hospital information.
- Send ambulance requests only through a verified channel to participating providers.
- Use a clearly labelled simulated provider dashboard for classroom demonstrations until a partner exists.
- Never show ambulance dispatched without explicit provider dispatch confirmation.
- Demonstrate with consenting test contacts, without contacting real emergency services.

## Shared foundation
Authentication, profile management and patient/caregiver permissions are shared infrastructure, outside the 13 assessed functions. Enforce authorization on the backend. Use synthetic demonstration data.

## Proposed technology and cost constraints
React, JavaScript, Tailwind CSS; Node.js and Express; MongoDB and Mongoose; Tesseract.js for local OCR. Planned external integrations: Overpass (A4), RxNorm (B1), openFDA (B2), Telegram (C1/C2/C3/C5).
No paid APIs or billing-enabled dependencies without explicit agreement. Availability, current terms and limits must be verified before implementation. Local OCR is not an external API integration. Hosting and reliable background reminders remain an open deployment decision; no perpetual free hosting guarantee is assumed.
