# Instructor sharing

Local candidate: v24-preview on feature/instructor-cloud, based on 81f3dfa (v23). Cloud integration is disabled until configuration and real sign-in are verified. The user authorized a separate Sortie Firebase project and saved training records only.

## Scope and preservation

Share saved briefs/debriefs, their answers, course/catalogue identity and the question definitions required to render historical/custom answers. Never send notebooks, draft forms or pending Add-field buffers, personal profile/focus, waiting goal shelf, PIN, feedback drafts or Google session data. Hours are derived from saved debrief answers, not the personal hours correction.

IndexedDB, local mirrors, full JSON backup, SCHEMA=4 and MIG=5 are unchanged. Nothing read from Firebase is written into Store. This is one-way instructor sharing, not multi-device editing or complete cloud backup. Keep the existing app URL; do not ask cadets to reinstall.

A cadet connects Google and explicitly binds existing saved records to that verified account once. The local binding cannot silently switch accounts. An instructor never uploads their local test flights. Cloud identity/acknowledgments are excluded from transferable full backups.

Durable saved records plus per-account acknowledgments are the resumable outbox. Uploads retry on saved-record changes/reconnection and once per minute while visible. Cloud failures never block local saving. A damaged journal, quota failure or account mismatch is reported without resetting data. Deletions are soft-deleted revisions, sent only for already-uploaded records; old local trash is excluded from initial migration.

## Architecture

- js/cloud-core.js: allowlisted projection, canonical payload/hash, resumable per-account acknowledgment, conflict detection.
- js/cloud.js: Firebase session/enrollment coordination, account binding, retry/status. No Store writes.
- tools/firebase-adapter.mjs: actual Firebase SDK adapter; npm run build:cloud produces self-hosted js/firebase-adapter.js with pinned SDK 12.19.0. The release manifest caches this bundle. GitHub Pages still serves plain static files.
- js/auth.js: retains the full-page Google OpenID redirect, nonce and pinned return URL. Exchanges the returned token for a Firebase session without saving the Google token. A 15-second cloud bridge deadline avoids blocking local startup. No popup or cross-domain Firebase redirect handler is introduced.
- js/instructor.js: read-only roster, individual flights, date/course/stage/search filters, deleted/history views, syllabus coverage, instructor report preview and download. Remote data never replaces the instructor's local Store. Summary accepts a read-only per-record question provider for custom/history fields.

## Firestore access model

    access/{uid}                         {active, role: cadet|instructor}
    cadets/{uid}                         {instructorId, course, name, email, lastSyncAt}
    cadets/{uid}/flights/{sha256(id)}     {payload, digest, receivedAt}
    .../revisions/{sha256(payload)}      {payload, digest, receivedAt}

Payload is canonical JSON {schema:1, record, questions, deletedAt}; strings preserve existing answer shapes and are exempted from indexing. Server enrollment, not the payload's course/instructor answer, determines access.

Only the Admin SDK provisions membership, names and assignments. Rules require a verified Google identity plus active enrollment. Cadets access their own flights. Instructors only read assigned cadets. Clients cannot self-enroll, promote themselves, reassign instructors, enumerate cadets, delete flight documents or modify prior revisions. No notebook/draft paths are allowed.

Each adapter transaction retains an immutable revision before advancing the current record. A stale device cannot overwrite another current digest. Both competing revisions stay available; cadets see a conflict status and instructors can inspect history. Automatic conflict overwrites and instructor editing are deliberately absent. Manual conflict reconciliation/restore tooling remains a follow-up.

Revision history is not an independent backup against deletion of the project or privileged administrator actions. Keep JSON exports and decide on independent cloud backup before rollout.

## Cloud setup and rollout

The old Google OAuth client named Sortie belongs to Google Cloud project aios-498412, number 790989398891. User chose a separate Sortie project; leave AIOS and its live OAuth client untouched.

1. Create the separate Firebase project and register a web app without analytics. Do not move hosting. Review database location and plan before creation; no paid upgrade is authorized.
2. Enable Google Authentication. Configure the new Google OAuth web client with the existing authorized redirect URI https://yzgershon.github.io/sortie/index.html. Put the public client ID in CLOUD_CONFIG.googleClientId and the public web config in CLOUD_CONFIG.firebase. Verify real Firebase acceptance of that Google credential. Keep enabled:false until ready.
3. Create Firestore with deny-by-default rules; deploy firestore.rules and firestore.indexes.json to the explicitly named new project before any pilot.
4. Prepare ignored dev/cloud-roster.json: instructor:{email,name}, cadets:[{email,name,course}]. Review real cadets versus family/test accounts. Never commit raw real emails or credentials.
5. Authenticate a trusted operator with Application Default Credentials. node tools/provision-cloud.cjs --project PROJECT --roster dev/cloud-roster.json previews counts without cloud calls; --apply creates/reuses Auth users and enrollment without touching flight data. Existing instructor reassignment is refused. Removing a hash from the old client allowlist does not revoke cloud access: also set access/{uid}.active=false.
6. Test a small pilot on Android Chrome and installed iPhone Safari: real Google flow, initial-history count/retry, offline save/reconnect, account mismatch, JSON exports before/after, report accuracy and assigned-instructor access. Emulator success does not prove production OAuth settings or real-device behavior.
7. Prepare accurate Hebrew release notes, update app/worker together, rebuild the release manifest, then obtain final live deployment authorization. No production app push is authorized yet.

## Tests and preview

    npm ci
    npm run build:cloud
    node tools/build-release.cjs
    node tools/test.cjs
    npm run test:rules
    node tools/preview-instructor.cjs

The preview http://127.0.0.1:8984/#/instructor uses labeled synthetic records and a mock read-only adapter. Firebase and feedback delivery are disabled. It is not a live instructor account. Ordinary local preview remains tools/preview.cjs on 8980.

New checks: cloud.cjs (24), cloud-auth.cjs (9), cloud-browser.cjs (24), cloud-rules.cjs (28), cloud-adapter.cjs (11). The latter two use actual local Auth/Firestore emulators only, project demo-sortie, ports 9198/8188. The adapter test verifies that Google sign-in links to a pre-provisioned UID, immutable revisions, conflicts and server revocation.

CLI state is in ignored dev/firebase-cli; emulator downloads are in C:/Dev/.firebase-emulators. The runner cleans up its own child tree after shutdown because Windows Java sometimes survives the CLI's graceful SIGINT.

Logs: C:/Dev/artifacts/sortie-v23/cloud-verified-regression-20260927.log and cloud-emulators-20260927.log. All new checks passed. The reproduced release-tour redraw race was fixed by tracking replacement targets and invalidating stale placement callbacks. The 30 settings/release checks now include an install-prompt redraw while the tour is open and pass. Final full-suite evidence is cloud-ready-regression-20260927.log. Real phone acceptance and actual cloud-project sign-in remain pending.

## Current external setup checkpoint

The separate-project wizard was opened with project name Sortie and suggested ID sortie-7900c, but Create project has not been submitted. Optional Gemini was switched off; the Analytics step remains open and its default switch has not yet been changed. No external Sortie project or database exists from this work yet.

The official Firebase CLI OAuth flow is open in the sidebar for the owner to review. Its scopes include Firebase and Google Cloud management, so the owner must complete that authorization directly. The CLI still reports no authorized accounts at this checkpoint. Local OAuth state lives only under ignored dev/. The Windows sandbox account began failing with error 1909; approved escalated commands were used for workspace-only writes/checks afterward.
