# Sahir Jawad Chowdhury viva sheet

Student ID 23301212. Own functions C1-C4, plus additional C5. Human rehearsal
status: **NOT_RUN**. Confirm faculty treatment of extra C5 separately.

## Show and explain your five workflows

| ID | Demonstration | Code to open | Stored result and failure |
| --- | --- | --- | --- |
| C1 | Assign/accept/complete/reopen task; add, author-edit/delete handover note and inspect history. | `client/src/TaskBoard.jsx`, `server/v1/tasks.js`, `server/v1/taskNotifications.js`, `server/v1/channels.js` | Task/events/notes; linked-channel proof and app consent. Sending is not acknowledgement; non-author note mutation is denied. |
| C2 | Show due events, taken/skipped/snooze and reasoned correction. | `client/src/DoseBoard.jsx`, `server/v1/doses.js`, `server/v1/doseReminders.js`, `server/dose-worker.js` | Occurrences/actions and separate reminder jobs/attempts. Snooze changes notification timing, not prescribed schedule. |
| C3 | Enable follow-up, show overdue-unconfirmed task, acknowledge and resolve; inspect suppression. | `client/src/FollowupBoard.jsx`, `server/v1/followups.js`, `server/v1/followup-worker.js` | Settings/follow-up/task/attempt/outcome. Silence is not skipped; revoked access/resolution suppress pending work. |
| C4 | Compare range counts, revise note, export PDF and test later download authorization. | `client/src/VisitReports.jsx`, `server/v1/reports.js`, `server/v1/report-pdf.js` | Health notes/revisions and frozen export snapshot. Expired/revoked downloads must fail. |
| C5 | Independent contact consent, deliberate activation, optional/unavailable location, acknowledgement and closure. | `client/src/SosBoard.jsx`, `client/src/EmergencyInbox.jsx`, `server/v1/sos.js`, `server/v1/sos-worker.js` | Incidents/jobs/attempts/acknowledgements/events. Provider requests are explicit development/test simulation, not dispatch. |

## Viva questions and answer cues

1. **Who may change a handover note?** Its author, with the current revision and
   permission checks; current deletion does not erase its history. Task ownership
   alone does not make someone the author of another user's note.
2. **What proves Telegram consent?** A recipient's expiring private bot challenge,
   /start proof and explicit app confirmation. The owner cannot assert another
   user's consent. No bot/test recipient is configured in this project yet.
3. **Why separate delivery and acknowledgement?** A provider accepting a message
   does not show that a person saw it, acted or took a dose. Unknown delivery cannot
   safely be retried blindly after a crash.
4. **How do workers survive restart?** Persist due jobs/attempts/leases and reconcile
   them under the documented late/expired/unknown policy. Explain a real process
   test and what happens when the computer is asleep.
5. **What does an unanswered dose mean?** It remains pending/overdue-unconfirmed;
   follow-up acknowledgement/outcome is independent and must not infer skipped.
6. **How can a report be checked?** Use a known patient/range, reconcile counts with
   events and compare screen/PDF snapshots. Retain source/history and enforce
   permissions again on download, including after grant revocation.
7. **Why can an emergency contact use the inbox without chart access?** Contact
   consent exposes only the permitted incident data; it does not create a caregiver
   grant. New/revoked consent must not expose an earlier incident incorrectly.
8. **What does SOS success mean here?** Distinguish one active incident, durable
   notice state, independent acknowledgement and closure. Simulation is excluded
   from production, and no real acceptance/ambulance dispatch is implemented.
9. **How do you test timing without pretending to wait in real life?** Explain
   injected test clocks versus actual due time and worker execution. A controlled
   clock test or DOM scenario must be labelled and is not your live delivery proof.

## Your live modification task

Change only the **C1 task title** from a 200 to an 80 bound in the practice copy.
Do not shorten the 2000-character handover note, rewrite history or alter task states.

1. Find TaskBoard's title input and change maxLength to 80.
2. Apply an explicit 80 bound in both task creation and task title editing. Keep
   revision, author/participant and active-grant checks intact.
3. Change only Task.title in store.js to String with maxlength 80. Explain the
   difference between document validation and the current update helper behavior.
4. Test 79/80 accepted and 81 rejected with a title error and no partial task/event/
   note/job writes. An invalid edit must leave the record/revision/history unchanged.
5. Check the rendered input, restart readback, unauthorized access and the existing
   worker/consent regressions. Explain treatment of already stored longer titles.

Discuss the shared Task model: A4 collection and C3 follow-up also generate titles.
A global maxlength change can reject those producers even when the C1 form works.
Identify their code paths before proposing a production change. The passing
reference fixtures do not prove every generated/legacy title is within 80.

Focused reference test, from the rehearsal source:

```powershell
$env:VIVA_EXPECT_LIMIT = '80'
node verification/step18/api.mjs server/test/viva-sahir.test.js server/test/tasks.test.js server/test/telegram.test.js server/test/doses.test.js server/test/followups.test.js server/test/reports.test.js server/test/sos.test.js
```

`sahir-reference.patch` is an answer key, already applied only in the supplied
reference copy. The canonical Source application retains its original behavior.

## Evidence you must record

Use independent synthetic owner/caregiver/contact accounts on one server/database.
Record your actual screen/API/DB result, diff, test output, explanation and real
commit/Jira links. Keep task acknowledgement, dose status, contact acknowledgement
and provider simulation separate. No real service calls or emergency-provider
messages are needed for the exercise. A genuine Telegram delivery check remains
an additional consent/configuration gate, not something to mark passed from fixtures.
