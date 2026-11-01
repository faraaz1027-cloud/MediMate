# Step 16 — API contracts
Status: proposed implementation contract, 1 November 2026. Covers A1–A4, B1–B4 and C1–C5. This is the full implementation target. The six create/list APIs and identity/access foundation now have an implemented subset; see [Step 17](STEP_17_API_IMPLEMENTATION.md) for its exact coverage and limitations. The Step 10 localhost notes API remains a separate demonstration. Read with [Step 15](STEP_15_DATA_MODEL.md) and [acceptance criteria](STEP_11_ACCEPTANCE.md).

## Shared HTTP contract
Step 20 keeps this envelope and authorization contract unchanged. Validation for email, password, timezone and task assignee now includes a field path/message so the UI can associate and focus the affected input. The client normalizes network/non-JSON responses locally; it does not convert a failure into an empty successful list or automatically repeat a mutation. No schema migration is needed.

Base path: /api/v1. Patient routes below are relative to /patients/{patientId}. All ObjectIds are 24 hexadecimal characters. Dates/times are ISO UTC instants, local dates YYYY-MM-DD and wall times HH:mm. Decimal quantities are strings with explicit units. Arrays contain IDs unless stated otherwise.

Success: {"data": resource-or-array, "meta":{"requestId":"opaque"}}. Lists additionally return meta.nextCursor (opaque string or null), limit (default 20, maximum 100) and applied filters. Cursor order is createdAt plus _id; dose lists order dueAtUTC plus _id. Never expose password hashes, raw callback tokens, Telegram chat IDs or storage keys.

Error: {"error":{"code":"VALIDATION_ERROR","message":"Correct the highlighted fields.","fields":[{"path":"doseQuantity","message":"Must be greater than zero."}]},"meta":{"requestId":"opaque"}}. Error messages must not reveal another patient's existence or upstream credentials.

| Status | Meaning |
|---|---|
| 200 | Read or mutation result; also an idempotent replay of a completed operation |
| 201 | New resource created |
| 202 | Persisted asynchronous work accepted; returns job/resource ID and status, not completed success |
| 204 | Successful logout or deletion with no body |
| 400 | Invalid JSON, malformed cursor, ID or query |
| 401 | Missing/expired authentication |
| 403 | Authenticated actor lacks operation permission on an otherwise accessible patient |
| 404 | Missing or out-of-scope resource; use for cross-patient IDs |
| 409 | REVISION_CONFLICT, INVALID_TRANSITION, IDEMPOTENCY_CONFLICT or active incident collision |
| 413 / 415 | Upload exceeds limit / unsupported media type |
| 422 | Well-formed data fails business validation |
| 429 | Rate limited, with Retry-After |
| 502 / 503 | Upstream integration failure / unavailable dependency |
| 500 | Unexpected failure; safe message and request ID only |

Every mutable resource has integer revision starting at 0. PATCH and transition requests include expectedRevision; an atomic comparison increments revision. Creation of immutable versions checks the parent revision. This is a standard metadata addition to Step 15, not permission to rewrite confirmed history.

Every state-changing patient request includes Idempotency-Key (UUID string). Save an operation record scoped by actor, patient, method and canonical route, with request hash and response. Same key/body returns the original outcome; changed body returns 409. Retain operation records for 30 days as the initial retry window. Domain unique keys for dose/stock/job/incident processing remain permanent; idempotency expiry never permits duplicate domain actions. Pending work returns the same job ID. A replay is authorized again before returning patient details.

## Authentication and authorization
Step 19 adds PATCH `/me` with `{displayName,expectedRevision}`, POST `/patients` with `{displayName,timezone}`, owner-only PATCH `/patients/{patientId}` with `{displayName,timezone,expectedRevision}`, owner-only GET `/patients/{patientId}/access-grants`, and PATCH `/patients/{patientId}/access-grants/{grantId}` with `{permissions,expectedRevision}`. Each write requires CSRF and a UUID Idempotency-Key, including profile/patient creation. Writes, audit and replay response commit together. A replay is checked against current authorization.

`/auth/me` includes the user's revision, caregiver permission catalog and accessible patient summaries with role (owner/caregiver), timezone, revision and effective permissions. It remains the bounded discovery route (up to 100 patients / 1,000 grants); the target paginated GET `/patients` below is not implemented yet. Grant listing is capped at 100 with an explicit GRANT_LIMIT error beyond that; pagination is future scale work.

