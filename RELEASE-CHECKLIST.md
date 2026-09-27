# v24 release checkpoint

Released on the user’s explicit instruction on 2026-09-27, app commit e9aa220. The subsequent steering required no announcement or separate connection step; both requirements are implemented.

- [x] Enrolled, verified Google sign-in automatically binds and syncs saved training records. Existing local sessions are not forcibly logged out.
- [x] No v24 release announcement, tour or linking confirmation. No messages were sent to cadets.
- [x] Saved flights, custom questions, notebooks, drafts, profile and goals preserved in a v23-to-v24 real-browser upgrade. Private data excluded from upload; wrong-account takeover refused; offline saved records retry automatically.
- [x] All 21 local suites and 39 Firebase rule/SDK emulator checks passed. Logs: v24-release-tests.log and v24-access-tests.log under C:/Dev/artifacts/sortie-v23. Two final neutral copy corrections were followed by manifest, worker and release-upgrade checks.
- [x] Pages build succeeded. All 35 live file hashes and exact worker matched v24; cloud enabled.
- [x] Existing production Google client and pinned callback verified with real owner sign-in. Firebase instructor access loaded 34 cadets; reopening restored the session.
- [x] Live rules equal checked-in rules; only owner enrolled as instructor and only human IAM principal; anonymous access denied.
- [ ] Real cadet/device upload counts have not yet been observed. Android and installed iPhone behavior remains real-device follow-up; do not infer it from Chrome/emulator tests.
- [ ] Independent managed cloud backups/PITR and broader cybersecurity hardening remain separate follow-up. No paid upgrade was performed.

See CLOUD-SETUP.md and HANDOFF.md for current details. The checklist below records the earlier frontend release.

## v23 release checklist

Updated 2026-09-26. Branch `release/next-update`, rebased on `origin/main` (`1b7c257`), build `v23`. Released to `main` on Yish's instruction on 2026-09-26.

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
- [x] Mobile notebook: shared cockpit palette, collapsible RTL folder sidebar, two main actions, one expandable page-options menu, 48px controls and full writing space. Verified long folders, both themes, enlarged text, touch/keyboard navigation and saving across folder changes/Back/pinning. Storage format unchanged.
- [x] Frontend audit: optional profile and personal focus, task-first Home, calm charcoal/sage theme, consistent typography and controls, filter reset, collapsible question editor and syllabus sections, theme-aware progress image and updated release notes. MIG 5 adds profile only; SCHEMA stays 4. See `FRONTEND-AUDIT.md`.
- [x] Completed-only weekly selection, planned/documented exercise wording, clean plain text, short/full summaries, log/trend filters and goal history.
- [x] Instructor report: week/date/course controls, contextual recurrence and later achievement, next-flight goals, custom/history answers, optional identity, exact preview, document/rich-text/print exports; 39 regression checks and A4 rendering.
- [x] Frontend redesign: one design system for all three themes, task-first Home, five-slot tab bar with a central brief action and the notebook, Hebrew-only labels, grouped flight record, 48px targets. No storage, schema, migration or save-flow change. See `FRONTEND-AUDIT.md`.
- [x] IAF visual layer: seeded mission charts, data-driven course route on Home/trends/progress/share image, sign-in radar scope, outline ring-and-star mark, `--iaf` blue and flag double-stripe accents, generated F-35I/F-16I/F-15I images with provenance in `assets/ARTWORK.md`. Read-only; no storage change.
- [x] Three original local aviation images across overview screens, with mobile crops and theme treatment; about 300 KB total, covered by the offline manifest. Prompts and provenance recorded in `assets/ARTWORK.md`.
- [x] All answer-history questions, retained first-run dismissal, optional brief sections, separated destructive settings, touch/focus improvements and truthful Hebrew privacy/save copy.
- [x] Verified network-first release manifest, complete-install requirement, previous/unrelated cache retention, HTTP-error/mixed-version fallback and safe update coordination during editing.
- [x] Feedback UI with retained/offline draft, optional disclosed diagnostics, disabled duplicate clicks and honest uncertain-delivery state; automated checks use loopback mocks. Real Formspree submission and owner-confirmed email receipt verified on 2026-09-26.
- [x] NexBank design system (UI UX Pro Max "Digital Banking"), Home stats on the first screen, read-only `js/motion.js` animations with a setting and reduced-motion support. No storage change. See `FRONTEND-AUDIT.md`.
- [x] Flight hours: Home totals every debriefed minute under any minutes question, archived ones included; a v22 profile shows its hours after upgrade (real-Chrome upgrade test). A manual total in הגדרות is stored as an additive `hoursAdjust` correction, never written into a flight.
- [x] More in הגדרות: animation level (auto/full/reduced/off), vibration, and which Home sections show. All are optional preferences, validated, carried by a full backup and skipped on restore if a later version wrote a value this one does not know. SCHEMA 4 and MIG 5 unchanged.
- [x] Stable-version update message appears after auth/PIN at Home, only for people with saved work (a first-time user is marked as seen quietly). It offers a guided spotlight tour of the new Home (`js/tour.js`), acknowledges once, and the tour stays available from מה חדש. Preview acknowledgment is separate.
- [x] Private access-maintenance CLI defaults to preview, validates hashes/course mapping and never pushes. Synthetic test only; real allowlist unchanged.
- [x] README and HANDOFF rewritten to current behavior. Local private roster/dev files remain ignored.

