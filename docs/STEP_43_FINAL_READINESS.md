# Step 43 — Final readiness and submission audit

**22 November publication addendum:** the completed source is published for team
review in [PR #15](https://github.com/faraaz1027-cloud/MediMate/pull/15) on
`feature/complete-project-review`; see [the current publication record](PUBLICATION_REVIEW.md)
for exact-revision local/hosted results and the current-head Checks link. The
recorded source checkpoint passed Windows/Linux with 189 backend tests and UI/build.
The documentation follow-up is checked again before task completion. This dated audit below retains
its original results. C1 real Telegram receipt was subsequently verified in
[the delivery addendum](MODULE_1_TELEGRAM_DELIVERY.md); C2/C3/C5 live receipt and
individual assessment are separate gates. The refined Module 1 UI is documented
in [the Figma update](FIGMA_MODULE1_UI.md). Overall course submission remains open.

Audit date: 21 November 2026, Asia/Dhaka. Actor: Codex technical review.
**Final submission status: NOT READY.** The local implementation and evidence are
prepared; human, live-integration, publication and faculty gates remain open.
The last numbered roadmap step is an audit, not proof of course completion.

## Scope and authoritative instructions

This audit uses [the lab instructions](CODEX_LAB_INSTRUCTIONS.md),
[the roadmap](CODEX_ROADMAP_AFTER_STEP_18.md), [requirements](REQUIREMENTS.md),
and [Step 11 acceptance criteria](STEP_11_ACCEPTANCE.md). The two supplied Lab 7
reports are examples, not a newer rubric or a requirement to change to Flask.
The agreed React/Vite, Express and MongoDB stack and all 13 owners/IDs are retained.
Authentication/profile work does not count as an assessed feature. Local OCR is
not an external API. C5's assessment and any faculty additions require confirmation.

## Prioritized findings

1. **P1 — course evidence is incomplete.** A1–A4, B1–B4 and C1–C5 have controlled
   technical evidence, but no individual final demonstration/viva/live-edit pass
   is recorded. Each student must understand, modify and commit their own work;
   the assistant's changes and tests cannot establish individual contribution.
   Jira links, genuine contribution evidence and each owner's external API
   demonstration must be attached to the Step 42 assessment record.
2. **P1 — live integrations and deployment decision are open.** No Telegram bot
   or consenting linked recipient is configured. Actual Telegram receipt is
   unverified. Sadat's successful live Overpass listing and Sahir's external API
   evidence remain open; Faraaz has dated live RxNorm/openFDA evidence but still
   needs his own demonstration. Controlled providers prove behavior, not public
   availability or live dispatch. Cloud MongoDB is absent; obtain the faculty's
   public-deployment requirement or explicit local-demo exception and test that
   arrangement. No real emergency provider dispatch is implemented or claimed.
3. **P1 — the tested source is local, not the remote main revision.**
   [main](https://github.com/faraaz1027-cloud/MediMate/tree/main) is still at
   `21f5053eb6f2111bd28973e6d54ed0a67f1edf37`.
   [PR 14](https://github.com/faraaz1027-cloud/MediMate/pull/14) is open/draft,
   based on the Step 30 branch, with Step 31 head `5a920e455a4d7651cc515d34a30206bedad4c49c`.
   Its [historical workflow](https://github.com/faraaz1027-cloud/MediMate/actions/runs/42128812382)
   passed. No failing check was found in the returned runs; this does not validate
   the unpublished Steps 32–43. Review the preserved local changes, make authentic
   owner commits, integrate the stacked branches, and run the current hosted
   Windows/Linux workflow on the exact proposed revision. Another member's real
   clean clone remains unverified. No commit, merge or submission is fabricated.
4. **P2 — responsive and performance evidence has limits.** Step 39 recorded
   actual native Chrome 360px/Slow 4G/offline recovery and Lighthouse results.
   Reviewed mobile LCP was 3.312s (performance 92, CLS 0.043), above the illustrative
   2.5s target; desktop performance was 100. Other native screens, accessibility
   and physical-device checks remain open. The isolated Step 42 80-character
   exercises are training references; the canonical application retains its
   original limits. They are not an approved production change.
5. **P1 — submission logistics are unconfirmed.** Faculty deadline, portal,
   final rubric/required formats and deployment decision have not been supplied.
   The 19-page Step 40 PDF and editable Markdown are prepared, alongside the three
   original revised Assignment 03 Word reports and final collections. Confirm
   faculty acceptance of the final-report format; no new final-report Word file
   or faculty submission is claimed. Use the current audit as an addendum to the
   dated report rather than changing its historical test claims.

## Verification and deliverables

The reproducible verifier is `verification/step43/audit.py`. It exports the current
canonical source into a separate candidate, compares runtime files to the actual
Step 41 fresh-install checkpoint and all 103 application hashes to Step 42's
canonical baseline, and validates the three earlier ZIPs and their checksums.
`npm run verify` is run in that candidate, not in the isolated Step 42 exercise.
Read `docs/evidence/step43/validation.json` and `summary.json` for actual results.
The full backend run includes the connected synthetic scenario; its fresh
checkpoint/exchange evidence is retained separately from the original Step 37 run.
No new real-browser screenshot or live public-transport result is implied.

The audit reopens the three revised Word ZIPs and verifies that each numbered
capture is embedded and matches the capture manifest. Final counts are **19 Sadat,
16 Faraaz, 24 Sahir (59 total)**, superseding the older 19/13/21 capture plan.
It checks collection request labels, Postman schema and each member's port.

Generated delivery files in `MediMate-A3/Final_Readiness/`:

- `Feature_Readiness.csv`: all 13 IDs, Step 11 criteria, code/test anchors and open gates.
- `Course_Gates.csv`: verified technical work and outstanding course requirements.
- `Submission_Checklist.md`: practical owner actions and unknown submission details.
- `Assignment03_Audit.json`: report, collection and capture verification.
- `Archive_Audit.json`: checksum/CRC checks of the dated Step 40–42 archives.
- `Git_Status.txt`, `Git_History.txt`, `Git_Refs.txt`, `Working_Source.patch`:
  actual local history/status and the tracked working diff; untracked source is
  included in the source export, not silently omitted from the backup.
- `Validation.json` and `Manifest.json`: result summary and per-file SHA-256 index.

`MediMate_Step43_Readiness_Backup.zip` contains the current source export, audit,
and unchanged Step 40/41/42 ZIPs with their checksums. The companion `.sha256`
checks the final ZIP. Dependencies, build output, private DBs and local configuration
are excluded; `.env.example` templates and explicit synthetic test credentials are
retained. The backup is an uncommitted source snapshot, not a released Git clone.
Verify its checksum after copying to a second location; a separate off-device
copy and restore by another member remain human checks. Do not publish the backup
as an assessed final submission until the course gates are resolved.

## Final demonstration order

Start with [Step 41 setup](STEP_41_REPRODUCIBLE_HANDOVER.md) and the exact persistent
commands in the generated submission checklist. Use only synthetic records and
separate authenticated patient, caregiver and contact sessions. The repeatable
technical scenario is [Step 37](STEP_37_COMPLETE_SCENARIO.md); its automated actor
does not replace the following human rehearsal:

1. **Module 1:** Faraaz B1 searches/reviews a medicine and shows manual fallback,
   filters, archive and retained history. Sadat A1 creates/reviews an OCR or manual
   draft, demonstrates draft-only deletion and immutable confirmed history.
   Sahir C1 assigns a task, accepts/completes it, edits/deletes his own handover
   note and proves unauthorized note controls. Refresh and show persisted data.
2. **Module 2:** Sadat A2 previews and confirms a complete schedule, shows the
   effective pause date and retained historical events. Faraaz B2 selects a real
   label, opens the cited source and edits a separate personal note. Sahir C2
   records taken/skipped/snoozed actions and reasoned correction; replay a taken
   request to prove no duplicate action. Show real notification receipt only
   when configured; otherwise label delivery disabled/NOT_CONFIGURED.
3. **Module 3:** Sadat A3 reconciles stock (2 - 1 + 5 = 6 in the controlled case),
   then A4 saves a live pharmacy preference and linked C1 collection task.
   Faraaz B3 reviews ingredient overlap/source limitations and B4 demonstrates
   supported citation, insufficient evidence, feedback and deletion. Sahir C3
   acknowledges/resolves overdue-unconfirmed follow-up without relabelling the
   dose skipped; C4 compares analytics/PDF totals and reopens the saved export;
   C5 demonstrates recipient consent, denied location, deliberate activation,
   acknowledgment, cancellation and clearly labelled provider simulation.
4. Restart MongoDB/API and reopen saved records. Show one invalid-input case,
   one permission/revocation failure and an integration outage for each relevant
   feature. Preserve actual screenshots, request/response and database evidence.
5. Each student answers the questions and performs their own frontend, backend
   and schema exercise from `docs/viva/`, reruns the affected regression, and
   records their genuine commit/Jira/evaluator links. The reference answer patch
   must not be submitted as proof that a student performed the change.

**Human final demo status: NOT_RUN for all three members.** Module 1/2/3 course
acceptance is open. After every blocking item is evidenced, update the checklist,
record the exact reviewed Git SHA and faculty deadline, produce a new dated backup,
verify it after copying, and submit through the confirmed faculty channel. There
is no invented Step 44: the next work is closing these gates.