**Step 19 invitation decision:** the owner enters an already-registered caregiver's shared user ID and explicitly selects permissions. POST `/access-grants` grants access immediately; no pending invitation or email delivery is claimed. This reuses the existing registered-user contract and avoids introducing an email provider/account discovery service for the local demonstration. PATCH a revoked grant to restore selected permissions using its latest revision; the existing unique patient/user identity is retained. This technical choice changes no assessed function or ownership. Non-empty named permission subsets are required. `access.manage` is owner-only and cannot be delegated. No platform-wide administrator exists; each patient owner administers that patient's access.

Use server-side sessions in an HttpOnly, Secure cookie in deployment; localhost HTTP development may omit Secure. SameSite=Lax, explicit origin allowlist, credentials enabled only for permitted origins. State-changing cookie-authenticated calls require a CSRF token and origin validation. Login rotates session; logout invalidates it. Never put secrets in URLs. Rate-limit login, search, upload, assistant and SOS routes. Workers authenticate as internal service actors, not user-provided role fields.

| Full route | Request | Success |
|---|---|---|
| GET /api/v1/auth/csrf | None | 200 {csrfToken} for same-origin session flow |
| POST /api/v1/auth/register | {email,password,displayName}; email normalized, valid email, password 12–128 characters | 201 {user:{id,displayName,email}}; establish session |
| POST /api/v1/auth/login | {email,password} | 200 public user; rotate session; generic credential error |
| POST /api/v1/auth/logout | CSRF token | 204; invalidate session |
| GET /api/v1/auth/me | Session | 200 public user and accessible patient IDs |
| POST /api/v1/patients | {displayName,timezone}; valid IANA zone | 201 Patient; server sets owner |
| GET /api/v1/patients | Session | 200 paginated accessible Patient summaries |
| GET /api/v1/patients/{patientId} | Active ownership/grant | 200 Patient and effective permissions |
| POST .../access-grants | Owner; {userId,permissions[]} | 201 Grant; audit |
| PATCH .../access-grants/{grantId} | Owner; {expectedRevision,permissions[]} | 200 Grant; revoke omitted permissions immediately |
| POST .../access-grants/{grantId}/revoke | Owner; {expectedRevision} | 200 revoked Grant; cancel unauthorized queued sends |

Permissions are Step 15's explicit permission strings. The owner has all; caregivers receive named subsets. Bind actor IDs and patient scope on the server. An emergency contact/channel link is never an access grant. Validate every referenced child ID within the same patient. No API trusts client-supplied owner, delivery or confirmation fields.

## Resource projections
Patient: {id,displayName,timezone,revision}. Grant: {id,userId,permissions,revokedAt?,revision}.
Prescription: {id,title?,status,currentVersionId?,revision}. PrescriptionVersion: {id,prescriptionId,versionNumber,status,previousVersionId?,instructions[],confirmedAt?,ocrStatus?}. Instruction: {id,lineNumber,medicineText,instructionsText,cabinetItemId?,strengthText?,doseQuantity?,doseUnit?,clarificationRequired}.
CabinetItem: {id,displayName,entryType,status,sourceRecordId?,strengthText?,form?,ingredients[],revision}. EvidenceRef: {sourceRecordId,sourceUrl,retrievedAt,passageKey,passageText}. Do not invent source identifiers for manual entries.
Schedule: {id,cabinetItemId,status,currentVersionId?,revision}. ScheduleVersion: {id,versionNumber,prescriptionInstructionId,timingMode,timezone,localTimes?,intervalMinutes?,anchorAtUTC?,effectiveFromUTC,endAtUTC?,doseQuantity,doseUnit}.
Dose: {id,scheduleVersionId,cabinetItemId,dueAtUTC,state,actionRevision,reminderDueAtUTC,snoozeCount,overdueUnconfirmed,stockSyncStatus}. The overdue flag is derived, not a terminal status.
Task: {id,title,description?,assigneeUserId,type,status,dueAtUTC?,revision}. Job: {id,status,subjectType,subjectId,errorCode?}. Notification attempt: {id,attemptNumber,status,attemptedAt,externalMessageId?}; channel acceptance is not human delivery or reading.
Incident: {id,status,activatedAt,locationStatus,location?,alerts[],providerRequests[],revision}. Alert exposes minimal authorized recipient display name, attempt status and acknowledgement; never another contact's secrets. ProviderRequest always includes providerMode, request status and separate dispatchStatus.

