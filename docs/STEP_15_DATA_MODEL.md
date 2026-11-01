# Step 15 — Shared data model
Date: 1 November 2026. Status: implementation baseline defined for all 13 functions; database schemas are not implemented by this document. Read with [acceptance criteria](STEP_11_ACCEPTANCE.md) and [logical diagrams](STEP_13_DESIGN_MODELS.md). This specification resolves Step 13's naming and lifecycle choices; [Step 16](STEP_16_API_CONTRACTS.md) defines the API contracts. Step 14's detailed Figma and Word submission is complete. The implemented Step 17 subset is documented separately.

## Conventions
- Use MongoDB ObjectId for internal IDs and references; serialize as 24-character hexadecimal strings in JSON. External identifiers (RxCUI, label IDs, OSM IDs, Telegram IDs) are strings, never internal primary keys.
- Documents have _id, createdAt, updatedAt and schemaVersion: 1. Mutable resources also have integer revision starting at 0; mutations compare and increment it. Actor mutations record actorUserId. Patient-owned documents require patientId. References must resolve to the same patient on the server.
- UTC BSON Date for instants; ISO 8601 UTC in APIs. Store IANA timezone separately (default Asia/Dhaka, editable). Local calendar dates use YYYY-MM-DD strings and wall times HH:mm.
- Required values cannot be empty; optional missing values are omitted. Unknown clinical values are not stored as zero. Quantities use Decimal128 with an explicit unit; API quantities are decimal strings. No implicit conversion between mg, mL and tablets.
- Small bounded immutable snapshots embed; independent histories and growing lists use referenced collections. Paginate histories. Never embed unlimited notification/action arrays.
- Server assigns owner, actor, timestamps and effective states. Client-supplied identifiers never establish permission.
- All collections below are proposed production collections. Existing Step 10 notes remain separate demonstration data.

## Identity and permissions
| Collection | Fields and meaning | Constraints |
|---|---|---|
| users | emailNormalized, displayName, passwordHash, status: active/disabled | Unique emailNormalized; hashes never returned; credentials and channel secrets never logged |
| patients | ownerUserId, subjectUserId?, displayName, timezone, status: active/archived | Owner is the organizer responsible for this record; optional subjectUserId links the person receiving care |
| accessGrants | patientId, userId, permissions[], grantedByUserId, grantedAt, revokedAt? | Unique patientId+userId; update grant on reauthorization and append audit event |
| channelLinks | userId, provider: telegram, externalChatId, verifiedAt, revokedAt? | Link via expiring single-use challenge; store challenge hash and expiry, not plaintext; bot token stays in environment |
| auditEvents | patientId?, actorUserId?, actorType: user/worker/provider, entityType, entityId, action, requestId, occurredAt, safeChangeSummary | Append only; no passwords, tokens, full source images or message bodies |

Permissions: prescription.read/write/confirm, cabinet.read/write, schedule.read/write, dose.read/record, stock.read/write, task.read/write, report.read/write, sos.activate/manage, access.manage. Owner receives these permissions; caregivers receive explicit subsets. Only owner manages grants and emergency contacts in the initial version. Prescription confirmation is a user review acknowledgement, not clinician verification. A linked patient account requires a grant unless it is the owner. Patient profiles without accounts are allowed for organizer-managed demonstration records. Ownership transfer is out of scope initially. Revocation blocks new reads, writes, exports and queued sends immediately on the next authorization check. Emergency-contact linking grants no chart access.

## Prescriptions and cabinet: A1, B1
| Collection | Required core fields | Optional or embedded fields |
|---|---|---|
| prescriptions | patientId, status: active/archived | currentVersionId, title |
| prescriptionVersions | patientId, prescriptionId, versionNumber, status: draft/confirmed | previousVersionId, sourceAssetId, ocrStatus: pending/succeeded/failed, ocrText, confirmedAt, confirmedByUserId, reviewCorrections |
| prescriptionInstructions | patientId, prescriptionVersionId, lineNumber, medicineText, instructionsText | cabinetItemId, strengthText, doseQuantity, doseUnit, route, frequencyText, durationText, clarificationRequired |
| cabinetItems | patientId, displayName, entryType: external/manual, status: active/archived | sourceRecordId, strengthText, form, ingredient identities with external IDs and confirmation/evidence, historyRevision |
| cabinetRevisions | patientId, cabinetItemId, revisionNumber, actorUserId, snapshot, reason | sourceRecordId |
| assets | patientId, storageKey, mimeType, sizeBytes, uploadedByUserId | checksum, deletedAt |

