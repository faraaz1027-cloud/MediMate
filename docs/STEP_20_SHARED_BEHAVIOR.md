# Step 20 — Shared UI and backend behavior

Implemented on 1 November 2026 as a focused shared-infrastructure slice following the lab guide and roadmap. Branch: `feature/step20-shared-ui`, based on Step 19's `feature/step19-account-access` (draft PR #2), not an assumption that Step 19 has merged into main. Preserve that review dependency when merging. No assessed function, feature ownership or schema changes are made.

## Behavior and rationale

- A failed startup request shows a safe connection error and a Reconnect action. Retrying obtains a session token again; sign-in is not left permanently disabled.
- A shared request helper preserves status, code, field errors and request ID. Network failures and non-JSON proxy responses produce readable messages rather than raw parser/network exceptions. Mutations are never automatically replayed.
- Successful empty lists say No records yet. Failed list reads show a separate error and Retry action. Already fetched records survive a transient network/server failure; authorization failures clear them. Data is tagged with its user/patient/work-area context, so switching views hides earlier records immediately. An obsolete response, including an old 401, cannot repopulate a new view or clear a newer session.
- Work-area navigation follows discovered named permissions. A task-only caregiver lands in tasks rather than triggering a prescription denial. Write-only users get an explicit read-access explanation; read-only users retain disabled creation controls. No supported permissions produces an explanatory state rather than an unrelated form. The backend still checks each request; the UI is not an authorization boundary.
- A shared form wrapper keeps native required/type/pattern checks, rejects required whitespace-only values, associates returned field errors with inputs using aria-invalid/aria-describedby, and focuses the first affected field. Editing clears the prior summary. Account, patient, grant and resource forms use the same wrapper. Server validation now supplies field paths for invalid email/password/timezone and unauthorized task assignees, in addition to existing text-field validation.
- Added a keyboard skip link, explicit account-panel expansion state and minimum-width protection for grid children. Retained the established React/CSS layout, labels, visible focus and mobile stacking; no full-page template or component system was substituted.

The HTTP success/error envelopes are unchanged. Additional field paths are backward-compatible metadata. No database migration or new dependency is needed. Identity, profile, grants and roles remain common workflows and do not count toward assessed A/B/C features.

## Validation and reproduction

Use Step 19 setup: `npm ci`, `npm ci --prefix verification/step18`, `npm run build`, `node verification/step18/api.mjs`, and `npm test --prefix verification/step18`. Restricted Windows workspace symlinks still required standalone client/server dependency installs locally, as recorded in Step 19; CI uses the clean locked root install on Ubuntu. Each local test uses its own fresh writable MONGOMS_DB_PATH and a cached MongoDB binary.

Local validation used Windows, Node 26.13.0 and a real MongoDB 7.0.24 replica set. The API suite passes all 14 reported tests, including field-error metadata, CSRF, expired authentication, cross-patient access, revocation, persistence, transactional rollback and idempotency. The production Vite build passes.

The production-bundle DOM suite tests offline startup and reconnect; a non-JSON 502 with retained records and successful retry; client whitespace validation and server assignee validation with focused/described invalid inputs; a held request while switching work areas, followed by an injected stale 401 that must not log out; permission-aware task-only navigation and read-only controls. Successful domain requests use the real database. Transport failures are deliberately injected, not represented as production incident evidence. Existing profile, create/list, refresh/login and session-expiry tests also pass.

Browser smoke review used the built interface and real Express/MongoDB with synthetic records. A test-only scratch server delayed a list request by a configured 10 seconds, then separately returned an injected 503. Loading and retry states were captured; the saved draft remained visible, retry recovered after the fault was removed, and reload retained it. Required whitespace validation focused the title and exposed its error description. Tab from title reached medicine name with a visible 3px outline. Desktop 1440x900, mobile 390x844 and 320x740 were checked with no horizontal overflow at measured mobile widths. Screenshots are local review deliverables; summary is in `docs/evidence/step20-validation.json`. No timing score or performance benchmark is inferred from the configured delay.

## Owner review and remaining gates

This is AI-assisted partial shared code. Students still review and explain the form associations, request error normalization, context/generation checks and server authorization, then practise modifying a UI validation rule and corresponding API/test. No individual contribution credit, Jira update, faculty acceptance, report submission or deployment is claimed.

The checks are not a full accessibility certification, Lighthouse audit, cross-browser/device matrix or all-feature failure test. Formal measurements remain Step 39; broader failure coverage remains Step 38. Bounded patient/grant discovery and direct registered-user grants retain Step 19's documented limits. Later feature screens must adopt the shared behavior as implemented. Next: Step 21, A1 prescription import/review/version history.
