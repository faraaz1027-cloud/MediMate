# Step 30 — A3 inventory and refill planning

Ihfaz Rashid Sadat owns A3 for Module 3. This branch builds on the confirmed A2 schedules, C2 dose actions and the same-origin production setup from the Step 29 review branch. [Lab rules](CODEX_LAB_INSTRUCTIONS.md) · [A3 acceptance criteria](STEP_11_ACCEPTANCE.md) · [Step 29 draft](https://github.com/faraaz1027-cloud/MediMate/pull/12)

## Behavior

- In **Inventory and refills**, choose an active cabinet medicine, save a unit and threshold, and record its opening count. Zero is a valid opening count so an empty supply can be tracked. Subsequent refills are positive, and corrections use a signed quantity and a required note. The opening entry locks the stock unit. Archived items retain their history.
- Recording **Taken** deducts the confirmed dose quantity when the medicine is active, the saved unit matches exactly and the balance covers the dose. When those conditions fail, the taken record stays valid and the inventory screen shows a reason for review. A stock editor can explicitly post a pending deduction after checking that the count excludes that dose. A correction away from taken reverses its debit when one exists. A correction back to taken is a new action with its own stock result.
- Low stock means an opened, active item has a balance at or below its saved threshold. Generate a checklist from the current low-stock items or create one for a chosen medicine. Requested quantity is optional. Mark every item collected before completing the checklist. Stock increases only when a refill is recorded in stock history.
- Coverage walks future pending occurrences on active confirmed schedules in chronological order. It includes retained future events before a schedule replacement's effective boundary. It reports time until the first uncovered dose, rounded down to two decimal places, or that the remaining scheduled doses are covered. Coverage is unavailable for paused or archived schedules with no qualifying events, incompatible units, unresolved deductions, or a query beyond 100 active schedules or 2,000 events. It is a stock estimate based on saved records.

## Transaction and contract decisions

- The dose action, occurrence, audit, idempotency receipt, balance and ledger entry commit together in a MongoDB transaction. The ledger keys `dose:<actionId>` and `reversal:<debitId>` identify each debit and reversal independently of transport retries. The same idempotency key and payload replay the original receipt. The current stock status is available through fresh reads.
- A read-only balance projection and append-only ledger use integer micro-units in Decimal128 to keep fractions exact. A shared revision serializes stock settings, manual entries, and automatic debits and reversals. The API accepts decimal strings with up to 12 whole digits and six fractional digits. A correction that would overdraw stock returns a conflict.
- C2 may apply a debit with the existing dose-recording permission. Stock reads and explicit inventory writes use `stock.read` and `stock.write` respectively. Pending deductions are paginated. Reviewed deductions update the ledger and occurrence and preserve the action's historical status. Pre-Step-30 taken occurrences without stock metadata show `legacy_untracked`. Old idempotency receipts can still carry their original `not_implemented` snapshot.
- Lists store up to 50 items within one MongoDB document for revision-checked collection and completion. Generated lists are explicit snapshots and leave the requested quantity blank for review. A4 pharmacy lookup, preferences and C1 task links are scoped to Step 31.

[Data model](STEP_15_DATA_MODEL.md) · [API contracts](STEP_16_API_CONTRACTS.md)

## Lab rehearsal with synthetic data

1. Sign in as an owner. Use a saved cabinet medicine and a confirmed A2 schedule with a known dose quantity and unit. Save a threshold and opening balance in Inventory. Capture the successful settings and ledger responses in Postman with credentials redacted.
2. Record a due dose as taken. Compare the ledger and balance. Replay the same request with its original idempotency key, then show a stale or competing request and confirm that the ledger still has one debit for the action. Correct the dose with a reason and show the reversal reference and restored balance.
3. Record a dose whose quantity exceeds the saved balance. Show its taken status and pending stock review. Record a refill, confirm what the count includes and post the pending deduction. Pause the schedule and show the coverage response. Use a separate fixture with incompatible units to show why its estimate is unavailable.
4. Reduce the balance to the threshold, generate a checklist, collect the item and complete the list. Compare the balance before and after. If medicine was added to stock, record that refill as a separate entry.

Ihfaz's course evidence is his own contribution, walkthrough and live frontend and backend edits. For the walkthrough, trace the action ID from C2 into the ledger and explain why the database transaction, unique ledger key and revision each matter. The automated evidence uses a disposable MongoDB replica set and synthetic records. The production React bundle is exercised in JSDOM. Browser layout, accessibility, individual lab demonstration and faculty acceptance remain open.

The production build, all 122 API/provider tests and the DOM integration passed. The MongoDB tests cover concurrent actions, a fault after debit, exact fractional arithmetic, ledger reversal, reconciliation, schedule pause, incompatible units and access boundaries. [API evidence](evidence/step30-api.json) · [DOM evidence](evidence/step30-dom.json)

Run the focused API scenario with `node verification/step18/api.mjs server/test/inventory.test.js`. For regression checks run `npm run build`, `node verification/step18/api.mjs` and `npm test --prefix verification/step18` after installing root and verification dependencies. On restricted Windows hosts, point `MONGOMS_DB_PATH` and `MEDIMATE_TEST_STANDALONE_DB_PATH` to separate empty disposable directories inside the workspace if MongoDB cannot rename its temporary files.
