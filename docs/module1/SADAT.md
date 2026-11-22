# Sadat — A1 Module 1 walkthrough

Ihfaz Rashid Sadat, 23301499. Personal demonstration status: NOT_RUN.
This sheet supports your own explanation and work; it is not contribution credit.

1. Open Prescriptions. Create a synthetic manual draft with missing dose details;
   show why it cannot confirm. Reload and show the saved draft.
2. Upload the supplied synthetic printed image, inspect OCR and correct the fields.
   Explain local OCR versus downloading engine/language assets; local OCR is not
   external API credit and no original image is stored by the backend.
3. Choose the same-patient saved medicine from B1. Show that the reference does
   not fill/validate clinical instructions and rejects foreign/archived new links.
4. Complete quantity, unit, timing and duration, resolve clarification, save,
   explicitly review and confirm. Show the saved instruction/version IDs.
5. Replace, correct one field, compare and confirm the new version. Reopen the old
   version after reload; it must retain its original values.
6. Delete a separate current unconfirmed draft. Explain why confirmed history is
   preserved. Show invalid-input and revoked-caregiver access failures.
7. Explain the frontend/API/model path and perform your own frontend/backend edit
   in an isolated practice copy, then run the affected requests/tests.

Code: `client/src/PrescriptionReview.jsx` → `server/v1/prescriptions.js` →
Prescription, PrescriptionVersion and PrescriptionInstruction in `server/v1/store.js`.
Look at draft PATCH/DELETE, confirmation, revision/idempotency and scope checks.

Questions: Why is OCR editable? What does reviewed confirmation establish? Why are
versions immutable? Which revision belongs to the draft versus the parent? What
happens to a saved reference after cabinet archive? Why does hiding a button not
replace API authorization?

Practice example: lower the prescription-title limit consistently in the input,
API validation and model, then test the boundary and rejection/no-partial-write
case. This is a training exercise; review existing values before any production
contract change. Existing Step 42 isolated practice instructions are available in
`docs/viva/SADAT.md`; do not present the assistant's reference patch as your edit.

Import `MediMate_Module1_Sadat.postman_collection.json`, port1499. Run all20 requests
in the supplied Postman_Run_Order.csv, including setup. The10 numbered A1 captures
are provided; their labels/filenames are in the capture map. Add your own UI/demo
evidence and actual commit/Jira/evaluator links to Human_Assessment.csv.