## Evidence

`node tools/build-release.cjs` and `node tools/test.cjs` passed **490 checks across 17 suites**, plus manifest/script/string/access-mapping validation (30 shell files). Latest log: `C:\Dev\artifacts\sortie-redesign\release-tests.log`. A dry run on a throwaway copy with the version set to `v23`/`sortie-v23` also passed all 17 suites (`C:\Dev\artifacts\sortie-redesign\release-dryrun-tests.log`); the working tree keeps `v23-preview`.

| Suite | Checks |
|---|---:|
| Original store regression, updated for intentional behavior | 64 |
| Syllabus matching | 31 |
| ראשוני internal catalogue verifier | 35 |
| מתקדם internal catalogue verifier | 59 |
| Preservation / backup / conflicts / journal | 27 |
| Storage abort, deadline, failed quarantine | 3 |
| Worker asset/fallback/ownership fault cases | 40 |
| Private access tool | 4 |
| Real Chrome v22 upgrade and rollback, including hours from v22 minutes | 12 |
| Browser screen and data flows | 26 |
| Real worker interruption, activation and offline relaunch | 10 |
| Local mock feedback, live-endpoint isolation and release announcement | 12 |
| Flight hours and correction, display preferences, backup/restore of them, course end date, update message and tour | 29 |
| Buffers, storage failure, conflicts, filters, 360px enlarged text | 22 |
| Notebook sidebar, preservation, 320-412px, themes and enlarged text | 40 |
| Profile preservation/failure, 16-screen theme/size matrix, filters, sections, access screens and sharing | 37 |
| Instructor report aggregation, history/custom answers, identity, scope, preview/export/print, preservation and mobile layout | 39 |

Latest log: `C:\Dev\artifacts\sortie-v23\instructor-report-tests.log` (previous full runs: `frontend-audit-tests.log`, `notebook-sidebar-tests.log`, `feedback-connected-tests.log`, `mobile-tests.log`, `final-tests.log`). Screenshots are in the same directory, including `frontend-*.png`, `report-*.png` and `mobile-notebook-*.png`. Actual loopback preview was inspected through the sidebar browser; one labeled live feedback test was received in Formspree and confirmed by Yish in Gmail. Automated suites block real Formspree submission URLs. Chrome runtime errors were checked by the browser suites; screenshot and short viewport inspection are not real-phone/keyboard acceptance. A4 output was rendered through headless Chrome; the real native print dialog and Google Docs conversion remain device acceptance items.

