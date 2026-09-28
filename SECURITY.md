# Sortie security boundaries

The app and syllabus files intentionally remain public. Server permissions protect saved training records. Verified devices keep offline access to their own local work. This is not a zero-risk guarantee or encryption of the device's local data.

## Admission and offline use

New sign-ins use a 256-bit nonce, a ten-minute callback window, exact Google issuer/audience/expiry checks, and verified email. Firebase must accept the Google credential and active server enrollment before the app writes a local admitted session. Unverified local JSON alone cannot open the normal app.

Restored SDK identity is checked against the expected account and server enrollment on each online launch. Devices that previously passed enrollment may use the private, UID-bound offline receipt during an outage. Explicit server denial removes that receipt; it never falls back to offline access. Signing out removes it too. Offline access has no automatic time cutoff. Revocation cannot reach a disconnected device until it reconnects. A user controlling local storage or browser code can bypass local UI checks; cloud reads still require server authorization.

Legacy local-only sessions need one normal Google sign-in. Existing Firebase sessions restore without a forced sign-out. Flights, notebooks, drafts, customized questions and preferences are not reset, migrated or deleted. The original account must reopen existing local history; signing into a different enrolled account does not transfer it. Account bindings and credentials are excluded from portable backups.

The cloud client checks membership on reconnect, after returning to the foreground (when the previous check is over a minute old), and every five minutes while visible and online. The server checks every protected request independently. A denied or ended session flushes the current draft and hides the app without destroying the editor DOM. Server failures never delete local records. Recovery exports require the same admission check.

## Server authorization

- Verified Google identity, active enrollment and an optional sign-in revocation cutoff are required for records.
- Cadets read/write only their own saved training records. Private notebooks and drafts have no authorized cloud path.
- Dashboard access additionally requires the exact UID in `security/instructor`, as well as instructor role and assigned cadet. A second instructor role does not grant dashboard access.
- Clients cannot write enrollment, change the owner pin, reassign a cadet, self-promote, permanently delete records or rewrite retained revisions.
- The dashboard uses server reads with no persistent Firestore record cache. Reports downloaded by the instructor are ordinary local files; signing out cannot erase an exported file.

The Firebase owner, privileged service accounts, the Google account, the host/browser and an unlocked device remain trust boundaries. Rules do not restrict Firebase Admin SDK/IAM access. This is not end-to-end encryption.

## Trusted operator actions

Keep operator credentials and the full roster only in ignored `dev/`. Never put them in public files or paste tokens into logs.

Before deploying rules to a new project, install the owner pin from the private roster:

    node tools/secure-cloud.cjs --project PROJECT --roster dev/cloud-roster.json
    node tools/secure-cloud.cjs --project PROJECT --roster dev/cloud-roster.json --apply

The first command only checks the live configuration. The second creates the pin only if exactly one active instructor matches the verified private roster owner. It refuses to replace a different pin. Neither command reads or changes training records. Normal enrollment provisioning never reactivates an existing revoked account or erases its revocation metadata.

To revoke access, a trusted administrator sets `access/{uid}.active` to `false`. To invalidate existing sign-ins while leaving an account enrolled, set its `authNotBefore` to the current Unix time in seconds and revoke its Firebase refresh tokens using the Admin SDK. The rules require a new `auth_time` strictly after that cutoff. Do not confuse removing a public allowlist hash with server revocation. Do not remove local flights or notebook data as part of revocation.

Reverting the frontend must not remove the owner pin or weaken the deployed record rules. The rules remain compatible with the prior v26 uploader. Keep the pinned Google client/callback unchanged.

## Browser hardening

The self-hosted Firebase bundle uses the existing persistence stores without the unused popup/redirect resolver. The CSP blocks inline scripts, inline event handlers, plugins, base-URL changes, HTML form submissions and connections outside the named services. Inline styles remain required by the UI. Referrers are suppressed. Report HTML is escaped and previewed in a sandbox; temporary report URLs are revoked on navigation or loss of access.

The CSP is a meta policy because GitHub Pages does not provide custom response headers. It does not provide `frame-ancestors` protection. Public source, browser extensions, compromised hosting and device malware are outside this protection.

## Verification and remaining work

`node tools/test.cjs` covers admission, offline behavior, data preservation, UI and updates. `npm run test:rules` uses only loopback emulators and tests authorization plus the actual Firebase SDK in Node and a disposable browser. The browser test upgrades the default SDK persistence to the constrained initializer and blocks network access for offline restoration. Browser/device emulation is not a real installed iOS/Samsung acceptance test.

Google passkey/2-Step Verification enrollment is a user-controlled account action. Its status must be confirmed separately; this release does not claim app-enforced MFA. No paid Identity Platform upgrade was made. Independent cloud backups/PITR are not enabled; immutable revisions do not replace backups against privileged deletion. Keep full local JSON exports, particularly for private notes/drafts.

References: [Firebase session revocation](https://firebase.google.com/docs/auth/admin/manage-sessions), [Firebase Auth dependencies](https://firebase.google.com/docs/auth/web/custom-dependencies), [Google OIDC validation](https://developers.google.com/identity/openid-connect/openid-connect).
