# Faraaz Jamil Chowdhury viva sheet

Student ID 24241205. Own functions B1, B2, B3 and B4. Human rehearsal status:
**NOT_RUN**. Answer from the actual source and synthetic records.

## Show and explain your four workflows

| ID | Demonstration | Code to open | Stored result and failure |
| --- | --- | --- | --- |
| B1 | Search, explicitly review/save a candidate, edit/filter/archive; show manual fallback. | `client/src/MedicineCabinet.jsx`, `server/v1/cabinet.js`, `server/v1/rxnorm.js` | Cabinet/revision/source records. Names for external identities come from the server; unmatched search is not an automatic match. |
| B2 | Choose applicable label, inspect original passages/date, save note and remove label/note independently. | `client/src/MedicineInformation.jsx`, `server/v1/information-cards.js`, `server/v1/openfda.js` | MedicineCard/source snapshot and independent note. An outage retains labelled saved evidence without claiming fresh retrieval. |
| B3 | Confirm ingredient identities, compare combination/duplicate products, acknowledge overlap/insufficiency. | `client/src/IngredientReview.jsx`, `server/v1/ingredient-reviews.js` | IngredientConfirmation/review/source metadata. Missing evidence never means safe. |
| B4 | Ask a supported source-section question, read exact citation, test abstention, feedback and deletion. | `client/src/EducationalAssistant.jsx`, `server/v1/educational-answers.js` | Saved question/outcome/citations/feedback and payload deletion. No LLM or personal prescribing answer is configured. |

Read the patient checks in app.js, models in store.js, and request.js error handling.
Source metadata is not the same as a patient's private note or a clinical decision.

## Viva questions and answer cues

1. **Why explicit RxNorm selection?** Search can be ambiguous and has limited local
   product coverage. The server resolves the chosen RxCUI and retains provenance;
   a client-supplied display name cannot assert an external identity.
2. **How is manual fallback labelled?** It is user-entered/unverified and must not
   silently acquire the guarantees of an externally identified record.
3. **How do source and note removal differ?** Each can be removed without erasing
   the other; source passages remain separate from personal commentary.
4. **What does source applicability mean?** The user reviews the product/label match;
   display the saved URL, identifier, retrieval time and original passages. It is
   not a clinician's assessment or a guarantee of the newest label.
5. **Why confirm ingredients before comparison?** Alias/combination identities need
   reviewed evidence. Overlap, supporting label text and insufficient data are
   separate outcomes; there is no complete interaction checker or safe verdict.
6. **Is B4 generative AI?** No. Four supported question forms map to saved evidence
   sections. Exact passages/citations are returned; unsupported, missing or ambiguous
   evidence abstains. No question/patient data is sent to an external model.
7. **What happens after cabinet details change?** Explain stored revisions, stale
   applicability/ingredient confirmation and which workflows require renewed review.
8. **How are malicious source/note strings displayed?** React text rendering avoids
   executing embedded markup; permission and schema/field validation remain server
   responsibilities. Explain revocation, cross-patient IDs and response failures.

## Your live modification task

Change only **B1 transcribed strengthText** from a 200 to an 80 bound in the practice
copy. Preserve the full server-resolved external product name and identity.

1. Find the Strength (optional) input and change maxLength to 80. The displayName
   limit remains 500; the form field remains unchanged.
2. In cabinet creation, apply 80 to strengthText only. In cabinet edits, preserve
   the 500 displayName / 200 form bounds while applying 80 to strengthText.
3. Change only CabinetItem.strengthText in store.js to String with maxlength 80.
   Do not change PrescriptionInstruction.strengthText or immutable source passages.
4. Explain why both create and update paths need validation, and why the current
   db.update helper does not gain universal validation from this model edit.
5. Test 79/80 accepted, 81 rejected; rejected edits must preserve record, revision
   and history. Mongoose document insert must reject an 81-character field in
   the modified reference. Stored descriptions must never be silently truncated.
6. Build and test the actual strength input, refresh/restart, then rerun the source
   and cabinet regressions. Discuss handling of pre-existing longer descriptions.

Focused reference test, from the rehearsal source:

```powershell
$env:VIVA_EXPECT_LIMIT = '80'
node verification/step18/api.mjs server/test/viva-faraaz.test.js server/test/cabinet.test.js server/test/rxnorm.test.js server/test/information-cards.test.js server/test/ingredient-reviews.test.js server/test/educational-answers.test.js
```

`faraaz-reference.patch` is an answer key, already applied only in the supplied
reference copy. The canonical Source application is unchanged.

## Evidence you must record

Show your changed input, valid/invalid API requests, persisted field, unchanged
state after rejection, source provenance and passing tests. Hide session/CSRF
values. Record your own reviewed commit/Jira item and explanation. Historical
RxNorm/openFDA successes and Codex's reference run do not establish your viva pass.
