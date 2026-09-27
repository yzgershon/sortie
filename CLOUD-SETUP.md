# Instructor sharing

v24 / sortie-v24 is live on main. App release commit e9aa220 was deployed through GitHub Pages on 2026-09-27, upgrading the previous v23 commit 81f3dfa. Yish explicitly authorized deployment on 2026-09-27. He subsequently required automatic connection at ordinary Google sign-in with no announcement, message, separate link button or confirmation. Sharing consent and saved-record scope are already settled. This supersedes earlier pilot/approval and manual-link instructions.

## v25 visibility follow-up

The Settings sharing section and top-bar shortcut are restricted to the verified instructor role. Cadet and unresolved sessions do not see these navigation controls. They update when membership resolves without rerendering forms. Automatic saved-record syncing is unchanged. Direct own-account status and the existing privacy explanation remain available; hiding navigation does not replace Firebase access rules. v25 also suppresses the release announcement.

## Behavior and preservation

Saved briefs/debriefs, their answers, course/catalogue identity and relevant historical/custom question definitions are shared. A verified Google identity and active server enrollment are required. Cadets connect automatically to their assigned instructor. Signing up in the app means using an already-enrolled Google account; clients cannot self-enroll.

Existing local-only sessions continue working and are not forcibly signed out. Those devices connect on their next ordinary Google sign-in; a client-side local session is not a verified Firebase credential. Returning Firebase sessions resume automatically. v24 deliberately skips the What's New announcement, without consuming a future release acknowledgment. Settings retains accurate privacy and connection status text.

Nothing read from Firebase is written into Store. SCHEMA=4, MIG=5, IndexedDB, mirrors, drafts and notebooks remain unchanged. No reinstall, storage reset, inbound cloud restore or multi-device editing is introduced. Cloud failures do not block local saving. Saved records and per-account acknowledgments form a resumable outbox; offline work retries on reconnection and while the app is open.

Notebooks, unfinished forms/Add-field buffers, profile/focus, goal shelf, PIN, feedback drafts and Google session data are excluded. Cloud membership/bindings are excluded from portable backups. Continue full JSON exports: instructor sharing is not a complete backup of the device. Immutable revisions are not independent backups against privileged project deletion. Firestore deletion protection is on; PITR/managed backups are not configured and no paid plan change was made.

The first verified cadet connection creates sortie:cloud-binding {uid,email}. It cannot silently switch owners. Before sign-out or a Google callback replaces a legacy local session, sortie:cloud-local-owner retains its email when saved flights exist. A different account cannot automatically claim that history. Corrupt metadata/storage errors stop sharing without resetting local records. Instructor accounts never upload their own local records.

## Architecture and access

- js/auth.js retains the existing Google OpenID full-page redirect, nonce and pinned callback. It passes the returned Google token to Firebase without storing the token. A 15-second bridge deadline keeps cloud trouble from blocking local startup.
- js/cloud.js checks the verified identity against the local account and trusted enrollment, then automatically binds/syncs cadets. js/cloud-core.js projects only saved training fields, hashes payloads, resumes acknowledgments and retains conflicts.
- tools/firebase-adapter.mjs uses the real Firebase SDK; npm run build:cloud produces the self-hosted js/firebase-adapter.js. The normal app remains static globals on GitHub Pages.
- js/instructor.js provides read-only roster/record/history/filter/progress/report views. The instructor interface and exports are English/LTR; source answers, names and custom question labels retain their original language. Cadet screens/reports remain Hebrew/RTL.

Firestore paths:

    access/{uid}                         {active,role}
    cadets/{uid}                         {instructorId,course,name,email,lastSyncAt}
    cadets/{uid}/flights/{sha256(id)}     {payload,digest,receivedAt}
    .../revisions/{sha256(payload)}      {payload,digest,receivedAt}

Only trusted Admin provisioning can enroll, assign or grant roles. Deployed rules require verified Google identity and active membership. Cadets access their own records; instructors read only assigned cadets. Clients cannot enumerate access, self-promote, reassign, permanently delete records, change immutable revisions, or write notebook/draft paths. Revocation is access/{uid}.active=false; removing the old client allowlist hash alone is insufficient.

Each upload transaction retains a revision before advancing the current document. A stale device cannot overwrite another digest; both conflict versions remain. Manual conflict reconciliation and cloud-to-device restore are future work.

## Configured backend