## A1 Prescription import, review and history
**Step 21 implementation decision (2 November 2026):** OCR runs in the browser with pinned Tesseract.js 7.0.0. Image bytes are not uploaded or retained. The `/assets`, asset-content and OCR-job routes below remain an earlier proposal, **not implemented endpoints**. Current prescription payloads use optional `source` metadata instead of `sourceAssetId`: `{fileName,mimeType,sizeBytes,sha256,ocrText,confidence?,ocrStatus}` (PNG/JPEG, 1–5 MiB, SHA-256 hex, original OCR text up to 30000 characters, finite confidence 0–100, succeeded/failed). This is untrusted provenance, not authenticity evidence. See [implemented scope, rationale and validation](STEP_21_PRESCRIPTION_REVIEW.md). Browser-local OCR is not an external API course integration.

Permission prescription.read for reads; prescription.write for drafts/replacement/archive; prescription.confirm independently for confirmation. Detail returns `{prescription,currentVersion,draftVersion}` with nested instructions. Draft PATCH and confirm use the version revision; replacement/archive use the parent revision. Draft edits also increment the parent revision. Confirmation stamps actor/time and preserves immutable instruction IDs. Replacement requires the current confirmed previousVersionId and no existing draft.
| Route | Request or query | Response and rule |
|---|---|---|
| Proposed only: POST /assets | multipart image; PNG/JPEG only, maximum 5 MiB; validate signature and decoded dimensions | Not implemented in Step 21 |
| Proposed only: GET /assets/{assetId}/content | Scoped session | Not implemented in Step 21 |
| POST /prescriptions | {title?,source?,instructions:[InstructionInput]} | 201 {prescription,draftVersion} |
| GET /prescriptions | status?,cursor?,limit? | 200 list Prescription |
| GET /prescriptions/{id} | None | 200 {prescription,currentVersion,draftVersion} |
| POST /prescriptions/{id}/versions | {expectedRevision,previousVersionId,instructions:[InstructionInput],source?} | 201 new draft; preserve prior versions |
| PATCH /prescriptions/{id}/versions/{versionId} | {expectedRevision,instructions:[InstructionInput],reviewCorrections?,source?} | 200 draft; 409 if confirmed |
| POST /prescriptions/{id}/versions/{versionId}/confirm | {expectedRevision,reviewed:true} | 200 confirmed immutable version; update current pointer atomically |
| GET /prescriptions/{id}/versions | cursor?,limit? | 200 version history |
| GET /prescriptions/{id}/comparison | fromVersionId,toVersionId | 200 {added,removed,changed}; both versions must belong to this prescription |
| POST /prescriptions/{id}/archive | {expectedRevision} | 200 archived Prescription |
| Proposed only: POST /assets/{assetId}/ocr | None | Not implemented in Step 21; recognition and progress run in the browser |

InstructionInput requires medicineText (1–200 chars), instructionsText (1–2000), lineNumber positive integer, and explicit clarificationRequired. Step 21 supports 1–30 lines and optional strengthText, frequencyText and durationText (each 1–200 chars when supplied). Confirmation requires positive decimal doseQuantity (string), supported doseUnit, nonempty frequencyText/durationText, clarificationRequired:false on every line, and reviewed:true. Supported confirmation units: tablet, capsule, mL, mg, g, drop, puff, unit, application. Missing/ambiguous details return 422; OCR cannot confirm or activate schedules. These are reviewed text fields, not clinical validation or schedule parsing.

## B1 Medicine search and cabinet
**Step 22 implemented update (2 November 2026):** use the [B1 implementation guide](STEP_22_MEDICINE_CABINET.md) for source/cache/migration details. External creation accepts an RxCUI (`externalId`) and `reviewed:true`, then resolves the canonical name on the server and creates its own sourceRecordId. Client sourceRecordId, displayName for external entries, and ingredient claims are rejected. Manual names support 1–500 characters; optional strength/form are user transcription, not parsed identities. Ingredients remain a B3 evidence workflow.

