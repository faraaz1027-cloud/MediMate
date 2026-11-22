# Step 38 failure/permission coverage

Recorded from the successful full backend regression and actual synthetic OCR engine run. No real alerts/providers were contacted.

| Category | Expected behavior | Coverage | Result |
|---|---|---|---|
| Cross-patient identifiers | Caller owning both patients cannot borrow resource IDs | [failure-audit.test.js](../../server/test/failure-audit.test.js), [api.test.js](../../server/test/api.test.js) | Passed |
| Revoked and partial grants | Current permissions protect reads, mutations and receipt replay | [failure-audit.test.js](../../server/test/failure-audit.test.js), [followups.test.js](../../server/test/followups.test.js), [sos.test.js](../../server/test/sos.test.js), [reports.test.js](../../server/test/reports.test.js) | Passed |
| Expired session and CSRF | Rejected writes have no side effects; fresh sign-in recovers | [failure-audit.test.js](../../server/test/failure-audit.test.js), [api.test.js](../../server/test/api.test.js) | Passed |
| Duplicate/concurrent submissions | One committed effect and honest conflicts | [api.test.js](../../server/test/api.test.js), [end-to-end.test.js](../../server/test/end-to-end.test.js), [sos.test.js](../../server/test/sos.test.js) | Passed |
| Concurrent stock and rollback | Exact balance/debits and transaction rollback | [inventory.test.js](../../server/test/inventory.test.js) | Passed |
| Blurred OCR | Clear control recognized; blur degrades; clarification blocks confirmation | [failure-audit.test.js](../../server/test/failure-audit.test.js), [prescriptions.test.js](../../server/test/prescriptions.test.js) | Passed |
| Unmatched/unavailable RxNorm | No false identity; malformed/unavailable evidence rejected | [rxnorm.test.js](../../server/test/rxnorm.test.js), [cabinet.test.js](../../server/test/cabinet.test.js) | Passed |
| Label absence/outage | No invented source passage or activation | [openfda.test.js](../../server/test/openfda.test.js), [information-cards.test.js](../../server/test/information-cards.test.js) | Passed |
| Map outage/partial data | Empty, partial, timeout and outage remain distinct | [pharmacies.test.js](../../server/test/pharmacies.test.js), [hospitals.test.js](../../server/test/hospitals.test.js) | Passed |
| Telegram failure/uncertainty | Unknown delivery is preserved without automatic resend | [telegram.test.js](../../server/test/telegram.test.js), [tasks.test.js](../../server/test/tasks.test.js), [doses.test.js](../../server/test/doses.test.js), [sos.test.js](../../server/test/sos.test.js) | Passed |
| Restart/crash boundaries | Persisted state/leases prevent duplicate effects | [timezone-restarts.test.js](../../server/test/timezone-restarts.test.js), [followups.test.js](../../server/test/followups.test.js), [sos.test.js](../../server/test/sos.test.js), [end-to-end.test.js](../../server/test/end-to-end.test.js) | Passed |
| Historical versions | Confirmed history is immutable and persists | [prescriptions.test.js](../../server/test/prescriptions.test.js), [schedules.test.js](../../server/test/schedules.test.js) | Passed |
| SOS boundaries | Forged state, expired consent/ack and production simulation rejected | [failure-audit.test.js](../../server/test/failure-audit.test.js), [sos.test.js](../../server/test/sos.test.js) | Passed |

Two confirmed findings were fixed; see step38-matrix.json and the before/final transcripts. Browser/device and live external gates remain separate.
