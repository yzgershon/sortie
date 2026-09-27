# Sortie / תחקיר

Hebrew, right-to-left flight briefing and debriefing PWA for two training courses: ראשוני and מתקדם. Plain HTML, CSS and JavaScript, with on-device storage. Works in Android Chrome and iOS Safari; it can be installed to the home screen.

The current development branch is `release/next-update`, build `v23-preview`. This is a local release candidate, not a deployed update.

## Daily use

- Prepare a brief, find a flight in the active course's syllabus, set goals and write exercise focus points.
- Debrief the same flight: enter minutes, assess goals, write exercise notes and set next-flight goals.
- Goals carry forward within their course/category context. Editing an older debrief preserves newer work.
- Search/filter flights; review trends and goal history. Prepare an instructor report for this week, last week, a date/course range or manually selected flights. Preview the exact short/full report, optionally include your name/callsign, export a document, copy rich text or use Print/Save as PDF.
- Open the notebook from its tab, organize pages into folders, set priorities, pin important pages and search.
- See recorded syllabus coverage by course/section, add personal milestones, and preview an image before sharing it.
- Customize questions while retaining definitions needed to read historical answers.
- Personalize the journal with an optional name, callsign and current focus. Home puts unfinished work before statistics and course coverage.
- Choose cockpit dark, quiet charcoal/sage dark, light or automatic appearance. Browse the syllabus through collapsible sections.
- Recover deleted flights/pages, revisit retained drafts, and export/restore a full JSON backup.

Syllabus coverage counts distinct, identified catalogue entries from completed debriefs in the active course. It is not official course completion or an instructor's qualification decision. Unassigned historical flights do not receive guessed course credit. Dates and additional course events must come from the cadet; none are invented.

## Data and privacy

Google sign-in is an access gate. It does not synchronize or back up flights. The public static repository and syllabus remain readable; the gate is not a security boundary for those files. The optional PIN is a screen lock, not encryption.

Flights use IndexedDB (`sortie`, `sorties`) and a localStorage mirror, merged by ID and timestamp at startup. Settings, drafts and the notebook use localStorage. Coordinated local writes retain a transaction intent so an interrupted operation can be recovered at launch. A failed durable save keeps the form available and offers recovery export.

Full JSON backup includes flights, question definitions/order/archive state, waiting goals, drafts and pending input buffers, course/theme/profile preferences, notebook folders/pages, milestones, unsent feedback and recently deleted items. Standard backups exclude Google sessions and the PIN. CSV and summary exports do not count as recovery backups. A raw recovery download is also available for inspection of damaged storage; it is not an ordinary import file and can contain local PIN hash metadata. Keep it private.

Local recovery copies share the device's storage risks. Export a JSON backup to a separate location regularly and before reinstalling. Reinstalling an iOS home-screen app can remove its data. Ordinary updates do not require reinstalling.

Feedback is separate from flight storage. The form sends only the written message, category, optional contact address and explicitly selected diagnostics. `js/feedback-config.js` contains the public endpoint for the owner's verified Formspree form. Delivery was tested from the local preview on 2026-09-26: the submission appeared in Formspree and the owner confirmed email receipt. Sending from the manual preview uses that real service; automated browser feedback checks use local mocks and block real Formspree submission URLs. No provider credentials belong in this repository. Formshield filtering is enabled; the account currently allows 50 submissions per month. Recheck its quota before release.

## Local preview

Requires Node.js. From this directory:

```powershell
node tools/preview.cjs
```

Open `http://127.0.0.1:8980/`. The server binds to loopback, overrides authentication only in its HTTP response, and disables the service worker for predictable preview refreshes. It does not edit production auth configuration. Its browser storage is separate from the deployed site. To test a production-style worker, use the isolated automated update suite below.

## Checking a change

```powershell
node tools/build-release.cjs
node tools/test.cjs
```

The full suite uses Node's built-in WebSocket and headless Chrome at `C:\Program Files\Google\Chrome\Application\chrome.exe`. Use a recent Node version with built-in WebSocket support. Tests create disposable Chrome profiles and loopback origins. They do not use cadet accounts or send feedback externally. `node tools/test.cjs --unit` runs the non-browser suites. Upgrade tests need git history including commit `005e762`.

The release manifest hashes the deployable shell. `node tools/build-release.cjs --check` fails when it is stale, versions disagree, a script is invalid, a referenced Hebrew string is missing, or access mappings are inconsistent. Regenerate it after any shell edit. There is still no framework/bundler build step.

The tracked tests are Node programs, not browser-accessible seed pages. Never publish the private `dev/` directory or its destructive seed/preview HTML. It contains private roster data and legacy test/parser tools.

## Files

| File | Purpose |
|---|---|
| `js/strings.js` | Hebrew UI copy |
| `js/auth-config.js`, `js/auth.js` | Google redirect gate and hashed allowlist |
| `js/courses.js` | Single course registry and category aliases |
| `js/syllabus*.js` | Matching and two syllabus catalogues |
| `js/store.js` | Flights, settings, goal reconciliation, backup and recovery |
| `js/workspace.js` | Local notebook, folders, milestones and feedback draft |
| `js/features.js` | Profile, notebook, progress/share, feedback, release notes and recovery screens |
| `js/summary.js` | Read-only instructor report model and standalone document output |
| `js/visuals.js` | Read-only procedural SVG: mission charts, the data-driven course route, the sign-in scope, the app mark and aircraft silhouettes |
| `js/motion.js` | Read-only interface motion: ambient light, arrival animation gate, tap ripples, greeting decode, card tilt, save fly-by |
| `js/tour.js` | Read-only guided tour: spotlights each new part of Home with a caption; keyboard, focus and reduced-motion aware |
| `js/app.js` | Router, original screens, forms and update coordination |
| `css/app.css`, `css/features.css` | Design system and three themes; frame, forms and core screens in `app.css`; notebook, course journey, report and secondary screens in `features.css` |
| `assets/sortie-*.jpg`, `assets/ARTWORK.md` | Three original aviation images, prompts and provenance; local and available offline |
| `sw.js`, `release-manifest.json` | Verified network-first offline shell |
| `tools/`, `tests/` | Local maintenance and reproducible checks |

## Access maintenance

The optional local helper previews a change before writing it:

```powershell
node tools/access.cjs --add EMAIL --name FIRST_NAME --course rishoni
node tools/access.cjs --remove EMAIL
```

Add `--apply` after reviewing its result. It requires the private `dev/roster.json`, stores a private recovery copy, writes hashes/first names to the public config, and never commits or pushes. An access-only change does not bump the app version. Validate the live config using the private `dev/check-access.js` after a separately authorized deployment.

## Release

GitHub Pages serves `main` at `https://yzgershon.github.io/sortie/`. **Pushing to main is a production deployment.** Keep the candidate local until Yish approves it.

Before a behavior-changing release, set matching stable `BUILD` and worker `VERSION`, regenerate the manifest, run the full checks, and complete [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). A stable release shows its Hebrew announcement once after authentication/PIN at Home. Preview acknowledgments do not consume the real release notice.

The worker validates a complete release before installation, retains the previous shell, falls back on server errors or mismatched assets, and defers activation during editing. Access configuration remains a deliberate network-first exception so access-only changes can arrive without a version bump.