Prescription version numbers are unique per prescription. Instructions are separate documents with stable ObjectIds. Confirmation freezes the version and its instructions; edits create another version. Confirm only when required medicine/dose fields are reviewed and ambiguities resolved. OCR never confirms itself. Keep previous confirmed versions and old schedule references. Archive cabinet items instead of deleting referenced items. Uploaded images use private storage references, never public file paths. Asset deletion does not erase confirmed text history.

## Evidence and assistant: B2–B4
| Collection | Core fields |
|---|---|
| sourceRecords | provider: rxnorm/openfda/overpass, externalId, sourceUrl, retrievedAt, contentHash, snapshot, matchStatus: selected/unverified; optional sourceVersion |
| medicineCards | patientId, cabinetItemId, sourceRecordId?, availability: available/unavailable, selectedPassages[], personalNote?, revisedAt |
| ingredientReviews | patientId, cabinetItemIds[], ingredientSnapshots[], evidenceRefs[], result: overlap/no_overlap_in_confirmed_ingredients/insufficient_information, acknowledgedAt?, acknowledgedByUserId?, note? |
| assistantConversations | patientId, createdByUserId, title?, deletedAt? |
| assistantMessages | patientId, conversationId, role: user/assistant, text, evidenceRefs[], outcome: answered/insufficient_evidence/error, feedback? |

Evidence references contain sourceRecordId and a passage key plus immutable passage text snapshot. Snapshots preserve the evidence used even after a later retrieval. Source records contain public external information only; personal notes belong to patient-scoped cards. No-overlap is limited to compared confirmed ingredient identities and never claims overall safety. Manual items remain unverified until explicit ingredient confirmation. Conversation deletion removes message text and evidence payloads; retain only a minimal deletion audit event. No model training dataset is required by this design.

## Schedules, occurrences and dose actions: A2, C2, C3
| Collection | Core fields |
|---|---|
| schedules | patientId, cabinetItemId, currentVersionId?, status: draft/active/paused/ended |
| scheduleVersions | patientId, scheduleId, versionNumber, prescriptionInstructionId, confirmedByUserId, confirmedAt, effectiveFromUTC, endAtUTC?, timezone, timingMode: fixed_times/interval, localTimes[] or intervalMinutes+anchorAtUTC, doseQuantity, doseUnit |
| doseOccurrences | patientId, scheduleId, scheduleVersionId, cabinetItemId, dueAtUTC, doseQuantitySnapshot, doseUnitSnapshot, state: pending/taken/skipped/cancelled, reminderDueAtUTC, snoozeCount, actionRevision |
| doseActions | patientId, occurrenceId, revisionNumber, action: taken/skipped/corrected_to_pending/snoozed, actorUserId, recordedAt, effectiveAt?, reason?, clientRequestId |
| followups | patientId, occurrenceId, status: open/acknowledged/resolved/cancelled, overdueAtUTC, nextAttemptAtUTC?, acknowledgedByUserId?, acknowledgedAt?, outcome?, resolvedAt? |

A pending occurrence past due plus the configured follow-up delay is displayed as overdue-unconfirmed, never automatically skipped. Occurrence state is the current projection; doseActions is immutable history. Snooze only changes reminderDueAtUTC and count; it is not a terminal dose status. First terminal action uses an atomic compare-and-set on pending state and actionRevision. Repeated clientRequestId returns the original result; another terminal action returns conflict. Corrections require expected revision and reason.

