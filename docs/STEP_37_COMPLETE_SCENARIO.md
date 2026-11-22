# Step 37 — Complete synthetic end-to-end scenario

Verified locally on 21 November 2026. One patient, one authorized caregiver and
one independently consenting emergency contact pass through all 13 functions and
a restart checkpoint. The run uses actual compiled-app HTTP routes, Express,
MongoDB transactions, persisted source records and the report renderer. Public
reference providers and Telegram transport are controlled adapters; no real
message, emergency-provider request or patient information was transmitted.

## Recorded result

The final run passed **14 checkpoints through 81 HTTP exchanges**. Each checkpoint
records input, expected state, observed result, record IDs and zero-based indexes
into the HTTP exchange log. Counts and outcomes are asserted against persisted
responses/database state, not hardcoded screen records.

- [Readable checkpoint ledger](evidence/step37-checkpoints.md)
- [Detailed scenario and synthetic record IDs](evidence/step37-scenario.json)
- [HTTP methods, paths and status codes](evidence/step37-exchanges.json)
- [Test transcript](evidence/step37-api.txt)
- [Artifact/source hashes and credential-field audit](evidence/step37-manifest.json)
- [Generated PDF checks](evidence/step37-pdf-qa.json)

The fixture database is removed after assertions. IDs in these artifacts are
historical synthetic evidence and cannot be pasted into a running demonstration
checkout. A human demonstration creates its own current records/IDs.

## Reproduce