- Firebase Sortie project sortie-7900c, number 959375176248; Spark plan. No Analytics link, paid upgrade or hosting move.
- Web app 1:959375176248:web:958e6f90af25de0e1eeccd. Public Firebase config lives in js/cloud-config.js, enabled for v24. Web API keys are not administrator credentials.
- Firestore default database: Standard/Native, me-west1 (Tel Aviv), deletion protection enabled.
- Google provider enabled; existing Sortie client 790989398891-df36sea2it2rbupm466ae8tknsg28h31.apps.googleusercontent.com (AIOS project) is on the Firebase external-client safelist. CLOUD_CONFIG.googleClientId remains empty. Existing AIOS configuration is unchanged.
- Production callback remains https://yzgershon.github.io/sortie/index.html. Google accepts that exact client/callback; the bare /sortie/ callback is not registered and must not replace it.
- Authorized Firebase domains: localhost, sortie-7900c.firebaseapp.com, sortie-7900c.web.app, yzgershon.github.io.
- Owner-only local preview uses the new project's client 959375176248-j0qnr5gvd21uv0il5tc9un0u16tqvl4r.apps.googleusercontent.com with http://localhost:8985/index.html. Its real owner sign-in and all 34 assigned roster reads were verified before release.

Read-only live access audit on release day confirmed exactly one active instructor matching the private roster owner, who is also the only human IAM principal. No public/group or inherited organization/folder access was found. Firebase/Firestore service accounts remain. Live rules match firestore.rules byte-for-byte and an unauthenticated read was denied. All 34 cadets (24 Primary, 10 Advanced) are assigned to the owner; two labeled test accounts are excluded. There were zero flight documents before deployment. Ignored evidence: dev/cloud-access-audit.json and dev/cloud-setup-verification.json.

The dashboard is a browser client, not local-only data storage. The local preview binds loopback and restricts its app gate to the owner. The deployed route is also protected by Firebase identity/rules; hiding its URL or public source is not the protection. Google infrastructure and privileged administrator credentials remain part of the trust boundary. This is not end-to-end encryption.

## Operator workflow and verification

    node tools/build-release.cjs
    node tools/test.cjs
    npm run test:rules
    node tools/preview-cloud.cjs --connect

Owner preview: http://localhost:8985/index.html#/instructor. Synthetic preview: tools/preview-instructor.cjs on 8984. Ordinary preview and non-worker browser tests disable real Firebase. Worker tests retain exact manifest bytes but block production Firebase/feedback network calls. Never run seed/clearAll harnesses against the live origin.

Enrollment: tools/provision-cloud.cjs --project sortie-7900c --roster dev/cloud-roster.json defaults to read-only planning; --apply is a trusted mutation. CLI OAuth state is in ignored dev/firebase-cli. dev/with-cli-adc.cjs creates a temporary authorized-user ADC file, runs the requested Node command, then removes it; no service-account key is created. Never track private rosters/credentials or dev contents.

Regression evidence: C:/Dev/artifacts/sortie-v23/v24-release-tests.log; permission/SDK evidence: v24-access-tests.log. The v23-to-v24 real-browser upgrade test verifies exact local-history/workspace preservation, no announcement/forced logout, automatic verified-account binding, exclusion of private fields, offline save/retry, and account-switch denial. Other retained suites cover v22/pre-course data, worker interruption, conflicts and mobile instructor reports. Emulators use demo-sortie only, ports 8188/9198.

Real Android/installed iPhone upload behavior remains unmeasured; browser/emulator results do not substitute for it. The deployed owner flow successfully exchanged a token from the original Google client for Firebase, loaded all 34 assigned cadets and restored the session on reopening. Do not claim cadet devices uploaded until actual records arrive. Deployment evidence is recorded in HANDOFF.md.

## Live release verification

GitHub Pages reported a successful build for e9aa2206f332147c6b9ed0571fbf648dab81784b at 2026-09-27T18:55:21Z. An independent HTTP check matched all 35 shell hashes and the exact worker, and confirmed cloud sharing enabled. Evidence: ignored dev/v24-live-verification.json.

The sidebar’s existing v23 session updated to v24 through its normal worker flow. A Google account selection using the original 790989398891 client and pinned /sortie/index.html callback completed without a new app-level confirmation. The actual production SDK signed the owner into sortie-7900c and read 34 assigned cadets; a fresh opening restored the session. The browser tool briefly returned a stale-element error during Google’s callback, but the next snapshot confirmed successful sign-in. Google’s page also logged a Windows WebGPU powerPreference warning; neither was an app sign-in failure.

Dashboard: https://yzgershon.github.io/sortie/index.html#/instructor. It requires the enrolled instructor account; the local preview remains available separately. Live access/assignment verification after sign-in still found one instructor, 34 cadets, zero saved flight documents and anonymous access denied. No cadet records were seeded, read from phones, or modified by the release procedure.
