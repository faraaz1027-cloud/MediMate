# MediMate
Medication management and caregiver coordination — CSE471, Section 01, Fall 2026.

MediMate is a planned web application for reviewing prescriptions, organizing medicine schedules, recording doses, tracking stock and coordinating caregivers. Its 13th function adds emergency contact alerts and assistance coordination.

**Status:** planning documentation established. Application code, tests and deployment are pending. This repository is not yet a working medical or emergency service.

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
Build the shared frontend/backend/database connection and authorization foundation, then deliver A1, B1 and C1 together for Module 1. See the checklist for earlier design and API submissions.

## Links to add
- Jira project: pending.
- Figma design: pending.
- Deployment: pending.
- Calendar deadlines and confirmed collaborator handles: pending.

Use synthetic demonstration records. Do not commit real medical records, contact details, secrets or environment credentials.
