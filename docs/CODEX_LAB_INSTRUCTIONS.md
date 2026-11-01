# CSE471 lab instructions for MediMate and Codex

**Source set reviewed:** `CSE471 Fall 2026 Lab Plan (1).pdf`; `Lab 01 _ Requirement Analysis.pptx`; `Lab 02 _ Chrome DevTools Manual(1).docx`; `Lab 03 _ Figma Manual.docx`; `Lab 04 _ API Development and Postman - Flask.docx`; `Lab 05 Git & Github [Vscode Version].docx`; `Lab 06 _ Vercel Manual (Software Deployment).docx`; `Lab 07 _ Sample Report College Space.pdf`. These are the lab materials available in the project Library on 1 November 2026. The Lab 7 PDF is a **sample report**, not an instruction to copy its claims or architecture. No separate Lab 8/9 manual was in this source set. Course dates, assignment rubrics, and faculty amendments must be confirmed separately.

## Instruction hierarchy and how Codex should work

1. Follow the current faculty/course requirements first, then the actual lab documents, then MediMate's approved requirements and repository specifications. Treat example code, screenshots, sample project content and suggested frameworks as demonstrations unless the guideline explicitly mandates them.
2. **Codex may change an implementation decision** if evidence warrants it: refactor schemas, endpoints, UI, libraries, deployment topology, or sequence. Before changing a documented contract, record the reason and impact; update related docs, tests and demos in the same change. Preserve the 13 agreed functions and owners unless the team/faculty approves scope changes. Never silently mark an unimplemented feature complete.
3. Work in focused branches/PRs; run relevant tests and explain changed code so its owner can perform live frontend/backend edits. Do not fabricate screenshots, API results, performance measurements, Git history, user interviews or deployments.
4. Use synthetic patient/contact data. Keep `.env`, passwords, tokens, real prescriptions and private contact details out of Git. Step 10 notes are a development demo, not evidence that later feature workflows exist.

## Project guideline: binding constraints

| Requirement in the guideline | MediMate consequence and evidence |
|---|---|
| Group size 3–4 | Three members: Ihfaz, Faraaz, Sahir. |
| Four assessed features **per member**; first in Module 1 (Lab 5), second in Module 2 (Lab 6), third/fourth in Module 3 (Lab 7) | A1–A4, B1–B4, C1–C4 satisfy the minimum. C5 SOS is an extra fifth Sahir feature in Module 3; confirm faculty treatment and time allocation. Each member demonstrates their own features; absence/inability to demonstrate yields zero for that feature. |
| At least one **external API integration per member** as a feature | Proposed evidence: Ihfaz Overpass in A4, Faraaz RxNorm/openFDA in B1/B2, Sahir Telegram in C1/C5. A locally running OCR library is not an external API. Demonstrate actual outgoing requests/responses and graceful outage handling. |
| Login/signup/logout, role/profile management and admin activities are **common workflows**, not assessed features | Implement collaboratively, but do not count them toward the four-per-member minimum. |
| Allowed frameworks exclude CMS, core/raw PHP, Firebase, Supabase and Django | React + Express + MongoDB is consistent with the guideline's JavaScript/MERN suggestion. The Lab 4 Flask/SQLite example is educational, not a mandatory migration. |
| AI only for **partial code generation and debugging support**, with understanding and ownership | Give each member manageable changes to review and commit themselves. They must explain AI-assisted code and make live frontend and backend changes during evaluation, or risk zero regardless of app quality. Do not ask Codex to replace their intellectual ownership. |
| Responsive mobile-friendly UI; no drag-and-drop builders or unexplained AI full-page templates | Implement the Figma designs in understood React/CSS components and verify mobile layouts. Allowed styling examples include Tailwind, Bootstrap, Material UI, DaisyUI, Chakra UI, Ant Design. |
| Database SQL/NoSQL/local storage; real CRUD, no hardcoded data | MongoDB is acceptable. Persist create/read/update/delete or archival behavior as applicable; seed only synthetic demo data, not fake hardcoded feature results. |
| GitHub/GitLab/Bitbucket and individual commit history | Use each student's own Git identity and focused contribution commits/PRs. |

## Lab 01 — Requirement analysis

