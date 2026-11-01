# Step 18 — React integration

The React client now connects to the six Step 17 APIs. It replaces the earlier notes-only landing screen with registration/login, patient selection, and prescription, manual cabinet and caregiver task forms and lists.

Run the local replica set and backend using [Step 17 setup](STEP_17_API_IMPLEMENTATION.md), then run `npm run dev:client` from the repository root. Open the URL printed by Vite. The development proxy keeps API requests same-origin; cookies and CSRF tokens accompany writes. Create a synthetic account to receive an owned patient automatically. Existing users can sign in again and recover accessible patient choices from `/auth/me`.

## Behavior
- Tabs display prescription drafts, manual cabinet items and open caregiver tasks. Forms save through authenticated APIs, then reload database records. Lists offer refresh and cursor pagination.
- Prescription entry currently supports one instruction per draft. All drafts need review; confirmation/history/OCR remain later work. Cabinet entries are labelled manual. Tasks default to assigning the signed-in user; another user ID requires an active task.write grant. Task due times use the device timezone and are sent as UTC.
- Loading, empty, failure and save feedback are visible. Errors preserve form entries. Duplicate clicks are blocked; an unchanged retry after a failed submission reuses the same idempotency key. That key is held in memory and is not retained across reloads.
- Stale list requests cannot populate a newly selected patient/tab. Switching patient/tab clears displayed records. Sign-out clears the screen and invalidates the server session. Native labels, field constraints and visible keyboard focus are included; CSS stacks the form/list on small screens.
- `/auth/me` now includes up to 100 accessible active patient summaries, based on ownership and up to 1,000 active grants. Large-scale patient discovery pagination is later work. Access is still rechecked for each resource request, so discovery does not bypass permissions.

## Validation
Pull requests and pushes to main run `.github/workflows/verify.yml`: a clean install, production build, the API suite against a disposable replica set, and the DOM integration checks. Run `node verification/step18/api.mjs` after installing the isolated test package to run the API suite without configuring a local database.

Session recovery is covered by expiring the real MongoDB sessions during the DOM test. Expired authenticated sessions return to sign-in with a fresh CSRF token; expired anonymous sign-in sessions preserve credentials for an explicit retry. Recovery never automatically replays a mutation.

The production Vite build passes. The real MongoDB API acceptance suite passes all 12 reported tests, including new patient-discovery and revocation assertions. The production React bundle is also exercised through JSDOM and Testing Library against a real MongoDB replica set; see [interaction evidence](evidence/step18-dom.json). This checks registration, each create/list flow, remount persistence and logout/login with patient rediscovery.

To repeat the DOM test, first run `npm ci` and `npm run build` at the repository root, then `npm ci --prefix verification/step18` and `npm test --prefix verification/step18`. This isolated test package downloads a temporary MongoDB binary and creates synthetic disposable data; it does not use your application database.

Chromium could not be downloaded in this environment, so browser layout, screenshots and a manual accessibility review remain unverified. To review locally, register, save one record in each tab, refresh the page, sign out/in and verify those records remain. Repeat at a narrow mobile viewport. Then try an unauthorized assignee and an invalid prescription entry and confirm that failures preserve input.

This milestone integrates the six implemented APIs. Full feature workflows, caregiver invitation UI, notifications, deployment and university submission remain pending. The original notes API stays a development-only backend demo.