| Route | Permission | Request | Success |
|---|---|---|---|
| GET /medicine-search | cabinet.read | q (2–100 chars),cursor?,limit? (1–50) | 200 {candidates:[{externalId,displayName,termType,sourceUrl}],provider,retrievedAt}; meta total/nextCursor; no supported match is an empty list |
| GET /medicine-search/{externalId} | cabinet.read | Numeric RxCUI | 200 resolved active SCD/SBD candidate with retrieval/source fields |
| POST /cabinet-items | cabinet.write | Manual: {displayName,entryType:manual,strengthText?,form?}; external: {entryType:external,externalId,reviewed:true,strengthText?,form?} | 201 item + initial revision; external source is resolved and saved by the server |
| GET /cabinet-items | cabinet.read | q?,entryType?,status:active(default)/archived/all,cursor?,limit? | 200 list CabinetItem |
| GET /cabinet-items/{id} | cabinet.read | None | 200 CabinetItem plus stored source or null |
| PATCH /cabinet-items/{id} | cabinet.write | {expectedRevision,displayName?,strengthText?,form?,reason}; one editable field required | 200 item + append revision; external name fixed; empty strength/form clears it |
| POST /cabinet-items/{id}/archive | cabinet.write | {expectedRevision} | 200 archived item; history retained |
| GET /cabinet-items/{id}/revisions | cabinet.read | cursor?,limit? | 200 immutable snapshots |

The server revalidates external candidates instead of trusting arbitrary external IDs or URLs. Manual ingredient identities remain unverified until explicitly reviewed with evidence. Step 22 search failures return 503/RXNORM_UNAVAILABLE, not an empty successful search; unsupported/inactive selection returns 422. Supported search results are active SCD/SBD concepts, not packs. Search cursors bind query and offset over the cached sorted set; refresh search after cache expiry if upstream results change. Source snapshots remain readable without upstream access. Revision/CSRF/idempotency and patient authorization protect edit/archive; legacy items gain an honest baseline snapshot on first change.

## A2 Verified schedule builder
| Route | Permission | Request | Success |
|---|---|---|---|
| POST /schedule-previews | schedule.write | {prescriptionInstructionId,cabinetItemId,timingMode,timezone,doseQuantity,doseUnit,effectiveFromUTC,endAtUTC?,localTimes? OR intervalMinutes+anchorAtUTC} | 200 {previewToken,expiresAt,occurrences[],warnings[]}; saves no active schedule |
| POST /schedules | schedule.write | {previewToken,confirmed:true} | 201 Schedule + version; first seven-day horizon persisted |
| GET /schedules | schedule.read | status?,cursor?,limit? | 200 list Schedule with current version |
| GET /schedules/{id} | schedule.read | None | 200 Schedule + current version |
| POST /schedules/{id}/versions | schedule.write | {expectedRevision,previewToken,confirmed:true} | 201 new version; cancel only unacted future old occurrences |
| POST /schedules/{id}/pause | schedule.write | {expectedRevision,reason?} | 200 paused Schedule |
| POST /schedules/{id}/resume | schedule.write | {expectedRevision,effectiveFromUTC} | 200 active Schedule; future occurrences only |

Preview tokens expire after 15 minutes and bind actor, patient, normalized input and source version revision/hash. Reject confirmation if source changed or token expired. Both modes require a confirmed unambiguous instruction, positive quantity, compatible units and end >= start. Fixed times: unique localTimes, 1–24 entries. Interval: positive integer intervalMinutes with a UTC anchor; no localTimes. Reject unresolved ambiguous/nonexistent local times. Generated occurrence timestamps retain the selected timezone semantics.

## B2 Information cards and B3 ingredient evidence
| Route | Permission | Request | Success |
|---|---|---|---|
| GET /cabinet-items/{id}/label-candidates | cabinet.read | None | 200 list candidate label IDs and source metadata |
| PUT /cabinet-items/{id}/information-card | cabinet.write | {expectedRevision?,selectedLabelId}; expectedRevision required if card exists | 200/201 card with availability and EvidenceRef[] |
| GET /cabinet-items/{id}/information-card | cabinet.read | None | 200 card or {availability:unavailable,reason:no_matching_label} |
| PATCH /cabinet-items/{id}/information-card/note | cabinet.write | {expectedRevision,personalNote} | 200 card; note separate from evidence |
| POST /ingredient-reviews | cabinet.write | {cabinetItemIds:[2–20 IDs]} | 201 {id,result,ingredientSnapshots,evidenceRefs,revision} |
| GET /ingredient-reviews/{id} | cabinet.read | None | 200 review |
| POST /ingredient-reviews/{id}/acknowledge | cabinet.write | {expectedRevision,note?} | 200 acknowledged review |

