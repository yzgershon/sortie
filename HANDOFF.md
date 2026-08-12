# תחקיר — handoff

Last updated: 2026-08-08

## Live

**https://yzgershon.github.io/sortie/** — GitHub Pages, `main` at repo root.
Repo `yzgershon/sortie`, **public**.

**Deploying: push to `main`, and in the same commit bump BOTH**

- `VERSION` in `sw.js`
- `BUILD` in `js/app.js`

The build number renders at the bottom of הגדרות. That is how you tell what a
phone is actually running, which matters more than it sounds — see below.

## The model

One record per flight, filled in two stages.

- **תדריך** before the flight: פיריט · נושא טיסה · מדריך · איזור · יעדים ·
  סילבוס · בטיחות
- **תחקיר** after: everything above carries in, tagged מהתדריך, plus
  דקות טיסה · נקודות עיקריות · בטיחות · אישור לסולו · יעדים לטיסה הבאה

**בטיחות deliberately does not carry.** One answer is what was briefed, the
other what happened. Two separate question ids.

**דגשים are per exercise**, not one field. Each syllabus row carries its own
דגש written at the תדריך and shown back beside its notes at the תחקיר.
Rows drag to reorder by their grip.

**נקודות עיקריות is an itemized list** (`type: 'list'`), one bullet per point,
not one block of text. Old answers written as text split on newlines the first
time they are read.

**The goal loop runs per category.** Goals get ✓ or ✗ at the תחקיר. A ✗ writes
the goal into יעדים לטיסה הבאה further down the same form, and clearing the ✗
removes it again — only rows added that way, so a hand-typed goal is never
pulled out underneath him.

On save, next-flight goals plus anything missed go back on the shelf **tagged
with that flight's categories**, and come out again only on the next flight
sharing one. Missing a goal on AW 7 brings it back on AW 8, never on the next
מבנה. A flight tagged both מבנה and לילה tags its goals with both.

- The category is not known when the form opens, so the carry runs **as he
  types נושא טיסה**, next to the syllabus match. Same hook, `onSubjectChanged`.
- Retyping the subject as another category takes the wrong-category goals back
  out. That is keyed on each row's `data-cats`, NOT on "did this session add
  it", so it still works after a draft reload. Untagged rows are his own and
  are never touched.
- Removing a carried goal by hand is remembered for the life of the form
  (`dismissed`, keyed on the goal id) or the next keystroke puts it back.
- A goal typed on Home is untagged and rides the next flight whatever it is.

**יעדים לטיסה הבאה get no ✓/✗** — he is setting them, not grading them. Their
text is an editable input so a typo is fixed in place, with a ✗ to delete the
row. Goals being graded keep fixed text and the ✓/✗ pair.

**Questions are data he owns.** הגדרות edits label, type, stage, options and
order. Only the two goal questions are locked (`PROTECTED` in `store.js`).
Deleting archives rather than destroys, so old answers still render.

**Home's fourth readout is אישור לסולו this week** — the share of the week's
debriefed flights cleared for solo, Sunday to Saturday. Found by `role: 'solo'`
so renaming the question does not blank it; if he deletes it, the readout falls
back to the old flight count.

## The Google sign-in gate

**Off until `js/auth-config.js` carries a `clientId`.** With none, `Auth.resolve()`
answers `off` and the app boots exactly as it always did — so a half-finished
setup can never lock anyone out of their own flights. Turning it on is that one
file plus a redeploy.

**It is a curtain, not a lock, and the difference matters.** The app is static
files on GitHub Pages: anyone can fetch the JavaScript directly, and anyone with
devtools can write a session into localStorage. Yish was told this plainly and
chose it anyway on 2026-08-08. Do not describe it to him as securing the
syllabus, because it does not. What it does is stop someone who lands on the URL
and tie getting in to named Google accounts.

**No SDK and no popup, both deliberate.** Firebase Auth's `signInWithRedirect`
wants its handler on the app's own domain, which GitHub Pages cannot serve, and
Safari's tracking prevention breaks the cross-domain fallback. A popup is worse:
an installed iOS PWA sends `window.open` to Safari and loses the opener, so the
token never comes back. A plain top-level redirect through Google's OpenID
endpoint avoids both and needs no library.

