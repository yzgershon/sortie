# Frontend audit and implementation

Reviewed and implemented 2026-09-26 on `release/next-update`, starting at `b572395`. Build remains `v23-preview`; this work has not been deployed.

Yish requested mobile-first polish across Sortie, personal pilot identity, a useful training dashboard and a quieter dark theme. The existing Hebrew RTL interface, on-device data model and cockpit character remain the foundation.

## Frontend redesign (after `d141c1a`)

Yish asked for a complete redesign for cadets' daily use on a Galaxy S24 (Chrome) and an installed iPhone PWA, preserving everything already saved. Build stays `v23-preview`; nothing was pushed or deployed.

Earlier decisions that were challenged:

| Before | Problem | Now |
|---|---|---|
| Four stylesheets overriding one another (`app` → `features` → `frontend` → `editorial`) | Hard to reason about; each fix needed another layer | One system: tokens, frame, forms and core screens in `css/app.css`; notebook, journey, report and secondary screens in `css/features.css`. The other two files are removed |
| Photo mastheads on nearly every screen | 75 to 110px of decoration above every task, on the smallest screens | Photos kept where they carry mood without delaying work: Home greeting, course journey, report, What's New. Work screens start with their content |
| English cockpit captions (BRIEF, DEBRIEF, SETUP, TRENDS, FLIGHTS, HOURS, 8W, DATE) | Noise in a Hebrew app; unreadable at 9px | Removed; Hebrew labels only, monospace kept for numbers and dates |
| Tabs: בית · טיסות · מגמות · הגדרות, notebook and "+" in the top bar | The daily action and the notebook were small top-bar icons; Settings, the least-used screen, took a tab | בית · טיסות · **תדריך** (centre action) · מחברת · מגמות. Settings is a gear in the top bar of the main screens. Forms keep a notebook shortcut, since the tab bar is hidden there |
| Home: identity block, focus, resume button, then either a pending card or "new brief" | Identity took the first screen; a stray "new brief" appeared next to "resume draft", yet both opened the same draft | Greeting over the photo, focus, then **one next step**: a pending debrief (amber), otherwise the unfinished brief, otherwise a new brief with the number of goals waiting. Other waiting debriefs and a secondary draft stay listed. Then open goals, course coverage, recent flights, statistics |
| Flight record tagged each brief answer "BRIEF" | Repetitive; one long undifferentiated card | Two sections, "לפני הטיסה" and "אחרי הטיסה"; short answers render as label/value rows. A pending record hides its empty debrief section, never a section containing answers |

Also: solid primary buttons, one per screen; 48px minimum targets throughout, removing the remaining 34–38px inline buttons; larger ✓/✗ goal grading; category tokens visually distinct from reused past answers; larger fixed-answer choices; full-width save bar; restyled sign-in, course and PIN screens. PIN dots now fill in digit order, the lock mark's caret points up in RTL, and the course picker's "125 גיחות" reads in the right order. Time-of-day greeting strings were added to `js/strings.js`.

Preservation: no change to `js/store.js`, `js/workspace.js`, `sw.js`, storage keys, SCHEMA (4), MIG (5), record shapes, draft keys, autosave timing, flush-on-navigation, conflict handling or update activation. Every data hook used by the tests (`data-*`, IDs and structural classes) is retained. The calm theme keeps `#141715` as its page and browser colour.

Verification: full suite **490 checks across 17 suites** after the settings and update-message work below (log `C:\Dev\artifacts\sortie-redesign\release-tests.log`). This includes the 16-screen × 3-theme × 3-size overflow/unnamed-control matrix, preservation, v22 upgrade, worker update and notebook suites. Before and after screenshots are in `C:\Dev\artifacts\sortie-redesign` (`before-*`, `v1-*`, `v2-*`, `vp-*`, `big-*` at 360px and 150% text, `n320-*`, `course-*`, `lock-*`, `sheet-*`). They come from Chrome device emulation, not a real S24 or iPhone.

## Findings and changes