Generate a rolling seven-day horizon, extended daily by the worker, bounded by the schedule end. Fixed times follow the saved timezone; intervals follow elapsed minutes from anchor UTC. Reject nonexistent/ambiguous local times unless the user explicitly resolves them. Version edits/timezone changes cancel unacted future occurrences from the old version at the effective boundary and generate replacements. Past and acted occurrences remain unchanged. Pause cancels unacted future occurrences; resume generates only future occurrences without retroactive reminders. Restart scans persisted work; expired reminder jobs are marked expired with a visible reason rather than silently sent late. Default reminder expiry is 60 minutes after due time; overdue follow-up remains a separate job with configurable patient delay.

## Stock, refill and pharmacy: A3–A4
| Collection | Core fields |
|---|---|
| stockTransactions | patientId, cabinetItemId, delta, unit, reason: opening/refill/correction/dose_deduction/dose_reversal, operationKey, actorUserId?, sourceDoseActionId?, reversesTransactionId?, note? |
| inventorySettings | patientId, cabinetItemId, stockUnit, lowStockThreshold |
| refillLists | patientId, status: open/completed/archived, createdByUserId |
| refillListItems | patientId, refillListId, cabinetItemId, requestedQuantity?, unit, state: needed/collected, collectedAt? |
| pharmacyPreferences | patientId, externalPlaceKey, listingSnapshot, retrievedAt, sourceUrl, preferred |
| refillTaskLinks | patientId, refillListId, taskId, pharmacyPreferenceId? |

Balance is sum of immutable ledger deltas; do not maintain an independent editable balance. One stock unit per cabinet item; changing unit requires a reviewed conversion/migration. Reject negative resulting balances atomically; record dose as taken even if stock deduction cannot proceed, with stock-sync pending/error visible for reconciliation. Unknown conversion means estimate unavailable. Refill list collection and stock addition are separate explicit operations, so task completion alone never invents a refill. Coverage uses future confirmed dose quantities with compatible units and states assumptions.

## Tasks, notifications and follow-up delivery: C1–C3
| Collection | Core fields |
|---|---|
| careTasks | patientId, createdByUserId, assigneeUserId, title, description?, type: general/refill, status: open/accepted/completed, revision, dueAtUTC? |
| taskEvents | patientId, taskId, actorUserId, eventType: created/assigned/accepted/completed/reopened/note, text?, occurredAt |
| notificationJobs | patientId, subjectType: task/dose/followup/sos, subjectId, recipientType: user/emergency_contact/provider, recipientId, channel, purpose, generation, dedupeKey, runAtUTC, expiresAtUTC?, status: pending/processing/succeeded/failed/cancelled/expired, leaseUntil?, attemptCount |
| notificationAttempts | patientId, jobId, attemptNumber, attemptedAt, status: attempted/accepted_by_channel/failed/unknown, externalMessageId?, errorCode? |
| acknowledgements | patientId, subjectType, subjectId, recipientType, recipientId, acknowledgedAt, mechanism |

Task transitions: open → accepted → completed; completed → open records reopening. Assignees require an active matching grant. Recheck grants/contact consent immediately before each send. Worker claims a job atomically with a lease; expired leases are recoverable. External channel acceptance is not proof a person read the message. Acknowledgement is recorded only through an authenticated action or expiring recipient-bound callback; check current grant/contact consent again. Retry creates a new attempt on the same logical job. External timeout can leave an unknown outcome; do not promise exactly-once external delivery.

## Emergency SOS: C5
| Collection | Core fields |
|---|---|
| emergencyContacts | patientId, displayName, contactPhone?, consentStatus: pending/active/revoked, consentedAt?, channelLinkId?, revokedAt? |
| sosIncidents | patientId, activatedByUserId, activatedAt, status: active/cancelled/resolved, locationStatus: available/denied/unavailable, location?: latitude+longitude+accuracyMeters+capturedAt, callbackSnapshot, closedAt?, closeReason? |
| sosAlerts | patientId, incidentId, emergencyContactId, recipientSnapshot, acknowledgedAt?, acknowledgedIdentity? |
| providerRequests | patientId, incidentId, providerMode: simulated/verified_partner, providerKey, channelVerificationRef?, status: pending/accepted/rejected/cancelled, requestedAt, confirmedAt?, confirmedBy?, dispatchStatus: unconfirmed/confirmed, dispatchEvidenceRef? |
| providerEvents | patientId, providerRequestId, type, actorType, occurredAt, evidenceRef?, detail? |

