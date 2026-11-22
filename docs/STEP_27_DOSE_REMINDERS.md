# Step 27 — C2 dose records and reminder preparation

Prepared 3 November 2026 (Asia/Dhaka). Function owner: **Sahir Jawad Chowdhury**. Branch: `feature/step27-dose-reminders`, stacked on [Step 26 draft PR #9](https://github.com/faraaz1027-cloud/MediMate/pull/9), base `ebd4a120d8bcb6d45fca6cdc7987df81b20b87b2`. This is a technical slice for review under the lab guide and Steps 11/14/15/16, preserving all 13 functions and owners. It is not individual student contribution, faculty acceptance, submission, deployment or a claim of real Telegram receipt. Earlier draft steps remain unmerged.

## Working scope and policy

Today’s doses reads actual persisted A2 occurrences, including saved medicine/strength, quantity/unit and timezone snapshots. Owner or currently authorized `dose.record` caregiver can record taken or skipped only once an occurrence is due. No future/cancelled recording is accepted. Server-recorded time is distinct from optional effective time, which must be between scheduled due time and server now. History is append-only through these APIs; corrections require a terminal record, a different new state and a nonempty reason. Returning to pending preserves the old reminder time. There is no automatic offline replay or guessed dose history.

Snooze appends a history entry, leaves dose pending and moves only reminderDueAtUTC to server now plus 10 minutes. It never moves dueAtUTC, changes prescribed quantity or reports the dose taken. Maximum three snoozes; the previous reminder must be due before snoozing again. Taken/skipped remain available while a reminder is snoozed. A unique action revision and patient/client UUID, transaction, projection CAS and retained idempotency response prevent double actions, including simultaneous requests and cross-route key reuse. Stale/conflicting requests return 409; replay still checks current access. A reasoned correction preserves the earlier entry and actor/time.

The local-date list defaults to the patient's calendar today. Explicit date/timezone or a positive half-open UTC range up to 31 elapsed days is supported. Pagination is bound to filters. Whole-window counts are independent of the current page/status filter. The simple overdue-unconfirmed flag means a pending past-due event, not a C3 follow-up or skipped dose. List and history can be refreshed explicitly. Empty/loading/validation/revision-conflict/read-only/session-expiry states use existing shared UI behavior. No stock is deducted: **stockSyncStatus is `not_implemented`**, and A3 reconciliation/ledger work is Step 30.

## Separate reminder execution

Reminders default off. The patient owner explicitly opts in for generic dose reminders to their own linked private Telegram account. C1 channel/task consent alone is insufficient. Authorized caregivers can record doses but cannot opt in recipients or retry messages. Enabling before configuration is allowed as a visible request, with configured/link readiness shown separately; it makes no delivery promise. Saving an unchanged preference is a no-op; a changed enabled value suppresses pending jobs.

The C2 worker and collections are separate because C1's sender assumes task-specific subjects/recipients and polls the dedicated bot. Reusing that claim path would confuse subject eligibility and consent. The existing Telegram adapter gains a generic dose notice without patient name, medicine, prescribed quantity or health text. No new application dependency was added. Channel acceptance is not evidence of receipt or reading; see Telegram's official [sendMessage contract](https://core.telegram.org/bots/api#sendmessage).

Due scans persist a unique job per occurrence/action revision/owner and the queue marker in one transaction. A settings cursor rotates batches of 100 patients; each scan considers up to 50 eligible events per patient. Committed due events are rediscovered after restart. A processing lease creates a durable numbered attempt, then checks active patient/schedule/cabinet, pending dose/action revision/current reminder time, unchanged owner consent and private link revision before calling the provider. This check is at a point in time: revocation after it cannot cancel a message already in flight. Concurrent workers cannot both claim the same job, but provider acceptance and Mongo completion cannot be atomic.

The late-delivery window ends **60 minutes after the current reminder time**; snooze starts a new reminder window. Older requests expire without altering dose state. Missing Telegram configuration records new requests as disabled/NOT_CONFIGURED with zero attempts. Definite failure is failed; uncertain responses or an expired processing lease become unknown and are never automatically resent. Processing-attempt count includes a claim suppressed before a provider call; providerCallAt distinguishes it. Explicit owner retry is allowed only for failed/disabled/suppressed current eligible jobs, before expiry, with configuration/link/consent and fewer than three attempts. It rebinds the current consent/channel revision. Sent, unknown, expired and processing jobs cannot be retried. No automatic resend occurs after merely reconfiguring Telegram.

## Setup and reproduction

Use the existing authenticated API and a **MongoDB replica set** (local single node is sufficient). Never point tests at patient data. Install using the repository lockfile and Node 24 CI baseline:

```sh
npm ci
npm ci --prefix verification/step18 --ignore-scripts
npm run build
node verification/step18/api.mjs
npm test --prefix verification/step18
```

For normal app setup follow Step 17/18. Set server environment values privately using `.env.example`; do not commit tokens or URIs. The independent C2 process is:

```sh
npm run dose-worker --workspace server -- --once
npm run dose-worker --workspace server
```

`--once` processes one bounded batch and exits with a safe summary. The loop queues due jobs, processes up to 20 claims per pass and spaces them by 1.1 seconds. SIGINT/SIGTERM request graceful shutdown. C1's `worker` process remains responsible for bot linking/polling; only that process should poll a dedicated bot. C2 does not call getUpdates. A heartbeat means a recent pass, not continuous availability. API/Vite alone do not run the sender, and no worker is deployed by this change. Ordinary local process/sleep/outage limits apply. API/session/worker configuration must refer to the same application database. A bot link and separate owner dose consent are required before real delivery.

The user explicitly has no bot or consenting test account. **No real Telegram call or recipient receipt was tested.** Do not ask for a token in chat or pretend controlled adapter outcomes satisfy the external-integration course gate. Owner configuration/consenting live proof can occur later. No real emergency/contact workflow is exercised.

Import [Step 27 Postman collection](../postman/MediMate_Step27.postman_collection.json) against a disposable replica-set app. Override baseUrl (default `http://127.0.0.1:3001/api/v1`). It creates synthetic owner/caregiver, cabinet/A1/A2 records; waits 20 seconds for three real due occurrences; records/replays/conflicts/snoozes/corrections; checks counts, consent, permissions/revocation; then turns its reminder preference off. Runtime sessions/CSRF are never forwarded to Telegram. Use a fresh MONGOMS_DB_PATH per Windows test invocation and a shared download cache. Windows workspace-link restrictions may require standalone `--workspaces=false` installs (server `--package-lock=false`); the root lock remains authoritative.

## Evidence and practical limits

Local Windows, Node 26.13.0, MongoDB 7.0.24 replica set:

- Production Vite build passes. **96 API/provider tests pass**, zero failures/skips. New cases include actual A1/A2 HTTP fixtures, bounded dates/counts/cursors, future/cancelled/foreign IDs, simultaneous terminal actions, replay/cross-route reuse, three snoozes, corrections, caregiver actors/read-only/revoked replay/owner consent/CSRF, transaction rollback and API restart. Reminder cases cover concurrent queuing/claims, disabled, controlled acceptance/definite failure/max retries/unknown/interrupted lease, snooze generations, unlink/pause/terminal suppression and expiry. The child-process test executes the actual `dose-worker.js --once` with explicitly blank Telegram configuration and a disposable DB.
- The production-bundle DOM integration passes, retaining earlier A1/B1/C1/A2/B2 coverage and adding expired-session recovery, local-date selection, taken/skipped/snooze/correction persistence, four action rows and disabled reminder history. JSDOM does not validate layout.
- Newman passes **43 requests / 55 assertions**, zero failures, against actual Express/MongoDB. No Telegram configuration/link or external send was used.
- Chromium desktop **1440×1000** and mobile **390×844** were visually inspected. Actual actions: owner opt-in, standalone worker, taken, skipped, snooze, reasoned taken→skipped correction, reload and re-open. Final synthetic browser DB has 12 A2 events, four unique action rows (two on the corrected occurrence), 2 skipped / 10 pending, one snooze, five disabled jobs and zero attempts. Due times remain unchanged; the snoozed occurrence's reminder alone moves. Document widths 1425/375 show no horizontal overflow in inspected views. No captured browser console errors. Screenshots accompany the review handover; exact pixel parity/full accessibility certification and Lab 02 performance metrics are not claimed.

Safe logs/readbacks are in `docs/evidence/step27-*`. The browser creation clock was deliberately 25 minutes behind wall time to generate due A2 fixture events, then restored before actions; this is labelled synthetic evidence, not medical history. Harness-only worker/readback routes were scratch files outside the product tree and are not shipped. Basic restart/expiry tests here do not complete Step 28's broader date-boundary/schedule-edit/delayed-execution audit. No stock effect is possible yet, so future A3 exactly-once deduction must still be implemented/tested.

## Code map and Sahir review

- `server/v1/doses.js`: scoped queries, public projections, action transactions, correction/snooze policy, consent and explicit retry.
- `server/v1/doseReminders.js`: durable queue marker/lease, eligibility, expiry, separate attempts and unknown-outcome handling.
- `server/dose-worker.js`: independent CLI and lifecycle; `server/v1/telegram.js`: generic fixed-host notice adapter.
- `server/v1/store.js`: additive action/settings/job/attempt models/indexes and scan cursor. No destructive migration, historical backfill or dependency change.
- `client/src/DoseBoard.jsx`: saved event cards, applied filters/summary, actor/time/reason history, explicit owner consent/readiness and mutation/retry guards. Step 14 records actual Figma frame and justified adaptations.
- `server/test/doses.test.js`, `server/test/dose-worker-cli.test.js`, `verification/step27/fixture.mjs`: controlled real HTTP/MongoDB acceptance and executable-worker fixtures; production DOM checks remain in Step 18 runner.

Sahir should trace one A2 occurrence into the list, action transaction, immutable action revision and rendered history; replay the same key and show one effective action, then trigger a stale-key conflict and reasoned correction. Explain why snooze is not a terminal dose state, why accepted/unknown/disabled are notification outcomes, and why unknown cannot safely auto-retry. Show consent off/on, disabled configuration, worker heartbeat and expiry without fabricated taken/skipped. Trace the actor and current grant, and demonstrate revocation.

Personally review and contribute a small justified frontend change plus a backend validation change with a meaningful regression, under Sahir's own identity, only after understanding the code. Explain transactions/CAS/unique keys and the non-atomic provider boundary. AI-authored changes are not an individual student contribution. Record actual Jira, viva/live-edit, external API and faculty evidence. Full Module 1/2 acceptance and submission remain open. The next roadmap step is **Step 28 — timezone and restart behavior**; deployment is Step 29.