| Area | Finding | Implemented result |
|---|---|---|
| Home | Generic date heading; statistics and feature tiles competed with the next task | Optional name/callsign, current course and personal focus; resume draft and pending debrief actions precede course coverage and journal statistics |
| Personal identity | No place to personalize the journal | Optional profile in Settings; autosaved name, callsign and current focus; explicit saved/failure state; full JSON backup includes it |
| Appearance | Bright cyan, photo and glow were the only dark presentation | Additional `לילה שקט` theme: charcoal, muted sage, softer status colors, no global photo backdrop or glow; original dark and light choices retained; visual theme previews |
| Shared typography | Small utility text and decorative motion competed with reading | Larger supporting text, stronger muted-text contrast, consistent headings and less motion/glow; reduced-motion preference honored |
| Navigation | Some icons had no accessible label; child screens lacked a selected tab; log selection shared space with tabs | Labeled icon actions, skip-to-content link, parent-tab selection, dedicated selection toolbar space |
| Brief and debrief | Workflow context was weak; small suggestion/delete controls; dark native date controls lacked a color scheme | Two-stage context strip, larger controls, labeled row inputs, readable native controls and calmer save bar |
| Flight log | Filtering could leave an unexplained empty list | Active filter count and one-action reset; clearer page heading and Hebrew selection count |
| Flight detail | Date dominated the record | Subject is the main heading, with date, course and state below it; goal verdicts have accessible names |
| Trends | Chart relied on bar height; enlarged text could widen the page | Visible counts and week dates, accessible week descriptions, constrained chart columns and clearer heading |
| Syllabus | Every flight header rendered into a very long page | Collapsible section index with completed/total counts; searching reveals matching sections and exercises; clearing search restores section state |
| Settings | Full question editor dominated routine settings | Profile and appearance first; backup/course/tools grouped; question editor collapsed while preserving all edit/reorder/archive actions |
| Notebook | Must retain the accepted minimal cockpit redesign | Shared themes and typography applied to list, folder drawer and ruled editor; no new toolbar or storage format |
| Progress and sharing | Theme-specific hardcoded colors in exported image | Progress presentation and share image use the selected theme; profile identity appears locally and is not automatically added to shared output |
| Summary, feedback, recovery, release notes | Inconsistent secondary-screen density | Shared heading, spacing, control and panel refinements; release notes include personalization and the quiet theme |
| Sign-in, course picker and PIN | Must remain readable under the new theme | Inspected in calm mode at 320px with enlarged text; existing access behavior retained |

No official ranks, earned wings, course event dates or qualification claims were invented. Course progress still means recorded syllabus coverage, and journal totals are labeled separately from active-course coverage.

## Flight hours, settings and the update message

Request: existing users' data should carry into the new Home (flight time especially), hours should be editable in settings along with the other adjustable things, and the update message should look professional with a Hebrew button that shows what changed through a spotlight tour.

- **Hours from existing data.** Every debriefed minute counts, read from whichever minutes question a flight was answered under (renamed or rebuilt questions included). Rounding is in six-minute tenths, so 123 minutes reads 2.1, not 2.0. The v22 upgrade test now checks the Home figure after upgrading real v22 data.
- **שעות טיסה in הגדרות.** Shows the total, the logged part and any manual part. Typing a total (32.5 or 32:30) stores the difference as a correction; flights are never edited, and later flights keep adding. Errors appear beside the field. One tap returns to the logged total. Home says when a total includes manual hours; מגמות is labelled as logged hours.
- **Also adjustable:** animation level (by the phone, full, reduced, off), vibration, and whether the personal focus, shortcuts, open goals and recent flights appear on Home. The numbers and the next step always stay.
- **The update message** is a sheet: blue-violet hero with the F-15I, the app mark and the version, a contrail an F-35 flies when it opens, four highlights with icons, a green line saying saved work came across unchanged, and pinned actions: הראו לי מה חדש, הבנתי אולי אחר כך, לכל השינויים. It appears once, after sign-in/PIN, only to people with saved work.
- **The tour** dims the screen and lights one part at a time (flight card, readouts, shortcuts, the brief button, settings) with a glow ring, HUD corners and a sweep of light. The caption card sits on the side with room and has step dots, back, next and skip. Esc, arrow keys, focus trapping and an inert app underneath are handled, and focus is restored at the end. Steps for hidden sections are skipped. It can be replayed from מה חדש.

## NexBank design system and motion

Follow-up request: Home stats higher, visible without scrolling; futuristic, with animations people do not see in other apps; a design system from the UI UX Pro Max skill, specifically its "Digital Banking" (NexBank) demo.

