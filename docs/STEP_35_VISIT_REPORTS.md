# Step 35 — C4 analytics and visit report

Implemented locally on 21 November 2026. Owner: Sahir. Function scope and ownership
are unchanged. Sahir must understand the metric rules, reproduce the fixtures,
rehearse and modify his own code before claiming individual course evidence.

## Workflow

1. Open **Visit reports**. Enter explicit UTC start/end timestamps and an IANA
   display timezone, such as Asia/Dhaka. Load analytics.
2. Review taken, skipped, pending, overdue-unconfirmed and excluded cancelled
   counts, plus the cutoff and metric version. A zero is a recorded dataset count,
   not proof that a medicine was taken or that all real-world activity is present.
3. With report.write, add a visit/health note and its actual recorded-at UTC time.
   Edit a note with its current revision and a reason; previous revisions persist.
4. Generate a private PDF. Its displayed totals are replaced by the frozen export
   snapshot so the screen matches the generated PDF. The saved export shows its
   range, timezone, generation time and expiry separately from later live queries.
5. Download the PDF while authenticated. Reload, reselect the patient and reopen
   the saved export through export history. Later actions or note changes require
   a new report. Download access expires after 24 hours and is rechecked each time.

Use the existing MongoDB/Express handoff commands. No additional worker, cloud
account, API key or paid service is needed. The PDF runs locally in Express.

## Metric definition c4-v1

- Select saved occurrences by dueAtUTC in **[fromUTC,toUTC)**, maximum 366 elapsed
  days. Display timezone affects formatting, and never changes those UTC bounds.
- Taken and skipped use current persisted occurrence state in the read snapshot.
  Cancelled events are listed for context and excluded from the scheduled total.
- Pending and overdue-unconfirmed are disjoint subsets of pending occurrences.
  The overdue boundary is max(dueAtUTC + delay, reminderDueAtUTC). At the exact
  boundary, an unconfirmed occurrence is overdue. Future events remain pending.
- Use the current saved C3 delay even if notices are disabled. With no saved C3
  preference, use a labelled 30-minute default. This is a report definition and
  does not claim a C3 escalation was sent. No percentages or adherence score are
  inferred. Changing settings can reclassify live pending events; saved reports
  retain their original delay, definitions and counts.
- The cutoff marks the application time for the transaction's read snapshot.
  It is not an event-replay service for arbitrary historical cutoffs. A later
  correction affects later reports; earlier frozen exports remain unchanged.
- No scheduled records gives no_scheduled_occurrences with zero counts. Invalid
  occurrence state, missing required dose/prescription source or dependency
  failure returns an explicit error rather than a plausible zero or partial PDF.

## Defined report projection

report.read authorizes this bounded patient report, not unrestricted domain
browsing. It includes dose medicine text/state/due time, dose action type/time
and correction marker, confirmed prescription version metadata, recorded refill
quantities/units/times, caregiver-task event type/status/time/actor IDs, and visit
health notes. It excludes task handover text, personal medicine notes, contact
information, refill free-text notes and authentication/channel secrets.

Dose history is due-time selected. Dose actions, refills, task events and notes
use their recorded/occurred times in the selected range through the cutoff.
Prescription history includes versions confirmed in-range plus confirmed source
versions for selected doses, even if their confirmation was earlier. Those
context versions are explicitly labelled. Medicine text comes from saved schedule
sources; refill names and prescription titles are current labels captured when
the report is generated. Refill arithmetic uses exact integer micro-units.

## Architecture and contract refinements

Bounded local PDF generation returns **201 ready**, replacing the proposed 202
background export job. There was no implemented report client or persisted job
format to migrate. This avoids adding another worker for a deterministic bounded
operation. Metadata returns its immutable snapshot; content returns private
application/pdf with attachment/no-store headers. Added range-filtered note listing
and paginated export history make notes and exports rediscoverable after reload.
See STEP_16_API_CONTRACTS.md for all request/response fields.

MongoDB adds healthNotes, immutable healthNoteRevisions and reportExports. A report
stores its snapshot and PDF bytes in the same transaction as its idempotency/audit
receipt. Generation and every download require current report.read. Health-note
writes separately require report.write; report.read never grants note mutation.
Writes retain CSRF and UUID idempotency checks. Replayed export creation returns
an ID, and subsequent access checks still control reading/download after revocation.

Limits: analytics up to 20,000 selected occurrences; export up to 500 per detail
collection (200 health notes), 1,000 total detail entries, 1 MiB snapshot, 60 PDF
pages and 4 MiB PDF bytes. Larger results reject with a clear shorter-range error;
no silent truncation. Export history pages contain at most 20 metadata records.
Expired content returns 410, including at the exact expiry timestamp. Expiry is
an access limit; this step does not automatically erase database records/backups.

PDFKit and Fontkit are pinned server dependencies. A bundled unmodified Noto Sans
Bengali font supports English/Bengali and carries its original OFL license and
source/hash manifest. Font coverage is checked before rendering; unsupported
characters produce an explicit export error. No replacement glyph is silently
accepted. These are implementation limits, not restrictions on stored note text.
[PDFKit font support](https://pdfkit.org/docs/text.html) ·
[Font source and license](https://github.com/google/fonts/tree/main/ofl/notosansbengali)

## Validation and owner demonstration

Run `node verification/step18/api.mjs server/test/reports.test.js` using the
existing disposable replica harness. It covers disjoint counts, exact boundary,
empty/invalid ranges, notes/revisions, contextual prescription source, fractional
refills, projection privacy, report-only caregiver access, revoked download,
frozen snapshots, exact expiry, missing sources, unsupported font characters and
record-limit rollback. Evidence: docs/evidence/step35-api.txt.

Build: `npm run build`. The production-bundle DOM rehearsal runs through
verification/step18/run.mjs with MEDIMATE_DOM_REPORT pointing to
docs/evidence/step35-dom.json. It adds a note, generates an export, compares screen
and saved snapshot counts and reopens the export after reload. The backend fixture
downloads actual PDF bytes. Native browser download UX, accessibility and visual
browser review remain separate from JSDOM.

The synthetic two-page PDF is output/pdf/step35-synthetic-visit.pdf. Snapshot and
extracted text are beside it; PNG pages are step35-page-1.png and step35-page-2.png.
These generated outputs are ignored by Git. Poppler rendering was visually
inspected; an initial left-margin error was corrected. pypdf verified counts,
fractional refill and Bengali text; pdfplumber checked horizontal page bounds.
This is actual generated fixture evidence, not a student screenshot or a real
patient report.

For Sahir's showcase: explain the half-open date range and disjoint pending
definitions; count a known MongoDB fixture manually; add/revise a visit note;
generate/download a PDF; compare counts and prescribed source/refill history;
reopen after restart; demonstrate a revoked download and an invalid date range.
Then change a visible report explanation and a metric fixture under Sahir's own
contribution identity. Do not claim clinical accuracy or a personal demonstration
from automated fixtures alone.

Next roadmap gate: Step 36 — Module 3 demonstration, including the outstanding C5
SOS implementation. C5 provider/ambulance dispatch must remain explicitly
simulated unless a real verified provider has confirmed it.

Final validation: all 161 backend regression tests passed, including seven C4 checks and byte-for-byte PDF regeneration for an identical snapshot/cutoff. The production-bundle UI rehearsal and Vite build passed. Final two-page PDF rendering, extraction and bounds evidence: docs/evidence/step35-pdf-qa.json. Full transcript: docs/evidence/step35-regression.txt; C4 excerpt: step35-api.txt; UI evidence: step35-dom.json.
