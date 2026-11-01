# Step 17 — Six database-connected APIs

Implemented and tested on 1 November 2026. This milestone provides two APIs for each member's allocated Module 1 area. It does not represent individual member authorship, faculty acceptance or completion of all Module 1 workflows.

## API allocation

All paths below begin with `/api/v1/patients/{patientId}`. Use a signed-in session, the patient's ID and the stated permission. State-changing requests also require `X-CSRF-Token` and a UUID `Idempotency-Key`.

| Allocated member | Method and route | Permission | Behavior |
|---|---|---|---|
| Ihfaz Rashid Sadat | POST /prescriptions | prescription.write | Creates a prescription, version 1 draft and 1–30 separate instruction records in one transaction |
| Ihfaz Rashid Sadat | GET /prescriptions | prescription.read | Lists scoped prescription summaries with draft/current version pointers |
| Faraaz Jamil Chowdhury | POST /cabinet-items | cabinet.write | Creates an explicitly manual cabinet entry |
| Faraaz Jamil Chowdhury | GET /cabinet-items | cabinet.read | Lists scoped cabinet items |
| Sahir Jawad Chowdhury | POST /tasks | task.write | Creates an open task and a handover event; assignee must be owner or an active caregiver with task.write |
| Sahir Jawad Chowdhury | GET /tasks | task.read | Lists scoped tasks |

Lists accept `limit` (1–100, default 20), an opaque `cursor`, and `status`. Prescription/cabinet status filters accept active/archived; task filters accept open/accepted/completed/cancelled. Only initial active/open creation is implemented here. Ordering is descending createdAt then ID. Responses include `meta.requestId`, `limit`, `filters` and `nextCursor`.

## Implemented identity and access foundation

- GET `/api/v1/auth/csrf` establishes an anonymous session and returns its token. POST register/login require that token and rotate the session; logout invalidates it. GET `/auth/me` returns the public signed-in user.
- Registration accepts email, password (12–128 characters), displayName and creates an owned synthetic patient in Asia/Dhaka. It additionally returns patientId and the rotated csrfToken. Passwords use salted scrypt; only token hashes persist for session cookies. Sessions expire after eight hours.
- GET `/patients/{patientId}` returns an accessible patient (prescription.read for caregivers). Owner-only POST `/access-grants` creates a named permission grant for a registered user. POST `/access-grants/{grantId}/revoke` compares expectedRevision and revokes it. Both require idempotency and CSRF headers.
- Each patient operation checks ownership or an active permission grant. Cross-patient or revoked access returns 404; an active grant missing a permission returns 403. A replay checks access again.
- Cookies are HttpOnly and SameSite=Lax; Secure is enabled with NODE_ENV=production. Browser writes validate an explicit Origin allowlist. Same-origin Vite proxy use is supported; cross-origin CORS hosting is not configured in this milestone. Non-browser clients may omit Origin but must supply session and CSRF token.
- Login/registration have a process-local throttle (10 attempts per IP/path per minute). A shared deployment limiter, password recovery, disabled-user management, patient creation/listing and complete grant editing/reauthorization remain later work. `/auth/me` does not yet enumerate accessible patients.

## Request examples

Prescription:
```json
{"title":"Synthetic example","instructions":[{"lineNumber":1,"medicineText":"Demo medicine A","instructionsText":"Demonstration only","clarificationRequired":true,"doseQuantity":"1","doseUnit":"tablet"}]}
```

Cabinet item:
```json
{"displayName":"Demo medicine A","entryType":"manual","strengthText":"Synthetic strength","form":"tablet"}
```

Task (replace the assignee ID with the registered owner/caregiver ID):
```json
{"title":"Review handover","assigneeUserId":"0123456789abcdef01234567","type":"general","dueAtUTC":"2026-11-02T17:00:00Z","handoverNote":"Synthetic example"}
```

POST prescription returns `{data:{prescription,draftVersion:{instructions:[...]}}}`. Other creates return `{data:resource}`. New creation returns 201; an identical idempotent replay returns 200 and the same resource. Changed input with the same key returns 409. Unknown fields are rejected, including client-supplied owner/patient/state fields. Decimal quantities serialize as strings. See the [full target contract](STEP_16_API_CONTRACTS.md) for the shared error envelope and later routes.

## Persistence and atomicity