**Teaching objective.** A functional requirement says what business task the system performs or what information it retains. Nonfunctional requirements describe operational, performance, security, cultural or political characteristics. The slides distinguish business requirements in a system request from detailed functional requirements in analysis, later translated into technical requirements. The lab project asks for **functional requirements only** in its functional-requirements assignment. This does not prevent security/performance discussion in design, testing and the final report.

**Lab format.** Name a function, then number its subrequirements (e.g., 1.1, 1.2). Describe actions and retained information in user-facing terms. For MediMate, use A1–C5 consistently, clear actors, triggers, validation, stored data and outcome. `docs/REQUIREMENTS.md` and `docs/STEP_11_ACCEPTANCE.md` are the current baseline; faculty-approved wording and template take priority.

**Codex evidence:** every feature has a distinct real workflow, database state and acceptance cases. No authentication or generic profile screen is passed off as an assessed feature.

## Lab 02 — Chrome DevTools

**Manual concepts.** Open with F12/Inspect. Elements inspects DOM, CSS, box model, grid/flex and event listeners. Console observes execution and errors. Sources supports breakpoints, stepping, scope and call stack. Network shows Fetch/XHR, request headers/payload/response/status/timing and throttling. Performance records interactions and flame charts. Memory supports heap snapshots. Application shows local/session storage, cookies and caches. Security reports certificate/mixed-content issues. Lighthouse audits performance, accessibility and other categories. Device mode previews different viewports.

**Lab exercise, separate from MediMate implementation.** Select an existing site similar to the topic; inspect an element and DOM breadcrumbs, call `inspect(document.body)`, inspect listeners and box metrics. The manual's Foodpanda exercise searches Dhanmondi/Pizza, inspects Fetch/XHR request header/payload/response, throttles network, hard reloads empty cache, examines Performance/LCP/CLS, Lighthouse and device view; it repeats comparison with dlrs.gov.bd. Its console examples change title/background and use `console.log`/`console.table` on the inspected page. These are inspection exercises, not features to code into MediMate. Choose a suitable comparison site only if faculty expects the exercise and record the actual URL and observations.

**Apply to MediMate.** Inspect prescription form validation and mobile layout; capture a real create/list API exchange; test slow/offline conditions; run Performance and Lighthouse on representative pages; inspect cookies/storage without exposing session secrets. The manual describes good LCP below 2.5 s and CLS at most 0.1, and Lighthouse bands 0–49, 50–89, 90–100. Record actual measurements with date, device, network condition and page, and avoid claiming results from the sample report.

## Lab 03 — Figma

**Manual concepts.** Frames/layers, move/scale, shape/pen/pencil/text tools, layout guides, typography, strokes, effects, reusable master components/instances, clickable prototype transitions and vertical overflow.

**Manual exercise.** Create an account/file; choose a desktop-sized frame (the example uses a TV preset), design a sample navbar/logo and reusable buttons, place images behind the logo using layer order, create a second frame, configure vertical scrolling, connect View All/Home in Prototype mode and test with Present. It also demonstrates a login frame with input component variants. The furniture branding and exact example dimensions are exercises, not MediMate requirements.

**Apply to MediMate.** The separate course milestone previously identified is two feature-related pages per student. The repository's Step 14 submission claims six desktop screens, mobile states and a prototype. Codex should verify current Figma link and DOC artifact, then implement corresponding responsive screens and meaningful loading/error/empty states. Do not count a login page as one of the assessed feature screens unless faculty explicitly instructs it.

## Lab 04 — Backend API and Postman

**Manual exercise.** Flask starts with a GET/POST dummy `/test` route, then uses a Student model and SQLite table for add/list/delete plus an HTML form. It explains that database changes need a commit in that SQLite example, and uses a SQLite Viewer. The Postman section calls Open-Meteo current/hourly/daily forecasts with latitude/longitude and Dhaka/London/Tokyo examples.

