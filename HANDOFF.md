# Sortie handoff

Updated 2026-09-25. Read this and the actual git status before editing. Preserve other agents' or Yish's work. User instructions take precedence over old agent briefings.

## Current state

- Workspace: `C:\Dev\sortie`; branch `release/next-update`; baseline `005e762` (v22).
- Local candidate: `v23-preview` in both app and worker. No production push/deployment was made during this work.
- Yish authorized the audit fixes, notebook, progress/sharing, feedback and release announcement. He selected on-device notebook storage with full backup and image/text sharing, not a public progress link.
- The new code is implemented locally and tested. The release is **not ready to deploy** until the service/device/content acceptance items in `RELEASE-CHECKLIST.md` are addressed.
- Local preview: `node tools/preview.cjs`, `http://127.0.0.1:8980/`. Auth is overridden in the local server response, never in the production file. A clearly labeled example notebook page was created in that preview only.
- Feedback recipient is already established with Yish. The Formspree endpoint remains empty. Registration is open in the workspace sidebar and a question is pending for Yish to sign in/create and verify his own account. No account, endpoint or real delivery has been claimed; no email was sent.

## People and settled constraints

Yish builds the app for his brother Evyatar (ראשוני). Yish uses Samsung Galaxy S24 / Chrome; Evyatar uses an installed iPhone Safari PWA. The source allowlist currently has 36 accounts; Yish reports 50+ users. These are different facts, not a measured usage count.

- Static PWA, plain globals, no framework or bundler, no analytics or flight cloud sync.
- Hebrew RTL UI strings belong in `js/strings.js`. Preserve supplied course wording. Avoid em dashes in UI copy.
- Keep the near-black cockpit design, cyan data, amber waiting states, monospaced readouts and cut corners. The notebook deliberately uses a ruled paper surface and binding.
- Do not push without Yish's authorization: main deploys GitHub Pages to real cadets.
- Commit with configured `yzgershon` identity, no identity overrides or co-author trailer.
- Never put raw emails or private `dev/` contents in tracked files. The public repository/syllabus and client-side gate were an informed choice.

## Data invariants

Settings SCHEMA remains **4**. Candidate MIG is **4**, an additive migration. Never bump SCHEMA to introduce a feature: it resets customized questions. Preserve question IDs, definitions, order, roles and archived history.

Flights remain `{id, flownAt, stage, answers, createdAt, updatedAt, course}` with additional optional catalogue identity. `brief` and `done` are stages of the same record. A course is stamped on first save; historical null courses remain null. Unknown-course text tags use both vocabularies independent of the active setting, but they never earn course-progress credit.

IndexedDB `sortie/sorties` and `sortie:mirror` merge by ID and newest timestamp. Never select one wholesale; normalization never invents an updated timestamp at load. Deletes create recoverable tombstones. Active record edits include a base timestamp to reject stale writes.

`sortie:settings` holds definitions/preferences/goal shelf. `sortie:workspace` holds schema 1 notes/folders/milestones, using per-row timestamps and soft deletes. Notes read the latest stored workspace before writing and reject stale edits; the editor offers a separate copy on conflict.

Drafts remain under `sortie:draft:new`, `sortie:draft:b:<id>`, `sortie:draft:d:<id>`, plus the old single-slot key. They include pending Add-field text and goal provenance. They no longer expire or disappear as orphans. Form flush handlers are registered once through `formFlush`; flush on navigation/pagehide/visibility change.

Coordinated local operations use `sortie:transaction` with before/after values and a replay state. Startup completes a durable intent or rollback before loading settings. `sortie:recovery`, `sortie:pre-v23`, last-good settings and damaged-source copies preserve recovery material. A local snapshot is not an off-device backup. Failed storage must not announce success or clear the visible form.

Full backup format is `backupVersion: 1`; includes flights, definitions, waiting goals, drafts/buffers, non-sensitive preferences, notebook/folders, milestones, feedback draft and deleted items. Standard backup excludes auth/PIN. CSV/doc exports do not update `lastBackup`. Raw recovery downloads are for manual inspection, exclude Google session keys, and may contain PIN hash metadata; keep private.

Import validates before mutation, previews additions/updates, snapshots the old state and merges with newer-record precedence. Conflicting question types get separate deterministic imported IDs so existing answers retain their representation. Importing into a populated profile retains unrelated shelf/workspace records. Do not promise a raw recovery download is a normal import file.

First debrief settles only goals actually received and graded. Never clear every currently matching shelf goal. Keep course/category/origin/source identity, and preserve later settlements when resaving older flights. Recovered missed-goal rows retain their linkage; changing the grade removes only their generated next-flight row.

## Courses and matching

