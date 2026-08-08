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

## Files

```
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

- **Never run on a real iPhone.** Everything so far is headless Chrome on
  Windows. Check first: `<dialog>` sheets, `navigator.share` for the exports,
  the date input, safe-area insets, whether `navigator.storage.persist()` is
  granted, and whether the summary document opens in Google Docs.
  **Drag-to-reorder especially** — it has only ever been driven by synthetic
  pointer events, never by a thumb, and the auto-scroll at the screen edges is
  the part most likely to feel wrong.
- **Access control.** The repo is public and so is the syllabus. Yish published
  it knowingly on 2026-08-07 and wants it gated by specific email or a passcode
  later. That needs a host with auth; the on-device model has no server.
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
