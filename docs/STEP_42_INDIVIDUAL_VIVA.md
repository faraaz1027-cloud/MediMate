# Step 42 individual viva and live modifications

Prepared 21 November 2026 on `feature/step42-viva-rehearsal`. This is a rehearsal
pack with independently testable reference exercises. It does not establish that
any student has demonstrated, understood, authored or submitted the work.

The lab rule is that every owner must understand and be able to modify their own
code. Each member has four original assessed functions; Sahir also has extra C5.
Accounts/profile/admin are shared infrastructure and do not replace these functions.
Each member's external integration, Git/Jira contribution and faculty evaluation
must be genuine. Codex's reference run cannot supply those human results.

## Member sheets

- [Ihfaz Rashid Sadat A1 to A4](viva/SADAT.md)
- [Faraaz Jamil Chowdhury B1 to B4](viva/FARAAZ.md)
- [Sahir Jawad Chowdhury C1 to C5](viva/SAHIR.md)

Start with the member's workflow and source tour. Have a teammate ask the questions
without reading the answer cues aloud. Then close the reference solution and make
the exercise manually in a separate practice copy. Explain each change before
running its test. A successful reference test is preparation, not a student pass.

## Session order for each member

1. Identify their function IDs and demonstrate the UI using synthetic records.
2. Trace one request through React, the request wrapper, Express route, permission
   and field validation, MongoDB transaction/model and the persisted response.
3. Demonstrate the relevant error, revoked/unauthorized request and refresh/restart
   behavior. Explain which source calls are live versus controlled or unavailable.
4. Make a frontend field change, corresponding backend validation change and model
   change in the practice copy. Explain legacy-data and update-validator behavior.
5. Run the focused case and relevant existing regressions; inspect the real rendered
   input and failed request. Record actual observations and unresolved errors.
6. Review the diff under the student's own Git identity and link their real Jira
   item/commit only after they understand it. Do not assign assistant work to them.

`Assessment_Record.csv` in the review pack starts with **NOT_RUN** for every human
check. The student/evaluator fills observations, date and actual evidence links.
This is a practice checklist, not a new faculty rubric or an invented grade.

## Tested reference exercises

All three exercises shorten an existing text field from 200 to 80 JavaScript
string code units. ASCII boundary tests use 79, 80 and 81 characters. Sadat changes
the A1 prescription title; Faraaz changes B1 transcribed strength text; Sahir changes
the C1 task title. Faraaz does not shorten server-resolved RxNorm product names.
These are metadata/transcription validation exercises, not prescribing decisions.

Each reference changes the actual input maxLength, its API validation and the
target Mongoose field from String to `{type:String,maxlength:80}`. Cabinet and task
edit routes receive the same bound as create. The original application remains
unchanged. The proposed 80 limit is a rehearsal task, not an approved new product
contract or a migration applied to existing records.

The baseline cases demonstrate the original 200 limit and unbounded String model.
Modified cases check the new boundary, highlighted field error, no partial domain
writes, edit rollback where applicable, Mongoose document validation, HTTP restart
persistence and denied anonymous reads. The compiled UI exercises type 81
characters into each real input and require an 80-character value before the
existing integrated workflow continues. DOM checks do not prove native layout.

### Schema and migration explanation

Mongoose document insert/save validation is not a MongoDB collection validator.
The current `db.update` helper does not set runValidators; the API must therefore
enforce its own bound on update. A direct raw MongoDB write can bypass Mongoose.
Adding maxlength does not rewrite or truncate existing documents. Before using a
shorter field in production, inspect existing lengths, choose an approved policy
and verify update behavior. Never silently truncate stored prescription text.

### Isolated copy and commands

Canonical project:
`C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`.
Reference copy:
`C:\Users\jfaar\Documents\Codex\MediMate-A3\Support\Step42_Review\Rehearsal_Source`.
The copy uses previously installed lockfile-tested dependencies; this step does
not claim another fresh install. It has disposable test databases and no .env,
private credentials or production data. All canonical client/server files are
hashed before preparation and checked unchanged afterward.

