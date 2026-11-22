# Faraaz — B1 Module 1 walkthrough

Faraaz Jamil Chowdhury, 24241205. Personal demonstration status: NOT_RUN.

1. Search live RxNorm and inspect the actual request/response and retrieval date.
   Show multiple candidates and explicitly review the selected medicine/strength/form.
2. Save the selected item; reload and reopen its retained source snapshot.
3. Show a no-result state and clearly labelled manual entry. A controlled outage
   is a separate technical fixture, not evidence that the public service failed.
4. Demonstrate name, entry-source and active/archived/all filters. Edit a manual
   item with a reason and inspect its immutable revisions.
5. Archive the item and find it with the archived filter; show retained history.
   Explain why archival does not erase prior confirmed prescription references.
6. Demonstrate invalid input, stale revision, read-only/revoked access and reload
   persistence. External source identity cannot be relabelled as another product.
7. Explain the frontend/API/model path and perform your own frontend/backend edit
   in an isolated practice copy. Rerun relevant regression and interpret results.

Code: `client/src/MedicineCabinet.jsx` → `server/v1/cabinet.js` and `rxnorm.js` →
CabinetItem, CabinetRevision and SourceRecord in `server/v1/store.js`.

Questions: Why is selection explicit? What is sent upstream? Why is manual identity
unverified? How do cache/retrieval dates differ? Why does an external name stay
fixed? How do revisions/transactions prevent lost edits? What survives an outage?

Practice example: change the optional strength-text limit consistently in the UI,
create/edit API validation and schema; test accepted/rejected boundaries and that
an invalid edit preserves the old value. Review legacy data and shared producers
before applying any production contract change. Existing isolated instructions:
`docs/viva/FARAAZ.md`. Reference answer patches are not personal contribution proof.

Import `MediMate_Module1_Faraaz.postman_collection.json`, port1205. Run all23 requests
in Postman_Run_Order.csv, including setup. The11 numbered B1 captures are supplied.
Fresh actual RxNorm technical evidence exists, but you must demonstrate it yourself.
Add your own UI/demo evidence and actual commit/Jira/evaluator links to the record.
