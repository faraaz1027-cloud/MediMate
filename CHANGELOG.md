# Change log

## Step 20 — Shared UI and backend behavior
- Added safe request errors, startup reconnect and explicit list retry/empty states.
- Added shared accessible field validation, permission-aware navigation and view-context guards against stale records and old 401s.
- Verified real mobile/keyboard states and controlled slow/failing requests; retained server-side authorization and explicit AI-assisted shared-work attribution.

## Step 19 — Shared account and access workflows
- Added profile editing, patient creation/editing and explicit owner/caregiver summaries.
- Added registered-caregiver direct grants, permission editing, revocation and restoration UI/API, with transactional audit/replay and revision checks.
- Reused session recovery from review PR #1 and corrected registration-to-logout navigation.
- Added database access regression tests and a real Postman/Newman collection; this is shared infrastructure, not assessed-feature contribution credit.

## Step 18 — React integration
- Added registration/login, patient selection and six API-backed create/list views.
- Added loading/error/empty feedback, input preservation, retry keys and paginated lists.
- Added patient discovery to auth/me and regression checks for grant revocation.
- Production build and database API checks passed; interaction evidence and browser-review limits are documented in Step 18.


## 2026-11-01 — Final design and API milestone
- Completed the student-account Figma pass: 46 native frames, 142 valid navigation destinations, supporting states and simulated SOS.
- Replaced the Word submission with the reviewed 16-page version using native exports.
- Added Step 16 contracts for all 13 functions and aligned data-model revision/report-write conventions.
- Implemented Step 17 POST/GET prescription, manual cabinet and caregiver task APIs, with transactional history, idempotency and audit records.
- Added session authentication, password hashing, CSRF/origin checks, patient scope and caregiver grant/revocation checks.
- Added database integration tests, an importable Postman collection and actual automated runner evidence. Local replica-set setup is documented.
- Kept remaining full feature workflows, personal contribution verification, university upload and deployment open.

Earlier entries below describe the state at those checkpoints and are superseded by this update.

## 2026-11-01
- Established the repository documentation baseline from the agreed project conversation.
- Recorded A1–A4, B1–B4 and C1–C5 with owners and module allocation.
- Added C5 Emergency SOS as the 13th function without removing C3.
- Added the development checklist and team contribution workflow.
- Repository creation and collaborator invitations were reported by the owner; invitation acceptance remains unverified.
- Application implementation, testing and deployment are pending.

### Step 10 implementation
- Added a React save-and-reload form and Express/Mongoose create/list endpoints.
- Added input validation, error states, localhost binding and environment placeholders.
- Added Windows-friendly local setup and persistence verification instructions.
- Live MongoDB persistence verification remains pending.

### Step 15 — Shared data model
- Defined ObjectId references, patient ownership and explicit access permissions.
- Added the shared data dictionary for all 13 functions, source evidence, history and reports.
- Specified schedule time handling, retry-safe dose/stock processing, indexes and transaction requirements.
- Documented SOS consent, acknowledgements and simulated/verified provider boundaries.
- Design baseline only; production schemas remain to be implemented. Step 14 submission remains in progress.

### Step 14 design deliverables
- Created 24 editable detailed Figma frames across six assigned screens: desktop, mobile, error and success views.
- Added a 15-page Word design submission, screen data, 24 supplementary SVG renderings and a standalone HTML prototype including simulated SOS.
- Inspected the A1 Figma screenshot and rendered Word layout; checked prototype JavaScript syntax.
- Recorded the remaining Figma interaction/export verification block caused by the Starter tool allowance. Step 14 is not marked fully verified.

