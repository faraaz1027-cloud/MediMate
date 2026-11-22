# Sahir — C1 Module 1 walkthrough

Sahir Jawad Chowdhury, 23301212. Personal demonstration status: NOT_RUN.
Real C1 Telegram receipt: technically VERIFIED on the user's PC with @Medi911_bot;
see `docs/MODULE_1_TELEGRAM_DELIVERY.md`. Your own demonstration remains NOT_RUN.

1. Create/assign a synthetic task to a registered permitted caregiver. Explain
   patient ID, assignee ID and the task.read/task.write grant.
2. Sign in as the assignee in a separate session. Explicitly acknowledge, accept
   and complete the task; show that these are distinct persisted actions.
3. Add, edit and delete a note authored by this account. Demonstrate the API denies
   editing/deleting someone else's note even if an actor can manage the task.
4. Reopen/reassign as permitted; show a new assignment generation and retained
   previous acknowledgement/events. Reload and inspect history/notification attempts.
5. Show invalid transitions/revisions, unauthorized actors and immediate revocation.
6. On the current configured setup, show the real bot link, consent, actual generic
   receipt and separate app acknowledgement. For the disabled-configuration case,
   use the default local helper/controlled evidence and label it accurately. Don't
   present an app acknowledgement alone as proof of Telegram receipt.
7. Explain the frontend/API/model path and perform your own frontend/backend edit
   in an isolated practice copy. Run the affected requests/tests and explain them.

Code: `client/src/TaskBoard.jsx` → `server/v1/tasks.js`, `channels.js`,
`taskNotifications.js`, `telegram.js`, `server/worker.js` → Task, TaskNote, TaskEvent,
NotificationJob/Attempt, ChannelLink and Acknowledgement in `server/v1/store.js`.

Questions: Which actors may transition a task? Why are note controls author-only?
Why is revision checking needed? Why do channel acceptance and acknowledgement
differ? What is an unknown delivery outcome? Why not automatically resend it?
How does unlink/revocation suppress an unsent notice? Why must only one bot poller run?

Practice example: change a task-title limit consistently in the UI, create/edit
API and model. Test boundaries and unchanged state after rejection. Other project
features create tasks, so a production limit change also needs a shared-producer
review. Existing isolated instructions: `docs/viva/SAHIR.md`; the reference patch
is not proof of your own work.

Import `MediMate_Module1_Sahir.postman_collection.json`, port1212. Run all41 requests
in Postman_Run_Order.csv, including two-account setup. The14 numbered C1 captures
are supplied. This automated collection expects Telegram disabled; the separate
real C1 receipt/acknowledgement evidence is now supplied. Add your own personal
demonstration, actual commit/Jira/evaluator evidence and repeat/explain the live flow.
