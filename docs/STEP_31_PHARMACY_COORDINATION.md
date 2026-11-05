# Step 31 — A4 pharmacy search and refill coordination

Ihfaz Rashid Sadat owns A4. The implementation builds on the Step 30 inventory/checklist and C1 task workflows. [Lab rules](CODEX_LAB_INSTRUCTIONS.md) · [A4 acceptance criteria](STEP_11_ACCEPTANCE.md) · [Step 30 draft](https://github.com/faraaz1027-cloud/MediMate/pull/13)

## Search and collection

1. Open **Inventory and refills**. Choose **Use device location** or enter a public area's latitude and longitude from OpenStreetMap. If device permission is denied, the coordinates remain editable. Search runs only after submitting the form with a radius from 100 to 5,000 meters. The manual option uses coordinates and requires no geocoder.
2. Choose **Save as preferred pharmacy** for a returned listing. The result shows the mapped name, position, optional address, listed phone and hours, and the retrieval time. Distances are approximate straight-line distances. Contact the pharmacy directly to confirm hours and medicine availability. Map results provide no ambulance or emergency dispatch status.
3. Create an A3 refill checklist, then select an open checklist and a C1 assignee in **Assign refill collection**. Choose whether to include the saved pharmacy. Open the new task in **Caregiver tasks** to review the linked checklist ID and public pharmacy snapshot. Access to the checklist's medicine items still requires stock permission.
4. The assignee can use the existing C1 acknowledgement and task status controls. Record checklist collection and actual refills separately in Inventory.

## Technical choices

- A fixed HTTPS Overpass request contains the rounded center and bounded radius. The app persists only selected public listing data. It includes no patient identifiers, medicines, checklist contents or notes in the provider request. The adapter bounds response size, query time, upstream rate and result count, and caches and coalesces identical requests. The public endpoint is shared infrastructure suitable for a bounded lab demonstration. [Overpass usage manual](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) · [OSM data attribution](https://www.openstreetmap.org/copyright)
- Selection tokens bind the exact server-returned snapshot to a user and patient for ten minutes. A process restart requires a fresh search before the first save. A committed idempotency receipt can replay after expiration. Each patient has one current preferred listing. After 24 hours, it remains viewable and requires a fresh search before a new task can use it.
- The list revision and single link prevent competing submissions from creating another collection task. The task, C1 creation event, notification job, checklist link, audit and idempotency receipt commit together. The task keeps its public listing snapshot if the preference changes later.

[Data model](STEP_15_DATA_MODEL.md) · [API contracts](STEP_16_API_CONTRACTS.md)

## Lab evidence

Run `node verification/step31/live.mjs` for a single Overpass request using a public area in Dhaka. Save the response status, count, retrieval time and public listing link. The configured public endpoint returned HTTP 406 or timed out during these attempts. A successful live listing from the configured endpoint remains open. [Live attempt evidence](evidence/step31-live.json)

The Vite production build and 128 API/provider tests passed. The controlled API suite runs the real routes against MongoDB and exercises a returned listing, no results, timeout, stale and tampered selections, permission checks, concurrent assignment and rollback. The production-bundle DOM scenario passed with a denied-location fixture and completes the A3 → A4 → C1 workflow with a controlled provider response. Browser layout and accessibility still require manual verification. [API evidence](evidence/step31-api.json) · [DOM evidence](evidence/step31-dom.json)

Ihfaz should show his own contribution, the successful live request, the denied-location fallback and the task linked to the A3 checklist. For the live edits, explain the allowed upstream query and the transaction boundary in Express, then change a visible loading or result state in the React screen. Step 29's deployment gate remains open.
