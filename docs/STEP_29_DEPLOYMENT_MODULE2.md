# Step 29 — Deployment preparation and Module 2 rehearsal

Prepared 4 November 2026 (Asia/Dhaka). Branch `feature/step29-deployment-demo`, stacked on [Step 28 draft PR #11](https://github.com/faraaz1027-cloud/MediMate/pull/11), base `3b46c9d4a270136a07824a3cc952a9e34af0c6fa`. The deployment package and local rehearsal are prepared; **Step 29's course deployment gate remains open**. No public MediMate URL, cloud database, running cloud worker, faculty-approved local alternative, real Telegram receipt or course submission is claimed.

## Confirmed constraints

The user confirmed that the faculty's public-deployment/local-demo requirement is **not confirmed**, selected Render **My Workspace** for inspection, and has **no cloud MongoDB database yet**. Read-only Render inventory found two services for another project and no MediMate service; those resources were not changed. The user previously confirmed no Telegram bot or consenting test recipient. All 13 assessed functions and owners are preserved. A2 belongs to Ihfaz, B2 to Faraaz and C2 to Sahir; assistant-authored work does not establish their individual contribution or live-edit ability.

The lab guide allows explained technical choices, but the Lab 06 Vercel example does not by itself approve a different host or a local-only submission. Obtain faculty agreement before treating either as the assessed deployment. This package supports preparation and rehearsal while that decision is pending.

## Prioritized findings and implemented changes

1. **P1 deployment blocker — production could not start reliably on a host.** The [base server](https://github.com/faraaz1027-cloud/MediMate/blob/3b46c9d4a270136a07824a3cc952a9e34af0c6fa/server/index.js#L140) listened only on 127.0.0.1, and [npm start](https://github.com/faraaz1027-cloud/MediMate/blob/3b46c9d4a270136a07824a3cc952a9e34af0c6fa/server/package.json#L8) required an ignored local .env file. Production now defaults to 0.0.0.0, accepts the host's PORT, starts from injected environment variables with an optional .env, and fails before listening when required production settings are absent. Local development keeps its loopback default.
2. **P1 integration blocker — a separately hosted Vite build had no production API routing.** Vite's proxy is development-only and the existing client uses relative /api URLs and SameSite=Lax cookies. The Express entrypoint now serves the compiled client and API together. This preserves the existing session/CSRF behavior without adding cross-site credential/CORS handling. SPA navigation gets index.html, while unknown API paths, missing assets and dotfiles remain 404. The index is not cached; hashed assets can be immutable. Development-only notes routes remain disabled in production.
3. **P2 deployment correctness — health/startup did not establish transaction readiness.** The deployed API and workers now reject standalone MongoDB using hello/session capability checks. This detects topology capability, not every possible user privilege/quota issue; authenticated CRUD still must be verified on the real cloud DB. Health performs a bounded database ping and exposes only connected/unavailable. API shutdown drains connections with a ten-second force-exit deadline; startup/runtime errors do not print connection strings.
4. **Open operational blocker — zero-cash always-running workers are not supplied by this Render plan.** No paid worker or cron is declared or created. A web page loading does not prove C1/C2 processing or Module 2 acceptance. The operating arrangement must be agreed separately.

Code map: `server/runtime-config.js` validates production environment and topology; `server/http-app.js` composes same-origin HTTP/static/health routing; `server/index.js` connects, initializes and listens. `server/worker.js` and `server/dose-worker.js` use the same production transaction check. `server/.env.example`, root start/demo commands and `render.yaml` document the intended operation. No application dependency or domain model was added. Existing API routes and assessed feature ownership are unchanged; Step 16 records the hosting/health additions.

## Hosting choice and current references

Checked the official references on 4 November 2026. Render free web services can serve this combined Node/Vite application but sleep after 15 minutes without inbound traffic, have an ephemeral filesystem and shared monthly usage limits. Background workers have no free compute plan. Therefore this Blueprint prepares the **web portion**, not an always-available reminder system. Review usage/spend controls before applying: selecting a free compute plan does not establish an unlimited, guaranteed zero-cost service. [Free service limits](https://render.com/docs/free), [compute plans](https://render.com/docs/compute-plans), [worker execution model](https://render.com/docs/background-workers).

MongoDB Atlas Free is a possible external database: its documented three-node replication supports a transaction-capable topology, subject to limited storage/throughput and idle-pausing rules. It is **not provisioned or tested here**, and no credentials or network permissions were created. Keep MongoDB; switching to Render Postgres would require a separate data-access migration without solving this step's current requirements. [Atlas Free limits](https://www.mongodb.com/docs/atlas/reference/free-shared-limitations/).

| Arrangement | Status and acceptance boundary |
|---|---|
| Local synthetic rehearsal | Implemented and tested; disposable replica set, compiled UI/API and disabled Telegram. Faculty approval as the deployment alternative is absent. |
| Render free combined web + external Atlas + explicitly run local workers | Web configuration prepared. Atlas and live URL absent. A student computer must remain awake/connected for workers; this is a limited demonstration arrangement requiring faculty agreement. |
| Cloud web/database plus always-running cloud workers | Requires a separately approved host/budget arrangement. No paid resource was silently substituted for the zero-cash constraint. |

The repository retains the Step 28 late/expired/unknown policy. Do not add artificial traffic just to imply continuous worker availability, run a reminder process during the build, or treat a short serverless request as the existing continuous worker.

## Reviewable Render configuration

`render.yaml` declares one new `medimate-module2-web` native Node web service in Singapore, matching the account's existing region. It uses plan free, manual deploys, Node 24, repository-root installation/build and `/api/health`. It declares no database, worker, cron or disk. MONGODB_URI and ALLOWED_ORIGINS use private initial-creation placeholders; Telegram values are blank. The branch is main, so the reviewed feature stack and Blueprint must be merged before applying. Do not replace an existing unrelated service with this definition.

The exact YAML passed structural validation against Render's downloaded official JSON Schema using YAML/Ajv 2020 tooling outside the application dependencies. Render CLI was not installed, and no Render API/platform-aware validation or Blueprint apply occurred. Before applying, install the official CLI if needed and run:

```sh
render blueprints validate render.yaml
```

[Blueprint reference/schema](https://render.com/docs/blueprint-spec), [official CLI setup](https://render.com/docs/cli), [environment handling](https://render.com/docs/configure-environment-variables). `sync:false` prompts for secrets during initial creation, not later updates; configure actual values privately and verify the next deploy uses them. Never commit a URI/token. Once the reviewed file is merged, the database is ready and the deployment arrangement is approved, the [MediMate Blueprint setup link](https://dashboard.render.com/blueprint/new?repo=https://github.com/faraaz1027-cloud/MediMate) points at this repository. Opening it is not evidence of a deploy.

Required environment for the combined production web service:

| Setting | Value/source |
|---|---|
| NODE_ENV | production |
| NODE_VERSION | 24 |
| HOST | 0.0.0.0 |
| PORT | Host-provided HTTP port; production default 10000 |
| SERVE_CLIENT | true; compile client first |
| MONGODB_URI | Privately configured application replica-set URI; no local fallback in production |
| ALLOWED_ORIGINS | Exact assigned HTTPS web origin, optionally comma-separated approved origins; no wildcard or path |
| TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME | Blank until the separate bot/link/consent work is ready |

Build: `npm ci --include=dev && npm run build`. Start: `npm start`. The explicit build flag retains Vite when NODE_ENV is production. A copied development .env example has HOST=127.0.0.1 and SERVE_CLIENT=false; override these for deployment. Configure the actual assigned origin, not a guessed hostname. Do not expose source files or .env as static content.

## Module 2 rehearsal and evidence

```sh
npm ci
npm ci --prefix verification/step18 --ignore-scripts
npm run build
npm run demo:module2
npm run demo:module2 -- --live-sources
npm run demo:module2 -- --live-sources --serve
```

The default run uses clearly labelled source fixtures. `--live-sources` explicitly calls public RxNorm/openFDA with public product identifiers, verifies saved passages against original response fields/hash, then deliberately injects a source outage. It never sends app sessions, patient text, notes or Telegram messages to those sources. `--serve` prints the temporary loopback URL and synthetic login, allowing manual rehearsal; Ctrl+C stops it and deletes its disposable database. It is not cloud deployment or permanent patient storage.

The clock is deliberately controlled (a calendar anchor and 25-minute advance) to exercise due events without waiting for clinical times; the course is labelled synthetic and is not medical direction. TTL sweeping is disabled only in the disposable demo because its fixture clock differs from Mongo's wall clock. The production application has no demo clock or harness route. Real source retrieval timestamps remain real UTC timestamps.

Eight checked stages: shared-patient A1/B1/A2 creates 12 persisted events against the same cabinet item; B2 selection retains exact original source facts; an injected outage preserves facts while the personal note saves; C2 taken replay deduplicates, caregiver skip retains actor and snooze changes only reminder time; counts reconcile to 1 taken/1 skipped/10 pending; C1 acknowledgement/accept/complete still works; server recreation preserves all histories/source/note; revoked caregiver loses reads/actions immediately.

Actual local validation: **114 API/provider tests pass**, zero failures/skips, production Vite build and production-bundle DOM suite pass. Four deployment tests include the actual production process without .env, frontend/static/API routing, secure cookie attributes, rejected origin, persistence across process restart, bounded health errors and real standalone Mongo rejection. The local process test uses HTTP plus a synthetic HTTPS Origin header and manually returned cookies; it does not prove a public TLS/browser deployment. The integrated Module 2 test uses the new HTTP composition. Existing Module 1 and restart regressions remain in the full suite.

The real-source run passed eight checks with **three actual public requests** (one RxNorm, two openFDA); five saved passages were verified against response fields, and the note survived the explicitly injected outage. DB readback: 12 doses, 3 actions, 1 card, 3 disabled reminder jobs, 0 attempts and 0 stock transactions. The local browser then inspected A2/B2/C2, saved a new synthetic note and verified it after reload. Desktop 1440×1000/mobile 390×844 document widths were 1425/375, with no captured console errors. Screenshots accompany the handover. No Lighthouse score, performance certification or completed student demonstration is claimed.

[Evidence index](evidence/step29-validation.json), [real-source rehearsal](evidence/step29-module2-live-sources.json), [controlled rehearsal](evidence/step29-module2-controlled.json), [API log](evidence/step29-api-tests.txt), [DOM log](evidence/step29-dom-tests.txt), [build log](evidence/step29-build.txt), [Blueprint structural validation](evidence/step29-blueprint-validation.txt). Windows runs should use a fresh MONGOMS_DB_PATH and the shared binary download cache. Re-run the full suite with `node verification/step18/api.mjs` after building; run DOM with `npm test --prefix verification/step18`.

## Steps needed to close the course gate

1. Confirm the faculty's required host/public URL or obtain explicit acceptance of the local/limited-worker arrangement. Record the actual decision; unconfirmed is not approval.
2. Set up a dedicated cloud MongoDB database privately if public deployment is required. Use a narrowly scoped DB user and allow only the required host egress/local-worker IPs. Do not use an unrelated project's database or silently open network access to everyone. Account terms, credentials and network access remain owner-controlled; no account or broad access was created here.
3. Have owners review the stacked changes, contribute their own understood frontend/backend edits and merge the approved stack/Blueprint. Verify the real database, origin, budget controls and worker arrangement, then apply/deploy in the confirmed workspace. Record service/deploy IDs, exact deployed commit and actual URL. Inspect logs without printing secrets, and wait for live plus HTTP/CRUD verification. [Deploy lifecycle](https://render.com/docs/deploys), [health checks](https://render.com/docs/health-checks).
4. Verify browser HTTPS sign-in, saved CRUD after refresh/restart, A1/B1/C1 regression, confirmed A2, real-source B2/outage/notes, C2 due actions/duplicate clicks and actual separate worker behavior at that URL. Check source facts against saved response evidence. Verify disabled/outage/expiry and revoked access. Do not treat only GET health or a green build as full success. Remember rollback does not undo database actions or external messages.
5. Configure a dedicated bot and consenting test recipient only when available, link privately, opt in separately, run one C1 poller plus C2 worker, and record real acceptance/recipient evidence without confusing it with app acknowledgement or dose state. This remains open because none is available.
6. Ihfaz demonstrates A2 and explains snapshots/version/timezone; Faraaz demonstrates B2's actual external requests, exact source passages and separate note; Sahir demonstrates C2's actor/history/idempotency and reminder uncertainty. Each makes live frontend/backend changes and records personal Git/Jira/viva evidence. The script and assistant-authored PR do not replace their work.

Step 29 remains prepared with external/human gates open. Step 30/A3 is later implementation and has not been started or claimed complete here.
