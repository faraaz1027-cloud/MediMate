# Step 14 — Interface designs and submission
Updated 1 November 2026.

## Deliverables
- [Editable Figma designs](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=2-2409): detailed desktop, mobile, error and success designs for six screens, preserving original wireframes.
- [Word submission](submission/MediMate_Step14_Design_Submission.docx): 16 pages, with member allocations, labelled figures, Figma links, mobile/error views, interaction rules and C5 SOS specification.
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

## Native prototype verification
The student-account pass completed the native Figma prototype. The detailed page contains 46 frames: the 24 desktop/mobile/error/success frames above, supporting loading/empty/secondary-action states and three C5 SOS frames. The original wireframes are preserved.

- [SOS confirmation](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=34-1886)
- [SOS active incident](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=34-1909)
- [SOS closure](https://www.figma.com/design/1Zy0JqsSdfzL9Lno6GlWbB?node-id=34-1939)
- [Presentation starting at A1](https://www.figma.com/proto/1Zy0JqsSdfzL9Lno6GlWbB/MediMate-Step-14-Interface-Designs?node-id=3-2402)

Inspected the native interaction graph: 142 NAVIGATE destinations resolve to valid frames; BACK interactions are configured separately. This is graph validation, not a claim of a manual click-through usability study. The prototype demonstrates navigation and illustrative outcomes; it does not call a working medical backend.

## Word submission and visual review
The final 16-page Word document uses native Figma exports for the six desktop designs, mobile excerpts, six error views, six success views and three SOS states. The mobile figures are explicitly labelled upper-screen excerpts; complete editable mobile layouts remain in Figma. No supplemental vector rendering is represented as a native export.

Reviewed the 27 exported native frames and rendered Word pages. Corrected the SOS active status banner clipping and the Word title border; re-rendered and checked the final document. Member allocations, frame links, interaction rules, accessibility considerations and simulation limits are included.

The HTML and SVG files remain supplementary earlier review artifacts. Figma and the final Word document are the authoritative Step 14 design submission. All examples are synthetic; SOS provider requests are simulated and no real notifications or dispatches occur.

## Completion
Step 14's detailed design and Word preparation are complete. Uploading the document to a university submission portal and faculty acceptance are separate actions; neither is claimed here. The native verification record is [available here](../design/step14/native_verification.json).
