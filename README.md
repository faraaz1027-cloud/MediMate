# MediMate
Medication management and caregiver coordination — CSE471, Section 01, Fall 2026.

MediMate is a planned web application for reviewing prescriptions, organizing medicine schedules, recording doses, tracking stock and coordinating caregivers. Its 13th function adds emergency contact alerts and assistance coordination.

**Status:** design/data/API specifications are established. The localhost React/Express/MongoDB demo and six authenticated database APIs are implemented. Full feature workflows, frontend integration and deployment remain pending. The repository is not a working medical or emergency service.

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
Connect the Step 17 APIs to the React interface, then finish A1 review/history, B1 search and C1 task transitions/notifications for Module 1. See [API setup and test evidence](docs/STEP_17_API_IMPLEMENTATION.md).

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