Label selection must match item identity/strength/form adequately; unrelated matches return 422. Unavailable evidence is a valid explicit result; source outage remains 502/503. Ingredient results are overlap, no_overlap_in_confirmed_ingredients, or insufficient_information; missing identities/evidence never produce a safety guarantee.

## B4 Source-grounded information assistant
| Route | Permission | Request | Success |
|---|---|---|---|
| POST /assistant-conversations | cabinet.write | {cabinetItemId,title?} | 201 conversation |
| POST /assistant-conversations/{id}/messages | cabinet.write | {question} (1–2000 chars) | 202 {jobId,messageId,status:pending} |
| GET /assistant-conversations/{id}/messages | cabinet.read | cursor?,limit? | 200 messages with outcome, text and EvidenceRef[] |
| PATCH /assistant-messages/{id}/feedback | cabinet.write | {expectedRevision,rating:helpful/unhelpful,comment?} | 200 feedback |
| DELETE /assistant-conversations/{id} | cabinet.write | {expectedRevision} | 204; remove message text/evidence payloads; minimal deletion audit |

Worker produces outcome answered/insufficient_evidence/error. Answered requires cited retrieved passages; no source means abstention. API must not synthesize unsupported prescribing/treatment instructions. Unselected model/provider remains an implementation choice constrained by zero cost and grounding checks.

## C1 Care tasks and channel linking
| Route | Permission | Request | Success |
|---|---|---|---|
| POST /tasks | task.write | {title,description?,assigneeUserId,type,dueAtUTC?,handoverNote?} | 201 Task; notification queued separately |
| GET /tasks | task.read | status?,assigneeUserId?,cursor?,limit? | 200 list Task |
| GET /tasks/{id} | task.read | None | 200 Task |
| PATCH /tasks/{id} | task.write | {expectedRevision,title?,description?,assigneeUserId?,dueAtUTC?} | 200 Task; active grant required for assignee |
| POST /tasks/{id}/transitions | task.write | {expectedRevision,action:accept/complete/reopen} | 200 Task; only valid lifecycle transitions |
| POST /tasks/{id}/notes | task.write | {text} (1–2000 chars) | 201 task note |
| GET /tasks/{id}/history | task.read | cursor?,limit? | 200 append-only task events |
| POST /api/v1/me/channel-link-challenges | Own session | {provider:telegram} | 201 {challengeUrl,expiresAt}; single use, 10-minute expiry |
| DELETE /api/v1/me/channel-links/{linkId} | Own session | None | 204; revoke channel link and queued sends |

Owner may transition assigned tasks; a caregiver needs task.write and must be the assignee to accept/complete. Reopening needs the creator/owner and task.write. Private callback verifies linkage, consent and active grants. Telegram webhook authenticates with the configured webhook secret and deduplicates update IDs; it is not a public channel-link approval endpoint.

## C2 Doses and C3 follow-up
| Route | Permission | Request | Success |
|---|---|---|---|
| GET /doses | dose.read | fromUTC,toUTC,state?,cursor?,limit? | 200 list Dose; half-open range |
| GET /doses/{id} | dose.read | None | 200 Dose + allowed action history |
| POST /doses/{id}/actions | dose.record | {expectedRevision,action:taken/skipped,clientRequestId,effectiveAt?} | 200 Dose + actionId + stockSyncStatus |
| POST /doses/{id}/snoozes | dose.record | {expectedRevision,minutes:10,clientRequestId} | 200 Dose; reminderDueAt changes, dueAtUTC unchanged |
| POST /doses/{id}/corrections | dose.record | {expectedRevision,newState:pending/taken/skipped,reason,clientRequestId} | 200 Dose + corrective action + stockSyncStatus |
| GET /followups | dose.read | status?,cursor?,limit? | 200 list follow-up |
| POST /followups/{id}/acknowledge | dose.record | {expectedRevision} | 200 acknowledged follow-up |
| POST /followups/{id}/resolve | dose.record | {expectedRevision,outcome,note?} | 200 resolved follow-up; stop pending escalation |

