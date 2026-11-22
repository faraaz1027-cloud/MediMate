# C1 real Telegram delivery — verified

Verified 21 November 2026, Asia/Dhaka. Bot: **@Medi911_bot** (MediMate Lab Test).
**The C1 real transport/receipt blocker is resolved.** This was a user-authorized
technical test operated by Codex on the user's PC, not Sahir's individual viva,
personal account demonstration, Git contribution or faculty acceptance.

## Observed result

| Stage | Actual evidence |
| --- | --- |
| Token replacement | BotFather confirmed replacement of the exposed token. Replacement saved only in ignored `server/.env.telegram.local`; no complete replacement token appears in reports. |
| Bot configuration | Actual `getMe` matched Medi911_bot; `getWebhookInfo` had no webhook; one poller used the same local database as Express. |
| Recipient linking | The signed-in Telegram account on the user's PC started the one-time challenge. Worker stored a proposed link; explicit user-authorized consent was confirmed through normal authenticated app API. |
| Synthetic task creation | Owner created task `6b01d9db8c442580a645bed6` for the synthetic caregiver through the real C1 route on port1212. |
| Delivery attempt | One attempt at **23:50:24.613 Dhaka**; job `sent`, attempt `accepted_by_channel`, no error. |
| Actual receipt | Native Telegram Desktop displayed the generic notice as **Received at 11:50 PM** in MediMate Lab Test. This is independent of the API send-success state. |
| Separate acknowledgement | Authenticated caregiver acknowledgement at **23:51:47.707 Dhaka**. Task remained `open`; acknowledgement did not fabricate completion. |

Received text:

> MediMate: an assigned task has an update. Sign in to review your caregiver tasks.

No patient name, medicine, task details or handover text was sent to Telegram.
Accounts/task contents were synthetic. The real recipient was the account already
signed in on the user's PC, linked to the synthetic caregiver. Consent/linking
used the real app lifecycle; no direct chat-ID injection or send-only shortcut.

## Evidence and limits

- `docs/evidence/module1-telegram/preflight.json`: actual bot identity/webhook checks.
- `docs/evidence/module1-telegram/delivery-api.json`: real scoped task, notification
  attempt and later separate acknowledgement.
- `docs/evidence/module1-telegram/receipt-native.json`: actual native Telegram
  accessibility observation, restricted to the received notice and time; private
  sidebar, bot token and consumed linking code excluded. This is native text
  evidence, **not a new screenshot**.

The initial browser URL-confidence interruption was recovered in the resumed
native Telegram check. No whole-screen Telegram screenshot containing private
contacts or linking codes was added. If faculty requires a screenshot, capture the
generic notice/time with private account/sidebar and codes excluded.

This verifies C1 delivery on this local setup. Other C2/C3/C5 real Telegram flows,
public hosting/worker uptime, comprehensive unlink/revocation live repetition and
each student's personal assessment remain separate. Existing controlled failure,
unlink/revocation and retry tests are retained; this live result does not relabel
those fixtures as real messages or replace their historical evidence.

## Reproduce on the same PC

Current services use Mongo27028, HTTP1212 and database
`assignment03_device_1212`. Keep exactly one C1 task worker for this bot/database.
If services are still running, do not launch duplicates. On restart, initialize
the Node24 environment documented in the Module1 guide, then use separate terminals:

```powershell
./scripts/local.ps1 -Mode Mongo
```

```powershell
./scripts/local.ps1 -Mode Initialize
./scripts/local.ps1 -Mode Server -Port 1212 -EnableTelegram
```

```powershell
./scripts/local.ps1 -Mode TaskWorker -Port 1212 -EnableTelegram
```

Open `http://127.0.0.1:1212`. Synthetic owner:
`handover-owner@example.test`; synthetic caregiver:
`handover-caregiver@example.test`; fixture password `Synthetic-handover-123!`.
Select the owner patient while signed in as caregiver to find the shared task.
Create a **new** synthetic task from the owner account for a new presentation
notice. Re-running `telegram-live.mjs send` deliberately reuses this test task;
it does not send another notice or claim a fresh run. Earlier disabled jobs are
not automatically resent after configuration/linking.

The verified backup excludes the token and private database, so restoring source
on another machine requires private configuration and new recipient linking. Do
not reuse the bot with a different database/poller concurrently. Do not copy token,
chat ID, private DB or one-time linking URLs into Git or a submission ZIP.

**Remaining Module1 course gates:** each student's real demonstration, questions
and frontend/backend edits; genuine individual Git/Jira evidence; reviewed source
publication/current CI; confirmed faculty deadline/portal/rubric. Sahir should
personally repeat/explain the C1 external integration before assessment.
