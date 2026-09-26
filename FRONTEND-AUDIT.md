# Frontend audit and implementation

Reviewed and implemented 2026-09-26 on `release/next-update`, starting at `b572395`. Build remains `v23-preview`; this work has not been deployed.

Yish requested mobile-first polish across Sortie, personal pilot identity, a useful training dashboard and a quieter dark theme. The existing Hebrew RTL interface, on-device data model and cockpit character remain the foundation.

## Findings and changes

| Area | Finding | Implemented result |
|---|---|---|
| Home | Generic date heading; statistics and feature tiles competed with the next task | Optional name/callsign, current course and personal focus; resume draft and pending debrief actions precede course coverage and journal statistics |
| Personal identity | No place to personalize the journal | Optional profile in Settings; autosaved name, callsign and current focus; explicit saved/failure state; full JSON backup includes it |
| Appearance | Bright cyan, photo and glow were the only dark presentation | Additional `לילה שקט` theme: charcoal, muted sage, softer status colors, no photo or glow; original dark and light choices retained; visual theme previews |
| Shared typography | Small utility text and decorative motion competed with reading | Larger supporting text, stronger muted-text contrast, consistent headings and less motion/glow; reduced-motion preference honored |
| Navigation | Some icons had no accessible label; child screens lacked a selected tab; log selection shared space with tabs | Labeled icon actions, skip-to-content link, parent-tab selection, dedicated selection toolbar space |
| Brief and debrief | Workflow context was weak; small suggestion/delete controls; dark native date controls lacked a color scheme | Two-stage context strip, larger controls, labeled row inputs, readable native controls and calmer save bar |
| Flight log | Filtering could leave an unexplained empty list | Active filter count and one-action reset; clearer page heading and Hebrew selection count |
| Flight detail | Date dominated the record | Subject is the main heading, with date, course and state below it; goal verdicts have accessible names |
| Trends | Chart relied on bar height; enlarged text could widen the page | Visible counts and week dates, accessible week descriptions, constrained chart columns and clearer heading |
| Syllabus | Every flight header rendered into a very long page | Collapsible section index with completed/total counts; searching reveals matching sections and exercises; clearing search restores section state |
| Settings | Full question editor dominated routine settings | Profile and appearance first; backup/course/tools grouped; question editor collapsed while preserving all edit/reorder/archive actions |
| Notebook | Must retain the accepted minimal cockpit redesign | Shared themes and typography applied to list, folder drawer and ruled editor; no new toolbar or storage format |
| Progress and sharing | Theme-specific hardcoded colors in exported image | Progress presentation and share image use the selected theme; profile identity appears locally and is not automatically added to shared output |
| Summary, feedback, recovery, release notes | Inconsistent secondary-screen density | Shared heading, spacing, control and panel refinements; release notes include personalization and the quiet theme |
| Sign-in, course picker and PIN | Must remain readable under the new theme | Inspected in calm mode at 320px with enlarged text; existing access behavior retained |

No official ranks, earned wings, course event dates or qualification claims were invented. Course progress still means recorded syllabus coverage, and journal totals are labeled separately from active-course coverage.

## Data preservation

SCHEMA remains **4**. MIG **5** only adds an empty optional `pilotProfile`; it does not rebuild questions or rewrite flights, goals, drafts or notebook data. Existing theme selections remain selected. Full backup/restore includes the profile and quiet-theme preference; normal merging into a populated installation retains existing preferences unless the user selects preference restoration. Malformed profile imports are rejected before mutation.

Profile writes use the existing durable settings path. Navigation flushes pending edits; a failed write leaves text visible and blocks leaving the editor. No profile values are automatically attached to feedback or progress sharing.

## Verification

- Full tracked suite: **412 checks across 15 suites**, including 37 frontend checks and the existing preservation, update, backup, notebook and failure-injection suites.
- Main-screen matrix: **16 screens × 3 themes × 3 viewport/text configurations**. Widths 320px and 390px at normal text, plus 360px at 150% root text size. No document-level horizontal overflow or unnamed visible button/link was found in these fixtures.
- Principal foreground/accent text tokens meet 4.5:1 against the page background in all three themes. This is a token check, not a complete accessibility certification of every color combination.
- Browser checks cover profile autosave/reload/failure, unchanged flight data, theme persistence/system appearance changes, skip-link focus, filter reset, section search and calm share-image background.
- Extra narrow checks: sign-in, course picker and PIN at 320×640 with 150% text. Screenshots inspected alongside the main-screen screenshots.
- Older migration suites rerun: **20 older-upgrade checks and 31 pre-course-upgrade checks passed**, in addition to the tracked v22 upgrade/rollback suite.
- Release manifest verifies **22 shell files**. Automated browser tests use disposable profiles and synthetic records; real Formspree submissions are blocked. No cadet data or production deployment was touched.

Evidence directory: `C:\Dev\artifacts\sortie-v23`. Full log: `frontend-audit-tests.log`; older migrations: `frontend-legacy-upgrade.log`, `frontend-course-upgrade.log`; screenshots: `frontend-*.png`. Before-state measurements and screenshots use `frontend-audit-before.json` and `audit-before-*.png`.

One repeated full run timed out waiting for the page to reload after explicit worker activation. No runtime exception was reported. Four subsequent isolated update runs and the final full suite passed; this does not establish the cause or prove it fixed. The failure log is retained as `frontend-update-timeout.log`, with rechecks in `frontend-update-recheck.log` and `frontend-update-repeat.log`. The update test now captures document, worker, draft and screenshot diagnostics on failure. Keep this on the release review list.

## Remaining acceptance

Yish's visual acceptance and actual Galaxy S24 / installed iPhone testing remain necessary, especially Hebrew keyboards, native date/dialog behavior, safe areas, drag edge-scrolling and native sharing. Automated dimensions do not prove thumb comfort or Safari behavior. The original syllabus content questions and real milestone details remain open. Final stable release wording, provider quota/domain review and deployment authorization are tracked in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