expectedRevision maps to dose.actionRevision for dose routes. Repeated clientRequestId must match Idempotency-Key and returns the original result. Only pending can take a first terminal action; another terminal action returns 409 and requires correction. Reject future effectiveAt; record server recordedAt separately. Snooze requires pending occurrence and maximum 3 snoozes per occurrence in the initial version. Owner may resolve; caregiver additionally needs active assigned follow-up access, defined by its persisted recipient set. Follow-up creation is internal worker work, unique per occurrence; an unconfirmed event is never auto-skipped.

## A3 Inventory and A4 refill coordination
| Route | Permission | Request | Success |
|---|---|---|---|
| GET /cabinet-items/{id}/stock | stock.read | None | 200 {balance,unit,coverageDays?,coverageStatus,lowStock,stockSyncStatus} |
| GET /cabinet-items/{id}/stock-transactions | stock.read | cursor?,limit? | 200 ledger entries |
| POST /cabinet-items/{id}/stock-transactions | stock.write | {expectedRevision,delta,unit,reason:opening/refill/correction,note?} | 201 ledger entry + resulting balance; expectedRevision compares inventory lock |
| PUT /cabinet-items/{id}/inventory-settings | stock.write | {expectedRevision?,stockUnit,lowStockThreshold} | 200/201 settings; existing needs revision |
| POST /refill-lists | stock.write | {items:[{cabinetItemId,requestedQuantity?,unit}]} | 201 list |
| GET /refill-lists | stock.read | status?,cursor?,limit? | 200 lists |
| PATCH /refill-lists/{id}/items/{itemId} | stock.write | {expectedRevision,state:needed/collected,requestedQuantity?} | 200 item; collection alone does not add stock |
| POST /refill-lists/{id}/complete | stock.write | {expectedRevision} | 200 completed list |
| GET /pharmacies | stock.read | latitude,longitude,radiusMeters (100–5000) | 200 {listings,sourceUrl,retrievedAt}; listing availability is not stock evidence |
| POST /pharmacy-preferences | stock.write | {externalPlaceKey} | 201 saved verified listing snapshot |
| POST /refill-lists/{id}/collection-task | stock.write AND task.write | {assigneeUserId,pharmacyPreferenceId?,dueAtUTC?} | 201 Task + refill link; same key returns same task |

Opening/refill deltas must be positive; correction delta nonzero with reason. Balance must remain >= 0 in a transaction serialized by the item inventory lock/revision. Only internal dose processing writes dose_deduction/dose_reversal; reject user-supplied reasons of those types. Record dose even if stock cannot reconcile and show needs_review. Coordinates must be valid ranges; location input may come from an entered area/geocoded selection after geocoding is separately implemented. Do not send patient IDs or medical notes to map services.

## C4 Analytics and visit reports
Add report.write as an explicit permission for health-note writes; report.read alone never authorizes mutation. This extends Step 15's permission vocabulary.
| Route | Permission | Request | Success |
|---|---|---|---|
| GET /analytics | report.read | fromUTC,toUTC,timezone | 200 {taken,skipped,pending,overdueUnconfirmed,dataCutoffUTC,metricDefinitionVersion} |
| POST /health-notes | report.write | {text,recordedAt} | 201 note |
| PATCH /health-notes/{id} | report.write | {expectedRevision,text,reason} | 200 new note revision |
| POST /report-exports | report.read | {fromUTC,toUTC,displayTimezone} | 202 report export job |
| GET /report-exports/{id} | report.read | None | 200 {status,countsSnapshot?,generatedAt?,expiresAt?} |
| GET /report-exports/{id}/content | report.read | None | 200 private PDF when ready; 409 if pending; 410 if expired |

Initial maximum range is 366 days. Counts use occurrence due time in [from,to), excluding cancelled events; pending is not-yet-overdue pending, overdueUnconfirmed is past configured follow-up threshold pending. They are disjoint. Recheck access on download; PDF expires after 24 hours. Report permission authorizes the defined report projection only, not unrestricted record browsing.