Models in `server/v1/store.js` use the Step 15 collection names: users, patients, accessGrants, sessions, prescriptions, prescriptionVersions, prescriptionInstructions, cabinetItems, careTasks, taskEvents, operations and auditEvents. They include schemaVersion, timestamps and revision. Unique indexes protect normalized email, access grants, prescription version/line identities and idempotency scope. Patient lists use compound ordering indexes. Session TTL and the 30-day idempotency TTL are enforced by MongoDB's asynchronous TTL monitor.

Each patient create saves its domain data, audit event and replay response in one transaction. A transaction failure rolls everything back. Concurrent duplicate keys return the committed result. A prescription draft does not confirm itself or activate a schedule. A task event records the initial handover without claiming Telegram delivery. No notification worker runs yet.

## Local setup (Windows PowerShell)

The older Step 10 standalone MongoDB can remain on port 27017. Run a separate local single-node replica set on 27018 for these transaction-dependent APIs. Use synthetic records. The following commands assume `mongod` and `mongosh` are installed and on PATH.

Create an empty directory and start this additional MongoDB process in its own terminal:
```powershell
New-Item -ItemType Directory -Force C:\MediMateMongo
mongod --dbpath C:\MediMateMongo --port 27018 --replSet medimate --bind_ip 127.0.0.1
```

In another terminal, initialize this new replica set once:
```powershell
mongosh "mongodb://127.0.0.1:27018" --eval "rs.initiate({_id:'medimate',members:[{_id:0,host:'127.0.0.1:27018'}]})"
```

From the repository root:
```powershell
npm ci
Copy-Item server/.env.example server/.env
npm run dev:server
```

Do not overwrite an existing `.env` containing settings you need: update its MONGODB_URI to `mongodb://127.0.0.1:27018/medimate_demo?replicaSet=medimate`. The API listens at `http://127.0.0.1:3001`. A standalone server can still serve the old demonstration, but transactional v1 writes fail with 503 until replica-set configuration is available. Production requires appropriate authenticated MongoDB/TLS configuration and HTTPS; no production deployment is included.

## Run the verification

With the local test replica set running, from the repository root:
```powershell
$env:MONGODB_TEST_URI="mongodb://127.0.0.1:27018/?replicaSet=medimate"
npm run test:api
```

The suite creates and deletes its own randomly named `medimate_test_*` database. It never drops the database named in the URI. Supply a local test instance with permission to create a temporary database. Missing configuration fails with a clear instruction rather than silently skipping tests.

Import [MediMate_Step17.postman_collection.json](../postman/MediMate_Step17.postman_collection.json) into Postman. Set baseUrl to `http://127.0.0.1:3001/api/v1`, keep cookies enabled and run the complete collection in order. It registers a fresh synthetic account, captures patient/user/CSRF variables and exercises all six APIs, three idempotent replays, validation and cross-patient denial. Remove or retain this synthetic account according to your local demonstration needs. For a command-line run:
```powershell
npx newman run postman/MediMate_Step17.postman_collection.json --env-var baseUrl=http://127.0.0.1:3001/api/v1
```

## Actual evidence

The acceptance suite and Postman collection were executed against real MongoDB 7.0.24 in a temporary single-node replica set, using Node 24.22.1. The test runtime was isolated from application dependencies. No real medical data or notification channels were used.

- Acceptance suite: 11 behavioral subtests plus their parent test passed (12 reported tests), zero failures/skips. Covers sessions, CSRF/origin checks, patient scope, six route persistence, duplicate/conflicting requests, concurrent duplication, invalid inputs, permission revocation, pagination, API restart, logout/login and transaction rollback.
- Postman/Newman: 13 requests and 37 assertions passed, zero failures. Database counts after the run were one prescription, one draft version, one instruction, one cabinet item, one task and one task event despite replaying each create.
- [Acceptance output](evidence/step17-api-tests.txt) and [sanitized Newman report](evidence/step17-postman-newman.json) contain the actual results. Session cookies, credentials and response bodies are excluded from the published report.

This is automated Postman-collection evidence, not a screenshot of the Postman desktop application. If faculty explicitly requires desktop screenshots, run the included collection locally and capture the request, response and Tests pane for each allocated API. Individual student explanations and contribution evidence remain each member's responsibility.

## Remaining feature work

Full prescription editing/confirmation/history and OCR; RxNorm search and verified external cabinet entries; task transitions/reopening and grant reauthorization; Telegram notifications; patient/account management and React integration are not implemented by this milestone. Unsupported external cabinet creation returns 422 explicitly. The full target contract also includes schedules, doses, stock, evidence, reports and simulated SOS; those remain later implementation work. Step 14 design/Word preparation, Step 15 data specification, Step 16 API specification and this six-API milestone are complete within the coverage described above.
