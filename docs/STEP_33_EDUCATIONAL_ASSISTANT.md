# Step 33 — B4 source-grounded educational assistant

Implemented locally on 21 November 2026. Owner: Faraaz. The agreed educational
function and ownership remain unchanged. Faraaz must understand, rehearse and be
able to modify the feature before submitting personal demonstration evidence.

## Implementation decision

The roadmap explicitly permits transparent source search without a model. This
implementation uses a narrow deterministic question-to-section mapping over
saved B2 applicability-confirmed label passages. It returns exact quotations and
their source URL, retrieval date, version, content hash and original passage key
and index. It sends no question or patient information to an external service.
Source text is rendered as React text and cannot execute markup or instructions.

Supported questions, ignoring case and trailing punctuation:

- What warnings are in the label?
- How does the label say to store this medicine?
- What is the labelled purpose?
- What active ingredients does the label list?

All other questions abstain, including personal treatment, prescribing and
invented-topic requests. An absent section abstains. Several differing matching
passages are shown together with an insufficient-evidence outcome: the search
cannot determine whether they agree or contradict each other. It never chooses
one as a treatment conclusion. Duplicate identical passages may be quoted.
This intentionally limited search avoids model cost, fabricated summaries and
invented citations. It is not a general conversational assistant.

Only an active, externally identified cabinet item with a current B2 card whose
RxCUI and cabinet revision match can supply evidence. Missing/unselected/stale
cards produce insufficient evidence. A missing stored source record produces
an explicit error outcome. Sources are saved snapshots; this feature does not
perform live refreshing or establish that the label is the latest available.
Refresh/review the source through Medicine information. Historical answers flag
changed cabinet details when reopened. Private B2 notes are excluded.

## Contract refinement

The proposed conversation/message worker contract is replaced by synchronous
`educational-answers` resources. This small bounded extractive search needs no
background job, polling or conversation container. Each question is independently
reviewable, receives feedback and can be deleted. Existing conversation routes
were unimplemented; no implemented clients or data require migration. The API
contract and data model are updated in this change.

All writes retain scoped cabinet.write, CSRF, transaction, audit and UUID
idempotency protection. Reads require cabinet.read. Creation/feedback receipts
return IDs only, with a separate GET for content. Deletion clears stored question,
medicine name, citations and feedback/comment payloads, retaining minimal record
IDs, result category and deletion/audit metadata. The immutable shared B2 source
record remains for the medicine card and other features. Deleted answers are
excluded from history and GET returns 404. Replaying an earlier creation receipt
returns its ID only and cannot resurrect text. This does not erase database
backups or unrelated B2 evidence.

## Local demonstration

1. In Medicine cabinet, choose and review the actual RxNorm product identity.
2. In Medicine information, review and save an applicable label with a supported
   section. Availability depends on actual source coverage. Use synthetic data.
3. Open Educational assistant, select the medicine and a supported question.
4. Compare every quoted character against the saved passage and inspect its source
   URL, date and version. No excerpt means an explicit abstention.
5. Try an invented topic and a personal dosing request; show insufficient evidence.
6. Mark helpful/unhelpful, reload, reselect the patient and reopen the saved question.
7. Delete it and verify it disappears. Inspect MongoDB to confirm cleared payloads.
8. Explain the topic mapping and transaction boundary; modify a visible React
   explanation and add a supported label-section mapping with an acceptance case.

## Verification

Backend: `node verification/step18/api.mjs server/test/educational-answers.test.js`.
Seven checks passed against real disposable MongoDB and Express: unavailable
label, exact source text/private-note exclusion, unsupported/personal/injected
questions and missing section, differing passages, feedback/replay/scoped access
and deletion, source loss and cabinet-change invalidation.
Evidence: `docs/evidence/step33-api.txt`.

Build: `npm run build`. UI rehearsal:
`node --experimental-vm-modules verification/step18/run.mjs`, with
`MEDIMATE_DOM_REPORT=docs/evidence/step33-dom.json` (absolute paths also supported).
The harness uses real local MongoDB/Express, the compiled React bundle and
controlled label fixtures. It checks exact cited text, escaped markup, feedback,
reload persistence and deletion. A successful run alone creates the evidence file.
JSDOM does not verify native browser layout, dialog focus or accessibility.
Student rehearsal, real-browser visual checks and faculty acceptance remain open.

No new paid service or model configuration is required. Telegram setup remains
deferred. Next numbered step: Step 34 — Sahir's unconfirmed-dose follow-up.

Full backend regression: 145/145 passed. The harness now limits execution to two test files concurrently. An overlapping default-concurrency backend/UI attempt exhausted local allocation and produced dependency failures; the separate bounded backend run passed. See docs/evidence/step33-regression.txt.

UI test harness correction: the deletion polling assertion compares a boolean rather than a React DOM element to null. Inspecting a temporarily present element on assertion failure can traverse React internals and exhaust allocation; this changes test diagnostics only.

Final UI rehearsal passed: production-bundle citations, escaped source markup, feedback, remount persistence and deletion. Evidence: docs/evidence/step33-dom.json. Full backend regression passed 145/145 and the production build passed.
