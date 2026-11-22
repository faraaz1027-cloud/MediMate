# Step 39 — Chrome DevTools and measured performance

Local technical step performed on 21 November 2026 (Asia/Dhaka), branch
`feature/step39-browser-performance`. Codex prepared these changes and evidence;
this does not establish individual student contribution, viva readiness, faculty
approval or a submitted course milestone. Assignment 03 and Steps 32–38 remain
preserved in the same checkout. No commit or GitHub PR was created for this step.

## Scope and conditions

The Lab 02 procedure in `CODEX_LAB_INSTRUCTIONS.md` and Step 39 roadmap were used.
Windows 10.0.26200, AMD Ryzen 5 5600X, 12 logical CPUs, 16 GiB RAM; Chrome 158 and
Lighthouse 13.6.0. The connection was loopback HTTP to Express serving the compiled
Vite app, with a disposable MongoDB 7.0.24 replica set. This is not internet/cloud
performance. Providers are controlled/disabled and no real alert is sent.

The synthetic signed-in prescription dashboard contains one draft and three manual
cabinet items, including a long name. The verification-only session bootstrap
redirect adds overhead; no token is placed in a URL or exported. The bootstrap is
only in `verification/step39/server.mjs`, never in the production entrypoint.

Native Chrome inspection used the existing profile, which has extensions. Its
request counts and trace include extension activity. CLI Lighthouse uses a separate
headless profile: simulated mobile 412×823, 4× CPU slowdown, 150 ms RTT and
1638.4 Kbps throughput; desktop uses its desktop preset. Full settings, timestamps,
request data and host metadata are in `evidence/step39/measurements.json`.

## Findings and corrections

1. **P2, corrected:** the initially absent Sign out control changed the header
   height after session restoration. Its space now remains reserved with
   `visibility:hidden`, disabled and inaccessible while signed out/loading.
   Mobile CLS dropped from 0.926 to 0.043.
2. **P2, corrected:** the desktop page gained a scrollbar after data loaded,
   shifting centered content. `html { scrollbar-gutter: stable; }` reserves that
   space. A diagnostic trace confirmed the shift; desktop CLS dropped from 0.802
   after the header fix to 0.018 on the reviewed build.
3. **P3, corrected:** the missing favicon produced a 404 Console error. A local SVG
   favicon and explicit HTML reference remove that failed request. Final Lighthouse
   Console-error audits are empty.
4. **P2, still open:** simulated mobile LCP is approximately 3.31 seconds, above
   the lab's illustrative 2.5-second target. The initial JavaScript is about
   394 kB uncompressed (112 kB build gzip estimate), and Lighthouse flags unused
   JavaScript. A future measured change can split optional work areas and verify
   chunk-loading failure recovery, plus verify actual hosting compression. No
   improvement to LCP or production compression is claimed here. Private API
   `no-store` is retained despite the back/forward-cache audit finding.

## Lighthouse measurements

These are individual lab measurements, not field percentiles or a device fleet
assessment. All reports are retained, including the diagnostic repeat and
intermediate builds; use `*-reviewed.report.*` for the final source build.

| Run | Performance | Accessibility | Best practices | LCP | CLS | TBT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mobile, before | 68 | 100 | 96 | 3.314 s | 0.926 | 0 ms |
| Mobile, reviewed | 92 | 100 | 100 | 3.312 s | 0.043 | 0 ms |
| Desktop, header fix only | 76 | 100 | 100 | 0.686 s | 0.802 | 0 ms |
| Desktop, reviewed | 100 | 100 | 100 | 0.688 s | 0.018 | 0 ms |

The final CLI run logs nine requests including the test bootstrap redirect,
document, assets/favicon and four API reads, approximately 407 kB transferred.
Timing details are in each JSON and the derived measurements. Redirect latency is
a test-harness limitation; it is not a production redirect finding.

## Native Chrome observations

- Elements showed the real rendered DOM and the applied `scrollbar-gutter:stable`
  rule. Screenshot: `evidence/step39/native-elements.png`.
