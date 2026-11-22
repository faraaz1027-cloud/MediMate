# Step 36 — C5 SOS implementation and Module 3 demonstration package

Local C5 implementation, 21 November 2026. Owner: Sahir. C5 remains the additional
fifth Sahir function described in the roadmap; it does not replace C3/C4 or imply
faculty acceptance of extra assessed scope. Each member must understand, rehearse
and be able to modify their own code. Automated evidence is not an individual
student demonstration or a real emergency-service result.

## SOS workflow

Use synthetic people and a single server/database for both accounts. For the
updated handoff this can be Sahir's server at port 1212. Open independent browser
profiles/private windows for owner and recipient; using different local ports
does not share user records and does not isolate cookies by port.

1. Recipient registers/signs in and opens the global **Emergency inbox**. Share
   only their displayed account ID with the owner. No patient-chart grant is needed.
2. Owner opens **SOS coordination**, enters the contact's display name, account ID
   and optional phone, then invites them. Status is pending. Owner cannot assert
   consent. Invitations expire after 24 hours.
3. Recipient opens their own inbox and explicitly accepts or declines. They can
   later revoke. Acceptance permits this patient's incident status, optional
   location and callback number to be shown in that account; it grants no chart
   access. Recipient names/phones are not taken from private profile data.
4. Telegram linking is separate: the recipient can generate a private bot challenge
   in the inbox, press Start in their own chat, refresh and explicitly confirm.
   Existing C1 polling handles proof of chat ownership. Without configured Telegram
   the control is disabled and consent/inbox still work. No live delivery is claimed.
5. Owner/authorized activator optionally requests device location, enters a callback
   number, reviews the activation dialog and explicitly confirms. Denied/unavailable
   location is saved without fabricated coordinates. Dismissing review creates no
   incident. Device acquisition does not automatically query a map provider.
6. One active incident per patient is enforced transactionally. Repeated presses
   return its ID without additional alerts. The detail shows durable notice states,
   attempts, independent recipient acknowledgements and provider requests.
7. Recipient signs in to their inbox, reviews the minimal incident and acknowledges.
   Acknowledgement expires 30 minutes after activation or upon closure. It never
   claims that help arrived or that an ambulance was dispatched.
8. SOS manager or originating activator reviews and confirms cancellation/resolution
   with a reason/reported outcome. Pending alerts are suppressed; closure jobs are
   created for the same still-consenting recipients. Status/history persist.

Phone links are explicit user actions using entered/listed phone numbers. This
application does not call anyone automatically or select a jurisdiction's emergency
number. Use local emergency services directly when needed; the classroom app is
not an emergency response service.

## Recipient authentication refinement

The proposed anonymous one-time consent/acknowledgement callback is replaced by
recipient-account authentication, CSRF, revision checks and UUID idempotency. This
avoids creating or distributing sensitive callback tokens while Telegram setup is
deferred. It preserves recipient-only control and operation-bound state checks.
No owner route can impersonate acceptance or acknowledgement. Account registration
is now a prerequisite for an emergency contact; this technical choice is explicit
and documented in STEP_16_API_CONTRACTS.md.

A consent generation binds each job to the exact active invitation/consent cycle.
Revocation followed by a new invitation cannot revive access to an old incident or
send an old queued alert. Acknowledgement fences contact and incident writes
against concurrent revocation/closure. No patient-chart grant is created.

## Notifications and persistence

New SOS collections are separate from C1/C2: emergencyContacts, sosIncidents,
sosJobs, sosAttempts, sosAcknowledgements, sosEvents and sosProviderRequests.
Activation atomically persists incident, recipients/jobs and event under a patient
write fence and partial unique active-incident index. A failed job insertion rolls
back the entire activation. Successful replay returns the committed incident ID.

The SOS worker claims a durable lease and records an attempt before the send path.
It checks current patient, recipient consent/generation, channel consent/revision,
incident state, acknowledgement and expiry immediately before calling Telegram.
Messages contain no patient name, medicine, location or callback number. Sent means
Telegram accepted a message; it is separate from reading or acknowledgement.

Definite failures can be explicitly retried by a manager, up to three attempts.
Sent, unknown, expired and otherwise ineligible notices cannot be blindly resent.
An expired processing lease becomes unknown/WORKER_INTERRUPTED after restart.
Restarting without configuration converts pending notices to disabled without an
attempt; existing unknown outcomes remain unknown. Restoring configuration does
not automatically retry disabled work. An accepted/in-flight external request
cannot be recalled by a later closure/revocation. New eligibility checks prevent
future sends, and the record preserves uncertainty.

Alert jobs/recipient acknowledgement have a 30-minute window; closure jobs have a
24-hour window. There is at most one alert and one closure kind per incident/contact.
At most 20 active/pending contacts are supported. Contact/invitation history over
100 is rejected explicitly; incidents/inbox paginate at 20. Five new activations
per patient in ten minutes is the limit; an existing active incident is returned
before applying it. A rejected activation returns 429 with Retry-After and an
explicit retry interval, never a silently dropped success.

## Local worker commands

