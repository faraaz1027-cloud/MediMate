# Step 13 — MediMate design models

**Status:** proposed design, 1 November 2026. These models guide implementation; the Step 10 notes demo is not the production data model. Confirm exact faculty diagram notation and report format before submission. Requirements: [13 functions](REQUIREMENTS.md) and [acceptance checks](STEP_11_ACCEPTANCE.md).

## 1. Actors and use cases

Mermaid does not provide a native UML use-case shape, so the following is a readable actor-to-use-case map. When a formal UML diagram is required, reproduce the same actors and ovals in Figma or a UML editor. External services are supporting systems, not human actors.

| Actor | Main use cases | Access boundary |
|---|---|---|
| Patient / household organizer | Confirm prescription (A1), build schedule (A2), manage stock/refill (A3–A4), cabinet and evidence (B1–B4), tasks and dose record (C1–C2), reports (C4), SOS (C5) | Own patient record, or expressly authorized record |
| Authorized caregiver | Accept and complete assigned tasks (C1), respond to dose follow-up (C3), view permitted reports (C4), acknowledge SOS (C5) | Only records and actions permitted by active grant |
| Emergency contact | Receive and acknowledge SOS (C5) | Linked channel and minimal incident information; not general patient access |
| Participating provider | Receive and confirm an ambulance request (C5) | Only through a verified provider channel; classroom provider is simulated |
| External data/notification services | Medicine terminology, label evidence, pharmacy listings, Telegram delivery | Integration failures are shown; services cannot authorize access to patient records |

```mermaid
flowchart TB
  P["Patient / organizer"] --> RX["A1–A4: prescription, schedule, stock, pharmacy"]
  P --> MED["B1–B4: cabinet, evidence, assistant"]
  P --> CARE["C1–C5: caregiver, doses, follow-up, reports, SOS"]
  G["Authorized caregiver"] --> CARE
  E["Emergency contact"] --> SOS["C5: acknowledge SOS"]
  CARE --> SOS
  H["Participating provider or labelled simulation"] --> SOS
```

**Use-case relationships:** A2 requires confirmed A1 instructions; C2 requires confirmed A2 schedule; A3 uses C2 taken events; C3 monitors unanswered C2 events; A4 may create C1 tasks; C4 reads confirmed records and events; C5 is a direct user trigger, independent of C3.

## 2. System architecture

```mermaid
flowchart TB
  UI["React web client"] --> API["Express API: validation and access checks"]
  API --> DB["MongoDB: patient-scoped records and history"]
  API --> EXT["External adapters: RxNorm, openFDA, Overpass, Telegram"]
  API --> WORK["Reminder / escalation worker"]
  WORK --> DB
  WORK --> EXT
```

The browser sends authenticated requests to the API. The API verifies the actor and an active patient access grant on every protected operation. External adapters normalize responses, keep source IDs and retrieval times, and return an unavailable state when an integration fails. The worker queries persisted due events so a restart can resume processing; a process that is asleep or offline cannot guarantee timely delivery. C5's simulated provider is an explicitly labelled development adapter, never a real dispatcher. The current Step 10 notes API lacks authentication and must stay a localhost demo.

### Logical modules and boundaries

| Module | Responsible data/operations | Depends on |
|---|---|---|
| Identity/access | User, patient profile, access grants; revoke access | Shared foundation |
| Prescriptions | Draft, OCR review, confirmed immutable versions | Identity |
| Medicine knowledge | Cabinet items, external source references, evidence, assistant history | Identity; terminology/label adapters |
| Schedules/doses | Versioned schedules, occurrences, actions, notification attempts | Confirmed prescriptions; identity |
| Inventory/pharmacy | Ledger, refill checklist, listing snapshot and collection task | Dose action; caregiver tasks; Overpass |
| Caregiving/SOS | Tasks, handovers, follow-up, emergency incidents and acknowledgements | Grants; schedules/doses; Telegram; provider simulation |
| Reports | Date range queries and PDF output | Patient-scoped read models across modules |

## 3. Database relationship model

MongoDB documents can embed small immutable snapshots or use references. The diagrams show *logical* entities and cardinalities, not a commitment to one collection per box. Every patient record carries `patientId`; each actor action carries `actorUserId`; server authorization checks the active grant rather than trusting a client-supplied patient ID. Define IDs as MongoDB ObjectIds or UUIDs consistently during Step 15.