- Console initially showed the favicon 404; final Lighthouse error audits are
  empty. Read-only Console metadata returned width 360/document width 360,
  zero localStorage/sessionStorage entries and zero script-visible cookies.
  `native-console-metadata.png` contains counts only. This is not a full storage
  or cookie security audit and does not mean the HttpOnly session is absent.
- Network Fetch/XHR showed CSRF, current user, prescriptions and cabinet reads.
  The prescription GET returned 200 and a JSON envelope with the synthetic draft.
  Native response headers confirmed `application/json; charset=utf-8`,
  `Cache-Control:no-store` and `X-Content-Type-Options:nosniff`;
  `native-response-headers.*` keeps request headers collapsed to hide cookies.
  No clinical decision or mutation was performed. The safe server exchange ledger
  records status, response Content-Type, Cache-Control and server duration without
  cookies, request bodies or CSRF values.
- With cache disabled and a forced fresh reload, the initial unthrottled native
  run showed 11 requests including extensions, DOMContentLoaded 110 ms, load
  150 ms and finish 199 ms. The subsequent actual DevTools **Slow 4G** reload
  showed DOMContentLoaded 3.46 s, load 3.50 s, finish 5.25 s; four API reads took
  592/581/586/586 ms. Screenshot/text: `native-slow4g.*`. These native request
  durations include throttling and differ from server processing time.
- At 360×1218 emulation the navigation wraps, the form fits and a long cabinet
  label wraps. Under Offline, cabinet loading failed with
  `ERR_INTERNET_DISCONNECTED` and displayed “Cannot reach the server. Check your
  connection and retry.” Restoring No throttling and pressing **Retry loading
  records** fetched all three items. Screenshots: `native-mobile-360.png`,
  `native-offline-retry.png`, `native-recovered.png`. No offline persistence or
  real-device coverage is implied.
- Native Performance **Record and reload**, without network/CPU throttling,
  produced a flame chart for a 5.17 s capture: LCP 0.16 s, CLS 0, scripting
  145 ms, rendering 5 ms and painting 5 ms. The capture includes extension work.
  Screenshot/text: `native-performance.*`. This is a separate measurement from
  simulated Lighthouse; it must not be used as its mobile score.

## Verification and repeat commands

Final Vite build passed. Existing database-connected DOM integration passed
(`evidence/step39/ui-regression.txt`). It exercises prescriptions, cabinet, tasks,
schedules, medicine cards, doses, inventory/refills and pharmacy preferences.
Backend behavior/routes/schema were unchanged, so the Step 38 186/186 backend
result remains earlier evidence, not a newly rerun full suite. The verification
scripts passed Node syntax checks. Native checks are evidence for the observed
pages only, not an audit of all 13 complete workflows.

From `C:\Users\jfaar\Documents\Codex\MediMate-A3\Source`:

```powershell
npm run build
npm ci --prefix verification/step39
$env:MONGOMS_SYSTEM_BINARY = 'C:\Users\jfaar\Documents\Codex\2026-11-01\github-plugin-github-openai-curated-remote\work\mongodb-binaries\mongod-x64-win32-7.0.24.exe'
node verification/step39/server.mjs
```

Keep that terminal running, open `http://127.0.0.1:17339/__step39/session`, and
in a second terminal at the same checkout run:

```powershell
node verification/step39/measure.mjs mobile mobile-new-check
node verification/step39/measure.mjs desktop desktop-new-check
node verification/step39/record.mjs
```

Use unique labels; the runner refuses to overwrite existing evidence. On another
machine set `CHROME_PATH` and an installed MongoDB binary path, or allow the test
library to obtain the specified binary. `Ctrl+C` shuts down the disposable server
and replica set. Native DevTools captures require repeating the observed UI steps;
the CLI does not manufacture them. Raw diagnostic DevTools logs remain ignored
under `.local-data`, outside the review evidence package.

Step 39's scoped technical measurements are recorded, with the mobile LCP finding
open. Next numbered step: **Step 40 — final documentation package**. Live Telegram,
reliable live public-map availability, real provider integration, physical-device
coverage, student demonstrations and deployment/faculty confirmation remain
separate gates. The Lab 7 report must carry these limitations forward.
