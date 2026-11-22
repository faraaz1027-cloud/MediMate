# Module 1 preparation checkpoint

Current live integration update: **C1 real Telegram receipt verified** with
@Medi911_bot, followed by separate in-app acknowledgement. See
[the delivery addendum](MODULE_1_TELEGRAM_DELIVERY.md). The earlier preparation
history below predates this real test; individual student assessment remains open.

21 November 2026, Asia/Dhaka. Branch: `feature/module1-submission-readiness`.
All earlier local work is preserved. **Module 1 is not yet submission-ready.**

Completed technical preparation:

- Confirmed A1 current-draft-only deletion, B1 filters/archive/history and C1
  author-only note editing/deletion in the current implementation.
- Fixed local startup: `scripts/local.ps1` now supports explicit `-EnableTelegram`,
  a dedicated private Telegram-only file, `CheckTelegram` and `TaskWorker` modes.
  Ordinary server runs still disable Telegram. The new loader reads only the two
  Telegram fields, validates syntax and does not print tokens. Syntax validation
  does not establish bot ownership, live availability or actual receipt.
- `npm run verify:module1` passed build, **62 focused API/provider tests**, compiled
  UI integration and a fresh actual RxNorm nine-checkpoint connected scenario.
  Logs/summary: `docs/evidence/module1-readiness/`. Telegram was disabled.
- Exported importable Module 1-only Postman collections into `postman/module1/`,
  preserving every setup/intermediate request in each original feature folder.
  Full original Assignment 03 collections/reports are unchanged.
- Actual local helper/Newman tests passed on ports 1499/1205/1212 with disposable
  MongoDB. Sadat: 20 requests/30 assertions; Faraaz: 23/37; Sahir: 41/60. Total:
  **84 requests, 127 assertions, zero failures**. Evidence: `startup-newman.json`.
- Actual helper probe verified default disabling even with inherited synthetic
  credentials and explicit opt-in configuration visible through authenticated
  `/me/channel-links`. Only synthetic dummy bot values were used; no Telegram
  worker/send ran. Those helper/Newman services were stopped after assertions.

The earlier Escape interruption was recovered after the user requested continuation.
Selected native Chrome desktop controls were reviewed: A1 saved draft/history and
disabled confirmation for unresolved clarification; B1 name filter with one matching
item; C1 owner-authored note edit/delete controls, their absence for a separate
caregiver, the shared-patient selection, and disabled task-edit submission for the
non-manager. Five native captures and observations are in
`docs/evidence/module1-readiness/browser/`; coverage/limits are in `browser-review.json`.
This is not a complete native end-to-end pass, student demonstration, fresh OCR
engine/device/performance run or faculty acceptance. The synthetic browser fixture
uses test-only session routes, never production auth bypasses. It shut down cleanly
through stdin, dropping its synthetic DB and stopping its temporary replica.

The earlier no-account response was later resolved by the user creating the bot
and authorizing PC setup/linking/receipt. Actual C1 receipt is now verified in the
delivery addendum; no other live channel or student pass is inferred.

Preparation deliverables now available in `Module1_Submission` and
`MediMate_Module1_Review_Pack.zip` after running `verification/module1/package.py`:

1. Member-specific Module 1 demo/capture order, code explanations and
   frontend/backend practice instructions, retaining genuine student ownership.
2. The 35 existing Module 1 Postman captures (A1 10, B1 11, C1 14), maps
   and focused collections into a verified review pack; these are evidence counts,
   not a newly confirmed faculty screenshot quota.
3. A Module 1 human assessment record, Jira task drafts and focused review
   patch. Do not invent completed assessments, Jira tickets, commits or authorship.
4. Current source/setup/evidence and checksums in a new Module 1 archive.
   Preserve dated Step 40–43 archives. Do not include private env, DBs/dependencies.
5. Selected desktop native controls reviewed; the complete human demo and any
   faculty-specific device/accessibility checks remain separate requirements.
6. Each member still performs their own demo, questions and frontend/backend edits,
   contributes under their actual identity, and supplies genuine Git/Jira links.
   Confirm faculty deadline/portal/Module 1 rubric. Public deployment is not
   established as a Module 1 requirement in the available material.

To continue technical checks on this device, prepend the official Node 24 runtime
from `.local-data/step41-runtime/selected.txt` to PATH and use the existing cached
MongoDB binary documented in Step 43. Run `npm run verify:module1` for the scoped
suite. Windows helper/Newman check: `node verification/module1/startup-newman.mjs`;
it uses the locked sibling `../assignment03-tools` Newman installation and refuses
to take over occupied member ports.

Future real Telegram setup (after a team-owned test bot exists): copy
`server/telegram.env.example` privately to ignored `server/.env.telegram.local` and
enter the token/username there. `./scripts/local.ps1 -Mode CheckTelegram` validates
only the private file syntax. Then start the server with `-EnableTelegram` and a
separate `-Mode TaskWorker -EnableTelegram`, using the same `-Port`/`-MongoPort`.
Finish linking and explicit recipient consent via the Step 23 procedure. Never
paste a token into chat/Git. No real Telegram transport was exercised here.
