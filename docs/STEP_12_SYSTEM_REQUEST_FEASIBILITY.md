# Step 12 — System request and feasibility analysis

**Project:** MediMate · CSE471 Section 01 · Fall 2026  
**Prepared:** 1 November 2026 · **Status:** planning draft for faculty and team review  
**Basis:** agreed 13 functions in [REQUIREMENTS.md](REQUIREMENTS.md), testable criteria in [STEP_11_ACCEPTANCE.md](STEP_11_ACCEPTANCE.md), and the team's reported successful local Step 10 persistence test. This document does not claim that the 13 functions or a live deployment exist.

## 1. System request

| Item | Proposal |
|---|---|
| Project sponsor | CSE471 student team; a real healthcare or pharmacy sponsor has not been secured. |
| Business need | People managing several medicines and family caregivers can lose track of prescription changes, schedules, stock, and task handovers when information is scattered across paper notes, calls and chats. This is the problem the team proposes to validate with users; no local prevalence or market-size figure is claimed here. |
| Intended users | A patient or designated household organizer; authorized caregivers. Clinicians, pharmacies and ambulance providers are external parties, not assumed application users or partners. |
| Desired outcome | Keep reviewed instructions, medicine records, dose events, refill tasks and caregiver actions in one traceable workflow, while showing source evidence and emergency contact status accurately. |
| Scope | A1–A4 prescription/schedule/refill/pharmacy; B1–B4 medicine cabinet, source cards, ingredient review and educational assistant; C1–C5 caregiver work, reminders, follow-up, reports and SOS. Common accounts and permissions support these functions. |
| Value proposition | A caregiver can see the current confirmed instructions and task status without reconstructing them from messages; a patient can review changes and distinguish an alert attempt from a response. These are expected benefits to test, not measured results. |
| Constraints | Three students; 13 functions across three modules; no paid API or billing-enabled service; individual Git commits, Jira and course deliverables. Local Step 10 is a connectivity demo only. |
| Success criteria | All 13 functions meet their Step 11 acceptance cases; each member can demonstrate their work and external integration; access control, history and failure states work; final report records observed measurements and limitations. |

### Example end-to-end scenario

A patient enters or scans a printed prescription, corrects the draft and confirms it (A1). A schedule is previewed and confirmed (A2). The medicine is saved in the cabinet with a source-linked information card (B1–B2). A caregiver accepts a collection task (C1). At dose time the patient records taken or skipped (C2); taken updates stock once (A3). Low stock creates a refill list and pharmacy search can aid coordination (A4). Unanswered doses receive follow-up (C3), and a visit report summarizes recorded facts (C4). Ingredient review and the educational assistant cite available evidence (B3–B4). SOS (C5) separately alerts linked contacts; a real ambulance request requires an actual participating provider.

### Boundaries

MediMate does not diagnose, prescribe, guarantee adherence, verify pharmacy stock, or guarantee an ambulance. OCR output must be reviewed. Missing medicine evidence must be marked insufficient. For a class demonstration, provider response uses a clearly labelled simulated dashboard, and no real emergency service receives a test request.

## 2. Feasibility assessment

