# Step 38 — Failure and permission audit

Completed local technical checks on 21 November 2026 in
`feature/step38-failure-audit`. The assessed functions and student ownership are
unchanged. No live contact alert or emergency-provider request was sent.

## Prioritized confirmed findings

| Priority | Finding | Reproduction and impact | Fix |
|---|---|---|---|
| P2 | SOS closure receipt replay skipped current manager/originator authorization | A caregiver could close another activator's incident while holding sos.manage, lose that permission but retain sos.activate, then receive 200 for the old closure receipt. A new closure was correctly denied; replay returned the stored success without a new mutation. | Check the current manager/originator role before receipt lookup for both cancel and resolve. Retain the transactional check for new transitions. Legitimate originating activators can still replay their own closure. |
| P2 | Server phone validation accepted formats the call UI could not use | A PATCH containing `++8801700000000` returned 200, while the UI's dial-link guard rejected it. | Contact and incident callback numbers now allow at most one leading plus, a leading digit, supported spaces/parentheses/hyphens, at least five digits and 5–30 characters. Malformed plus placement returns 422. |

The original two failing leaf cases and parent failure are retained in
[before-fix output](evidence/step38-before.txt). The final targeted audit passed
all 11 reported tests (ten adversarial cases plus their parent).
[Targeted result](evidence/step38-targeted.txt) ·
[Current audit records](evidence/step38-audit.json)

The code changes are in `server/v1/sos.js`. A focused two-fix patch is available
in the delivery's `Support/Step38_Review/Step38_SOS_Fixes.patch`, beside before/after
source copies. The before copy is reconstructed by reversing the two explicit
edits, since the earlier C5 source remains an uncommitted local addition. The
patch's reverse check passed against the already fixed checkout. Do not apply it
again there. No schema migration, student-authored commit or GitHub PR is claimed.

## Verified failure coverage

The complete backend run passed **186/186 tests**. A generated matrix links all
13 requested failure categories to their actual test files and successful log:

- [Readable coverage matrix](evidence/step38-matrix.md)
- [Machine-readable findings, matrix and limitations](evidence/step38-matrix.json)
- [Full regression transcript](evidence/step38-regression.txt)
- [Evidence/source hashes](evidence/step38-manifest.json)

New checks specifically cover a caller owning two patients borrowing IDs across
cabinet/prescription/schedule/dose/task/follow-up/ingredient/assistant/report/SOS
resources; wrong CSRF with no writes; simultaneous note edits; forged SOS state
fields; partial role loss including receipt replay; consent revoked between an
acknowledgement's read and write; valid/invalid call-number formatting; and expired
session rejection followed by fresh CSRF/sign-in and a single idempotent result.

The consent race is forced with a test-only database fence hook. Revocation commits
before the held acknowledgement reaches its contact write. MongoDB retries the
stale transaction, current consent fails, the API returns 404, and no acknowledgement
is persisted. Test hooks are restored and never installed in application code.

Existing regression cases cover duplicate creates, concurrent stock deductions
and rollback, unmatched or unavailable RxNorm, openFDA source failures, partial/
unavailable Overpass data, definite/unknown Telegram outcomes, process crashes and
restart leases, immutable historical versions, and SOS expiry/production boundaries.
They were rerun against the fixed source rather than inferred from earlier results.

## Actual blurred OCR check

`verification/step38/ocr.mjs` generates a clear synthetic text image and a strongly
blurred derivative, then runs the installed Tesseract.js Node/WASM worker locally.
The clear control recognized `ALPHA TEST 12345` with confidence **77**; the blurred
image produced empty text with confidence **0**. Both inputs have recorded hashes.
No image or patient content is uploaded to an OCR service. The public English
language asset may be downloaded by the worker and is cached in ignored local data.

[OCR engine evidence](evidence/step38-ocr.json). Generated clear/blurred PNGs are
in `output/step38/`, ignored by Git. The backend audit uses the actual blurred
result when that evidence exists, preserves its provenance/confidence, and verifies
that even reviewed:true cannot confirm a draft with unresolved clarification.
No extra dose occurrences are created. In a clean CI environment without the OCR
artifact, that API test uses explicitly controlled low-confidence metadata; the
evidence packager requires the separate successful engine run to claim this audit's
actual OCR coverage.

This is synthetic Node-engine evidence, not a browser upload test, handwriting
accuracy score or clinical transcription validation. Native browser file selection,
model-loading/offline behavior, focus, cancellation and device-specific quality
remain part of Step 39's browser checks. Manual clarification remains mandatory.

## Reproduce

From the tested checkout, the final backend suite is:

```powershell
Set-Location -LiteralPath 'C:\Users\jfaar\Documents\Codex\MediMate-A3\Source'
$env:MONGOMS_SYSTEM_BINARY = 'C:\Users\jfaar\Documents\Codex\2026-11-01\github-plugin-github-openai-curated-remote\work\mongodb-binaries\mongod-x64-win32-7.0.24.exe'
node verification/step18/api.mjs
```

For the focused new audit, append `server/test/failure-audit.test.js`. The existing
harness creates/removes a disposable replica database and preserves the handoff's
local application database. The checked application frontend is unchanged in this
step; the backend suite includes its compiled same-origin integration checks.

For the OCR check, provide an installed Sharp package path. On this device the
Codex bundled package is:

```powershell
$env:MEDIMATE_SHARP_PATH = 'C:\Program Files\WindowsApps\OpenAI.CodexPrimaryRuntime.v26-1119-907-0_26.1119.907.0_x64__3k8sg7r9htsxt\dependencies\node\node_modules\sharp'
node verification/step38/ocr.mjs
```

On another device use its installed/bundled Sharp location; Sharp is a verification
tool here and is not a new application runtime dependency. The script has a
45-second deadline and records unavailable/failed honestly. Never substitute its
metadata fallback for successful engine evidence. Run
`node verification/step38/record-evidence.mjs` after the successful full transcript,
audit JSON and engine result are present to package the coverage matrix/hashes.

The full suite also reruns Step 37 and regenerates its synthetic record IDs/PDF.
Its ledger, PDF QA and manifest were refreshed to that passing connected case.
Existing human capture/rehearsal guides still apply; generated record IDs are
historical disposable-fixture evidence, not a running manual demonstration dataset.

## Remaining gates

Live Telegram remains deferred. Public hospital/pharmacy map availability has not
been established by the controlled tests; the latest recorded live lookup timed
out. Provider requests are still explicit classroom simulation, with no verified
provider or dispatch claim. Student contribution/viva/faculty evidence and native
browser checks remain open. These are separate from passing the tested failure
contracts, and no course completion is inferred from the test count.

Next roadmap step: Step 39 — genuine Chrome DevTools and measured performance.