- **Claims are checked, the signature is NOT.** Audience, issuer, expiry, nonce
  and verified-email are all verified; the RSA signature is not, because that
  needs Google's JWKS and untested crypto that could lock his brother out is
  worse than none when localStorage is editable anyway. Do not read the checks
  in `auth.js` as more than that.
- **The allowlist fails closed.** An empty `allow` blocks everyone. Entries can
  be plain addresses or SHA-256 hashes — hashes keep the addresses off the
  public web. `node dev/hash-email.js someone@gmail.com` prints them.
- **It is re-checked on every launch**, against the stored session too, so
  taking someone off the list actually takes them off it.
- **Google answers in the URL fragment, which is where the router lives.**
  `Auth.resolve()` has to run before `navigate()`; it lifts the token out and
  puts the route he was on back. Wire it in that order or sign-in lands on a
  garbage screen name.
- **Sessions are long (30 days) and read from the device**, so the app still
  opens with no signal. That is the whole reason not to use a short window.
- **Locked out?** `localStorage.removeItem('sortie:auth')` in devtools, or empty
  `clientId` in `auth-config.js` and redeploy.

## Files

```
js/auth-config.js    the only file to edit to turn the gate on or change who
js/auth.js           the gate itself
js/strings.js        every piece of UI text, Hebrew
js/syllabus.js       matching logic for the training chart
js/syllabus-data.js  the chart itself: 125 גיחות, 445 חתך rows, 12 sections
js/store.js          data layer, questions, goal loop, export
js/app.js            router and screens
css/app.css          the avionics display system
assets/make-bg.ps1   regenerates the blurred cockpit backdrop
dev/                 local harness, NOT in the repo
```

## Checking it

Both suites are in `dev/`, which is gitignored, and both drive the real code.

```
node dev/test-store.js       44 checks: the goal loop, categories, migrations
node dev/test-syllabus.js    31 checks: matching a typed גיחה to the chart
node dev/verify-syllabus.js  35 checks: the chart itself — every גיחה resolves,
                                        every category reaches it. --full lists
                                        every exercise, for eyeballing against
                                        the original chart
node dev/test-fill.js        28 checks: types a subject into the REAL תדריך and
                                        checks the right exercises land
node dev/test-auth.js        45 checks: tokens, the allowlist, sessions, the
                                        fragment handoff. No browser needed
node dev/test-gate.js        37 checks: the gate in a real browser, including
                                        that it stays invisible when unconfigured
node dev/hash-email.js       prints the allowlist hash for an address
node dev/test-upgrade.js     20 checks: boots v11, uses it, swaps in HEAD on the
                                        same origin, checks nothing went missing
node dev/test-categories.js   8 checks: every path that could drop a category
node dev/serve-test.js       47 checks: click-driven, real Chrome, real IndexedDB
node dev/shots.js            screenshots + the exported doc, into dev/shots/
node dev/inspect.js [url]    dumps what a build actually has; takes the live URL
```

`test-upgrade.js` is the one that was missing when v12 shipped. Any change to
`store.js` defaults, migrations or question shape should be run through it,
because a fresh install proves nothing about the phone in his brother's pocket.

**Never point `serve-test.js` or `shots.js` at the live URL** — they call
`Store.clearAll()`, and that origin holds real flights. `inspect.js` is
read-only and safe against live.

`serve-test.js` and `shots.js` start Chrome themselves and drive it over CDP.
**Do not add `--virtual-time-budget`** — under it IndexedDB callbacks and
service workers never fire, which is most of what these exercise. Two harness
traps worth knowing, both of which cost a debugging round here: pointing an
iframe or a tab at the same document with a different hash is a hash change and
fires no load event, and the summary's selection is read out of sessionStorage
once per document, so it needs a real navigation and not a hash bounce.

## Traps

- **Bump `VERSION` and `BUILD` together.** Forgetting leaves the app reporting a
  version it is not running.