- **Tokens from the demo** (`uupm.cc/demo/digital-banking`): navy `#0A1628`→`#0F1D32`, glass surfaces at 5/8/12% white with a hairline border, the blue action gradient `#0052CC→#0066FF` with a glow, a blue→violet (`#6554C0`) card for the headline figure, radii 12/18/24, Space Grotesk figures and Latin (Rubik for Hebrew display, Heebo for body). The accent used as text is lifted to `#4C9AFF` so it passes 4.5:1 on navy; fills that carry text use the solid action blue. Light theme is the same system in daylight; calm keeps its charcoal and sage and drops the decorative motion.
- **Home order**: compact greeting row (date, greeting, course/callsign, avatar linking to the profile) and a one-line focus; then a waiting debrief, if any, as a compact card (the pending-debrief-before-statistics rule still holds); then the stats. The flight card shows flight hours as the balance, this week's flights as the chip, minutes, a contrail of debriefed flights over the last eight weeks (same windows as מגמות) and course progress. Three readouts follow (flights, goals met, solo or this week), then quick actions (route, syllabus, weekly summary, backup), the brief card when nothing is waiting, goals and recent flights as separate rows. At 390×844 the whole flight card is on the first screen even with a debrief waiting.
- **Motion**: altimeter-drum figures (CSS reels; the digits stay as real text), the F-35 flying the contrail with its afterburner (SVG motion path), the greeting decoding from noise once per launch (drawn in a pseudo-element; the real text never changes), the card tilting under a finger and with the phone on Android, a glint across the card, screens materializing block by block, ring gauges and progress bars filling, a floating dock with a sliding lit pill and a raised action ringed by light, tap ripples, an amber beam circling a waiting debrief, a save fly-by with a contrail and sonic-boom ring, toasts with a countdown line, and a drifting ambient glow. Arrival animations only run when `navigate()` sets `.is-entering`; entrance transforms never scale, never apply to dialogs, the save bar or the form progress, and the view clips horizontal overflow, so tests and taps measure stable geometry. `prefers-reduced-motion` stops all of it.
- `js/motion.js` is new and read-only. No storage key, schema, record, draft or worker behaviour changed.

## Mission visuals and IAF accents

Follow-up request: make the app look striking, with light Israeli Air Force accents, technological route graphics and the best jets.

- **`js/visuals.js`** (new, read-only) draws procedural SVG in the language of a flight-planning display. It covers a plotting grid, terrain contours, range rings with a compass card, route legs with headings, waypoints and an own-ship aircraft silhouette. Colours come from CSS classes (`.mchart__*`), so all three themes restyle it. Decorative charts are seeded, so they don't change between renders; the Home chart is seeded by date and changes daily.
- **The course route is real data.** Each syllabus section is a numbered waypoint, spaced by its number of sorties, and the route is lit to the recorded coverage with the aircraft at that point. It appears on the progress screen (replacing the ring gauge; the `.journey__reading` percentage stays), as a one-line route on Home and in trends, and on the shared progress image. Numbering matches the section list, and the SVG has a spoken summary.
- **Light IAF accents.** An `--iaf` token per theme (flag blue `#0038B8` in light). The app mark is an outline ring with a two-triangle star, which evokes the roundel without using the insignia. The flag's two stripes mark section headings, frame the sign-in/PIN screens and the share image. The sign-in, course and PIN screens get a radar scope with a turning sweep. The Home hero carries HUD corner marks and a small coordinate tag (the flight academy's region).
- **Jets.** Generated images of the F-35I Adir (Home), two F-16I Sufa (course journey) and the F-15I Ra'am (What's New) replace the generic trainer and terrain photos; see `assets/ARTWORK.md`. The syllabus data doesn't say which aircraft each course flies, so no image is presented as the cadet's own aircraft.
- Animations (sweep, route flow, waypoint pulse) stop under reduced motion. Offline payload grows by one small script; image bytes are about the same as before.

## Instructor report and original artwork

Follow-up starting at `106be3a`, also on 2026-09-26. Yish chose an instructor-ready report as the summary's main purpose and requested original generated images throughout the app.