### Identity, prescriptions and cabinet

```mermaid
erDiagram
  USER ||--o{ ACCESS_GRANT : receives
  PATIENT ||--o{ ACCESS_GRANT : authorizes
  PATIENT ||--o{ PRESCRIPTION : owns
  PRESCRIPTION ||--o{ PRESCRIPTION_VERSION : retains
  PRESCRIPTION_VERSION ||--o{ INSTRUCTION : contains
  PATIENT ||--o{ CABINET_ITEM : owns
  CABINET_ITEM }o--o| SOURCE_RECORD : identifies
  USER {
    string id PK
    string email
  }
  PATIENT {
    string id PK
    string timezone
  }
  ACCESS_GRANT {
    string id PK
    string patientId FK
    string userId FK
    string role
    datetime revokedAt
  }
  PRESCRIPTION {
    string id PK
    string patientId FK
    string currentVersionId FK
  }
  PRESCRIPTION_VERSION {
    string id PK
    string prescriptionId FK
    string status
    datetime confirmedAt
  }
  INSTRUCTION {
    string id PK
    string versionId FK
    string medicineText
  }
  CABINET_ITEM {
    string id PK
    string patientId FK
    string sourceRecordId FK
    string status
  }
  SOURCE_RECORD {
    string id PK
    string provider
    string externalId
    datetime retrievedAt
  }
```

A confirmed version is retained even after a replacement. Draft OCR output cannot directly generate an active schedule. `SOURCE_RECORD` is optional: manual entries are visibly marked, and source passages must retain a URL/identifier and retrieval time.

### Schedule, doses and stock

```mermaid
erDiagram
  INSTRUCTION ||--o{ SCHEDULE_VERSION : defines
  SCHEDULE_VERSION ||--o{ DOSE_OCCURRENCE : generates
  DOSE_OCCURRENCE ||--o| DOSE_ACTION : records
  DOSE_OCCURRENCE ||--o{ NOTIFICATION_ATTEMPT : triggers
  CABINET_ITEM ||--o{ STOCK_TRANSACTION : tracks
  DOSE_ACTION ||--o| STOCK_TRANSACTION : deducts
  SCHEDULE_VERSION {
    string id PK
    string instructionId FK
    string patientId FK
    string timezone
    string status
  }
  DOSE_OCCURRENCE {
    string id PK
    string scheduleVersionId FK
    datetime dueAtUTC
  }
  DOSE_ACTION {
    string id PK
    string occurrenceId FK
    string status
    datetime recordedAt
  }
  NOTIFICATION_ATTEMPT {
    string id PK
    string occurrenceId FK
    string channel
    string deliveryStatus
  }
  CABINET_ITEM {
    string id PK
    string patientId FK
  }
  STOCK_TRANSACTION {
    string id PK
    string cabinetItemId FK
    string sourceActionId FK
    number delta
    string reason
  }
```

Store times in UTC plus the schedule's timezone. Enforce at most one effective dose action per occurrence and at most one stock deduction per taken action with unique database keys/atomic operations. Snooze changes a notification attempt/due reminder, never the prescription or scheduled dose. Correct a recorded action through an auditable correction flow rather than erasing history. Inventory balances derive from ledger entries.

### Caregiving, follow-up and SOS

```mermaid
erDiagram
  PATIENT ||--o{ CARE_TASK : owns
  USER ||--o{ CARE_TASK : assigned
  CARE_TASK ||--o{ HANDOVER_NOTE : records
  DOSE_OCCURRENCE ||--o| FOLLOWUP : escalates
  PATIENT ||--o{ EMERGENCY_CONTACT : lists
  PATIENT ||--o{ SOS_INCIDENT : raises
  SOS_INCIDENT ||--o{ SOS_ALERT : sends
  EMERGENCY_CONTACT ||--o{ SOS_ALERT : receives
  SOS_INCIDENT ||--o| PROVIDER_REQUEST : requests
  CARE_TASK {
    string id PK
    string patientId FK
    string assigneeUserId FK
    string status
  }
  HANDOVER_NOTE {
    string id PK
    string taskId FK
    string actorUserId FK
  }
  FOLLOWUP {
    string id PK
    string occurrenceId FK
    string status
  }
  EMERGENCY_CONTACT {
    string id PK
    string patientId FK
    string linkedChannelId
  }
  SOS_INCIDENT {
    string id PK
    string patientId FK
    string status
    datetime activatedAt
  }
  SOS_ALERT {
    string id PK
    string incidentId FK
    string contactId FK
    string deliveryStatus
    datetime acknowledgedAt
  }
  PROVIDER_REQUEST {
    string id PK
    string incidentId FK
    string providerMode
    string confirmationStatus
  }
```

