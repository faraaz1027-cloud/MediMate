# Step 23 — C1 caregiver tasks, handover and Telegram preparation

Prepared 2 November 2026 (Asia/Dhaka). **C1 remains owned by Sahir Jawad Chowdhury.** This is AI-assisted work for his review, personal contribution and live-edit practice, not evidence of his individual contribution or faculty acceptance. The branch is stacked on Step 22 draft PR #5; earlier unmerged work is preserved.

**Gate still open:** the user confirmed there is no Telegram bot or consenting test account available. Task workflows and controlled Telegram tests are implemented, but **no real Telegram message was sent or received**. Step 23's external-delivery demonstration, Sahir's external API evidence and full C1/Module 1 acceptance remain incomplete. Do not replace this gate with a mock success or check it off because CI is green.

## Implemented task workflow

An organizer creates/assigns a general/refill task to the patient owner or an active caregiver with both task.read and task.write. The UI offers current permitted assignee IDs/names and retains manual ID validation. An assignee or patient owner accepts an open task, then completes an accepted task. The creator/patient owner may reopen a completed task. Other caregivers cannot accept/complete somebody else's task. Only the creator/patient owner can edit/reassign active tasks; a reassignment returns to open and starts a new assignment generation.

Task participants (creator, patient owner, assignee) with task.write can append handover notes. History is append-only and records actor/time, transition and task snapshots. Existing older events remain readable without inventing missing snapshots. Detail, state/own-assignment filters, edit/history/notification pagination and reload persistence are implemented. Revisions protect edits/transitions/acknowledgements; idempotency protects retries. Task, event, notification job, audit and operation records commit together or roll back together.

An assignee explicitly acknowledges in MediMate. This creates an authenticated acknowledgement record and projection timestamp while retaining the task status. Accepting, completing and Telegram acceptance do not manufacture an acknowledgement. Reassignment/reopening clears the current acknowledgement and starts a new generation; earlier acknowledgements/events remain in history.

## Telegram linking and delivery design

Telegram is disabled when private environment configuration is absent. Tasks still save; their notice job says disabled/not configured with zero attempts. No success state is fabricated.

When configured, linking uses an authenticated, CSRF-protected 10-minute challenge. The user opens their own private bot chat and presses Start, then refreshes MediMate and explicitly confirms consent for **generic task notices**. The polling worker accepts only a private chat whose sender and chat IDs match, with a non-bot sender. A `/start` proof proposes a link; it does not activate it. Consent must be confirmed by the same signed-in app account, using its challenge revision before expiry. One active Telegram identity cannot belong to two app accounts. Linking gives no patient permissions.

The random 64-character code is stored only as a hash. Its private URL is returned once and is excluded from operation replay, audit and stored responses. An unchanged request replay returns the challenge ID but a null URL; generate a fresh challenge if the URL was lost (up to five unexpired challenges). The shared mutation helper adds a response presentation callback so ephemeral URL data is sent after commit without being persisted. Channel status shows a masked account reference; no raw bot token or chat ID is exposed in JSON. Unlink in MediMate or send `/stop` to the bot to revoke the link. Queued sends check link revision and current access before dispatch.

