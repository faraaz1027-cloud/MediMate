# Step 34 — C3 unconfirmed-dose follow-up

Local implementation, 21 November 2026. Owner: Sahir. Scope and ownership are
unchanged. Sahir must rehearse, understand and modify his code before claiming
personal course evidence. Telegram setup remains deferred by the user; no real
Telegram follow-up delivery is claimed.

## Workflow and operating policy

The owner opens **Dose follow-up**, selects an active caregiver and a delay of
10–1440 minutes, and explicitly consents. Follow-up is off by default. The
caregiver needs dose.read, dose.record, task.read and task.write on that patient.
Telegram linking is a separate consenting action in Caregiver tasks.

Run `npm run followup-worker --workspace server -- --once` from the checkout for
one scan, or omit `-- --once` for continuous operation. The worker uses the
server's ignored .env MONGODB_URI and Telegram configuration, like the existing
C1 and C2 workers. For a process-level test fixture an explicit environment URI
can be supplied. No private configuration is committed.

The existing local handoff MongoDB/start commands still apply. Express by itself
does not run this worker. Keep the C1 worker for Telegram linking/polling. C1 and
C3 delivery workers share the durable C1 notification claims and can run together.
The C2 dose worker remains separate.

For the updated local handoff's Sahir server on port 1212, open another PowerShell
terminal after MongoDB and Express are running:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27028/assignment03_device_1212?replicaSet=assignment03'
$env:TELEGRAM_BOT_TOKEN = ''
$env:TELEGRAM_BOT_USERNAME = ''
npm run followup-worker --workspace server -- --once
```

Use the database suffix of the server you are demonstrating (1499, 1205 or 1212).
These are separate local databases. The empty Telegram values preserve the
deferred live setup. A continuous demonstration can omit `-- --once` and stop the
worker with Ctrl+C.

A pending dose becomes eligible after dueAtUTC + configured delay, and after its
current snooze/reminderDueAtUTC if that is later. A late scan catches up pending
occurrences without inventing a taken/skipped state. Each occurrence has exactly
one follow-up for its lifetime, enforced by a unique index. Opting out then in,
changing settings, worker restarts, or correcting a recorded dose back to pending
does not produce another escalation for the same occurrence. Existing follow-ups
keep their original caregiver; preferences apply to new follow-ups. To handle
renewed concern after a resolved follow-up, use an explicit caregiver task.

The worker atomically creates the overdue-unconfirmed record, a generic C1 task,
task event, durable notification job and occurrence link. It uses bounded batches
and persisted settings/reconciliation cursors. Settings and dose writes conflict
with concurrent opt-out/recording rather than committing stale updates.

Reusing C1 delivery preserves attempt history, channel acceptance versus reading,
failed/unknown/disabled outcomes, restart leases and bounded explicit retries.
An unknown provider outcome is never automatically resent. Generic Telegram text
contains no medicine, patient or dose details. Notification eligibility checks
current follow-up status, pending dose, owner preference, original recipient,
caregiver permissions and channel consent immediately before the send path.
An already accepted or in-flight provider request cannot be recalled.

## Acknowledgement and resolution

Owner or active assigned caregiver can acknowledge in **Dose follow-up**. This
records a separate actor/time and suppresses queued pending notices. The C1 task
has its own task-notice acknowledgement; that also stops C1 delivery, while the
C3 acknowledgement remains a distinct workflow record.

Resolve with contacted_patient, unable_to_contact or other and an optional note.
Resolution closes the linked task with an event and suppresses pending jobs in
the same transaction. It never changes the dose action. A worker scan also closes
follow-ups after taken/skipped recording or cancellation, preserving the actual
dose state and recording dose_recorded or schedule_cancelled. These automated
outcomes describe source state rather than caregiver contact.

Revoked caregivers cannot read/update follow-ups or receive eligible notices.
Settings opt-out or a caregiver change blocks pending delivery for previous
follow-ups. Open records remain available to the owner for explicit resolution.
Disabled jobs remain honestly disabled with zero delivery attempts; configuration
restoration does not itself prove delivery. Sent means channel acceptance only.

## Persistence and contracts

New collections: followupSettings (unique patient) and doseFollowups (unique
occurrence). DoseOccurrence.followupId links the record; Task.followupId links
the generic caregiver task. Overdue-unconfirmed is a follow-up status; the C2
enum stays pending/taken/skipped/cancelled. Internal generic dose revisions can
advance during follow-up linking; actionRevision remains the C2 write contract.

Settings require owner + dose.record. Follow-up reads require dose.read and
owner/assigned caregiver access; mutations additionally require dose.record,
CSRF, UUID idempotency key and expectedRevision. History has 20-item pages using
before IDs, with optional status. Detail includes current dose state, C1 jobs and
attempts. C1 task APIs continue to protect access independently. See the updated
STEP_16_API_CONTRACTS.md for exact fields and outcomes.

## Validation and demonstration

`node verification/step18/api.mjs server/test/followups.test.js` exercises real
Express/MongoDB with a controlled Telegram adapter: owner consent, authorization,
delay boundary, two scanners, duplicate prevention, separate acknowledgements,
resolution without dose inference, rollback, revocation, pre-reconciliation
terminal-dose suppression, opt-out, disabled delivery and an actual CLI process
restart against persisted records. Evidence: docs/evidence/step34-api.txt.

`npm run build` builds the Vite interface. The production-bundle JSDOM scenario
in verification/step18/run.mjs covers owner preferences, caregiver selection,
disabled-provider escalation, acknowledgement, outcome/note and reload
persistence. MEDIMATE_DOM_REPORT selects the evidence path; step34-dom.json is
created only by a successful run. JSDOM does not prove native browser layout,
focus or accessibility. Real Telegram delivery, Sahir's rehearsal and visual
browser evidence remain separate open checks.

For demonstration: show no record before the delay, one overdue record/task/job
after it, explicit disabled or actual provider state, acknowledgement, resolution
and persistence after restarting the worker. Inspect that the dose remains pending
after unable_to_contact. Then record a real synthetic C2 action and show another
follow-up closing without another dose write. Revoke the caregiver and show no
new delivery. Explain the transaction and eligibility guard, then make a small
frontend change and rerun an affected request under Sahir's own contribution.

Next numbered implementation step: Step 35 — analytics and visit report.

Security review: full assigned-caregiver permissions and assignment are checked before replay and inside mutation transactions; removing task access blocks an old acknowledgement receipt even if dose permissions remain.

Final local validation: full regression 154/154 passed; final affected C3 checks 9/9 passed after replay-permission hardening and saved-medicine display. Vite production build passed. Production-bundle DOM workflow passed for setup, escalation, acknowledgement, resolution and remount. Detail medicineText comes from the same saved ScheduleVersion source used by C2, with an explicit unavailable fallback. Evidence: docs/evidence/step34-regression.txt, step34-api.txt and step34-dom.json.
