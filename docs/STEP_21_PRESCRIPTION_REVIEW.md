# Step 21 — A1 prescription review and immutable history

Verified 2 November 2026 with synthetic data. A1 remains owned by **Ihfaz Rashid Sadat**. This is an AI-assisted implementation for owner review, not an individual contribution or faculty acceptance claim. The branch is based on Step 20 (draft PR #3); review the earlier shared infrastructure first.

## Implemented workflow

Enter a manual draft or choose a printed PNG/JPEG, inspect editable OCR suggestions, correct the instruction fields, save, explicitly acknowledge review and confirm. Confirmation requires every line to have medicine/instruction text, a positive quantity, supported unit, timing and duration text, with clarification cleared. Saving an incomplete draft is allowed; confirming it is blocked. OCR never confirms a version or creates a schedule.

Create a replacement from the current confirmed version, save corrections, compare fields and confirm a new version. Old versions and instruction identities remain immutable and readable after reload and database restart. Comparison aligns by line number and reports added, removed and changed fields; it is not an ingredient or clinical comparison. Archival preserves history and blocks further changes.

## Technical decision and contract changes

The earlier Step 16 asset/job proposal is replaced for this slice by **browser-local Tesseract.js 7.0.0**, loaded only when OCR is requested. It avoids a server upload store and background job service while retaining editable review and history. No image bytes are sent to Express or retained by MediMate. First OCR use downloads worker/core/English recognition assets from the library's default remote locations; recognition then runs in the browser. Network or recognition failure leaves manual entry available. See the upstream [API](https://github.com/naptha/tesseract.js/blob/master/docs/api.md) and [local installation guidance](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md). A future offline deployment can self-host those assets. Local OCR does **not** satisfy Ihfaz's external API course requirement; A4 remains planned.

Source metadata stores file name, MIME type, size, SHA-256 reference, original OCR text, optional confidence and success/failure status. It is untrusted client metadata, not proof of file authenticity. Editable suggestions do not overwrite the original OCR text; copy corrected text into instruction fields before saving. The original image is not retained; keep it separately if needed for a demonstration. English printed text is the tested scope; handwriting, Bangla and medical accuracy are not established.

All routes are under `/api/v1/patients/{patientId}` and use existing session, CSRF, scoped permissions, mutation idempotency and transaction/audit handling:

| Route | Implemented behavior |
|---|---|
| POST /prescriptions | Create parent plus draft instructions, optional title/source metadata |
| GET /prescriptions | Existing scoped paginated list |
| GET /prescriptions/{id} | Parent, currentVersion and draftVersion, each including instructions |
| POST /prescriptions/{id}/versions | Replacement using parent expectedRevision and current previousVersionId |
| PATCH /prescriptions/{id}/versions/{versionId} | Replace draft instructions with version expectedRevision; optional source/reviewCorrections |
| POST /prescriptions/{id}/versions/{versionId}/confirm | Version expectedRevision and reviewed:true; stamp confirmer/time, atomically move current pointer |
| GET /prescriptions/{id}/versions | Nested instruction history, limit 1–100 and stable cursor |
| GET /prescriptions/{id}/comparison | fromVersionId and toVersionId scoped to this parent |
| POST /prescriptions/{id}/archive | Parent expectedRevision; preserve versions |

Reads require `prescription.read`; draft creation/edit/replacement/archive require `prescription.write`; confirmation independently requires `prescription.confirm`. A read+confirm caregiver can inspect and confirm a complete saved draft without write permission. Replay rechecks access, including revocation. Parent revisions also advance on draft edits; clients must reload detail before replacement/archive. Draft PATCH and confirmation use the **version** revision.

At most 30 instruction lines, unique positive line numbers and existing 64 KiB JSON limit apply. Draft quantities use positive decimals (up to 12 integer and 6 fractional digits). Confirmation supports tablet, capsule, mL, mg, g, drop, puff, unit and application. Timing/duration are reviewed text, not interpreted schedule rules or clinically verified values. OCR files are PNG/JPEG, up to 5 MiB; signature and decoded dimensions are checked (32–10000 per side, at most 20 million pixels), with cancellation/60-second recognition timeout.

Schema changes are additive: version previousVersionId, confirmedAt, confirmedByUserId, reviewCorrections and source; instruction frequencyText/durationText. No destructive migration or rewrite of confirmed history is performed. Older incomplete drafts need timing/duration before confirmation. Existing installed collections require no backfill for these optional fields. No server asset/OCR-job endpoint is claimed implemented.

## Code to review and explain

`server/v1/prescriptions.js` contains validation and transactional lifecycle routes; `store.js` supplies additive schema fields and session-aware list/remove operations. `client/src/PrescriptionReview.jsx` contains the editor, OCR lifecycle, explicit review, comparison/history and stale-response guards. `ValidatedForm.jsx` resolves indexed field paths. The existing App retains account/cabinet/task flows and delegates A1 to this panel.

Ihfaz should personally review and contribute changes, explain revision/idempotency/authorization behavior, and practise changing an instruction field in React and its server validation. Do not present generated commits as his personal work. Faculty scope/ownership changes still require agreement; this implementation changes a technical contract only.

## Reproduction and observed evidence

Use Node 24 and a replica-set MongoDB, following Steps 17–19 setup. From repository root:

```sh
npm ci
npm ci --prefix verification/step18
npm run build
node verification/step18/api.mjs
npm test --prefix verification/step18
```

On this restricted Windows host, standalone installs from Step 19 avoided denied workspace symlinks. Tests use mongodb-memory-server with disposable replica sets; set MONGOMS_DOWNLOAD_DIR to a cached binary directory if needed. Use a **fresh MONGOMS_DB_PATH directory for each separate invocation**; reusing a replica-set directory with a different random port can fail startup. The API runner includes both existing access tests and A1 tests. DOM verification executes the real production entry as an ES module with Node's experimental VM module flag (configured in the verification package), against real Express/MongoDB. OCR is checked separately in Chromium, not simulated in JSDOM.

- API suite: 25 reported tests pass, no failure/skip; includes incomplete/unreviewed confirmation, concurrent/replayed requests, immutable versions, replacement/diffs, pagination, cross-patient/parent access, read/write/confirm separation, revocation, source validation, transactional rollback, archive and database restart.
- Production-bundle DOM suite: prior shared regressions plus draft edit, explicit review, replacement comparison, confirmation, remount and old-version quantity checks pass. Machine-readable results remain in `docs/evidence/step18-dom.json` for the shared runner.
- Real Newman run: 15 requests, 22 assertions pass; import `postman/MediMate_Step21.postman_collection.json`. The cookie jar is disabled and session variables remain runtime-only. CLI evidence: `docs/evidence/step21-newman.txt`.
- Chromium: actual English OCR of a synthetic printed image; reviewed confirmation; quantity 1→2 comparison; reload/current-v2 and immutable-v1 views; invalid PNG-signature rejection; blurred-image empty OCR persisted as a clarification draft with confirmation blocked. Desktop 1440×1000 and mobile 390×844 inspected; mobile had no horizontal overflow in the inspected view. This is not a comprehensive accessibility or OCR accuracy assessment.

Browser screenshots and synthetic fixtures are supplied with the review deliverables; no real prescriptions or session secrets are committed. No deployment or external service credit is claimed. Module 1 integration, Jira, individual contribution/viva and faculty-specific submission evidence remain open. **Next: Step 22 — B1 medicine search and personal cabinet.**
