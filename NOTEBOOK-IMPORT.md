# Notebook photo import (v28 candidate, not released)

Updated 2026-10-21. Photo/camera transcription is implemented in both flight forms, with an editable Hebrew review and an authenticated Cloudflare reader. It transcribes only: no model training, flight advice, inferred missing content or syllabus recommendations.

## Release state

- Branch `feature/notebook-photo-import`, based on `5f86b85` / v27. Candidate BUILD/VERSION are v28/sortie-v28; the manifest verifies 39 files. No frontend push/deployment, data migration, roster or Firestore-rule change.
- **Selected model: GPT-6.1 Sol, medium reasoning**, original image detail, standard service tier. The actual brother's page completed in 56.6 seconds. Low was faster but lost more wording; high took 231 seconds. Accuracy is still subject to the cadet's mandatory review.
- Current server code was deployed for a controlled owner-authenticated test on October 21: all 11 checks passed, including six exact synthetic Hebrew content checks. It returned in 9.3 seconds. The reader was then disabled again and disabled state was confirmed by polling.
- The candidate endpoint is the deployed Cloudflare reader. Previews disable the endpoint and automated browsers block it. No mock is shipped to cadets. Pasted-text import works offline.
- Code and verification are prepared for the owner's push decision. Release requires enabling the tested reader, polling readiness, then deploying the verified frontend. Handwriting has not been fully confirmed by its author; physical iPhone/S24 acceptance remains unperformed. These limits must accompany release readiness, not be presented as verified accuracy.
- The owner subsequently authorized publication and requested a one-time feature announcement. v28 now has its own announcement content version, so users who dismissed v23-v27 still see the notebook notice at Home after verification/PIN unlock. It explains photo selection, review/correction and draft-only saving, with Open brief and Understood actions. Opening a brief preserves its existing draft. Acknowledgment suppresses repeats across reopening/maintenance builds; manual What's New and the old Home tour remain available. Previews do not consume the acknowledgment; open forms are not interrupted.

## Cadet flow and data preservation

1. Open ייבוא מהמחברת inside a brief or debrief; choose a photo. Selection does not upload.
2. Explicitly read the photo, or paste text offline. Scanning shows elapsed time and a Stop reading button; it has no automatic retries.
3. Review and correct the text next to the original photo. Assign rows to the user's actual editable questions, including custom IDs/names. Unknown mappings, uncertain text, ambiguous marks and `[לא ברור]` spans start unassigned. **Uncertain grades start open**, even if the provider proposed a check/cross.
4. Acknowledge review, then add to the current draft. Ordinary Save is still required.

Scalars fill only when empty; textareas append; exact duplicate list rows are skipped. Existing goal grades require their own opt-in. Brief and next-flight goals stay ungraded. General highlights are not guessed onto individual exercises; rows may explicitly target an existing exercise's brief focus or debrief notes.

Applying snapshots recovery state first and changes only the current draft. Existing IDs, goal provenance, dates/course, untouched answers, saved flights, waiting shelf and unfinished Add-field buffers survive. Neither the settings schema nor migrations change.

Edited review text/assignments autosave in that form's draft and are included in full draft backups. Ordinary Save excludes the review from the saved flight/cloud projection and retains its private draft if review work remains. Closing, stopping, a failed scan, or choosing a comparison photo preserves the review. A late stopped response cannot overwrite it. Photos are never persisted. A new photo hides the old review until explicit resumption or extraction. The long review has sticky close/photo controls, vertical photo scrolling and pinch zoom; completion focuses a heading, leaving the phone keyboard closed.

## Authentication, privacy and hosting

The browser redraws the image to JPEG, removes EXIF/GPS metadata and bounds the longest edge to 2400px. Only that image goes to OpenAI, never flights, notebook folders, email or question definitions. The server receives a Firebase ID token for authentication but does not send it to OpenAI.

`worker/auth.mjs` validates the complete token through Google's accounts:lookup, checks disabled/revoked status and identity, then uses the same user's token to read only their own enrollment and the exact instructor UID pin through existing Firestore rules. There is no administrator credential, training-record read or Firebase write. Forged tokens, inactive enrollment, wrong providers and revoked access fail closed. Only iat/auth_time allow bounded 60-second clock skew; expiry/revocation cutoffs stay strict.

`worker/index.mjs` forwards to a SQLite Durable Object. Origins, request method, body size, JPEG dimensions and output structure are bounded. Responses contain only the transcription or sanitized errors. Observability is disabled; app logs contain no image, transcript, credential or token.

Hosting remains the existing Cloudflare Workers Free setup. No paid hosting or Google billing activation is authorized. Firebase remains on its existing Spark setup. The OpenAI key is the `SORTIE_OPENAI_API_KEY` Worker secret, never client code. The server also requires `NOTEBOOK_ENABLED=true`; checked-in configuration defaults to false. Disabling it stops scans without affecting saved work.

OpenAI requests use Responses, strict JSON schema, `store:false`, no tools and no fallback model. Provider abuse-monitoring/image exceptions still apply; this is not a zero-retention guarantee.

## Limits and estimated spending

The frontend cannot override the fixed model, instructions or limits.