In the tested delivery checkout:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
./verification/step37/run.ps1
```

This starts a disposable MongoDB replica, exercises the scenario, stops it and
packages the evidence. It does not use or delete the handoff's persistent local
database. The runner uses MONGOMS_SYSTEM_BINARY if configured, otherwise checks
this device's existing cached MongoDB 7.0.24 executable. On another computer,
configure a compatible installed binary or the normal memory-server cache.

For a fresh clone, first install the root workspaces and the existing verification
dependencies, then build the frontend:

```powershell
npm ci
npm ci --prefix verification/step18
npm run build
```

The direct test command is
`node verification/step18/api.mjs server/test/end-to-end.test.js`.
The scenario is also registered in the default API suite. Application code was
unchanged in this step. Step 36's 174-test regression remains the previous baseline;
the new complete-scenario case was executed separately, not represented as a new
full-suite run. The runner's successful result and hashes identify the exact local
working source; a dirty working tree is explicitly recorded without inventing a
student commit or contribution.

## Sequence and expected invariants

| Stage | Actor | Concrete result |
|---|---|---|
| Foundation | Owner/caregiver/contact | Separate accounts; caregiver has only declared patient grants; caregiver and contact complete app chat-link consent using controlled Telegram updates. |
| A1 | Owner/Sadat workflow | Draft one synthetic instruction, then bind the reviewed B1 medicine before explicit confirmation; immutable confirmed source retained. |
| B1 | Owner/Faraaz workflow | Save two reviewed external identities: primary and combination. The primary is shared by A1/A2 and later stock/report records. |
| B2 | Owner/Faraaz workflow | Review an applicable label; all saved passages equal the original controlled provider text. |
| A2 | Owner/Sadat workflow | Preview/confirm a two-hour synthetic ten-minute interval in Asia/Dhaka, producing 12 occurrences. These are test timings, never medical directions. |
| Stock prerequisite | Owner | Establish opening count 2 before any intake. This is a known pre-dose baseline, not an after-dose count. |
| C2 | Caregiver/Sahir workflow | Record first taken and second skipped. Replay the taken request; one action and one automatic debit persist. Third occurrence remains pending. |
| A3/A4 | Owner/Sadat workflow | Balance 1 reaches threshold 1; generate a refill checklist, save a controlled pharmacy listing, link it to a caregiver collection task. |
| C1 | Caregiver/Sahir workflow | Controlled channel acceptance, separate app acknowledgement, accept and complete. Completing the collection/checklist changes no stock. |
| A3 refill | Owner | Record the actual synthetic refill of 5 separately. Final balance is 2 - 1 + 5 = 6, with exactly one dose debit. |
| C3 | Owner/caregiver | Consent to delay 10 minutes. At the third occurrence's exact overdue boundary, create one follow-up/task; acknowledge and resolve unable_to_contact. Dose remains pending. |
| B3 | Owner/Faraaz workflow | Confirm full canonical ingredient sets. Primary and combination overlap on RxCUI 161, retaining both combination ingredients; save acknowledgement. Missing combination label evidence remains explicit. |
| B4 | Owner/Faraaz workflow | Quote the exact saved warning passage, abstain on a personal treatment request, and save feedback. No model-generated treatment statement. |
| C4 | Owner/caregiver | Add a synthetic visit note and export/download. Analytics and PDF snapshot both show taken 1, skipped 1, pending 9, overdue-unconfirmed 1; refill/source/task history included. |
| C5 | Owner/contact | Owner invites; contact alone accepts. Denied location remains denied. Repeated activation saves one incident/alert. Controlled channel acceptance precedes separate recipient acknowledgement. Provider request is explicitly simulated. Resolve and send one closure notice; contact still has no chart access. |
| Restart | All relevant accounts | Restart HTTP server and MongoDB client connection. Existing sessions, source records, resolved follow-up/SOS and identical PDF bytes remain. Workers send no additional notice. |

The scenario records two controlled caregiver task notices, one controlled SOS
alert and one controlled SOS closure. In these artifacts, sent means acceptance
by the test adapter. It does not establish a real Telegram delivery. Chat proof
passes through the actual hashed challenge/confirmation code, while its upstream
Telegram update is controlled test input. Raw codes, cookies, passwords, signed
selection tokens and chat IDs are excluded from the exported ledger/log.

## PDF and frontend evidence

The actual downloaded PDF is
`output/pdf/step37-synthetic-visit.pdf` in this checkout. It has two pages; Poppler
rendering was visually reviewed and pypdf/pdfplumber checked counts, refill, note
text and horizontal page bounds. Its SHA-256 matches the scenario's download
before and after reconnect. PNG pages and extracted text sit beside the PDF.
Generated outputs are ignored by Git; they contain synthetic fixture data only.
After rerunning the scenario, render/check the new PDF before reusing a visual
QA claim or its PNGs. The manifest's pdfQa.matchesCurrentPdf reports whether the
separately recorded PDF QA belongs to the newly generated PDF hash.

Step 36's [production-bundle DOM rehearsal](evidence/step36-dom.json) remains the
frontend evidence for the unchanged application code. Its transcript and the
current compiled bundle/source files are hashed in step37-manifest.json. This
step does not relabel a scripted HTTP test as a new native-browser demonstration.
Actual worker process restart/crash evidence remains in Steps 28, 34 and 36;
this run specifically restarts the HTTP listener and database client connection.

## Team rehearsal and capture order

Use the handoff's MongoDB/Express commands and one chosen server/database, such
as Sahir's port 1212. Owner, caregiver and emergency contact should use separate
browser profiles/private sessions on that same origin. Do not mix account IDs
from the isolated 1499/1205/1212 databases. Existing Word reports and Assignment
03 screenshot slots are unchanged by this verification step.

1. **Shared setup:** create synthetic accounts/patient and grant only the caregiver
   permissions needed for dose/task/report views. Show the recipient inbox account
   ID. Telegram setup stays deferred unless explicitly configured with consent.
2. **Sadat A1:** show the draft, input/review corrections and confirmed source.
3. **Faraaz B1/B2:** select the explicit product, show cabinet association and
   applicability-reviewed original label passages with source date/URL.
4. **Sadat A2:** show the preview, timezone, confirmation and resulting occurrences.
5. **Sadat baseline/Sahir C2:** save pre-dose stock 2, then show taken/skipped and
   the single ledger debit. Keep the unconfirmed occurrence visible.
6. **Sadat A3/A4:** show low stock, checklist, public listing/preference and linked
   collection task. With a source outage, capture that real error and use clearly
   labelled controlled evidence separately; never present a fixture as a live map.
7. **Sahir C1:** acknowledge/accept/complete the collection task; show its retained
   listing and notice state. Then record actual refill 5 and reconcile balance 6.
8. **Sahir C3:** configure delay, run the follow-up worker, acknowledge/resolve the
   contact attempt and verify the dose remains pending.
9. **Faraaz B3:** confirm identities, compare combination overlap, display sources,
   missing-label marker and acknowledgement.
10. **Faraaz B4:** supported question/citation, unsupported personal request,
    feedback and deletion as required by his own feature demonstration.
11. **Sahir C4:** visit note and explicit date range, counts, actual PDF download,
    matching totals/source/refill history and saved export after reload.
12. **Sahir C5/contact:** invite/accept in separate sessions; dismiss activation
    review once; confirm denied-location SOS; show notification status and separate
    acknowledgement. Show simulation-only provider request and explicit closure.
13. **Persistence:** restart local services/workers, sign in/reselect as necessary,
    and reopen the saved source, follow-up, SOS and report. Record the actual
    observed status; a reconnect alone is not a claim about native process crashes.
14. **Individual live edits:** each member explains and changes a small part of
    their frontend and backend, then reruns an affected request. Preserve genuine
    authorship, Git/Jira and faculty evidence.

In the user's unconfigured local Telegram setup, expected manual notice state is
disabled/NOT_CONFIGURED with zero actual sends, rather than the controlled sent
states in the automated artifact. Live Telegram, successful public map integration,
native-browser/device checks and individual contribution/faculty evidence remain
open. Public deployment/local-demo requirements are still unconfirmed. The
technical scenario passes without silently closing those course gates.

Next roadmap step: Step 38 — failure and permission audit.
