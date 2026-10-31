# Step 14 — Interface designs and submission
Updated 1 November 2026.

## Deliverables
- [Editable Figma designs](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=2-2409): detailed desktop, mobile, error and success designs for six screens, preserving original wireframes.
- [Word submission](submission/MediMate_Step14_Design_Submission.docx): 15 pages, with member allocations, labelled figures, Figma links, mobile/error views, interaction rules and C5 SOS specification.
- [Self-contained HTML prototype](../design/step14/MediMate_Step14_Prototype.html): download and open locally. Uses temporary in-memory data; no real API, Telegram or hospital requests.
- [Screen data](../design/step14/screens.json) and editable SVG supplements in design/step14/.

## Member allocation and native frame links
| Member | Screen | Desktop | Mobile | Error | Success |
|---|---|---|---|---|---|
| Ihfaz Rashid Sadat | A1 Prescription review | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2402) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2517) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2631) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2660) |
| Ihfaz Rashid Sadat | A2 Schedule builder | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2679) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2794) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2909) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=3-2938) |
| Faraaz Jamil Chowdhury | B1 Medicine cabinet | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-308) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-393) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-477) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-506) |
| Faraaz Jamil Chowdhury | B2 Medicine information | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-525) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-623) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-721) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-740) |
| Sahir Jawad Chowdhury | C1 Caregiver tasks | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-759) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-864) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-969) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-998) |
| Sahir Jawad Chowdhury | C2 Today’s doses | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-1017) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-1118) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-1219) | [Open](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=4-1238) |

## Prototype review
Use the navigation buttons to change screens. The state selector shows ready, loading, empty and failure states. Main actions show success; invalid schedule dates show a correction state. Manual entries remain labelled user-entered. Task actions cycle Open → Accepted → Completed → Open. Dose action is terminal until a correction flow; repeated Taken clicks do not create another demo record. Snooze changes only the reminder feedback. Emergency SOS test uses confirmation, location-unavailable, contact response, simulated provider and closure states.

The prototype is for interface review, not production persistence or permission validation. No backend is called. Browser execution could not be verified here because Chromium was unavailable and its download failed; JavaScript syntax passed.

## Verification and remaining blocker
- Confirmed Figma creation results for 24 detailed native frames with editable text, imported Material 3 buttons and text fields, and auto-layout.
- Corrected desktop horizontal auto-layout sizing after inspecting A1; visually inspected the resulting A1 Figma screenshot.
- Created 24 supplementary editable SVG views from the same screen specification.
- Rendered and reviewed the 15-page Word document, then removed the inherited title border and re-rendered.
- One figure is an actual Figma screenshot. Other Word figures are explicitly labelled supplemental vector renderings, not Figma exports.
- **Native Figma interactions and final visual review/exports of all frames remain incomplete/unverified.** A prototype-wiring call failed on a self-navigation target; the next inspection hit the Figma Starter MCP tool limit. Do not claim successful wiring from that failed call.
- Native C5 SOS frames and a native loading/empty-state gallery were not confirmed created. Their flow is specified in the Word document and HTML supplement.

## Next Figma pass
When tool access is available, inspect page 2:2409 first. Verify every desktop/mobile frame and fix any wrapping, clipping or spacing issues; wire buttons only to different top-level frames on the same page, skipping self-navigation links. Verify forward/back flows, add SOS/loading/empty frames, export the remaining frames, and replace supplemental figures with those exports. Keep Step 14's final verification checkbox open until those checks pass.

Step 15 remains complete as a documented data-model baseline. This update does not change the agreed 13 functions.
