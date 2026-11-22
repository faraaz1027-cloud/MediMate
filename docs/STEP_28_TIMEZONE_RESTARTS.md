# Step 28 — Timezone and restart behavior

Prepared 4 November 2026 (Asia/Dhaka). Branch `feature/step28-timezone-restarts`, stacked on [Step 27 draft PR #10](https://github.com/faraaz1027-cloud/MediMate/pull/10), base `401da09855e4924c73f3fe271eaf95dc0d13c795`. This audit supports Ihfaz's A2 schedules and Sahir's C2 reminders, preserving all 13 functions and owners. It follows the lab instruction guide and roadmap, with real HTTP/MongoDB tests and synthetic data. Student contribution, live modifications, Jira/faculty acceptance, course submission and real Telegram receipt remain separate gates.

## Prioritized findings and changes

1. **P2 — Pending jobs could remain misleading after a disabled restart.** The [baseline early return](https://github.com/faraaz1027-cloud/MediMate/blob/401da09855e4924c73f3fe271eaf95dc0d13c795/server/v1/doseReminders.js#L224) skipped reconciliation whenever Telegram configuration was absent. New tests actually observed pending where disabled or expired was expected. Jobs that were already committed before configuration removal now become disabled/NOT_CONFIGURED, or expired/WINDOW_EXPIRED at the window boundary, without adding a processing attempt or changing dose state. Restoring configuration does not implicitly resend a disabled job; the owner must explicitly retry an eligible current request.
2. **P2 — A disabled one-pass worker stopped after recovering one interrupted lease.** The same early return reported no work after an expired processing lease had been changed to unknown. A bounded draining caller could stop with more interrupted jobs waiting. Recovery now reports progress and scans the oldest lease first with an additive status+leaseUntil+id index. A process test crashes two real workers after separate claims, then proves one disabled restart recovers both jobs without provider calls. Unknown remains unknown and cannot automatically resend.

The fix is limited to `server/v1/doseReminders.js` and one additive index in `server/v1/store.js`; no application dependency, assessed function scope, owner, UI layout or stock behavior changes. The existing C2 interface already renders disabled/expired/unknown separately. The boolean return of deliverOne now means a claim or reconciliation made progress; the existing CLI processed count is **work units**, never a delivery count. Each unit may also recover an interrupted lease. Existing job/attempt IDs and history are retained; no destructive migration or fabricated dose history is created.

Repository review found the Step 27 integration CI successful and no standalone open issues; open entries were the existing stacked draft PRs. No pre-existing failing check was assumed. The new regression assertions exposed the pending-state defect locally. One initial test assertion incorrectly expected HTTP 200 for an A2 version create; it was corrected to the existing 201 contract, without changing that API.

## Verified behavior

The new suite uses saved A1/B1/A2 HTTP workflows, authenticated owner requests and actual MongoDB transactions. It reports 12 scenarios plus their containing test (13 reported tests):

| Scenario | Observed result |
|---|---|
| Dhaka midnight | At 2026-11-04 17:59:59.999Z the local date is Nov 4; at 18:00:00.001Z it is Nov 5. The 12 saved fixture events partition 1/11 across the two dates, with no repeated ID. UTC calendar filtering returns all 12 on Nov 4. |
| Calendar generation | Dhaka fixed 00:00/23:59 map to 18:00Z/17:59Z across adjacent UTC dates. Ambiguous New York DST wall time is rejected. |
| API/connection restart | Close/recreate Express and disconnect/reconnect Mongoose to the same DB; saved IDs, UTC times, timezone snapshots and dose list remain identical. The Mongo server itself remains running in this test. |
| Crash inside queue transaction | A separate Node process is killed after inserting the job inside the still-open transaction, before queue-marker commit. Neither job nor marker survives; a fresh process later queues one committed job. |
| Crash after queue commit | The committed queue is read by a fresh process with a different host TZ. One controlled acceptance occurs, one attempt remains, and another restart makes no duplicate call. |
| Crash before provider / after controlled acceptance | Actual child processes are killed at both observable boundaries after a lease claim. After lease expiry, fresh processes preserve unknown/WORKER_INTERRUPTED, retain one attempt and no dose action, and make no resend. Explicit retry returns 409. |
| Delayed execution | At exactly first due +60 minutes, seven occurrences are due: the oldest reminder expires and six newer reminders are accepted by the controlled adapter. All 12 doses remain pending and zero actions are invented. Another pass sends nothing twice. |
| Disabled restart / expiry | Already committed pending jobs become disabled before expiry, or expired at the exact boundary, with no added attempt. No later implicit send follows reconfiguration. |
| Recovery backlog | Two actual killed claims are both recovered in one disabled draining pass; no providerCallAt or dose actions are created. |
| Outage and duplicate retry | A controlled definite rejection persists across process restart. Two simultaneous explicit retries against the same revision produce 200/409; one new accepted attempt is made, bringing its retained attempt count to two. |
| Future schedule edit | Real reviewed A2 replacement retains all 12 old-version events, cancels future old events and creates version 2. The already-due old event remains pending and can receive its one reminder after restart. |
| Clock rollback | A queued job is not sent while server time is before its saved runAtUTC. Catching up sends it once; a later restart does not repeat it. |
| Pause, snooze and resume | A past-due snoozed notice is suppressed while its schedule is paused. Resume preserves due time/action history, restores only eligible future paused events and does not silently resend the suppressed notice. An explicit current owner retry can send within its window. |
| Snooze across midnight / action replay | A Nov 20 23:59 Dhaka occurrence snoozed at 23:59:30 retains its original due-day membership while reminder time becomes Nov 21 00:09:30. A later taken record and API restart replay return the same action ID. History contains the snooze and taken rows, with no stock or stock-sync rows. |

The child-process fixture is `server/test/fixtures/dose-worker-child.js`. It calls the real queue/lease implementation with a synthetic in-process adapter and IPC phase gates; it never constructs the Telegram adapter, loads a token or calls an external host. Its accepted signal means the **controlled fixture** accepted the call. It does not prove a real provider accepted or a recipient read anything. Queue rollback is tested using an actual uncommitted insert, rather than merely abandoning work before a write.

The disposable API test replica now uses transactionLifetimeLimitSeconds=5 so a killed client does not leave its deliberately open transaction blocking test cleanup for the production-default interval. This is test-runner configuration only. Application/production Mongo settings are unchanged. TTL sweeping remains disabled only in that test replica because injected application dates differ from Mongo's wall clock; the API still enforces session expiry, and fixtures log in normally after advancing by days. Each run uses a unique synthetic database; the runner owns and stops the disposable replica. No production patient data is used or deleted.

## Time and availability policy

- Due instants and reminder run/expiry instants are stored in UTC; prescribed timezone/quantity/source snapshots stay with the occurrence. Calendar lists use the selected IANA timezone and half-open local-day bounds, not the worker host TZ. A date filter changes display membership, never a prescribed due instant.
- Reminders may be sent late only before reminderDueAtUTC +60 minutes; equality is expired. Snooze changes reminder time, preserving the original dose due time. Expired/disabled/unknown notification outcomes never become taken/skipped or C3 follow-up automatically.
- Queue marker plus unique occurrence/action/recipient key prevent double queueing. Action revision/idempotency/history constraints prevent double recording. Claim CAS/leases prevent competing sends under normal running conditions. Provider acceptance and Mongo completion are not atomic; a crash across that boundary is conservatively unknown. A lease can also expire after a long pause, and an in-flight call cannot be recalled. Clocks must be reasonably synchronized; arbitrary clock faults or provider behavior cannot be guaranteed away.
- Keep API and worker on the same replica-set database. Run the separate C2 process; Vite/API alone do not execute reminders. C1's bot poller stays separate and is the only process that should poll a dedicated bot. Do not run duplicate pollers. Queue scans are bounded (100 enabled patient settings, 50 unqueued events per patient); the cursor persists and rotates. The normal worker processes up to 20 work units per pass with 1.1-second spacing, so a large backlog needs additional passes. `--once` intentionally handles only one bounded batch. A heartbeat records a completed scan, not uninterrupted availability or delivery.
- Shutdown, computer sleep, network/database outage and free-host suspension can delay work. Running again scans committed events and classifies stale requests; it cannot guarantee on-time reminders while the process is unavailable. Disabled/definite-failed current jobs need explicit owner retry when ready; unknown/accepted/expired jobs cannot retry. Consent/link and active-record eligibility are rechecked before a new provider call, at a point in time; revocation after that point cannot cancel a call already in flight.

No stock implementation exists, so tests verify **absence** of stock effects rather than claiming exactly-once deduction. A3/Step 30 must still add and test its ledger/atomic reconciliation. C3/Step 34 escalation is also later work. No bot or consenting test account is available; real Telegram send/receipt stays unverified. Nothing was deployed or merged by this step.

## Validation and reproduction

Local Windows / Node 26.13.0 / MongoDB 7.0.24 replica set: **109 API/provider tests pass**, zero failures/skips, including all Step 28 cases and earlier regressions. Production Vite build and production-bundle DOM integration pass with the existing four persisted dose-action records. No new layout/browser/performance measurement is claimed in this backend audit; Step 27 contains the actual desktop/mobile inspection. [Evidence index](evidence/step28-validation.json), [API log](evidence/step28-api-tests.txt), [build log](evidence/step28-build.txt), [DOM log](evidence/step28-dom-tests.txt) and [reproduced defect](evidence/step28-before-fix.json) are retained. Existing Step 27 Postman proof remains in its own evidence; it was not presented as a new Step 28 run.

```sh
npm ci
npm ci --prefix verification/step18 --ignore-scripts
npm run build
node verification/step18/api.mjs
npm test --prefix verification/step18
```

For the focused crash/timezone suite, the runner now accepts optional test file arguments:

```sh
node verification/step18/api.mjs server/test/timezone-restarts.test.js
```

Windows: use a fresh MONGOMS_DB_PATH per invocation and an existing MONGOMS_DOWNLOAD_DIR cache. The root dependency lock remains authoritative; no app dependency changes are needed. Normal worker commands remain `npm run dose-worker --workspace server -- --once` or `npm run dose-worker --workspace server`, with private server environment configuration. Never paste credentials or tokens into chat/Git.

## Owner review and next gate

Ihfaz should explain local-calendar versus UTC membership, the explicit replacement boundary, retained past events and pause/resume rules. Sahir should explain queue-marker transactions, claim revision/lease, attempt versus provider call, conservative unknown, explicit retry and the disabled-restart fix. Both should inspect and understand the tests, contribute their own focused changes under their own Git identities and practice live frontend/backend modifications. Assistant-authored changes are not independent student contribution.

This completes the scoped Step 28 technical audit for the tested cases; it is not a universal delivery guarantee. Real Telegram proof, personal/Jira/faculty acceptance and Module 2 demonstration remain open. The next roadmap step is **Step 29 — deployment and Module 2 demonstration**: resolve the faculty online requirement and verify a zero-cash arrangement for frontend, API, MongoDB and reliable worker, then prepare a concrete deployment review. A static frontend URL alone does not close that gate.