One active incident per patient; repeated activation returns that incident. Location denial does not block activation; validate latitude/longitude ranges when present. Notify only active consenting linked contacts. Retain minimal recipient snapshots for incident history; revoked contacts receive no later details. Cancelling/resolving stops unsent jobs and queues closure notices only for still-consenting recipients previously alerted. Provider acceptance and dispatch confirmation remain separate, and dispatch requires explicit provider evidence. Simulated requests always retain providerMode and a visible simulation label. No real provider adapter is enabled without a verified partner. Hospital listings are source snapshots and never dispatch or stock evidence.

## Reports: C4
healthNotes: patientId, authorUserId, recordedAt, text, revision. reportExports: patientId, requestedByUserId, fromUTC, toUTC, displayTimezone, generatedAt, dataCutoffUTC, metricDefinitionVersion, countsSnapshot, status: generating/ready/failed, privateAssetId?, expiresAt?. Read/export requires report.read; creating or changing health notes requires report.write. Counts use occurrence dueAtUTC in a half-open [fromUTC,toUTC) interval and effective action state at cutoff; exclude cancelled occurrences. Show taken, skipped, pending and overdue-unconfirmed separately without double counting. Export snapshots retain the figures actually shown. Health notes and PDF assets remain private.

## Index contract
| Collection | Unique or query index |
|---|---|
| users | unique emailNormalized |
| accessGrants | unique patientId+userId; userId+revokedAt |
| prescriptionVersions | unique prescriptionId+versionNumber |
| prescriptionInstructions | unique prescriptionVersionId+lineNumber |
| cabinetRevisions | unique cabinetItemId+revisionNumber |
| scheduleVersions | unique scheduleId+versionNumber |
| doseOccurrences | unique scheduleVersionId+dueAtUTC; patientId+dueAtUTC; state+reminderDueAtUTC |
| doseActions | unique occurrenceId+revisionNumber; unique patientId+clientRequestId |
| stockTransactions | unique patientId+operationKey; patientId+cabinetItemId+createdAt |
| inventorySettings | unique patientId+cabinetItemId |
| followups | unique occurrenceId; status+nextAttemptAtUTC |
| notificationJobs | unique dedupeKey; status+runAtUTC; status+leaseUntil |
| notificationAttempts | unique jobId+attemptNumber |
| acknowledgements | unique subjectType+subjectId+recipientType+recipientId |
| sosIncidents | partial unique patientId where status=active |
| sosAlerts | unique incidentId+emergencyContactId |
| providerRequests | unique incidentId+providerKey |
| sourceRecords | unique provider+externalId+contentHash |
| careTasks / taskEvents | patientId+assigneeUserId+status / taskId+occurredAt |

Add patientId+createdAt to patient history collections when needed. Partial indexes apply only to the stated subset; optional unique fields must not accidentally make all missing values collide. Index creation and cross-reference validation belong in schema implementation, not only documentation.

## Atomicity and corrections
The production design requires a MongoDB replica set with transactions for cross-document mutations. The existing standalone local demo can remain for Step 10; configure a local single-node replica set before testing production workflows. Never silently run a transaction-dependent workflow on standalone MongoDB.

Within a transaction: validate active access and expected revision; write action/history; update the occurrence projection; append a stock ledger entry when conversion/balance permits, otherwise save a reconciliation work item; enqueue notification jobs/audit event; commit. Workers send externally only after commit. Save stock reconciliation in stockSyncJobs(patientId, sourceDoseActionId, status: pending/applied/needs_review, errorCode?, operationKey), unique sourceDoseActionId. Retrying uses the same ledger operationKey, preventing double deduction. A correction reverses an applied deduction once with a unique reversal operationKey, then applies the corrected state and any replacement deduction in one transaction. Reconcile jobs check the current effective action revision so stale work cannot deduct after correction. Competing stock updates serialize against an inventory lock/revision document per patient+cabinet item within the transaction; retry write conflicts and recheck balance.

