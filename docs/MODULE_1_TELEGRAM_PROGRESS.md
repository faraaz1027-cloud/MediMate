# C1 actual Telegram delivery checkpoint

**RESOLVED:** resumed PC check verified actual receipt at23:50 Dhaka and separate
app acknowledgement at23:51. See [final delivery evidence](MODULE_1_TELEGRAM_DELIVERY.md).
The original interrupted checkpoint below is retained as history, not current status.

21 November 2026, Asia/Dhaka. User explicitly authorized PC operation, replacing
the exposed bot token, private configuration, linking and the real test notice.

- Bot: `@Medi911_bot`, display name MediMate Lab Test.
- BotFather confirmed the exposed token was replaced. The replacement was read
  from the rendered native BotFather message and written directly to ignored
  `server/.env.telegram.local`. No complete replacement token was printed or
  committed. Do not copy either token into evidence or command text.
- Actual `getMe` validated the replacement bot/username. `getWebhookInfo` returned
  no webhook; polling is ready. Evidence: `docs/evidence/module1-telegram/preflight.json`.
- Local MongoDB is initialized on27028. Real Express/Vite API is running on1212;
  the single task worker runs against the same `assignment03_device_1212` DB.
  Current execution sessions: Mongo10214, Express17731, worker72574. Do not start
  another poller or swap databases for this bot.
- Normal API seed prepared synthetic owner/caregiver accounts. The recipient is
  the Telegram account signed in on the user's PC, linked to the synthetic
  caregiver for an authorized transport test; this is not Sahir's individual
  demonstration/assessment evidence.
- A normal authenticated channel-link challenge was prepared. Its one-time URL
  is stored only in ignored `.local-data/module1-telegram/state.json`, expires
  after ten minutes and is deliberately excluded from reports. API cookies/CSRF
  tokens are not persisted. The real bot link was entered into a new Chrome tab.
- Computer Use then stopped automatically because it could not determine Chrome's
  current URL confidently enough to enforce policy. No further PC interaction was
  attempted in that turn. Native Telegram may now show the bot's Start screen;
  inspect a fresh native window state only after the user resumes PC work.

At this earlier checkpoint receipt was unverified. The resumed run subsequently
confirmed actual native receipt as well as API attempt state, then app acknowledgement.

Resume with Node24 from `.local-data/step41-runtime/selected.txt` and host-context
loopback access as needed (the sandbox's initial Mongo connection returned EACCES;
host-context initialization succeeded):

1. Inspect actual native Telegram `MediMate Lab Test` screen and press Start with
   the prepared one-time linking code. Regenerate using the normal API if expired.
2. `node verification/module1/telegram-live.mjs status` must show proposed linking.
3. `node verification/module1/telegram-live.mjs confirm` records the user's already
   authorized explicit task-notice consent through the normal authenticated API.
4. `node verification/module1/telegram-live.mjs send` creates one synthetic task
   with a stable idempotency key. Worker sends the generic notice only after the
   active recipient link/permissions are rechecked. Re-running does not create
   another test task. No direct-send shortcut bypasses the domain workflow.
5. Observe the actual received generic notice in native Telegram, record safe
   receipt/time evidence without token/one-time-code/private sidebar data. Read
   actual notification attempt status via status/evidence.
6. `node verification/module1/telegram-live.mjs ack` records separate in-app
   acknowledgement; `... evidence` exports sanitized API/domain results. Receipt
   and acknowledgement remain distinct. Then update the Module1 guide/pack and
   current evidence; preserve the dated earlier disabled-transport runs.

The helper's `prepare` mode creates/reuses a current challenge via normal app auth;
`status` is read-only apart from normal session authentication. `telegram-probe.mjs`
uses only read-only getMe/getWebhookInfo and never changes an existing webhook.
