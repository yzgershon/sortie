# Instructor sharing

Local candidate: v24-preview on feature/instructor-cloud, based on 81f3dfa (v23). The backend is configured and real owner sign-in is verified. Cloud integration remains disabled in the cadet release candidate. The user has already authorized a separate Sortie Firebase project and sharing saved training records only; consent is settled. A one-cadet pilot means a technical check of the original Google flow and record preservation, not an additional consent or approval process. The current English dashboard work does not deploy the cadet app.

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
2. Google Authentication is enabled in the new project. Its external-client safelist contains the existing Sortie OAuth client, so CLOUD_CONFIG.googleClientId stays empty and production keeps its existing client and pinned redirect. Public Firebase config is populated, enabled:false. The new project's generated OAuth client is used only by the owner-only local test preview, with redirect http://localhost:8985/index.html. AIOS settings were not changed. Verify the original-client token exchange on a controlled cadet pilot before release.
3. Create Firestore with deny-by-default rules; deploy firestore.rules and firestore.indexes.json to the explicitly named new project before any pilot.
4. Prepare ignored dev/cloud-roster.json: instructor:{email,name}, cadets:[{email,name,course}]. Review real cadets versus family/test accounts. Never commit raw real emails or credentials.
5. Authenticate a trusted operator with Application Default Credentials. The local dev/with-cli-adc.cjs wrapper can reuse the explicitly authorized Firebase CLI session: it creates a temporary ignored authorized-user ADC file, runs the requested Node command, then removes the file. It creates no service-account key. node tools/provision-cloud.cjs --project PROJECT --roster dev/cloud-roster.json previews counts without cloud calls; --apply creates/reuses Auth users and enrollment without touching flight data. Existing instructor reassignment is refused. Removing a hash from the old client allowlist does not revoke cloud access: also set access/{uid}.active=false.
6. Test a small pilot on Android Chrome and installed iPhone Safari: real Google flow, initial-history count/retry, offline save/reconnect, account mismatch, JSON exports before/after, report accuracy and assigned-instructor access. Emulator success does not prove production OAuth settings or real-device behavior.
7. Prepare accurate Hebrew release notes, update app/worker together, rebuild the release manifest, deploy on the user’s instruction to push. Keep technical verification distinct from the already-confirmed sharing permission.

## Tests and preview

    npm ci
    npm run build:cloud
    node tools/build-release.cjs
    node tools/test.cjs
    npm run test:rules
    node tools/preview-instructor.cjs

The preview http://127.0.0.1:8984/#/instructor uses labeled synthetic records and a mock read-only adapter. Firebase and feedback delivery are disabled. It is not a live instructor account. Ordinary local preview remains tools/preview.cjs on 8980.

New checks: cloud.cjs (24), cloud-auth.cjs (9), cloud-browser.cjs (26), cloud-rules.cjs (28), cloud-adapter.cjs (11). The latter two use actual local Auth/Firestore emulators only, project demo-sortie, ports 9198/8188. The adapter test verifies that Google sign-in links to a pre-provisioned UID, immutable revisions, conflicts and server revocation.

CLI state is in ignored dev/firebase-cli; emulator downloads are in C:/Dev/.firebase-emulators. The runner cleans up its own child tree after shutdown because Windows Java sometimes survives the CLI's graceful SIGINT.

Logs: C:/Dev/artifacts/sortie-v23/cloud-verified-regression-20260927.log and cloud-emulators-20260927.log. All new checks passed. The reproduced release-tour redraw race was fixed by tracking replacement targets and invalidating stale placement callbacks. The 30 settings/release checks now include an install-prompt redraw while the tour is open and pass. Final full-suite evidence is cloud-ready-regression-20260927.log. Real phone acceptance remains pending; real owner cloud-project sign-in was subsequently verified as recorded below.

## Current external setup checkpoint (2026-09-27)

