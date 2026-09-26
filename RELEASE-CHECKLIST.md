# v23 candidate release checklist

Updated 2026-09-26. Branch `release/next-update`, baseline `005e762`, local build `v23-preview`. No production push or deployment.

## Implemented and verified locally

- [x] Stable form IDs and in-flight Save guard; 120-minute values retained; brief edits retain debrief notes.
- [x] Durable-save outcomes, visible recovery export on failure, retained drafts and all Add-field buffers.
- [x] Stale-record conflicts, retained historical question definitions, safe type changes/reset, archived-question access.
- [x] Versioned full backup/restore with preview, notebook/milestones/feedback drafts, private-data exclusions, question-type conflict handling, recovery snapshot and interrupted-write journal.
- [x] Recoverable flight/note deletion, separate JSON backup reminder, damaged-source quarantine/raw recovery download.
- [x] Goal provenance, first-debrief scope, old-flight resave protections, course/category separation and advanced alias precedence.
- [x] Recovered missed-goal linkage; edited suggested goals protected; zero-exercise recommendations; past-subject and searchable-picker paths.
- [x] Course-aware catalogue progress, unassigned-history distinction, stable selected identities, personal milestones, catalogue-derived solo/night markers and image/text sharing preview.
- [x] One-click notebook access, ruled pages, folders, priorities, pinning/search, autosave, local conflict-copy recovery, full backup and individual page download.
- [x] Mobile notebook: compact cover, reachable folder picker/create action, 48px controls, scalable text, save status above writing and full editor space. Verified long folders, touch creation and saving on Back without changing storage formats.
- [x] Completed-only weekly selection, planned/documented exercise wording, clean plain text, short/full summaries, log/trend filters and goal history.
- [x] All answer-history questions, retained first-run dismissal, optional brief sections, separated destructive settings, touch/focus improvements and truthful Hebrew privacy/save copy.
- [x] Verified network-first release manifest, complete-install requirement, previous/unrelated cache retention, HTTP-error/mixed-version fallback and safe update coordination during editing.
- [x] Feedback UI with retained/offline draft, optional disclosed diagnostics, disabled duplicate clicks and honest uncertain-delivery state; tested against loopback mock only.
- [x] Stable-version What's New appears after auth/PIN at Home, acknowledges once and remains in Settings. Preview acknowledgment is separate.
- [x] Private access-maintenance CLI defaults to preview, validates hashes/course mapping and never pushes. Synthetic test only; real allowlist unchanged.
- [x] README and HANDOFF rewritten to current behavior. Local private roster/dev files remain ignored.

## Evidence

`node tools/build-release.cjs` and `node tools/test.cjs` passed **348 checks across 14 suites**, plus manifest/script/string/access-mapping validation.

| Suite | Checks |
|---|---:|
| Original store regression, updated for intentional behavior | 64 |
| Syllabus matching | 31 |
| ראשוני internal catalogue verifier | 35 |
| מתקדם internal catalogue verifier | 59 |
| Preservation / backup / conflicts / journal | 26 |
| Storage abort, deadline, failed quarantine | 3 |
| Worker asset/fallback/ownership fault cases | 31 |
| Private access tool | 4 |
| Real Chrome v22 upgrade and rollback | 11 |
| Browser screen and data flows | 26 |
| Real worker interruption, activation and offline relaunch | 10 |
| Local mock feedback and release announcement | 10 |
| Buffers, storage failure, conflicts, filters, 360px enlarged text | 22 |
| Notebook touch/navigation, long folders, 320-412px and enlarged text | 16 |

Latest log: `C:\Dev\artifacts\sortie-v23\mobile-tests.log` (previous full run: `final-tests.log`). Screenshots are in the same directory, including `mobile-notebook-*.png`. Actual loopback preview was inspected through the sidebar browser. Chrome runtime errors were checked by the browser suites; screenshot and short viewport inspection are not real-phone/keyboard acceptance.

The 12 private legacy suites were rerun too. The retained store suite has four intentional expectation changes: MIG 4; explicitly carry/achieve a goal before expecting settlement (two assertions); retain orphan drafts. Its tracked replacement passes all 64 checks. The other legacy suites passed, including the 31-check pre-course upgrade and 20-check older upgrade. Original logs remain available; the catalogue verifiers retain 3/7 source-content notes.

## Required before deployment

- [ ] Yish signs into/creates his own Formspree account and verifies the intended receiving address. Create the form, configure the public endpoint in `js/feedback-config.js`, review provider-side spam controls, and run an explicitly authorized real submission/receipt test. No real delivery has occurred.
- [ ] Yish reviews the local candidate. No UI acceptance has been assumed from automated checks.
- [ ] Test candidate on Galaxy S24 Chrome and installed iPhone Safari: Hebrew input, date/dialogs, safe areas, drag/edge scroll, offline opening/update, JSON recovery, native file/image sharing and opening summary in Google Docs.
- [ ] Confirm course completion basis and real milestone/event names/dates with Evyatar. Current progress is recorded syllabus coverage, with personal milestones; it does not claim official qualification/completion.
- [ ] Reconcile the original PDF uncertainties before making catalogue corrections. AW 2, the reconstructed solo entry, הקפות coverage and empty-exercise entries remain content questions. The catalogue data was not changed in this candidate.
- [ ] Decide with cadets whether extra not-assessed/not-performed controls are useful. They were conditional in the proposal; no speculative grading step was added.
- [ ] Set matching stable BUILD/VERSION, finalize accurate Hebrew release copy, regenerate manifest, rerun full checks and obtain Yish's deployment authorization.

Do not reinstall an existing cadet app to receive this update. Export a JSON backup before any deliberate reinstall. No local-only system can guarantee preservation after OS eviction, device loss or manual site-data deletion.