- **The service worker is network-first for the shell, on purpose.** It was
  cache-first, which made every deploy appear one launch late: the first launch
  served the cached build while the new one downloaded behind it. Features
  looked like they had never shipped. Do not "optimise" it back.
- **Never prefer one storage over the other on load.** `Store.init` merges
  IndexedDB and the localStorage mirror by id. Taking IndexedDB whenever it had
  rows once ate two records from a half-committed write.
- **`normalize()` must not re-stamp `updatedAt`.** Load paths compare it.
- Syllabus matching folds a **letter/digit boundary into a space**, because the
  chart writes `AW3` and he types `AW 3`. It also folds gershayim against a
  straight quote. `AW 30` must never collapse into `AW 3`; there is a test.
- **A typed גיחה can be SHORTER than the chart name.** Ten entries carry a
  description after the number — `ניווט 5 - עובדה חזור`, `לילה 5 צ׳ק סולו לילה`,
  `מאמן 6 - מבחן במאמן` — and nobody types those. `lookup` matches three ways:
  exact, he-typed-more (`AW 3 לילה`), and he-typed-less, the last only when it
  lands on exactly one entry so `מבנה` alone still fills nothing. Shipped v13;
  before that those ten silently matched nothing and the סילבוס stayed empty
  with no hint why. `dev/test-syllabus.js` asserts all 101 stay reachable.
- **A no-match now says so** under the syllabus, once the subject contains a
  digit. Silence is what hid the bug above for a week.
- **`אווירובטיקה` is aliased to AW in TWO places** and needs to be. `syllabus.js`
  folds it so the right exercises load; `store.js` folds it so the flight is
  filed under the AW *category*. With only the first, writing אווירובטיקה 7
  loaded the right syllabus and then dropped out of the AW filter and the AW
  goal carry entirely.
- **`.map(flightRow)` is a trap.** map passes the index as the second argument,
  which is flightRow's `selectable` flag, so every row after the first drew a
  selection checkbox instead of its chevron. Wrap it.
- Drag-to-reorder is **pointer events, not HTML5 drag-and-drop** — iOS Safari
  fires no dragstart on touch. The grip's `touch-action: none` is what stops the
  page scrolling instead of the row moving; do not drop it.
- **ניווט, אוויר אוויר and מבנה גובה נמוך each had an SBT 1 and SBT 2.** Those six
  are prefixed with their section (`ניווט SBT 1`, `א״א SBT 1`, `גנ״מ SBT 1`).
  Every other name is verbatim from the chart.
- **Two sections were missing from the transcription until v14** and nobody
  noticed for a week: **מבנה גובה נמוך** (where every גנ״מ גיחה lives) and
  **מאמן חירומים** (16 simulator sorties). A category he can pick that reaches
  no גיחה is the signature of this; `dev/verify-syllabus.js` now asserts every
  one of the 11 categories reaches the chart, so it cannot happen silently again.
- **A category can be spelled two ways and both must file the same.** There are
  now two alias tables and they are NOT the same thing:
  `syllabus.js ALIASES` folds a typed name onto a chart name so the right
  exercises load (`אווירובטיקה`→`AW`, `מ״מ`→`מבנה מתקדם`), while
  `store.js CAT_ALIASES` folds a written subject onto a category so filtering
  and the goal carry see it (`אווירובטיקה`→`AW`, `מבנה מתקדם`→`מ״מ`). Note they
  point opposite ways: he types the short form, the chart writes the long one.
  Adding a spelling usually needs an entry in both.
- **סולו and הקפות are modifiers, not גיחה prefixes.** `סולו 3` matches nothing
  on purpose; the גיחות are `סולו אווירובטיקה 3`, `סולו מכונס`, `סולו א״א`.
- Headless Chrome on Windows will not size a window below ~500px and leaks the
  system DPI into `innerWidth`. Use `dev/preview.html` for phone-accurate shots.
- IndexedDB callbacks and service workers do not fire under
  `--virtual-time-budget`. Those paths cannot be verified headlessly.
