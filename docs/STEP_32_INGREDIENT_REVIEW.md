# Step 32 — B3 ingredient and label review

Implemented locally on 21 November 2026 in `feature/step32-ingredient-review`.
Owner: Faraaz. Assessed scope and ownership are unchanged. Faraaz must rehearse,
understand and be able to modify the feature before claiming individual completion.

## Workflow

1. Open **Ingredient review**, select 2–20 active cabinet medicines.
2. For each externally identified medicine, choose **Review ingredients**. Compare
   the saved cabinet name, transcribed strength/form and actual package against the
   resolved RxNorm product and its complete returned IN ingredient list.
3. Confirm only after that review. Correct a mismatched product in the cabinet;
   unresolved or manual identities remain insufficient. Ingredients cannot be
   supplied or edited as client claims.
4. Compare the selected medicines. The saved review preserves cabinet revisions,
   confirmed ingredients, overlaps, immutable ingredient source records and current
   B2 applicability-confirmed label passages with their source metadata. Personal
   notes are excluded from label evidence. Missing labels have an explicit marker.
5. Read source passages, acknowledge and optionally save a follow-up note.
   Reopen the review from history after reloading the app.

## Result boundaries

The algorithm compares canonical RxNorm **IN RxCUIs**, including all returned
ingredients in a combination product. Aliases with the same ID overlap. It does
not infer an identity from a display name, strength string, manual entry or fuzzy
match. Precise salt equivalence, excipients, clinical interactions and overall
medicine safety require separate review. A single missing/outdated ingredient
confirmation makes the result `insufficient_information`, even when some known
overlaps are displayed. Otherwise results are `overlap` or
`no_overlap_in_confirmed_ingredients`. The latter describes the confirmed set only.

Any cabinet edit, including strength/form, invalidates the previous confirmation.
Historical results stay frozen and display `itemsChanged` when cabinet revisions
or active status differ. Acknowledgement records reading/follow-up, never clinical
approval. Missing label evidence remains separate from ingredient completeness.

## Technical choices and contracts

The initial contract had comparison and acknowledgement routes but no way to
confirm authoritative ingredients. Added patient-scoped candidate and confirmation
routes supply that prerequisite. `STEP_16_API_CONTRACTS.md` documents their fields.
RxNorm calls use the existing fixed-host timeout, bounded-response, queue and
12-hour cache. Product resolution accepts active SCD/SBD concepts; related IN
responses are bounded to 20 unique ingredient IDs and validated in full.

Live NLM responses on this date returned `relatedGroup.rxcui:null` for both sample
products. The request URL binds the resolved product ID; a conflicting non-null
echoed ID is rejected. An adapter regression covers this observed schema.
Original evidence: `docs/evidence/step32-live.json`.

MongoDB adds `ingredientConfirmations` (unique patient/item) and
`ingredientReviews`. SourceRecord retains immutable public ingredient evidence.
All writes use existing CSRF, scoped permissions, UUID idempotency receipts,
audit and transactions. Cabinet/confirmation writes fence concurrent changes.
Confirmation requires expected cabinet and confirmation revisions plus the hash
of the reviewed authoritative ingredient set/product name. Successful replay
does not require another upstream call. Acknowledgement is one-time and revision
checked. History uses bounded pages of 20. Evidence over 1 MiB is rejected with a
request to compare fewer medicines; text is never silently truncated.

## Validation and remaining demonstration

- Backend integration tests exercise manual/missing data, aliases, combinations,
  no overlap, incomplete positive overlap, saved source passages, excluded private
  notes, strength/form edits, immutable history, source outage, revision/hash
  checks, idempotency, scoped access and acknowledgement.
- Adapter tests cover malformed/incomplete/oversized relations and the nullable
  NLM field. Full regression run before final adapter hardening: 137/137 passed.
  See `docs/evidence/step32-api-final.txt` for affected tests after final changes.
- `verification/step18/run.mjs` exercises the production React bundle with real
  local Express/MongoDB and controlled public providers. Evidence is recorded in
  `docs/evidence/step32-dom.json` only on a successful run. JSDOM does not establish
  visual layout, browser accessibility or a student's demonstration.
- Live public retrieval passed for RxCUIs 198440 and 857004, yielding ingredient
  overlap 161 (acetaminophen), with both ingredients retained for the combination.
  This is reference retrieval evidence, not clinical validation.

Reproduce backend checks using the repository's existing MongoDB replica harness:
`node verification/step18/api.mjs server/test/ingredient-reviews.test.js server/test/rxnorm.test.js`.
Build with `npm run build`. Run the UI rehearsal with
`node --experimental-vm-modules verification/step18/run.mjs`.
An installed compatible MongoDB binary can be supplied through
`MONGOMS_SYSTEM_BINARY`; the test replica is disposable.

The next numbered implementation step is Step 33, Faraaz's B4 source-grounded
educational assistant. Live Telegram setup remains deferred at the user's request.
This working copy also contains earlier Assignment 03 changes; those remain
preserved and must be reviewed separately when preparing a focused GitHub diff.

## Public source references

- [NLM getRelatedByType](https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getRelatedByType.html)
- [RxNorm ingredient lookup FAQ](https://www.nlm.nih.gov/research/umls/rxnorm/faq.html)
- [RxNorm term types](https://www.nlm.nih.gov/research/umls/rxnorm/docs/appendix5.html)