Technical change from the proposed webhook: a separate `server/worker.js` process uses Telegram **getUpdates long polling**, so a local demonstration needs no public HTTPS webhook or tunnel. There is no public incoming-update or link-approval endpoint. See official [getUpdates](https://core.telegram.org/bots/api#getupdates), [deep linking](https://core.telegram.org/bots/features#deep-linking) and [sendMessage](https://core.telegram.org/bots/api#sendmessage). A bot with an existing webhook cannot also use getUpdates; its owner must deliberately choose the polling setup. This code does not delete existing webhooks automatically.

Run **one poller for one dedicated bot/database**. The cursor and processed update IDs persist; receipt IDs deduplicate inbound updates. Do not swap a different bot into an existing database: migrate/reset its polling state and obtain fresh links/consent first. Multiple pollers/replicas and webhook deployment need a later deployment design. The worker is a local process, not an always-on hosted reminder service.

Create, reassignment and reopen events queue generic notices for the assignee. The only outgoing text is: “MediMate: an assigned task has an update. Sign in to review your caregiver tasks.” No patient name, task title, medicine detail, note or private application URL goes to Telegram. This consent is for C1 generic task notices; C5 emergency-contact/location consent is a separate future workflow.

Before dispatch, the worker rechecks the active patient, matching assignee/generation/status, current task.read/write access, absence of current acknowledgement, and the same active channel revision. Changed/completed/acknowledged tasks, revoked caregivers or changed/unlinked channels suppress unsent notices. Revocation cannot recall a request already in flight. A successful sendMessage response records **accepted by channel**, not human receipt/read/acknowledgement.

Jobs are atomically claimed with a 60-second lease, and attempts persist separately. Explicit provider rejection is failed; network timeout, malformed response or an interrupted send is unknown. An expired processing lease becomes unknown, not an automatic resend. Participants can explicitly retry a definitively unsent current job with a current consenting link, up to three processing attempts; unknown/sent outcomes cannot be retried by this route. Outbound calls are bounded (8-second timeout, 256 KiB response cap), and the CLI spaces dispatches by 1.1 seconds. No exactly-once Telegram delivery is promised. Polling failure pauses and retries; configuration/cursors/queue state survive process restart. A database failure after external acceptance may leave an unknown outcome after lease recovery.

## API and additive data changes

Patient routes are under `/api/v1/patients/{patientId}`. Reads require task.read; writes task.write, CSRF, session and UUID Idempotency-Key. Existing cross-patient/revocation protections remain.

| Route | Implemented contract |
|---|---|
| GET /task-assignees | Current permitted owner/caregiver IDs and names (up to 100 grants) |
| POST /tasks | Existing title/description?/assigneeUserId/type/dueAtUTC?/handoverNote?; now queues separate notice and snapshot event |
| GET /tasks | status?,assigneeUserId? (ID or me),limit?,cursor? |
| GET /tasks/{id} | Current task, generation and acknowledgement projection |
| PATCH /tasks/{id} | expectedRevision plus title?/description?/assigneeUserId?/dueAtUTC?; empty description and null dueAtUTC clear fields; creator/owner only while active |
| POST /tasks/{id}/transitions | expectedRevision,action:accept/complete/reopen; valid lifecycle and actor required |
| POST /tasks/{id}/notes | text (1–2000); append participant handover event |
| GET /tasks/{id}/history | Stable createdAt+ID cursor; nested task snapshots where available |
| POST /tasks/{id}/acknowledgements | expectedRevision; current active assignee only |
| GET /tasks/{id}/notifications | Scoped job status plus up to three sanitized attempts; limit/cursor |
| POST /tasks/{id}/notifications/{jobId}/retry | {}; explicit bounded retry of definitively unsent current job |

Own-session routes: GET `/api/v1/me/channel-links`; POST `/me/channel-link-challenges` with provider:telegram; POST `/me/channel-link-challenges/{id}/confirm` with expectedRevision,consent:true; DELETE `/me/channel-links/{id}` with no body or {}. Unlink returns a 200 JSON acknowledgement so idempotent replay uses the shared response envelope (earlier proposal said 204). Missing bot configuration returns 503/TELEGRAM_NOT_CONFIGURED for challenge/retry. No generic `/jobs` or `/notifications` endpoint is claimed implemented; C1 uses task-scoped routes.

Additive fields: Task.assignmentGeneration/acknowledgedAt/acknowledgedByUserId; TaskEvent.occurredAt/fromStatus/toStatus/snapshot. New collections: ChannelLink, ChannelChallenge (TTL), TelegramReceipt (dedupe/TTL), WorkerState, NotificationJob, NotificationAttempt and Acknowledgement with unique domain keys. NotificationJob is currently task-specific; later C2/C3/C5 work must extend its subject contract. Earlier tasks have no invented notification jobs or acknowledgements. No destructive migration is needed. MongoDB must support replica-set transactions/indexes.

## Reproduce and finish the real Telegram gate

Use Node 24 and the Steps 17–19 setup. Run `npm ci`, `npm ci --prefix verification/step18`, `npm run build`, `node verification/step18/api.mjs`, `npm test --prefix verification/step18`. Restricted Windows hosts can use Step 19 standalone installs. Tests can cache MONGOMS_DOWNLOAD_DIR and must use a **fresh MONGOMS_DB_PATH per invocation**. No dependencies were added.

For the remaining human test, the team must first create/control a dedicated test bot through Telegram's official BotFather and choose a consenting test recipient. Store TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME only in ignored `server/.env` (blank placeholders are in the example). Never paste the token into chat/Git/logs. Start the API and, separately, `npm run worker -w server`; keep one bot poller running. Verify any existing webhook situation with the bot owner.

The consenting recipient signs into their own MediMate account, generates a link, presses Start in their private chat, refreshes status and confirms consent. The organizer assigns a synthetic task. Verify the actual generic notice in Telegram and record a redacted screenshot/time, persisted job and accepted_by_channel attempt. Then acknowledge in MediMate and show the separate state; test unlink/revocation before a later send. Do not claim this gate passed until that evidence exists. No live notice has been sent in this implementation session.

## Observed validation and owner review

- 54 reported API/provider tests passed, no failure/skip. New cases cover actor/revision/state rules, append-only notes, concurrent replay, cross-patient access, expired/private linking and explicit consent, hashed/one-time codes, processed-update dedupe/cursor, delivery failure/retry/unknown outcomes, interrupted leases, revocation/unlink, acknowledgement separation, rollback and restart. Telegram is a **controlled fixture**, not a live account, in these tests.
- Production-bundle DOM suite passed with real Express/MongoDB, including task note/acknowledgement/accept/complete/reopen/edit after remount, disabled Telegram UI, and earlier A1/B1/account regressions. It checks the saved note paragraph, not text still in the editor. Shared results remain in docs/evidence/step18-dom.json.
- Newman task collection: **28 requests and 37 assertions passed** with synthetic organizer/caregiver sessions. It explicitly expects Telegram disabled and sends no external messages. Collection and CLI evidence are included.
- Real Chromium: organizer assigns → separate caregiver signs in/acknowledges/accepts/adds note/completes → organizer reopens → reload preserves events and clears current acknowledgement. Disabled Telegram state and zero attempts remain visible. Desktop 1440×1000 and mobile 390×844 inspected; document width 375 at the mobile viewport. This is not a comprehensive accessibility/performance audit.

Sahir should review TaskBoard.jsx, tasks.js, channels.js, taskNotifications.js, telegram.js and worker.js; explain permission/state checks, transactional outbox, consent, retry ambiguity and why sent differs from acknowledged; contribute personally and practise a React field change and matching backend validation. Jira, individual contribution/viva and faculty-specific evidence remain open. No deployment or complete Module 1 acceptance is claimed. **Next planned step: Step 24 integration, while retaining the open real Telegram demonstration gate.**