## Lifecycle and implementation handoff
- Archive referenced prescriptions, cabinet items and patient profiles. Preserve confirmed versions, actions and stock ledger; use correction records.
- Delete temporary OCR/upload drafts explicitly when discarded. Account deletion requires a separate deliberate cleanup policy for personal assets and records; do not cascade-delete shared history automatically.
- Store bot tokens only in server environment; secret-free source snapshots may be cached. Synthetic seed data must never send live notifications.
- Implement identity/access first, then A1/B1/C1 models; add schedules/doses, stock/evidence, SOS and reports in dependency order.
- Step 16 must specify each request/response, permission, idempotency key and conflict/error shape using these names.
- Before feature completion verify cross-patient references are rejected, revoked access fails, confirmed history survives replacement, duplicate dose requests deduplicate, concurrent stock cannot underflow, corrections reconcile, worker restart recovers, and simulated SOS remains labelled.

## Step 15 completion
Identifiers, patient ownership, permissions, all 13 feature data dictionaries, lifecycles, timestamps, index constraints and consistency strategy are defined. This is the documented team baseline, subject to implementation feedback; it does not claim team/faculty sign-off or working schemas.


## Step 21 implementation update — 2 November 2026
A1 adds optional PrescriptionVersion.previousVersionId, confirmedAt, confirmedByUserId, reviewCorrections and source metadata, plus PrescriptionInstruction.frequencyText/durationText. Confirmation preserves version/instruction identities; replacement creates new records and changes only the parent's current pointer. No destructive migration or rewrite of confirmed history is performed. Existing drafts need complete reviewed timing/duration before confirmation. Browser-local OCR replaces the planned server asset/job storage for this slice: no image bytes are retained and source metadata is untrusted. See [Step 21 contract and rationale](STEP_21_PRESCRIPTION_REVIEW.md) and the amended A1 section of Step 16. Other asset/domain models remain planned, not implemented by A1.

## Step 22 implementation update — 2 November 2026
B1 adds CabinetItem.sourceRecordId and implements public SourceRecord snapshots plus immutable patient-scoped CabinetRevision records (unique cabinetItemId+revisionNumber). Creates start at revision 0; edits/archive append snapshots transactionally. Existing items gain a baseline on their first change with unknown prior actor, without fabricating earlier revisions. External RxCUIs are resolved by the server; client sourceRecordId/ingredient claims are rejected. Display names allow 500 characters for canonical compound names. Strength/form remain user transcription, and ingredients/cards are later steps. No destructive migration or deletion occurs; archived IDs/source/history remain readable. See [Step 22 contracts, rationale and evidence](STEP_22_MEDICINE_CABINET.md).

## Step 23 implementation update — 2 November 2026
C1 adds Task assignment generation and acknowledgement projection, plus immutable TaskEvent snapshots/transition/time metadata. New ChannelLink/ChannelChallenge (hashed code, expiry), TelegramReceipt, WorkerState, task-specific NotificationJob/NotificationAttempt and Acknowledgement collections implement consent, durable outbox, delivery attempts and app acknowledgement separately. Domain unique indexes prevent duplicate job/attempt/ack/update records. Existing tasks/events are retained without invented snapshots/jobs/acknowledgements. No destructive backfill is required. Later C2/C3/C5 work must extend the task-specific job subject contract and obtain relevant contact/location consent; C1 generic notices do not grant that consent. A separate long-polling process replaces the earlier webhook proposal for this local slice. Real Telegram delivery remains unverified because no test bot/recipient was available. See [Step 23 implementation, API details and remaining gate](STEP_23_CAREGIVER_TASKS.md).