Start MongoDB/Express with the current handoff helper. In another PowerShell:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$env:MONGODB_URI = 'mongodb://127.0.0.1:27028/assignment03_device_1212?replicaSet=assignment03'
$env:TELEGRAM_BOT_TOKEN = ''
$env:TELEGRAM_BOT_USERNAME = ''
npm run sos-worker --workspace server -- --once
```

Choose the same database suffix as the server being demonstrated. Omit `-- --once`
for continuous processing; Ctrl+C stops it. Keep C1's existing worker for Telegram
chat-link polling when live linking is deliberately configured later. The empty
values above preserve the user's deferred live setup; no secret/token is committed.

## Hospital listings and provider simulation

Hospital search runs only after an explicit form submission. It sends a rounded
public area center/radius to the configured Overpass host, selecting the fixed
amenity=hospital type. The shared bounded adapter retains timeout, response size,
cache, cooldown and request-budget rules. Results show source/retrieval metadata,
OSM attribution, approximate distance and listed phone when usable. A limited
result is labelled. A successful empty list and a source outage remain distinct.

[OSM hospital tag](https://wiki.openstreetmap.org/wiki/Tag:amenity%3Dhospital)
describes mapped facilities, not live admission/ambulance capacity. This app
exposes no capacity, provider verification or ambulance availability claim.
The live attempt at a public Dhaka-area center returned unavailable; no successful
live hospital listing is claimed. Evidence: docs/evidence/step36-hospitals-live.json.
Controlled adapter/UI fixtures verify functionality and are labelled synthetic.

The only provider-request option is an owner-only classroom simulation in
development/test. It persists simulated_request_only and sends no external request.
The simulation route is not mounted in production. Verified partner mode is
unconfigured and rejected; no provider callback, acceptance or dispatch claim is
implemented. The UI always distinguishes simulation and displays no dispatch
confirmation. A genuine provider integration needs a separately verified partner,
service authentication and distinct acceptance/dispatch evidence before adding
those states.

## Validation

`node verification/step18/api.mjs server/test/sos.test.js server/test/hospitals.test.js server/test/telegram.test.js`
uses real local MongoDB/Express with controlled external adapters. It verifies
recipient-only consent, no chart access, invitation/acknowledgement expiry,
concurrent/replayed activation, denied/available/stale location, independent
acknowledgement, simulation, production exclusion, hospital outage, revoked/new
consent isolation, failed/unknown outcomes, actual worker process restart,
cancellation, rollback, disabled configuration and explicit rate guidance.

`npm run build` builds the app. The compiled-React JSDOM scenario uses independent
owner/recipient cookie jars: invite/accept, disabled linking, dismiss activation
review, denied location, one saved disabled alert, simulated provider request,
hospital fixture search, recipient acknowledgement after remount and closure
notice persistence. Evidence is written to step36-dom.json only after success.
JSDOM does not establish native location permissions, phone dialing, browser
layout/accessibility or human contribution. No real Telegram send was performed.

## Seven-feature Module 3 rehearsal

| Feature | Owner | Demonstration and required evidence |
|---|---|---|
| A3 | Sadat | Dose action to explicit stock deduction, low-stock checklist and actual refill; reconcile exact balances. |
| A4 | Sadat | Area search/denied-location fallback, saved pharmacy, checklist-linked caregiver task. Successful live listing remains a separate open check. |
| B3 | Faraaz | Confirm ingredients, compare aliases/combination, show overlap and insufficient data with cited evidence/acknowledgement. |
| B4 | Faraaz | Supported sourced question with exact passage, invented/personal question abstention, feedback and deletion. |
| C3 | Sahir | Configured delay to one overdue-unconfirmed task, independent acknowledgement/outcome, worker restart and revoked access. |
| C4 | Sahir | Known dataset/date range to counts, revised visit note and private PDF; verify numbers/source history and revoked download. |
| C5 | Sahir | Separate recipient consent, deliberate SOS/denied location, notice attempt state, recipient acknowledgement, cancel/closure, call/map option and clearly simulated provider request. |

Use the compiled-bundle/API evidence as technical rehearsal, then each student
captures their own genuine screenshots and demonstrates a frontend/backend edit.
Steps 30–36 guides contain exact workflows. The full course gate remains open for
student rehearsal, native-browser evidence, live integrations where required and
faculty assessment. This local implementation does not finish those by assertion.
Next technical roadmap step: Step 37 — complete end-to-end synthetic scenario.

Final local validation: full backend regression 174/174 passed, including C5, hospital adapter, Telegram and prior feature checks. Production-bundle owner/recipient UI rehearsal and Vite build passed. Evidence: docs/evidence/step36-regression.txt, step36-sos-api.txt and step36-dom.json. The latest live hospital attempt timed out after 10012 ms before an HTTP response was received; this remains a source-availability gap, not a successful live listing. No live Telegram or provider request was made.

Step 38 audit tightened current manager/originator checks for closure receipt replay and aligned server phone validation with dial controls. The existing workflow and consent ownership remain unchanged; see STEP_38_FAILURE_PERMISSION_AUDIT.md.