- A headless screenshot of the app in a **cross-origin** iframe comes out empty,
  because `.stagger` uses `animation-fill-mode: both`. Keep the harness
  same-origin, or screenshot the live URL.
- GitHub Pages builds on this repo have timed out twice. `gh api -X POST
  repos/yzgershon/sortie/pages/builds` retriggers one.

## Not done

- **The sign-in path is verified on BOTH platforms, 2026-08-08.** Android
  (Yish's Galaxy S24, Chrome) and iOS (a family iPhone, Safari, installed to the
  home screen and signed in from there — not just in a Safari tab, which proves
  nothing about standalone). Gate, Google redirect, token, allowlist, session,
  sign-out and back in, all working on both.
  Do NOT say "iPhone" about Yish's device; he is on Android. That was wrong
  through most of this project.
- **Google's Testing mode does not block non-owner accounts here.** The consent
  screen still reads Testing / External / 0 test users, and a plain family
  Google account — not an owner of the Cloud project — signed in fine. The app
  asks only for `openid` and `email`, both non-sensitive, so Google appears not
  to gate basic sign-in on the test-user list and does not count these against
  the 100-user cap (the counter sat at 0 after real sign-ins).
  So **publishing the consent screen is optional, not required.** It was pushed
  hard earlier on the assumption that Testing would lock the other 22 out; the
  evidence says otherwise. Publishing would still remove the dependency on
  undocumented leniency, and costs one click, but nothing is broken without it.
  No refresh tokens are used, so the 7-day Testing-mode token expiry does not
  apply either.
  Also still unchecked on iOS: `<dialog>` sheets, `navigator.share` for the
  exports, the date input, safe-area insets, whether
  `navigator.storage.persist()` is granted, and whether the summary document
  opens in Google Docs. **Drag-to-reorder especially** — only ever driven by
  synthetic pointer events, never by a thumb, and the auto-scroll at the screen
  edges is the part most likely to feel wrong.
- **The gate is built but not switched on.** It needs two things from Yish: an
  OAuth client ID from Google Cloud Console (Web application, with
  `https://yzgershon.github.io/sortie/` as an authorized redirect URI and
  `https://yzgershon.github.io` as an authorized JavaScript origin) and the
  addresses to allow. Both go in `js/auth-config.js`.
- **The gate does not make the syllabus private.** The repo is public, so
  `js/syllabus-data.js` is readable on github.com whatever guards the website.
  Really removing that exposure means either a private repo on a host that
  serves it behind auth (Cloudflare Pages + Access), or not shipping the chart
  at all and having his brother import it once from a file. Yish knows; he chose
  the sign-in gate on 2026-08-08 for what it does cover.
- **Sign-in has never run against real Google, or on an iPhone.** Every check
  uses a synthetic token. The two things most likely to bite: whether an
  installed iOS PWA follows the redirect to accounts.google.com and comes back
  inside the app rather than bouncing to Safari, and whether the redirect URI
  registered in Google matches exactly (`/sortie/` and `/sortie/index.html` are
  different URIs — register both).
- **Two names are reconstructed, not read.** The row above AW 3 had an empty
  גיחה cell, which in these tables means it continues the row before, so it is
  filed as **AW 2** and its list may be the tail of a longer one. The row after
  סולו משולבת 1 was cut mid-word to `כחול במידת הצורך)` and is filed as
  **סולו משולבת 2 (יבוצע כחול במידת הצורך)**. Both need a look at the original.
- There is still **no הקפות section** in the supplied chart — the only גיחה
  carrying the word is `סולו הקפות 1`, under לילה. So `הקפות 12` fills nothing.
  Either a page is missing or הקפות genuinely has no syllabus of its own.
- **Not shown to the brother yet.** Wording and grouping still need his read.

## Next

1. Install on his iPhone from **Safari**, Share, Add to Home Screen. Settle the
   URL first: a PWA's stored flights are tied to its origin, so moving hosts
   later costs him his data.
2. Run one real brief and debrief end to end.
3. Confirm the Hebrew wording and the two missing chart rows.