## C5 Emergency SOS and assistance coordination
| Route | Permission | Request | Success |
|---|---|---|---|
| POST /emergency-contacts | Owner + sos.manage | {displayName,contactPhone?,channelLinkId?} | 201 contact with pending consent |
| GET /emergency-contacts | Owner + sos.manage | cursor?,limit? | 200 contacts |
| PATCH /emergency-contacts/{id} | Owner + sos.manage | {expectedRevision,displayName?,contactPhone?} | 200 contact; consent cannot be asserted by owner |
| POST /emergency-contacts/{id}/revoke | Owner + sos.manage | {expectedRevision} | 200 revoked contact; stop future sends |
| POST /sos-incidents | sos.activate | {confirmed:true,locationStatus:available/denied/unavailable,location?,callbackPhone?} | 201 Incident or 200 existing active incident; do not create duplicates |
| GET /sos-incidents/{id} | sos.activate OR sos.manage | None | 200 authorized incident projection |
| POST /sos-incidents/{id}/cancel | sos.manage OR originating activator with sos.activate | {expectedRevision,reason} | 200 cancelled Incident + closure jobs |
| POST /sos-incidents/{id}/resolve | sos.manage OR originating activator with sos.activate | {expectedRevision,outcome} | 200 resolved Incident + closure jobs |
| POST /sos-incidents/{id}/provider-requests | sos.manage | {providerKey,providerMode:simulated/verified_partner} | 202 ProviderRequest; verified mode requires configured partner |
| GET /hospitals | sos.activate OR sos.manage | latitude,longitude,radiusMeters | 200 source listings, never ambulance availability |

Consent/acknowledgement callbacks are separate recipient-scoped routes: POST /api/v1/recipient-actions accepts {token,action:consent/acknowledge/decline} with a one-time opaque token from the linked channel. Hash tokens at rest; token binds patient, recipient, operation and incident if relevant. Expire consent tokens after 24 hours and incident acknowledgement tokens after 30 minutes or incident closure, whichever occurs first. Callback checks current contact consent/revocation and incident state. Response contains minimal acknowledgement status and no chart data. Generic expired-token errors reveal no recipient details.

Location requires coordinates plus accuracyMeters >= 0 and capturedAt when available; otherwise omit location. SOS rate limiting must return explicit retry guidance, never silently drop an incident. Provider callbacks use service authentication and operation-bound signatures; verified partner acceptance and dispatch confirmation require separate events/evidence. Classroom simulation routes are available only in development/test to the owner, must not be mounted in production and cannot send real requests.

## Jobs, notification status and external adapters
GET /jobs/{id} requires the same permission as its originating feature and current patient scope. GET /notifications?subjectType=&subjectId= requires the originating feature's read permission (prescription.read, cabinet.read, dose.read, task.read, or incident access). Return job and attempt states, never raw channel secrets. No generic user route lets clients mark notification accepted, provider confirmed or job succeeded.

External services run server-side behind RxNorm, label, Overpass and Telegram adapters. Apply bounded timeouts and retry budgets; cache public source records with provenance. Client responses show unavailable/failed/unknown explicitly. Cache search results by public input, never include private notes. Only persist-and-commit work may be sent by the worker. Cross-document workflows require the Step 15 replica-set transaction strategy.

## Example — one confirmed dose action
POST /api/v1/patients/111111111111111111111111/doses/222222222222222222222222/actions
Headers: authenticated session, X-CSRF-Token, Idempotency-Key: 00000000-0000-4000-8000-000000000001
Request:
```json
{"expectedRevision":0,"action":"taken","clientRequestId":"00000000-0000-4000-8000-000000000001","effectiveAt":"2026-11-02T02:00:00Z"}
```
Response 200:
```json
{"data":{"id":"222222222222222222222222","state":"taken","actionRevision":1,"stockSyncStatus":"pending","actionId":"333333333333333333333333"},"meta":{"requestId":"example-request"}}
```
All example IDs and values are synthetic. Success records the dose, not an external delivery guarantee. Retry rechecks access and returns the same action; conflicting body or a stale expectedRevision under a new key returns 409.

## Step 17 handoff and checks
Suggested six database-connected APIs: A1 POST/GET prescriptions; B1 POST/GET cabinet-items; C1 POST/GET tasks. These are two endpoints per assigned module owner; the selection does not count external integrations as completed.

For every selected route, implement server validation, active grant checks, patient-safe references, response projection, error envelope and persistence. Demonstrate successful create/list after refresh, invalid fields, missing session, cross-patient IDs, revoked access and duplicate request handling. Use Postman to collect real evidence; none is claimed by this contract.

Additional integration checks: confirmed versions cannot be patched; stale schedule preview rejected; dose double-submit deducts stock once; correction cancels stale stock work; simultaneous stock updates cannot underflow; queued sends recheck revocation; wrong label never silently matched; SOS without location still creates incident; provider simulation never reports real dispatch. Final contract values (limits and delays) are initial project defaults and can be revised with a recorded version.

