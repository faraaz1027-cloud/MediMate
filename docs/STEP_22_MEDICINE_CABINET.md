# Step 22 — B1 live medicine search and personal cabinet

Verified 2 November 2026 (Asia/Dhaka), using synthetic accounts and records. **Faraaz Jamil Chowdhury remains B1 owner.** This AI-assisted change is prepared for owner review; it does not establish individual student contribution or faculty acceptance. It is stacked on Step 21 draft PR #4, preserving earlier unmerged work.

## Implemented behavior

Search RxNorm by medicine/ingredient name, inspect alternative clinical/branded drug candidates, explicitly select an RxCUI, review its full name and your strength/form transcription, then save. No candidate is selected automatically. The server resolves the selected RxCUI itself, rejects client-supplied source IDs/names/URLs and stores a source snapshot, retrieval date and SHA-256 content reference. A fixed external identity cannot be silently renamed; archive it and create a different item when the identity is wrong.

Use a clearly labelled manual entry for unmatched products or during an outage. Manual records have no external source reference and cannot claim a verified identity. Strength/form are retained as user transcription; ingredient identity, clinical appropriateness, schedules and information cards are not inferred. Bangladesh product coverage is not guaranteed. The original source name remains visible alongside edited transcriptions.

View details, filter by literal name substring, active/archived/all status and manual/RxNorm source, edit with a reason and expected revision, and archive. Default lists show active records. Every create/edit/archive appends an immutable cabinet snapshot. Archive retains the item ID, source reference and edit history; it does not delete referenced records. Later schedule/card integration remains a separate roadmap gate.

## RxNorm integration and evidence

The Express adapter uses the fixed HTTPS RxNav host and these official APIs:

- [getDrugs](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getDrugs.html) searches products associated with a name.
- [getRxConceptProperties](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRxConceptProperties.html) resolves an active concept and returns its name/type.
- [Service terms](https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html) provide attribution and traffic guidance; the requested attribution is displayed in the search UI.

This slice supports active SCD/SBD concepts with names up to 500 characters. Packs and unsupported/longer concepts are omitted; an empty supported result set offers manual entry. Strength/form are deliberately not parsed from compound drug names. Search query or selected public ID goes upstream; patient/account identifiers and cabinet notes do not. Users are told not to type personal details into search.

Requests have an 8-second upstream abort timeout, a 2 MiB response cap, at least 110 ms between upstream starts, bounded pending work, same-request coalescing and a 12-hour in-memory cache (maximum 200 entries). This reduces repeated calls and stays below the documented single-IP limit for one API process. Multiple replicas behind one IP would need shared pacing/cache before deployment. Queued requests exceeding the queue age limit fail explicitly. Failed HTTP/JSON/schema responses are not cached. Search pagination uses a query-bound offset over the cached, sorted candidates; refresh search after cache expiry if upstream results change. Sources retain the actual retrieval time even when reused from cache.

Real Chromium calls on 1 November UTC / 2 November Dhaka returned Cymbalta candidates 596928, 596932 and 615186. The browser selected 596928, saved the public source snapshot, edited only form transcription casing, archived, reloaded and displayed revisions 0–2. A synthetic no-match query returned no supported matches. A deliberately injected upstream outage showed an explicit error while a labelled manual item saved successfully. `docs/evidence/step22-live-rxnorm.jsonl` contains **real public upstream request URLs/statuses/responses only**, not private account/session data. Repeated Postman calls can use the adapter's cache; retrieval dates remain explicit.

## Implemented API and schema changes

All routes are under `/api/v1/patients/{patientId}`. Reads/search require `cabinet.read`; writes require `cabinet.write`, session, CSRF and a UUID Idempotency-Key.

