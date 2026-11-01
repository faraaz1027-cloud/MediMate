# Step 19 — Account and access workflows

Implemented shared infrastructure on 1 November 2026, following CODEX_LAB_INSTRUCTIONS.md and CODEX_ROADMAP_AFTER_STEP_18.md. These workflows do not count as any student's assessed A/B/C feature. No faculty submission or individual implementation credit is claimed.

## Working slice

Existing signup/login/logout and session/CSRF checks are reused. Account and access settings let a signed-in user edit their display name, create an owned patient, select accessible patient profiles, and refresh discovery without signing in again. Owners edit a patient's name/timezone, grant access to a registered caregiver by shared user ID, inspect grants, change named permissions, revoke and restore access. Patient ownership is assigned by the server; clients cannot assign themselves a role or change another user's profile.

The invitation mechanism is a direct grant to a registered user, with immediate effect and no email/pending-invitation claim. This is a documented technical choice under the roadmap's freedom-to-change rule: reuse Step 17's identity contract for a zero-cash local demo rather than introduce email delivery. See Step 16 for requests and limits. Permissions reserved for later features do not make those features implemented.

Writes require CSRF and idempotency keys. The user/patient/grant revision prevents overwriting a concurrent edit. Data, audit event and replay response commit together. Existing schemas and indexes are reused; no destructive migration is required. Existing empty or delegated access.manage grants cannot be created/updated by this UI; administration remains owner-only. Restore uses PATCH on the original grant rather than creating a duplicate patient/user pair.

## Roles and operation policies

| Operation | Policy |
|---|---|
| Edit account display name | Signed-in user, own profile only |
| Create patient | Signed-in user becomes owner |
| Edit patient / administer grants | That patient's owner only |
| View/create prescriptions | Owner or prescription.read / prescription.write |
| Confirm prescriptions | Owner or prescription.confirm; endpoint remains Step 21 work |
| View/edit tasks | Owner or task.read / task.write; transitions remain Step 23 work |
| Record dose | Owner or dose.record; endpoint remains Step 27 work |
| SOS actions | Owner or explicit sos.activate / sos.manage; incident read policy and endpoints remain Step 36 work |

Every implemented patient operation checks the active grant at the server. Revocation removes discovery and blocks an already-signed-in caregiver on the next resource request. This does not retract information already viewed or cancel future worker jobs: notification/worker implementation is later work. No global admin or public user directory is introduced.

## Reproduce and review

Install root dependencies with `npm ci`, then `npm ci --prefix verification/step18`. Run `npm run build`, `node verification/step18/api.mjs`, and `npm test --prefix verification/step18`. The isolated runners download MongoDB 7.0.24 and use disposable replica sets. `MONGOMS_DOWNLOAD_DIR` can point to a cached binary. On restricted Windows environments, set `MONGOMS_DB_PATH` to a fresh empty writable directory per run. Do not reuse an old replica-set directory with a different random port. The runners never use the application database.

The sandbox denied npm's workspace symlinks locally. Local verification used `npm ci --prefix client --workspaces=false` and `npm install --prefix server --workspaces=false --package-lock=false`; CI performs the root locked install on Ubuntu. No application dependency or lockfile was changed.

For Postman, import `postman/MediMate_Step19.postman_collection.json`, set baseUrl to the local API, and run the full collection in order. It creates synthetic owner/caregiver accounts; per-request cookies are disabled so the two captured sessions remain distinct. Session credentials are runtime variables only; do not export a populated variable set. A real Newman run used `npx --yes newman@6.2.1 run postman/MediMate_Step19.postman_collection.json --env-var baseUrl=http://127.0.0.1:3005/api/v1 --reporters cli` against a disposable local test server. See `docs/evidence/step19-validation.json` for results.

UI demonstration: register two synthetic users; caregiver shares the ID shown in Account and access; owner grants task read permission; caregiver refreshes account details and selects the shared patient; owner edits/revokes/restores access. Show the 403 for disallowed writes and 404 after revocation using Postman. Edit account and patient names, create another patient, reload and verify retained values. Keep real patient records and session cookies out of captures.

## Owner review and remaining gates

Each member must review and understand this AI-assisted shared slice. Explain the active-grant lookup, expectedRevision check, transaction and idempotency replay; practise changing a UI label, server validation limit and test assertion. Students must make their own real contributions and perform live frontend/backend edits. Do not attribute these assistant-authored changes as evidence of a student's four assessed features.

Still open: password/email changes and recovery, pending/email invitations, large-scale discovery/grant pagination, comprehensive accessibility and slow/offline review, full feature workflows, faculty-specific screenshots/submission and individual viva. These are explicitly outside this local Step 19 slice or later roadmap gates; no deployment or email service is claimed. The next roadmap step is Step 20 shared UI/backend behavior; A1 remains Step 21.