- Model: `gpt-6.1-sol`, `reasoning.effort=medium`, `service_tier=default`, original image detail.
- Input-token count preflight: 15 seconds; 16000-token maximum including conservative schema/overhead allowance.
- Generation: 12000 output tokens including reasoning; 120-second timeout. Client allows 150 seconds including authentication. Incomplete/refused/invalid output cannot populate a form.
- Requests: 3/minute and 20/UTC day per UID; 200/UTC day and 2000/UTC month globally; two active requests.
- Estimated API budget: **$1/UTC day and $5/UTC month globally**. Reserve $0.18 atomically before provider work, then release the excess only for valid returned usage from the selected model and standard tier. Missing/invalid usage and failed/timed-out requests retain the reservation. Counts are not refunded.
- Pricing uses verified standard input/cache-write/output rates plus a 10% regional allowance. Missing cache-write detail uses the higher write rate conservatively. Transactional settlement respects day/month rollover. Storage contains UID counters/time buckets/spend estimates, never photos or transcripts.

This is a conservative estimate under configured token/pricing limits, not an invoice guarantee, tax calculation or account-wide OpenAI cap. Other projects using the same key are outside this counter. Raising limits requires an intentional code change; no automatic upgrade or retry is implemented.

## Evidence and its limits

Real page, prepared with the actual app image function; private evidence stays in ignored `dev/`:

| Sol setting | Time | Estimated API cost | Structure | Rows flagged uncertain |
| --- | --- | --- | --- | --- |
| medium, selected | 56.6 s | $0.033411 | 5 sections / 18 rows | 7 |
| low | 14.2 s | $0.014261 | 5 sections / 18 rows | 9 |
| high, prior run | 231.1 s | $0.104751 | 5 sections / 18 rows | 4 |

Flag counts are not accuracy scores. Medium preserved the clear title, section boundaries and words previously missed by Luna, but ambiguous handwriting still needs correction. One uncertain goal was proposed as met: the new review safeguard leaves that grade open. No author-confirmed word-by-word ground truth exists. Earlier Luna evaluations were unreliable; Sol/max timed out at 300 seconds with no usage returned. There was no Astra call or automatic retry.

Private evidence: `dev/notebook-handwriting-{attempt,provider,result}-sol61-{medium,low}.json`. The two October 21 direct tests cost an estimated $0.047672 total; the live synthetic call is separate. Never commit the source photo/transcript.

Cached medium output was exercised at 390px in disposable Chrome: 18 rows, all seven uncertain rows unassigned, corrected title applied only to a draft, zero saved flights/persisted photos/horizontal overflow/input autofocus/browser exceptions. `dev/notebook-handwriting-ui-result-sol61-medium.json` records this mocked-transport check. Private comparison artifact: `C:/Dev/artifacts/sortie-sol61-review/index.html`. Opening it makes no API call.

The October 21 deployed test used a fresh owner Google sign-in:
- Actual instructor, enrollment and exact UID pin passed.
- Forged signature returned 401; invalid image with valid identity returned 400.
- Synthetic scan returned 200 in 9272 ms; subject, exercise, met/missed goals, highlight and safety all matched.
- Reader disabled afterward; no cadet training record was read or changed.
- Evidence: `dev/notebook-deployed-acceptance-oct21.json`.
- CLI OAuth exchange was rejected for the wrong client audience before scanning; ordinary Google sign-in in Chrome worked. Do not loosen Firebase audiences to make the CLI credential work. The sidebar blocked its popup. The private test server was stopped after completion.

All 28 app suites passed across the combined run and the affected release-copy rerun. The only first-run failure was a stale expected What's New entry count (9 vs 10), corrected for the new notebook entry. Separately: 20 server, 12 Worker authorization/boundary and 11 actual workerd/SQLite checks passed after budget refinements. Notebook browser: 48; real v27-to-v28 update/preservation: 12. Actual workerd mocks Google/OpenAI; it is separate from the live test above. Manifest verification and Wrangler dry-run passed. Physical phone testing remains unperformed.

## Operator steps

- Use the configured git identity; do not push without the owner's release instruction.
- Windows ARM64: use ignored `dev/node-x64/node_modules/node-win-x64/bin/node.exe` for Wrangler/workerd. Set `XDG_CONFIG_HOME=C:\Dev\sortie\dev\cloudflare-cli` and `WRANGLER_SEND_METRICS=false`. No global runtime upgrade.
- The existing secret is already installed. If replacement is necessary, read the explicitly selected ignored key file and supply it on stdin; never print it or pass it in command arguments. No generic credential search.
- Rebuild `release-manifest.json` after shell edits, and verify the exact candidate before release. Do not bump v28 again for these local refinements.
- At release, deploy the exact server with `NOTEBOOK_ENABLED:true`, poll for enabled response, then push the verified frontend. The disabled flag may take several polls to propagate. No rules/roster/data reset is required.
- After push, verify Pages build and all live shell hashes/worker bytes; only then tell the brother the feature is available. Draft Hebrew message is in the private release notes; it has not been sent.
- Ask the brother to try one page and review the transcription on his installed iPhone. Avoid claiming trained handwriting recognition or guaranteed correctness.

## Reproducible checks

`node tools/test.cjs` runs the 28 app suites, including import/mapping/preservation, server/Worker checks, browser flows and the actual v27 service-worker upgrade. The workerd runtime suite runs separately with x64 Node: `node tests/notebook-worker-runtime.cjs`. `node tools/build-release.cjs --check` verifies the shell manifest. Wrangler supports a no-deploy dry run with `deploy --config worker/wrangler.jsonc --dry-run`.

Official references: [Sol model/pricing](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [input-token counting](https://developers.openai.com/api/docs/guides/token-counting), [provider data controls](https://developers.openai.com/api/docs/guides/your-data), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Firebase account lookup](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info), [Firestore REST authorization](https://firebase.google.com/docs/firestore/use-rest-api).
