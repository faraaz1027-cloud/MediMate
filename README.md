# MediMate
Medication management and caregiver coordination — CSE471, Section 01, Fall 2026.

MediMate is a planned web application for reviewing prescriptions, organizing medicine schedules, recording doses, tracking stock and coordinating caregivers. Its 13th function adds emergency contact alerts and assistance coordination.

**Status:** design/data/API specifications are established. The localhost React/Express/MongoDB demo and six authenticated database APIs are implemented. The React client now integrates those APIs. Full feature workflows and deployment remain pending. The repository is not a working medical or emergency service.

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
- Frontend: React, JavaScript, Tailwind CSS.
- Backend: Node.js and Express.
- Data: MongoDB and Mongoose.
- OCR: local Tesseract.js with manual review.
- Planned integrations: RxNorm, openFDA, OpenStreetMap Overpass and Telegram.
- Development tracking: Jira; source control: GitHub.

The project has a zero-cost constraint. Integration terms and deployment options must be checked before adoption. Hosting and reminder execution arrangements are still to be decided.

## Emergency SOS scope
Notify linked, consenting contacts and track acknowledgements. Use a clearly labelled simulated hospital/provider dashboard for classroom demonstrations until a participating provider is secured. A notification does not establish ambulance dispatch.

## Next implementation milestone
Next is Step 23, C1 caregiver task transitions, handover and Telegram linking/notifications, followed by Module 1 integration. A1 review/history and B1 live search/cabinet are implemented for owner review in [Step 21](docs/STEP_21_PRESCRIPTION_REVIEW.md) and [Step 22](docs/STEP_22_MEDICINE_CABINET.md). See [API setup and test evidence](docs/STEP_17_API_IMPLEMENTATION.md).

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