| Dimension | Current evidence | Main gap / risk | Action before sign-off |
|---|---|---|---|
| Technical | Team reports Step 10 React → Express → local MongoDB saved a test note through refresh and backend restart. This supports basic persistence, not the full application. | Integrating 13 functions, permissions, schedules, background reminders, OCR, source matching and SOS is substantially larger. | Build shared identifiers/API contracts, then module slices; test authorization, restart, timezone and duplicate actions. |
| Integration | Proposed: RxNorm, openFDA, OpenStreetMap Overpass and Telegram; local Tesseract.js for OCR. | Availability, coverage for Bangladesh medicines, rate limits and suitability are not yet established by this project. Contacts must link a supported notification channel. | Test each with sample inputs and outage cases; provide manual entry or unavailable states; record observed terms and coverage before promising use. |
| Operational | Patients and caregivers can use a web interface and named task ownership. | User access, device/internet availability, language and willingness to change have not been validated with target users. Notifications require connectivity and a running service. | Interview at least one potential patient/organizer and one caregiver, with consent; prototype mobile flows, Bangla labels if useful, and a manual fallback. |
| Schedule | Module 1: A1/B1/C1; Module 2: A2/B2/C2; Module 3: A3/A4/B3/B4/C3/C4/C5. | Seven functions in Module 3, including extra C5, create a concentrated workload; exact section deadlines unknown. | Put dependencies in Jira, set dates from faculty announcements, reserve integration/testing time, and seek faculty feedback on scope. |
| Economic | Local development on existing student computers and local MongoDB has no new hosting or paid API commitment in the current plan. | Electricity, internet, devices and team time still have real costs; online deployment or reliable scheduled jobs may incur cost. No price or perpetual free tier is guaranteed. | Keep a zero-cash prototype baseline; verify any host and provider terms before adoption; use a local or faculty-approved alternative if free hosting cannot satisfy Lab 6. |
| Legal/ethical and data | Planned use of synthetic records, limited contact information, backend permissions, history and consent-based sharing. | Real medical and location records increase privacy and misuse risk; actual hospital dispatch is unavailable without a verified partner. | Use synthetic data for class; implement account access/revocation and minimal notifications; obtain explicit consent before any real-user pilot; do not claim clinical or dispatch approval. |

### Cost and resource estimate

| Item | Planned source | Cash budget assumption | Dependency |
|---|---|---|---|
| Student laptops, phones, internet | Team's existing resources | No new purchase planned; existing resource costs excluded | Confirm each member can run the stack. |
| React, Express, MongoDB local, Tesseract.js | Local development tools | No paid service planned | Check licenses and device capability during setup. |
| External API calls | Proposed public integrations | No paid plan authorized | Verify current access conditions and fit before implementation. |
| Demo notifications | Linked consenting Telegram test accounts | No paid messaging service planned | Check bot delivery behaviour; show failures. |
| Online frontend/backend/database and reminders | To be chosen | **Unresolved** | Faculty must confirm online requirement; verify provider limits, sleep behaviour, background jobs and total cost. |
| Hospital/ambulance integration | No partner secured | Excluded from working live prototype | Simulated provider only until verified channel and participant exist. |

The **zero-cash target is conditional**, not a guarantee that an always-on production deployment is free. Do not add a payment method or paid dependency without team agreement.

## 3. Risks and mitigation priorities

1. **Wrong or ambiguous medication instructions:** confirmation gate for OCR, version history, explicit clarification and no automatic clinical inference.
2. **Unauthorized access:** patient-level backend authorization, caregiver revocation, minimal notification contents and synthetic class data.
3. **Reminder reliability:** persisted dose and notification events, idempotent actions, explicit timezone, restart recovery and failure indication.
4. **Poor source coverage:** manual cabinet entry; source-linked cards only where matched; insufficient-evidence result for B3/B4.
5. **SOS false confidence:** deliberate activation, alert/acknowledgement/dispatch as separate statuses, location-unavailable handling and a clearly simulated provider.
6. **Time and staffing:** shared foundation first; integrated module demos; C5 adds a fifth Sahir function and should be scheduled explicitly.

## 4. Decision gates and evidence to collect

- **Faculty:** approve 13-function scope and any additions; provide actual assignment dates and online deployment rule.
- **Users:** record anonymized needs and usability feedback from a patient/organizer and caregiver; do not invent interview results.
- **Technology:** record sample API responses, Bangladesh medicine match rates on a small agreed test set, outage behaviour, OCR review examples and local model feasibility if B4 uses one.
- **Evaluation:** attach Figma pages, two database-connected APIs per member, Postman evidence, Jira history, individual commits, real DevTools measurements and module demonstration results.
- **Deployment:** decide how frontend, backend, database and scheduled reminders operate together within the verified cost constraint.

## 5. Preliminary conclusion

A **local classroom prototype is technically plausible** based on the successful Step 10 connection and the proposed module sequence. Full technical, economic and operational feasibility is **conditional** on the above tests, faculty decisions, real user feedback and an acceptable deployment arrangement. This is a planning assessment, not a clinical validation or proof that the completed system works.