`js/courses.js` is the course registry: ראשוני `rishoni` has 125 entries; מתקדם `mitkadem` has 147. Separate catalogue and category aliases have different directions. Never substitute course aliases for syllabus matching. Whole-token matching must distinguish AW 3 from AW 30 and support Hebrew gershayim, keyboard variants and unique shortened names.

Advanced entries can have recommended goals without exercises. Fill independently. Air/simulator names can collide; retain alternatives and protect edited suggested goals when changing a selection. Stable selected catalogue identity is cleared when the subject no longer matches. Progress excludes other/unknown courses and unresolved ambiguous text-only records.

Category matching gives a longer explicit advanced phrase precedence over an overlapping generic alias. Preserve legitimate multi-category ראשוני subjects. Bare category names do not trigger fill. Root syllabus verifiers must pass after catalogue/matcher edits.

The private advanced parser pipeline remains `node dev/mit-parse.js <PDF> --json dev/mit-raw.json`, `node dev/mit-build.js`, `node tests/verify-mitkadem.cjs`. Read each page's own table headers; fixed columns once omitted entire sections. Do not regenerate from guessed content.

## Authentication and updates

The Google gate is enabled in production configuration and was reported verified on Android and installed iOS in earlier work. Claims are checked; token signatures are not cryptographically verified. It is an access curtain, not protection for public static files. Sessions slide on use and permit offline expiry grace for still-allowed hashes. Keep the exact pinned redirect `https://yzgershon.github.io/sortie/index.html` unless coordinated with Google Cloud configuration.

For a behavior release, update app BUILD and worker VERSION together, then run `node tools/build-release.cjs`. The manifest is mandatory. The worker verifies all shell hashes before install; network-first requests accept only the matching release, otherwise use verified cached assets. Retain the previous Sortie shell and unrelated caches. Auth config is exempt from hash pinning for access-only updates.

A waiting worker is activated at a safe point, or by an explicit Update action after draft flush. A controller change from another tab must not force an active editor to reload. Real-Chrome tests cover an interrupted download, offline recovery, waiting while editing, explicit activation and retained drafts/notebook.

Stable releases show What's New once at Home after auth/PIN. Preview builds suppress automatic announcements and do not consume the real acknowledgment. Feedback is currently draft-only; service activation/delivery and provider-side spam settings remain outstanding. A timeout cannot prove non-delivery; retry copy says so.

## Verification and maintenance

Run `node tools/build-release.cjs` then `node tools/test.cjs`. The tracked suite uses synthetic data, disposable browser profiles, real Chrome/IndexedDB and local-only mock feedback. It includes the retained store/matcher/catalogue regression checks plus preservation, storage failures, v22 upgrade/rollback, screen interactions, worker fault cases, real updates, feedback/release behavior and narrow-screen enlarged-text checks. `--unit` skips browser suites.

The private legacy suites were also rerun. All passed except four obsolete `test-store.js` expectations; the tracked copy updates MIG 4, explicit carried-and-achieved goal setup, and retained orphan drafts. Their original logs remain for comparison. The pre-course upgrade test passes 31 checks; older upgrade passes 20. No real-device acceptance is implied by Chrome emulation.

Evidence: `C:\Dev\artifacts\sortie-v23\final-tests.log` and screenshots; original audit/report/probes under `C:\Dev\artifacts\sortie-review-2026-09-25`. The public tracked tests are Node files, not seed HTML. Never run `dev/serve-test.js` or `dev/shots.js` against the live origin.

Live traps: wrap `.map(flightRow)`; map's second argument is selectable. Use pointer events and `touch-action: none` for dragging. Keep LF and never insert control characters. Export new Store APIs at the bottom. Gate install prompts from rendering behind authentication. Browser tests must wait for an actual new document, disable the worker in migration-only suites, avoid virtual-time-budget, and wait for entrance animations before screenshots. New tests use CDP device metrics for phone-size rendering.

## Remaining acceptance work

- Connect and verify feedback delivery using Yish's own Formspree account. No provider credential belongs in source; only its public form endpoint.
- Review candidate on the real S24 and installed iPhone: drag/edge scroll, Hebrew keyboard/date/dialogs, safe areas, offline update and recovery, file/image sharing, and summary opening in Google Docs.
- Ask Evyatar for actual course milestone/event names, dates and completion rules. Current milestones are personal and syllabus coverage is explicitly an estimate of recorded catalogue coverage.
- Reconcile the source PDF doubts: reconstructed AW 2 and סולו משולבת 2, missing הקפות section, and catalogue entries with no exercises. Internal verifier success is not PDF reconciliation.
- No new not-assessed/not-performed grading controls were imposed; these were conditional on cadet feedback in the proposal. Summary wording now distinguishes plans from debrief notes without inferring performance.
- Final stable version, accurate release notes and deployment only after Yish accepts the candidate.
