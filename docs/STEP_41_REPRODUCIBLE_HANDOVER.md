# Step 41 CI and reproducible handover

Prepared 21 November 2026 on `feature/step41-reproducible-handover`. This extends
the existing CI workflow; it does not imply a new hosted run, deployment or a
completed student handover. Earlier local work is preserved.

## Review findings

1. **P1 release gap:** remote `main` resolves to roadmap commit
   `21f5053eb6f2111bd28973e6d54ed0a67f1edf37`; its workflow path returned 404.
   [PR 14](https://github.com/faraaz1027-cloud/MediMate/pull/14) is an open draft
   on the stacked Step 30 branch. Its [base-feature workflow run](https://github.com/faraaz1027-cloud/MediMate/actions/runs/42128812382)
   succeeded. This is older Step 31 evidence, not a passing check for this working
   tree. The issue search returned no open issues; it did not establish no open PRs.
   Review and integrate the earlier stack and local changes before giving members
   `main` as the complete release. No merge or fabricated student commit was made.
2. **P2 handover gap:** the current helper was outside the Git root and depended
   on a device-specific cached binary. `scripts/local.ps1` now works from the
   repository, using an installed `mongod` or explicit `MONGOMS_SYSTEM_BINARY`.
3. **P2 verification gap:** `npm run test:api` previously needed an already supplied
   test URI, and the runner listed files manually. It now starts the existing
   disposable replica and discovers `server/test/*.test.js`, retaining explicit
   file selection for focused checks. `npm run verify` builds, tests API/database/
   workers, then tests the compiled UI, failing on any failed stage.
4. **P2 CI diagnostics:** retain the existing least-privilege workflow and add
   Windows/Linux jobs, cancellation of superseded jobs, manual dispatch and seven-day
   diagnostic artifacts even on failure. CI uses controlled providers, empty
   Telegram settings and a disposable MongoDB replica. No production secrets are
   needed. `.local-data/verification` contains only this runner's logs/summary;
   the upload does not include the rest of `.local-data` or `.env`.
5. **P2 onboarding:** README now distinguishes implemented local functions from
   deployment/student evidence, and explains the current CSS stack and startup.
   The seed adds two synthetic accounts, three manual items, an unconfirmed draft
   and one caregiver task through actual API routes. Re-running preserves existing
   records/history and never overrides passwords or revoked grants. A focused
   database-connected seed test verifies replay and rejects non-loopback targets.

## Fresh install and verification

Recorded result: the empty `Support/Step41_Review/source-initial` export installed
both lockfiles using checksum-verified official Node **24.22.3** on Windows.
`npm run verify` passed the Vite build, **187 backend tests** (zero failed/skipped)
and the compiled UI integration. Source export manifest and installation/build/API/
UI logs are retained under `docs/evidence/step41` and the review handoff. This is
a real fresh dependency install, not use of the original checkout's node_modules.
Linux and the hosted Windows runner are configured but not newly executed here.

Use Node 24 (`.nvmrc`) and Git. Start in the reviewed release checkout, not an
unverified old `main`. Until review/commit integration is complete, the Step 41
source export is the tested handoff candidate and is explicitly not a Git clone.

```powershell
npm ci --include=dev
npm ci --prefix verification/step18
npm run verify
```

Network is needed for package installation and the first MongoDB 7.0.24 download.
For an installed compatible binary, set `MONGOMS_SYSTEM_BINARY` to its absolute
`mongod` path before testing. Tests create their own disposable replica databases;
they do not use or clear the persistent handover database. Full API checks include
transaction/permission/replay, actual worker process/restart, export and complete
scenario tests. DOM integration verifies working UI requests, not native layout.
The separate Step 39 native evidence remains applicable to its recorded pages.

## Persistent Windows rehearsal

Build first. From the repository root in terminal 1:

```powershell
./scripts/local.ps1 -Mode Mongo
```

Leave it open. In terminal 2:

```powershell
./scripts/local.ps1 -Mode Initialize
./scripts/local.ps1 -Mode Server -Port 1499
```

In terminal 3: `npm run seed:demo -- http://127.0.0.1:1499`.
Open http://127.0.0.1:1499. Synthetic account emails are
`handover-owner@example.test` and `handover-caregiver@example.test`; their fixture
password is `Synthetic-handover-123!`. No real personal data is seeded. The draft
requires clarification and does not create a medication schedule or contact anyone.
Use separate profiles for owner/caregiver. The seed supplies task/dose permissions
only; all additional grants and emergency consent remain explicit user actions.

Port 1205 is Faraaz; port 1212 is Sahir. The helper maps them to
`assignment03_device_1205` and `assignment03_device_1212` respectively; Sadat uses
`assignment03_device_1499`. For interacting accounts use one server and database.
Cookies are not isolated by port. Ctrl+C stops the processes; preserve the database
folder `.local-data/mongo` between sessions.

The seed uses normal API sessions in memory and prints only fixture IDs/emails;
it creates no auth-bypass route. It rejects external origins, HTTPS, credentials
in URLs and non-root paths. Its fixed synthetic credential must never be used on
a publicly deployed real-user system.

The helper also accepts `-MongoPort` and any valid local `-Port` for isolated
testing. Default database port/data-folder behavior remains 27028 / `.local-data/mongo`.
A nondefault database port gets a separate `.local-data/mongo-PORT` folder.
`MEDIMATE_MONGO_PORT` passes the selected port to the existing replica initializer;
its unchanged default preserves the older Assignment 03 helper.

The actual helper/seed CLI was checked at HTTP **17441** / MongoDB **27041** in the
fresh export. Repeated seeds kept IDs, then both MongoDB and Express were stopped
and restarted from the same files. IDs still matched and readback counted two
users, two patients, three cabinet items, one prescription, one task, one note,
one grant, zero dose occurrences and zero notification attempts. The isolated
listeners were stopped afterward; the existing demonstration database was not used.
Evidence: `docs/evidence/step41/persistent-restart.json`.

## Linux and macOS local rehearsal

Create `.local-data/mongo`, run an installed MongoDB binary, then initialize using
the same script as Windows:

```sh
mkdir -p .local-data/mongo
mongod --dbpath .local-data/mongo --port 27028 --replSet assignment03 --bind_ip 127.0.0.1
# Another terminal at the same checkout:
node verification/assignment03-init-replica.mjs
export MONGODB_URI='mongodb://127.0.0.1:27028/assignment03_device_1499?replicaSet=assignment03'
export NODE_ENV=development PORT=1499 HOST=127.0.0.1 SERVE_CLIENT=true
export ALLOWED_ORIGINS='http://127.0.0.1:1499'
export TELEGRAM_BOT_TOKEN='' TELEGRAM_BOT_USERNAME=''
npm start
# Another terminal:
npm run seed:demo -- http://127.0.0.1:1499
```

These Unix commands are instructions; the local verification device is Windows.
The hosted Linux/Windows matrix must run after the reviewed workflow is published.

## Workers and secrets

Every worker uses the same chosen DB as its API. In each separate PowerShell
terminal set the following (Sahir example) and run the appropriate worker:

```powershell
$env:NODE_ENV = 'development'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27028/' +
  'assignment03_device_1212?replicaSet=assignment03'
$env:TELEGRAM_BOT_TOKEN = ''
$env:TELEGRAM_BOT_USERNAME = ''
npm run worker --workspace server
# Other independent terminals with the same environment:
npm run dose-worker --workspace server
npm run followup-worker --workspace server
npm run sos-worker --workspace server
```

Empty Telegram settings deliberately prevent live delivery. The seed task may
have a disabled notice; this is not a delivered notification. The existing
`server/.env.example` supports split Vite development. Copy only to ignored
`server/.env` and set real values privately when live setup is later authorized.
For production, use the host's secure environment or protected CI environment;
never put a URI/token in YAML, screenshots, logs or an archive. CI verification
does not require any provider/cloud secret.

## Disposable seeded demonstration

`npm run demo:module2 -- --serve` starts the existing seeded controlled-provider
rehearsal, including its own replica set. It prints its loopback URL and synthetic
fixture login. The test clock and source fixtures are clearly identified. It
deletes only its disposable fixture DB on exit. Do not pass `--live-sources` when
claiming a controlled/no-provider test. It is separate from the persistent helper.

## Publication and assessment gates

The extended workflow remains local until the owners review/commit the source and
integrate the existing stack. Then open/review a PR against the intended integration
branch and inspect both OS jobs. Do not replace or merge the historical draft PR
just to obtain a green badge. A future fresh clone must name the actual reviewed
ref/commit, install from its lockfiles and run the commands above on another
member's device. That human/device result remains separate from local export tests.

There is no deployment job that creates an unapproved service. The prepared Render
configuration, no cloud database, worker availability, live Telegram/Overpass,
student ownership and faculty approval remain the existing open gates. C5 provider
mode stays a classroom simulation. Step 40's documentation ZIP is a historical
checkpoint and is not silently regenerated to claim Step 41 evidence.

Official workflow/artifact references checked during this step:
[workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[upload artifact inputs](https://github.com/actions/upload-artifact).

Next numbered step after local validation: Step 42 individual viva and live modifications.