From a checkout with dependencies installed, preparation is:

```powershell
node verification/step42/prepare.mjs
```

The supplied default copy already contains answers. For an independent attempt,
create an unmodified copy with only the selected member's test entrypoint:

```powershell
node verification/step42/prepare.mjs --member sadat
# Or --member faraaz / --member sahir
```

These create `Support/Step42_Review/sadat-practice`, `faraaz-practice` or
`sahir-practice`. An optional `--name another-practice` avoids an existing directory.
They retain the original 200 behavior; the default 80 test should fail until the
student makes the change. Use VIVA_EXPECT_LIMIT=200 only for the baseline check.
The Sadat starter was checked separately: its original 200 case passes and its
80 case deliberately fails before implementation. That expected failure is a
reference-test check, not a new failing check on the canonical application or a
student result. Faraaz/Sahir starters can be created with the commands above.

An optional first argument supplies another already-installed dependency checkout.
Preparation refuses to overwrite an existing rehearsal directory. Preserve any
student edits rather than resetting it. The three entrypoint tests are installed
only in the rehearsal copy, not in the canonical server test directory.

Before applying reference solutions, run this in the rehearsal copy to establish
the original behavior (set MONGOMS_SYSTEM_BINARY if using an installed binary):

```powershell
$env:VIVA_EXPECT_LIMIT = '200'
node verification/step18/api.mjs server/test/viva-sadat.test.js server/test/viva-faraaz.test.js server/test/viva-sahir.test.js
```

`node verification/step42/apply.mjs` from the canonical checkout prepares the
reference answers **only in the isolated copy**. It also writes three reversible
patches under `Support/Step42_Review`. Do not run it over an ongoing student
exercise; read the small diff after an independent attempt. The supplied practice
copy already contains the reference changes, and the command is not a reset tool.

After the change, in the rehearsal copy:

```powershell
$env:VIVA_EXPECT_LIMIT = '80'
# Pick only the student's own focused file first:
node verification/step18/api.mjs server/test/viva-sadat.test.js
# Or viva-faraaz.test.js / viva-sahir.test.js
npm run verify
```

For a single member's independently modified copy, install only that member's
test entrypoint or select its file explicitly. The shared supplied reference copy
contains all three answers and all three tests. Full verification expects all
three limits there. No human must memorize or blindly apply all three patches.

## Evidence and outstanding work

Recorded reference result: baseline API cases passed 3/3 with the original 200
limit. After the isolated changes, Node 24.22.3 passed **190 backend tests**, zero
failures/skips, the Vite build and compiled UI integration. The three additional
cases and input checks are exercise evidence only. The reference patches passed
reverse-application checks. The canonical application hashes are checked unchanged
when packaging. No owner/evaluator result is inferred from these outcomes.

The Task model is also written by A4 collection and C3 follow-up workflows. A new
global title bound may affect generated titles outside the C1 form. The current
reference fixture regressions pass, but this is not approval for arbitrary legacy
or generated values. Review every producer and an explicit migration policy before
proposing any actual shared-schema contract change.

The package separates assistant reference results from the human record. Source
paths, baseline/modified HTTP outcomes and test transcripts are under
`docs/evidence/step42`. Existing Step 41 full-test and handover evidence remains a
separate checkpoint; Step 40's PDF/ZIP is not rewritten to claim student completion.

Live Telegram remains unconfigured. Recorded Overpass availability remains a
separate check; controlled adapters do not meet a successful live-call claim.
The Step 41 recorded remote main/draft-stack publication gap still needs owner
review and a genuinely reviewed release ref. No student Git commits, Jira updates,
scores or faculty approval were created in this step.

Next numbered step is **Step 43 final readiness and submission audit**. Its result
must retain any NOT_RUN human checks and live/deployment/faculty gates.
