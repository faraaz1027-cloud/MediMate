# Ihfaz Rashid Sadat viva sheet

Student ID 23301499. Own functions A1, A2, A3 and A4. Human rehearsal status:
**NOT_RUN**. Use synthetic records and demonstrate your own understanding.

## Show and explain your four workflows

| ID | Demonstration | Code to open | Stored result and failure |
| --- | --- | --- | --- |
| A1 | Enter/import, correct, save draft, confirm review, replace and compare; delete only an unconfirmed draft. | `client/src/PrescriptionReview.jsx`, `server/v1/prescriptions.js` | prescriptions, prescriptionVersions and instructions. Unresolved clarification cannot confirm; confirmed history is immutable. |
| A2 | Choose confirmed source, preview and confirm; pause at a reviewed effective time. | `client/src/ScheduleBuilder.jsx`, `server/v1/schedules.js`, `server/v1/schedule-time.js` | Schedule/version/preview and doseOccurrences. Earlier history survives a future pause; stale source/preview fails. |
| A3 | Establish stock, record one intake, replay it, generate refill list and record actual refill separately. | `client/src/InventoryBoard.jsx`, `server/v1/inventory.js`, `server/v1/stockLedger.js` | Ledger reconciles opening minus intake plus refill. Unknown units/baseline need review; replay cannot debit twice. |
| A4 | Submit area search, review listing, save preference and link a refill collection task. | `client/src/PharmacyCoordination.jsx`, `server/v1/pharmacies.js`, `server/v1/overpass.js` | Saved source/preference/checklist/task links. A map listing proves neither stock nor provider availability; timeout is not an empty success. |

Read `server/v1/store.js`, `server/v1/app.js` and `client/src/request.js` for the
shared patient, actor, validation and response path. Explain a visible field all
the way to a persisted record. Original course requirements remain in Steps 11/16.

## Viva questions and answer cues

1. **What does confirmation establish?** A user acknowledged corrected transcription,
   not clinical verification. OCR is editable and cannot confirm itself.
2. **Where does OCR run?** Browser-local Tesseract worker; engine/language files may
   download on first use. The original prescription image is not uploaded/retained.
   This is not your external API integration credit.
3. **Why immutable versions?** Old schedule/dose history must keep its source;
   replacement produces a new reviewed version instead of overwriting past facts.
4. **Why preview and timezone?** Preview binds the current reviewed source/settings.
   Explain expiry/revision checks, UTC instants, IANA zone and local-day boundaries.
5. **What happens at the pause boundary?** Review the actual effective instant and
   affected pending events; cancellation of future events must preserve earlier/acted
   history. Dismissing the dialog must change nothing.
6. **How is stock deducted once?** Identify the dose/action domain key, transaction
   and stock ledger. Idempotency is not permission to repeat after access revocation.
7. **Why does collection completion not add stock?** A task outcome is not proof of
   received quantity. A separate refill ledger entry records the actual receipt.
8. **What leaves the app for A4?** Public area/radius to the bounded Overpass adapter.
   Explain timeout/cooldown/cache/source attribution and manual area fallback.
   Demonstrate a genuinely successful live call separately if faculty requires it.

## Your live modification task

Without reading the reference patch first, change only the **prescription title**
limit from 200 to 80 in the practice copy. This is an exercise, not permission to
shorten medical instructions or migrate production data.

1. Find the title input in PrescriptionReview; change maxLength and explain how
   server validation still protects requests that bypass the UI.
2. Find `text(b.title, "title")` in prescription creation; pass an explicit 80 bound.
   Keep the title optional at the API if omitted; an invalid provided value fails.
3. Change only the Prescription model's title definition to a String field with
   maxlength 80. Do not change Task, instructions or cabinet field definitions.
4. Update the practice contract notes; discuss existing titles above 80 and why
   validation does not rewrite/truncate them. Explain Mongoose versus MongoDB.
5. Test 79/80 accepted and 81 rejected (422, title field error, no partial draft/
   version/instruction records). Check saved length after API restart.
6. Build and demonstrate the actual title input. The reference DOM check types 81
   ASCII characters and observes 80. A native browser demonstration remains yours.

Focused reference test, from the rehearsal source:

```powershell
$env:VIVA_EXPECT_LIMIT = '80'
node verification/step18/api.mjs server/test/viva-sadat.test.js server/test/prescriptions.test.js server/test/schedules.test.js server/test/inventory.test.js server/test/pharmacies.test.js
```

`sadat-reference.patch` is an answer key, already applied only in the supplied
reference copy. The canonical Source application retains its original limits.

## Evidence you must record

Capture your UI change and one valid/invalid HTTP exchange with secrets hidden;
show the persisted value/history, a passing focused regression and your explanation
of the diff. Add your actual reviewed commit and Jira link, date and any issue to
Assessment_Record.csv. Do not replace a live Overpass result with a fixture or
claim Codex's run was your own demonstration.