An emergency contact's Telegram link does not itself grant access to the patient's chart. SOS location is optional and shared only with permitted recipients. An alert attempt, recipient acknowledgement, provider acceptance and ambulance dispatch are distinct states. No real provider request exists without a verified participant.

### Proposed indexes and consistency rules

- `ACCESS_GRANT(patientId,userId)` to check active permission.
- `PRESCRIPTION_VERSION(prescriptionId,versionNumber)` unique.
- `DOSE_OCCURRENCE(scheduleVersionId,dueAtUTC)` unique; `DOSE_ACTION(occurrenceId)` unique for effective action.
- `STOCK_TRANSACTION(sourceActionId,reason)` unique when reason is dose deduction.
- `FOLLOWUP(occurrenceId)` unique; `SOS_ALERT(incidentId,contactId)` unique per contact/attempt key.
- For stock and reminder processing, use atomic writes or a transaction and a retry-safe key. Verify the exact transaction strategy against the selected MongoDB deployment before coding.

## 4. Key activity flows

### A1: review and confirm prescription

```mermaid
flowchart TB
  START["Enter fields or upload image"] --> DRAFT["Create editable draft"]
  DRAFT --> REVIEW["Review medicine and dose fields"]
  REVIEW --> VALID{"Complete and unambiguous?"}
  VALID -- "No" --> REVIEW
  VALID -- "Yes" --> CONFIRM["Confirm immutable version"]
  CONFIRM --> SCHEDULE["Eligible for A2 schedule preview"]
```

If OCR fails, manual editing remains available. Replacing a confirmed prescription creates a new version and shows the differences; it never rewrites past dose events.

### C2/C3/A3: dose action and follow-up

```mermaid
flowchart TB
  DUE["Persisted dose becomes due"] --> ALERT["Attempt reminder; store delivery separately"]
  ALERT --> ACTION{"User action?"}
  ACTION -- "Taken" --> STOCK["Record action once; deduct stock once"]
  ACTION -- "Skipped" --> SKIP["Record skipped"]
  ACTION -- "Snoozed" --> SNOOZE["Move reminder; keep schedule"]
  ACTION -- "No response after delay" --> FOLLOW["Mark overdue-unconfirmed; notify authorized caregiver"]
  FOLLOW --> RESOLVE["Record acknowledgement and outcome; stop escalation"]
```

A reminder delivery does not imply a dose was taken. A dose with no response remains unconfirmed, not automatically skipped. After restart, the worker scans due persisted events and reuses idempotency keys so retries do not duplicate alerts or deductions.

### C5: emergency assistance

```mermaid
flowchart TB
  PRESS["Deliberate SOS activation"] --> INCIDENT["Save incident and permitted location"]
  INCIDENT --> CONTACTS["Notify linked contacts; track attempts"]
  CONTACTS --> ACK["Record individual acknowledgements"]
  INCIDENT --> PROVIDER{"Verified provider channel?"}
  PROVIDER -- "No" --> SIM["Labelled provider simulation and call options"]
  PROVIDER -- "Yes" --> REQUEST["Send request; wait for explicit confirmation"]
  ACK --> CLOSE["Cancel or resolve with history and notices"]
  SIM --> CLOSE
  REQUEST --> CLOSE
```

## 5. Design review before implementation

1. Confirm whether faculty requires formal UML use-case notation and a particular ERD convention.
2. Agree naming, owner/patient identity, role permissions and record lifecycle at Step 15.
3. Decide how an authenticated household organizer differs from a patient and who can confirm prescription instructions.
4. Choose the schedule event generation horizon, timezone changes and restart policy.
5. Choose whether C5's simulated provider dashboard is accessible only to test accounts and how to label it.
6. Review source coverage for Bangladeshi medicine brands and specify an honest manual-entry flow.