- Firebase project Sortie: sortie-7900c, number 959375176248. Current plan is Spark; no billing upgrade, Analytics link or Gemini service was enabled by this work.
- Web app: 1:959375176248:web:958e6f90af25de0e1eeccd. Its public configuration is in js/cloud-config.js, still enabled:false.
- Firestore default database: Standard / Native, me-west1 (Tel Aviv), freeTier:true, DELETE_PROTECTION_ENABLED. PITR and independent managed backups are not enabled. No Storage bucket or app hosting deployment was created by this work.
- Tested rules/indexes were deployed to this explicit project only. Readback of ruleset eb10b878-d2a6-4d84-b34c-8f0340b7437c matched firestore.rules byte-for-byte. A real unauthenticated read returned PERMISSION_DENIED.
- Google provider is enabled. The existing 790989398891-df36sea2it2rbupm466ae8tknsg28h31.apps.googleusercontent.com client appears in the external-client safelist after reopening the console, confirming persistence. Adding to this list saves immediately; the provider Save button remains disabled when no other setting changed. AIOS was not edited.
- Authorized Firebase domains: localhost, sortie-7900c.firebaseapp.com, sortie-7900c.web.app and yzgershon.github.io.
- Trusted enrollment completed: one instructor and 34 cadets (24 rishoni, 10 mitkadem), every assignment and email/course mapping checked against the private roster. The owner and two labeled test accounts were excluded from the cadet list. The backend contained zero saved flight documents after setup. No saved training records were read from devices or uploaded, and no messages were sent. Enrollment names, emails and course assignments were uploaded as authorized.
- The owner completed real Google identity/email consent. The actual production adapter exchanged the Google token, retained the pre-provisioned instructor UID and read all 34 assigned cadets under deployed Firestore rules in the local preview. Browser refresh restored the session and roster. This used the new project's generated OAuth client, not the original AIOS client or an installed phone.
- The public getProjects API rejected a clientId check for the external client despite its persisted safelist entry. This is not proof of a successful cross-project token exchange; that exact flow remains a pilot requirement. Do not silently switch production clients or change the pinned callback as a workaround.
- Owner-only real preview: node tools/preview-cloud.cjs --connect, http://localhost:8985/index.html#/instructor. Requires ignored dev/cloud-roster.json; serves only shell files, disables feedback and the worker, and seeds no records. It uses the new project's OAuth client 959375176248-j0qnr5gvd21uv0il5tc9un0u16tqvl4r.apps.googleusercontent.com and its authorized localhost callback. The synthetic preview remains on 8984.
- Live sign-in exposed a temporary false instructor-denied message during session restoration. Cloud.start now announces connecting and Instructor shows permission-check progress while pending. Two delayed-session checks were added; the full local suite now passes 555 checks in cloud-connected-regression-20260927.log. The previous 39 Auth/Firestore emulator checks remain applicable; no rules or adapter code changed in this setup turn.
- Local private verification output is dev/cloud-setup-verification.json. CLI credentials remain in ignored dev/firebase-cli; no temporary operator-adc directory remained after provisioning/verification. The Windows sandbox account still required approved escalated workspace commands.

Still required before rollout: controlled cadet Google sign-in with the original client; verify a cadet's historical saved-record count, offline retry and unchanged local backup; real Android/installed iPhone acceptance; independent backup decision; final Hebrew release notes and the actual live app deployment. The app has not been pushed or deployed.

## English instructor workspace and access verification (2026-09-27)

- The instructor dashboard, account/connection screen, Google sign-in gate, PIN prompt, filters, dates, default question labels and exported report interface use English/LTR. Cadet answers, names and custom/renamed question labels retain their source language. Bidi isolation keeps Hebrew content readable within English reports. The cadet app and its own reports stay Hebrew/RTL. Translation is presentation-only; no record, settings schema, migration, cloud projection or rules changed.
- Open http://localhost:8985/index.html#/instructor on this computer while `node tools/preview-cloud.cjs --connect` is running. The server binds 127.0.0.1 and its local gate allows only the roster owner. It is not a public hosted dashboard and does not serve the private dev folder. The account control in the top bar opens an English connection screen with Sign out.
- The dashboard is a browser client. Shared records live in Firebase, not solely on the instructor computer. Dashboard source/route secrecy does not protect data; Firebase validates the Google identity and deployed Firestore rules enforce assignments. Cadets can access their own records but cannot access the instructor roster or other cadets’ records. This is not end-to-end encryption. Google service infrastructure and privileged administrator credentials remain part of the trust boundary.
- Read-only live audit: exactly one active instructor, matching the private roster owner; that same owner is the only human IAM principal. No group/public IAM bindings or inherited organization/folder access were found. Firebase/Firestore service accounts remain enabled. Live Firestore rules match the checked-in rules byte-for-byte. All 34 cadet assignments match the owner and private roster. No saved flight documents exist yet; anonymous access returned PERMISSION_DENIED. Audit outputs are ignored dev/cloud-access-audit.json and dev/cloud-setup-verification.json; do not commit them.
- Live owner session loaded the English roster (34 cadets), navigated to the connection screen and back, with no browser console errors. Synthetic browser checks cover original Hebrew/English answers, custom labels, exact English report download/preview, Hebrew cadet-report isolation, narrow screens in three themes, sign-out and PIN flows, and preservation of saved flights, notebooks and drafts.
- Access emulators passed 28 rule checks plus 11 actual SDK checks, including other-cadet/unassigned-instructor denial, self-promotion denial and revoked access. The first rerun encountered an orphaned demo Firestore emulator on 8188; only that verified orphan (demo-sortie, this repo’s rules, nonexistent parent) was stopped before the passing rerun. PowerShell Stop-Process failed; taskkill of the verified PID succeeded. No live service was stopped.
- Final regression: all 20 suites passed, including 43 instructor browser checks and 39 summary checks. Evidence: C:/Dev/artifacts/sortie-v23/instructor-english-regression-20260927.log and cloud-access-emulators-20260927.log. No live app push, rules change, role grant, or cadet-record write was made during this localization/access-review turn.