The 12 private legacy suites were rerun too. The retained store suite has four intentional expectation changes: migration number (now MIG 5); explicitly carry/achieve a goal before expecting settlement (two assertions); retain orphan drafts. Its tracked replacement passes all 64 checks. The other legacy suites passed, including the 31-check pre-course upgrade and 20-check older upgrade, both rerun after MIG 5. Original logs remain available; the catalogue verifiers retain 3/7 source-content notes.

A finding-by-finding reconciliation with the original proposal is in [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md). Conditional ideas and feedback retry limitations are recorded there.

## Required before deployment

- [x] Owner's Formspree account/email verified, Sortie Feedback form created, public endpoint configured, provider settings reviewed. One synthetic test from the local candidate appeared in the Formspree inbox and Yish confirmed Gmail receipt. Formshield is on; CAPTCHA remains off by default. No paid upgrade or account-security change.
- [ ] Recheck provider quota (currently 50 submissions/month) and domain restriction when releasing. A restriction to `yzgershon.github.io` would filter local-preview submissions into spam; production-origin delivery still needs release verification.
- [x] Yish reviewed the candidate on the preview link and ran a real single-phone update from v22 on `sortie-next`; the saved data carried over.
- [ ] Test candidate on Galaxy S24 Chrome and installed iPhone Safari: Hebrew input, date/dialogs, safe areas, drag/edge scroll, offline opening/update, JSON recovery, native file/image sharing and opening summary in Google Docs.
- [ ] Review the intermittent explicit-update reload timeout seen in one repeated browser suite run. Four isolated reruns and the final full suite passed, but the cause is unconfirmed. Failure evidence is retained in `frontend-update-timeout.log`; the test now captures additional failure state. Include open-draft update activation in real-device acceptance.
- [x] ראשוני end date (2026-12-10) set in `js/courses.js`; progress, Home and the trends syllabus panel show it with a countdown, the גיחות not yet documented and the weekly pace that would cover them. מתקדם has `ends: null` until its date is announced, and then shows nothing.
- [ ] Set the מתקדם end date in `js/courses.js` when it is announced.
- [ ] Confirm course completion basis and real milestone/event names/dates with Evyatar. Current progress is recorded syllabus coverage, with personal milestones; it does not claim official qualification/completion.
- [ ] Reconcile the original PDF uncertainties before making catalogue corrections. AW 2, the reconstructed solo entry, הקפות coverage and empty-exercise entries remain content questions. The catalogue data was not changed in this candidate.
- [ ] Decide with cadets whether extra not-assessed/not-performed controls are useful. They were conditional in the proposal; no speculative grading step was added.
- [x] Set matching stable BUILD/VERSION (`v23` / `sortie-v23`), regenerated the manifest (30 files), reran the full checks (490 across 17 suites, log `C:\Dev\artifacts\sortie-redesign\v23-release-tests.log`) and received Yish's deployment instruction. Earlier note on the release-day steps: Release day, in order: `var BUILD = 'v23'` in `js/app.js` and `var VERSION = 'sortie-v23'` in `sw.js`; `node tools/build-release.cjs`; `node tools/test.cjs` (the tests read the version, so no test edits are needed); commit; push only on Yish's instruction. The update message then shows once to every cadet with saved work.

Production `main` moved to `1b7c257` on 2026-09-26: an access-only commit adding one test account (hash only, ראשוני). The working tree carries the identical `js/auth-config.js`, so build the release on top of `origin/main`, not the older `005e762`.

Single-phone update test: `https://yzgershon.github.io/sortie-next/` (public repo `yzgershon/sortie-next`, now commit `8e622cf`) serves this candidate as `v23-canary2`, with the course end date and badge. The test copy's worker only cleans up its own `sortie-v23-canary*` caches, so the live app's offline copy on the test phone is never removed. Same origin as the live app, so the test phone's saved data is what upgrades; nobody else receives it. Its cache (`sortie-v23-canary-shell`) and update notice are separate from the real release. After v23 ships, delete that repo (the test phone's worker unregisters when its script returns 404).

Do not reinstall an existing cadet app to receive this update. Export a JSON backup before any deliberate reinstall. No local-only system can guarantee preservation after OS eviction, device loss or manual site-data deletion.
