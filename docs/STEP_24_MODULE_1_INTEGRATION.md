# Step 24 — Module 1 integration and demonstration evidence

Verified 2 November 2026 (Asia/Dhaka), on the Step 23 foundation (draft PR #6). **Technical integration is verified; full Module 1 acceptance remains open.** There is no Telegram bot/consenting test recipient, individual student contribution/viva evidence, Jira project/status evidence or faculty sign-off available. This guide does not mark those gates complete or claim a deployment. No PR is merged by this work.

The original owners remain Ihfaz (A1), Faraaz (B1) and Sahir (C1). These are AI-assisted implementation/debugging and review materials; each student must personally understand, contribute and demonstrate their feature. Login/account/access are shared infrastructure, not assessed features. All accounts, instructions and task notes used here are synthetic.

## Integration gap and code change

Step 15 and the Step 16 instruction projection already planned an optional `cabinetItemId`, but A1 did not accept, persist or display it. Step 24 implements that association rather than leaving A1/B1 connected only through a patient ID. The prescription editor offers paginated active saved medicines for the current patient, with manual/RxNorm provenance labels and an explicit selection. It does not fill or modify transcribed medicine/dose fields, infer ingredient equivalence or create a schedule. A user must review identity, strength and form.

The optional reference is validated transactionally. A **new** association requires cabinet.read and an active item in the same patient. Missing, malformed or foreign references fail with an indexed field error, and rollback leaves the previous draft intact. Preserving a previously stored reference does not grant cabinet access or require it again; a prescription confirmer can review saved instructions with prescription.read/confirm independently. Internal validation does not expose cabinet contents.

Confirmed instruction text/IDs and references remain immutable when a cabinet item is renamed or archived. A replacement/edit may retain its existing archived reference in a draft so the user can review/correct it; confirmation requires referenced items to be active, or the reference must be cleared/replaced. New links to archived items are rejected. Validation uses the transaction snapshot; a later/concurrent archive does not erase historical references. Replacement comparison reports `cabinetItemId` changes as well as transcribed fields.

The only schema addition is optional PrescriptionInstruction.cabinetItemId. Existing unlinked drafts/confirmed versions need no migration, backfill or relabelling. Association removal is represented by omitting cabinetItemId in the replacement instruction payload. No assessed function scope/owner changes are made. Changes touch prescriptions.js/store.js, the existing prescription editor and the API installation of the shared access check; B1/C1 domain behavior is reused.

## One-patient scenario and acceptance crosswalk

| Checkpoint | Observed result/evidence | Remaining gate |
|---|---|---|
| B1 live search → explicit candidate → save | Actual NLM RxNorm Cymbalta results, explicit 596928 selection, retained source/retrieval data | Faraaz personally demonstrates/explains it |
| Outage/manual fallback | Test-only injected RxNorm outage returns 503; a labelled manual item still persists | No production outage/performance claim |
| A1 manual draft → correct → confirm | Incomplete confirmation blocked; complete reviewed instructions retain the same-patient cabinet ID | Ihfaz review/live edit |
| A1 OCR review | Actual browser OCR of the synthetic printed fixture, corrected fields, explicit review, confirmation and reload | One printed-English fixture; no accuracy certification |
| Shared records | One patient ID across prescriptions/cabinet/task; persisted cabinet ID on instructions; same registered caregiver ID used in grant/task/history | No automatic clinical matching |
| C1 handover and state | Same-patient caregiver note, separate app acknowledgement, accept/complete/reopen; generation/history persists | Real Telegram receipt remains unverified |
| Permission boundaries | Foreign/missing references blocked; revoked caregiver cannot read A1/B1/C1 or replay earlier mutations; restoration uses the existing grant | Team verifies intended grants in their own demo |
| History/archive/restart | Original dose/reference survives cabinet edit/archive; reviewed replacement changes reference; API restart reads back the same records/source/task state | This is API restart, not a machine power-failure test |
| Module 1 submission | Evidence and rehearsal procedure prepared | Jira, individual commits, student viva, Telegram and faculty acceptance open |

C1 shares patient/caregiver identifiers and includes actual prescription/cabinet IDs in its synthetic handover description. Those description IDs are **text references**, not new structured task foreign keys. Later A4 refill/task and A2 schedule relationships remain separate roadmap steps.

## Reproducible checks

Use Node 24 and the replica-set setup from Steps 17–19. No dependencies were added.

```sh
npm ci
npm ci --prefix verification/step18
npm run build
node verification/step18/api.mjs
npm test --prefix verification/step18
node verification/step24/run.mjs
node verification/step24/run.mjs --live-rxnorm --output docs/evidence/step24-live-api.json
```

The API suite now includes module1.test.js. The default Step 24 runner uses controlled RxNorm data and explicitly labels it; `--live-rxnorm` makes actual fixed-host NLM calls. Both run the same HTTP scenario with real Express/MongoDB records and an API restart. Telegram is forcibly disabled in this disposable verification harness to avoid unintended messages. Cookies/CSRF/passwords remain in runtime closures and are excluded from reports. The synthetic database is cleaned up after the runner completes; reported IDs are evidence of that run, not records in a deployment.

On this restricted Windows host, use the standalone installs documented in Step 19 if workspace symlinks are denied. MONGOMS_DOWNLOAD_DIR may point to cached binaries; MONGOMS_DB_PATH must be a **fresh directory for each invocation**. The live runner records public upstream URLs/statuses/payloads, source IDs, shared record IDs, checkpoint assertions and patient-filtered DB counts. Its injected outage is explicitly test-only and is not presented as an actual NLM incident.

Observed results:

- **55 reported API/provider tests passed**, no failures/skips. The new integrated case executes nine checkpoint assertions/flows, including cross-feature revocation, reference permissions, rollback, archive/history and restart. Existing Steps 19–23 regressions remain.
- Production-bundle DOM suite passed against real Express/MongoDB, including explicit saved-medicine selection, replacement copy and historical ID persistence after remount, plus prior account/A1/B1/C1 workflows. Results remain in docs/evidence/step18-dom.json.
- Standalone live scenario passed; see docs/evidence/step24-live-api.json. Patient-filtered counts: 2 prescriptions, 4 versions/instructions, 2 cabinet items, 4 cabinet revisions, 1 task, 6 task events and 2 disabled notice jobs. This runner's OCR metadata is an explicitly labelled API fixture, not engine output.
- Newman: **40 requests and 52 assertions passed** in the combined Module 1 collection. It uses synthetic organizer/caregiver sessions, same patient IDs, reference changes, archive/history, revocation/restoration and disabled Telegram. The source-metadata fallback fixture does not claim to run OCR. Evidence: docs/evidence/step24-newman.txt.
- Actual Chromium OCR used the same synthetic patient as the live browser API scenario. It recognized the printed Demo medicine fixture; reviewed quantity 1 tablet and saved cabinet reference survived confirmation/reload. Independent file SHA-256, confirmed version, dose and link were checked against DB readback in docs/evidence/step24-browser-db.json. A separate caregiver signed in to that patient and acknowledged the reopened task. Screenshots accompany the handover.
- Desktop 1440×1000 and mobile 390×844 inspected; mobile document width 375. No comprehensive accessibility, Lighthouse/performance score or clinical safety claim is made.

## Team demonstration and evidence to finish

1. Run one shared local API/database and Vite frontend. Use synthetic organizer/caregiver accounts and explicitly record the patient ID. Keep real credentials outside Git/report screenshots.
2. Faraaz demonstrates live search, alternative candidate review and save, then the manual fallback, filtering, edit and archive. Show source/manual labels and actual outgoing API response/retrieval date.
3. Ihfaz enters a manual draft and uploads the synthetic printed fixture; reviews OCR, selects the intended saved item, corrects quantity/timing/duration, clears clarification and explicitly confirms. Reload, replace/compare and show the immutable prior version. Explain what happens if its cabinet item is archived.
4. Sahir demonstrates create/assign, a separate permitted caregiver signing in, notes, explicit acknowledgement, accept/complete/reopen and history. Show disabled/pending/accepted/unknown notice states truthfully; an app acknowledgement is not proof of Telegram receipt.
5. Complete the [Step 23 real Telegram procedure](STEP_23_CAREGIVER_TASKS.md) with a dedicated bot, private configuration and consenting test recipient. Capture actual redacted receipt/attempt evidence. This has **not** happened in the current session.
6. Revoke caregiver access and verify all three areas reject new reads/writes, then restore the existing grant. Reload/restart and compare persisted IDs/state. Record actual screenshots/API/DB evidence, not mock screen fixtures.
7. Each owner reviews the affected code, contributes under their own accurate identity and rehearses a real frontend/backend modification. Fill in actual personal commit/PR links and Jira task/status URLs. Ask a teammate to review before any merge. Faculty scope/rubric/acceptance decisions remain theirs.

The existing React/CSS interface and Step 14 interaction goals are extended; no new Figma file or pixel-perfect redesign is claimed. No messages were sent to real contacts/services via Telegram. **Next planned implementation: Step 25, confirmed schedule builder (A2), while the outstanding Module 1 demonstration/sign-off gates remain open.**