| Route | Contract |
|---|---|
| GET /medicine-search | q (2–100 chars), limit (1–50, default 20), cursor? → candidates, provider, retrievedAt; meta total/nextCursor |
| GET /medicine-search/{externalId} | Numeric RxCUI → current supported concept preview |
| POST /cabinet-items | Manual: entryType:manual, displayName (1–500), optional strengthText/form (1–200). External: entryType:external, externalId, reviewed:true, optional strengthText/form. External displayName/sourceRecordId are forbidden. |
| GET /cabinet-items | q? (up to 100), entryType?, status? (active default/archived/all), limit 1–100, cursor? |
| GET /cabinet-items/{id} | Item plus stored source or null, without requiring RxNorm availability |
| PATCH /cabinet-items/{id} | expectedRevision, reason (1–500), at least one displayName/strengthText/form; empty strength/form clears it. External identity/name remains fixed. |
| POST /cabinet-items/{id}/archive | expectedRevision; preserve source/history and reject later edits |
| GET /cabinet-items/{id}/revisions | Stable createdAt+ID cursor, limit 1–100; immutable snapshots |

Unavailable upstream returns 503/RXNORM_UNAVAILABLE; unsupported/inactive selections return 422. No-match is a successful empty candidate list. Stale revisions return 409. All new routes retain existing patient scope and replay reauthorization.

The proposed sourceRecordId/ingredients create contract is refined: accept an externalId, resolve it server-side and generate the sourceRecordId. Client ingredient claims are not accepted; B3 will add evidence/confirmation. Display names expand from 200 to 500 characters for compound canonical names. Additive schema: CabinetItem.sourceRecordId; SourceRecord public source/snapshot fields; CabinetRevision patient/item/revision/actor/snapshot/reason with a unique item+revision index. First edit/archive of a pre-Step-22 item records its existing state as a legacy baseline with unknown prior actor; it does not fabricate earlier history. No destructive migration/backfill or individual attribution is performed.

Shared mutation handling gains an optional preparation callback: resolve external data before starting a database transaction, skip lookup on successful replay, then recheck access/idempotency within the transaction. Source, item, history, audit and operation records commit together. No external request executes inside the transaction.

## Validation and reproduction

Use the Steps 17–19 replica-set setup and Node 24. Root commands: `npm ci`, `npm ci --prefix verification/step18`, `npm run build`, `node verification/step18/api.mjs`, `npm test --prefix verification/step18`. Restricted Windows hosts can use the standalone package installs documented in Step 19. Tests can use cached MONGOMS_DOWNLOAD_DIR and a **fresh** MONGOMS_DB_PATH per invocation. No dependency was added for B1.

- 39 reported API/provider tests passed, no failures/skips. The B1 suite tests candidate ambiguity/pagination, source validation, concurrent replay, outage/manual fallback, literal filters, revisions/history, cross-patient/read-only/revoked access, transactional rollback, legacy baseline, archive and restart. Provider tests cover cache/coalescing, malformed responses, response bounds, timeout and retry. Existing A1/access tests still pass.
- Production-bundle DOM suite passed against real Express/MongoDB. It verifies explicit selection/review, editing, archive filters, no-match/outage fallback, and archived source/history after remount. Upstream responses are controlled fixtures here; this suite is not presented as a live external call. Shared evidence remains in `docs/evidence/step18-dom.json`.
- Real Newman run: 17 requests and 27 assertions passed using `postman/MediMate_Step22.postman_collection.json`; evidence in `docs/evidence/step22-newman.txt`. Runtime cookies/CSRF variables are not committed.
- Chromium live external workflow, reload/history and controlled outage/manual persistence passed. Desktop 1440×1000 and mobile 390×844 inspected; mobile document width was 375 within a 390-wide viewport. No comprehensive accessibility, accuracy or performance certification is claimed. Screenshots accompany the review deliverables.

## Owner review and remaining gates

Review `server/v1/rxnorm.js` (external requests/cache), `server/v1/cabinet.js` (validation/lifecycle), `store.js` (additive collections), and `client/src/MedicineCabinet.jsx` (search/editor/history and stale-response guards). Faraaz should explain why selection is explicit, why an external name is fixed, why manual data is unverified and how a transaction/revision prevents lost edits. Practise a frontend field change and matching backend validation, contribute personally and maintain Jira/individual commit evidence. The live request evidence supports an integration demonstration; faculty assessment and student ownership remain separate gates.

The UI extends the existing Step 20 React/CSS components and the Step 14 cabinet interaction goals (search, manual fallback, saved list and failure states). This is not a claim of pixel-perfect reproduction of the Figma submission. No deployment or full Module 1 integration is claimed. **Next: Step 23 — C1 caregiver task transitions, handover and Telegram linking/notifications.**
