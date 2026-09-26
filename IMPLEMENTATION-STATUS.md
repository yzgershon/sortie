# v23 implementation status

Reviewed 2026-09-26 against the original September 25 audit/proposal, current source and local checks. Branch: `release/next-update`. Build: `v23-preview`. Nothing has been deployed from this branch.

The 29 confirmed audit findings have corresponding fixes in the local candidate. The requested notebook, course journey/sharing, feedback and release announcement are implemented. This does **not** mean every optional idea or every release acceptance step is complete.

## Confirmed audit register

All rows below are implemented locally. The evidence column identifies regression coverage; it does not claim testing on a cadet's phone or every possible failure sequence.

| ID | Result | Evidence in `tests/` |
|---|---|---|
| D01 | Versioned full JSON backup includes definitions, shelf, preferences, drafts and new workspace data | preservation, upgrade |
| D02 | Failed durable saves report failure and preserve visible work | preservation, storage-faults, usability |
| D03 | Stale record/draft edits are detected, with recovery choices | preservation; form conflict handling in `js/app.js` |
| D04 | Rapid Save clicks use one record identity and an in-flight guard | browser |
| D05 | Direct duration entry retains 120-minute records | browser, upgrade |
| D06 | Brief-route edits retain existing exercise debrief notes | browser |
| D07 | Retyping a question creates a new definition; historical shapes remain readable | preservation |
| D08 | Reset retains archived custom definitions and searchable answers | preservation |
| D09 | Imports validate before mutation and retain recovery material | preservation, storage-faults |
| D10 | Malformed mirror data is retained for recovery rather than silently discarded | preservation, storage-faults |
| D11 | Pending goal, exercise and main-point Add-field text survives navigation | browser, usability |
| D12 | CSV/document exports no longer reset the full JSON backup reminder | separate backup path in `js/app.js` and `js/store.js` |
| G01 | First debrief settles received goals without clearing a newer flight's shelf | preservation |
| G02 | Identical goal wording in another category does not suppress an old-flight edit | preservation |
| G03 | Historical classification and waiting goals respect course context | preservation, test-store |
| G04 | Other-course flights cannot earn progress in the active course | browser |
| G05 | Specific advanced phrases take precedence over overlapping aliases | preservation, catalogue verifiers |
| G06 | Recovered missed-goal links allow achievement to remove only the generated next-goal row | browser |
| G07 | Candidate replacement detects and preserves edited recommended goals | browser |
| G08 | Recommended goals load even when an entry has no exercises | browser |
| G09 | Past-subject suggestions run the normal syllabus/goal fill behavior | browser |
| U01 | A failed shell install keeps the previous release | worker (each manifest asset), update-browser (real browser interruption) |
| U02 | HTTP failures and mixed assets fall back to verified cached files | worker, update-browser |
| U03 | Activation preserves unrelated caches and a previous Sortie release | worker |
| R01 | This Week replaces old summary selection | browser |
| R02 | Instructor reports use completed flights, distinguish planned/documented exercises, preserve custom/history answers and count recurring goals by distinct flights | browser, summary; read-only `js/summary.js` |
| R03 | Plain summary copy omits document CSS | browser |
| R04 | Answer history exposes all eligible questions | browser |
| R05 | First-run dismissal survives reload | preservation, upgrade |

## Features and usability

| Area | Current candidate |
|---|---|
| Notebook | One-tap access from the top bar; folders, priorities, pinning, search, autosave, page download, conflict-copy recovery and full JSON backup. Updated to the shared cockpit palette, a collapsible RTL folder sidebar and one expandable page-options menu. Storage format unchanged by this redesign. |
| Course journey | Course-specific recorded syllabus coverage, section progress, catalogue solo/night markers, personal milestones and a polished image/text sharing preview. No public progress website or cross-device sync. |
| Feedback | In-app form, retained offline draft, optional disclosed diagnostics and Formspree delivery. A real local-preview test reached the provider and Yish confirmed email receipt. No flights or notebook pages are attached automatically. |
| What's New | Hebrew grouped highlights, once per stable version after sign-in/PIN at Home, plus Settings access. Preview builds do not consume the stable release acknowledgment. |
| Recovery | Full backup, validated merge/import, deleted-item restoration, retained drafts and archived questions. Local recovery snapshots supplement exported backups. |
| Daily screens | Home shortcut to an unfinished new brief, searchable flight picker, optional brief sections, filters, goal history, short/full summaries, keyboard exercise reordering, larger controls and clearer save/privacy wording. |
| Instructor report | Week/date/course controls and manual flight selection, contextual goal recurrence/later achievement, next-flight goals, safety and custom answers, optional name/callsign, exact sandboxed preview, document/rich-text export and browser Print/Save as PDF. No saved-record mutation. |
| Original artwork | Three locally served aviation images across Home, notebook, progress, syllabus and other overview headers; about 300 KB total, cached offline, subdued per theme. Forms and notebook writing remain clear. See `assets/ARTWORK.md`. |
| Personalization and frontend | Optional local name/callsign/focus with full backup; personal Home prioritizes unfinished work and course coverage. Quiet charcoal/sage dark theme, consistent headings and touch controls, collapsible syllabus sections/question editor, filter reset, readable chart and theme-aware share image. See `FRONTEND-AUDIT.md`. |
| Maintenance | Reproducible tracked checks, release manifest, updated docs and a private local access-maintenance CLI. There is no in-app administrator dashboard. |

## Not finished or deliberately conditional

- **Real-device acceptance:** Galaxy S24 Chrome and installed iPhone Safari still need testing for keyboard/date/dialog behavior, safe areas, drag/edge scrolling, offline upgrades, restore, native sharing and Google Docs import. Chrome emulation is not this evidence.
- **Update-test reliability:** One repeated browser suite run timed out after explicit worker activation. Four isolated reruns and the final full suite passed; no cause or product fix is established. Failure diagnostics and evidence are retained for release review.
- **Course content:** Evyatar still needs to supply actual milestone/event names, dates and completion rules. The app currently reports recorded syllabus coverage, not official qualification or guaranteed course completion. Original PDF uncertainties remain unreconciled; catalogue contents were not guessed or changed.
- **Optional product decisions:** Extra not-assessed/not-performed grading states were conditional suggestions and have not been added. Cadet feedback should determine whether those distinctions help.
- **Feedback delivery limits:** Double clicks are prevented and retries retain a submission ID. Exactly-once delivery after a network timeout is not guaranteed by the current integration; the UI explains that a timed-out message may already have arrived. Provider quota/domain settings and production-origin delivery need release review.
- **Release:** Yish's design acceptance, final stable version/release copy and deployment authorization remain outstanding. The current branch is a local preview.

## Verification

`node tools/build-release.cjs` and `node tools/test.cjs`: **456 checks across 16 suites**, plus release manifest/script/string/access-mapping validation (27 shell files). This includes 39 instructor report checks, 40 notebook checks at 320–412px, light/dark themes, enlarged text, touch and keyboard sidebar use, and preservation when renaming/removing folders, navigating, pinning and deleting pages. The 37 frontend checks add all three themes across 16 screens, profile migration/backup/save-failure checks, enlarged text, access screens, filtering, section search and sharing. The older 20-check and pre-course 31-check upgrade suites were also rerun after MIG 5; this report/artwork change adds no migration.

Latest local evidence: `C:\Dev\artifacts\sortie-v23\instructor-report-tests.log`, `frontend-*.png`, `report-*.png` and `mobile-notebook-*.png`. Full deployment gates are in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). No test result promises protection against device loss, manual data deletion or OS storage eviction.