**Apply to MediMate.** Preserve the **learning outcomes**: implement real database-connected HTTP operations; show JSON request/response, status, validation, persistence and failure; test with Postman; demonstrate an actual external API integration. Keep Express/Mongoose rather than copying Flask app.py or the Student schema. A Postman request to Open-Meteo by itself does not fulfill each MediMate member's feature-level integration. Step 16 contracts and Step 17 six authenticated APIs are the current project baseline. Verify the actual endpoints, DB writes and owner contribution before claiming the two-APIs-per-student assignment is satisfied; include screenshots/code excerpts if the faculty submission asks for them.

## Lab 05 — Git and GitHub

**Manual exercise.** Install Git, select command-line PATH, optionally install official VS Code GitHub extensions, configure `user.name` and `user.email`, initialize a practice repo, stage and commit `home.html`, create `feature-contact`, add a Contact Us paragraph, switch branches to observe isolation, merge, push a public `Lab05-Git-Practice` repo and test `.gitignore` with `secrets.txt`. It also explains `git status`, `git log --oneline`, `git clone`, `git pull` and the Source Control UI.

**Apply to MediMate.** Use the **existing** `faraaz1027-cloud/MediMate` repo; do not reinitialize, publish another repo, or overwrite its history. Create feature branches, make descriptive commits under individual student identities, review and merge, then pull on each machine. Check `git status` before staging; keep secrets ignored. The practice exercise's `master` name is illustrative: MediMate's default branch is `main`. Preserve each member's actual contribution evidence.

## Lab 06 — Vercel deployment

**Manual workflow.** Deployment makes the app available in its target environment. The manual distinguishes deployment from a release. It asks for a GitHub repo, Vercel Hobby sign-up via GitHub, New Project, GitHub app access (prefer selecting only the relevant repository), import, framework/root directory check, Deploy, and verification on the project domain. It explains build command, output directory, install command and environment variables for secrets and different environments.

**MediMate decision still needed.** The example mainly covers a web frontend. MediMate also needs an Express API, MongoDB and a reliable reminder/escalation worker; a deployed Vite page alone is not a deployed working system. Codex may propose a different architecture or host if faculty permits, but should verify current free-tier terms and test frontend/API/database/scheduled jobs together. Keep a local demo fallback for the zero-cash constraint, while confirming whether the faculty requires online access. Never commit production secrets or claim an ambulance request works because a site URL loads.

## Lab 07 — Sample project report

The 41-page CollegeSpace PDF shows a **sample structure**: title/team and table of contents; system request (business need, requirements, value, constraints); functional requirements; technology; backend and API/Postman evidence; UI/Figma; frontend; user manual; desktop/mobile performance and network analysis; public GitHub link; deployed link; individual contributions; references. Its project-specific code, metrics, technology choices, business forecasts and member contributions do not describe MediMate and must not be copied as facts.

**MediMate report checklist:** use Step 12 for the system request with verified updates; Step 11/requirements for functions; Step 13/15/16 for design/data/API; real Figma/screens and tested React pages; original Postman and DevTools captures; a user manual with synthetic screenshots; links to the actual repository/deployment; per-member function and commit evidence; limitations including source coverage, reminder availability and simulated provider. A public repo or particular report pagination is shown in the example, not established as a universal rule by that PDF.

## Crosswalk for Codex

| Course evidence | Where to maintain it |
|---|---|
| Functional requirements and acceptance | `docs/REQUIREMENTS.md`, `docs/STEP_11_ACCEPTANCE.md` |
| System request/feasibility | `docs/STEP_12_SYSTEM_REQUEST_FEASIBILITY.md` |
| Architecture/data/API | `docs/STEP_13_DESIGN_MODELS.md`, `docs/STEP_15_DATA_MODEL.md`, `docs/STEP_16_API_CONTRACTS.md` |
| Figma submission | `docs/STEP_14_DESIGN_SUBMISSION.md` and linked Figma/Word deliverable |
| API proof | `docs/STEP_17_API_IMPLEMENTATION.md`, real Postman results |
| Git evidence | Feature branches, individual commits and PRs in the current repo |
| Deployment/report | Real deployment evidence or explicit unresolved status; measured DevTools results and user manual |

**Source limitations:** only text and described lab screenshots were reviewed for this guide. Check the original lab file when exact visual formatting or a faculty-specific screenshot is needed. The lab plan PDF is a project guideline, while the separate schedule/rubric described in earlier project discussions was not among the eight lab files reviewed here.