- Rebuilt the summary around this week, previous week, date/course range or manual selection. Empty periods retain the controls. The full document keeps historical instructor answers, extra customized questions, per-flight notes, goals and briefing focus; short mode omits the appendix.
- Recurring goals count distinct flights, grouped by course/category context and wording. Later achievement is visible without erasing earlier misses. Open goals stay outside the success denominator. Invalid/missing minutes are disclosed, and planned exercises remain distinct from exercises with notes.
- Added an exact sandboxed document preview, rich-text/plain copy, HTML `.doc` download and browser Print/Save as PDF. Names/callsigns are explicitly opted into; profile focus stays private. The export uses readable A4 typography and real dates. All content comes from saved records; no generated assessments or qualification claims.
- Generated three original raster images with the built-in image tool: a runway/training aircraft, flight journal still life and fictional aerial terrain. Production JPEGs total 302,654 bytes. Prompts/provenance are in `assets/ARTWORK.md`.
- Applied local image crops to Home, notebook list, course progress, log, trends, syllabus, settings, feedback and release/report headers. Removed the older global photo backdrop. Dark, calm and light each get restrained image treatment; form inputs, notebook editor and exported documents stay plain and readable.
- Added `css/editorial.css` and read-only `js/summary.js`; no storage-schema, migration, saved-flight or notebook-format change.

## Data preservation

SCHEMA remains **4**. MIG **5** only adds an empty optional `pilotProfile`; it does not rebuild questions or rewrite flights, goals, drafts or notebook data. Existing theme selections remain selected. Full backup/restore includes the profile and quiet-theme preference; normal merging into a populated installation retains existing preferences unless the user selects preference restoration. Malformed profile imports are rejected before mutation.

Profile writes use the existing durable settings path. Navigation flushes pending edits; a failed write leaves text visible and blocks leaving the editor. No profile values are automatically attached to feedback or progress sharing.

## Verification

- Full tracked suite: **490 checks across 17 suites**, including 39 instructor report checks, 37 frontend checks and the existing preservation, update, backup, notebook and failure-injection suites.
- Main-screen matrix: **16 screens × 3 themes × 3 viewport/text configurations**. Widths 320px and 390px at normal text, plus 360px at 150% root text size. No document-level horizontal overflow or unnamed visible button/link was found in these fixtures.
- Principal foreground/accent text tokens meet 4.5:1 against the page background in all three themes. This is a token check, not a complete accessibility certification of every color combination.
- Browser checks cover profile autosave/reload/failure, unchanged flight data, theme persistence/system appearance changes, skip-link focus, filter reset, section search and calm share-image background.
- Extra narrow checks: sign-in, course picker and PIN at 320×640 with 150% text. Screenshots inspected alongside the main-screen screenshots.
- Older migration suites rerun: **20 older-upgrade checks and 31 pre-course-upgrade checks passed**, in addition to the tracked v22 upgrade/rollback suite.
- Expanded report checks cover all three themes at 320/390px and 360px enlarged text, exact preview/document content, optional identity, plain copy, print dispatch, custom/archived answers, date/course selection and unchanged saved records/settings except the existing export timestamp. Headless A4 output was generated for inspection; native print dialogs and Google Docs conversion need real-device acceptance.
- Release manifest verifies **30 shell files**, including the three images. Automated browser tests use disposable profiles and synthetic records; real Formspree submissions are blocked. No cadet data or production deployment was touched.

Evidence directory: `C:\Dev\artifacts\sortie-v23`. Latest full log: `instructor-report-tests.log`; earlier frontend run: `frontend-audit-tests.log`; older migrations: `frontend-legacy-upgrade.log`, `frontend-course-upgrade.log`; screenshots: `frontend-*.png`, `report-*.png`. `instructor-report-example.pdf` contains synthetic regression data. Before-state measurements and screenshots use `frontend-audit-before.json` and `audit-before-*.png`.

One repeated full run timed out waiting for the page to reload after explicit worker activation. No runtime exception was reported. Four subsequent isolated update runs and the final full suite passed; this does not establish the cause or prove it fixed. The failure log is retained as `frontend-update-timeout.log`, with rechecks in `frontend-update-recheck.log` and `frontend-update-repeat.log`. The update test now captures document, worker, draft and screenshot diagnostics on failure. Keep this on the release review list.

## Remaining acceptance

Yish's visual acceptance and actual Galaxy S24 / installed iPhone testing remain necessary, especially Hebrew keyboards, native date/dialog behavior, safe areas, drag edge-scrolling and native sharing. Automated dimensions do not prove thumb comfort or Safari behavior. The original syllabus content questions and real milestone details remain open. Final stable release wording, provider quota/domain review and deployment authorization are tracked in [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).
