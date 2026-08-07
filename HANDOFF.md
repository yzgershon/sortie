# תחקיר — handoff

Last updated: 2026-08-07

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

**The goal loop:** goals get ✓ or ✗. A ✗ writes the goal straight into
יעדים לטיסה הבאה further down the same form, and clearing the ✗ removes it
again. Only rows added that way are removed, so a hand-typed goal is never
pulled out underneath him. On save, next-flight goals plus anything missed
become the live list on Home.

**Questions are data he owns.** הגדרות edits label, type, stage, options and
order. Only the two goal questions are locked (`PROTECTED` in `store.js`).
Deleting archives rather than destroys, so old answers still render.

## Files

```
js/strings.js        every piece of UI text, Hebrew
js/syllabus.js       matching logic for the training chart
js/syllabus-data.js  the chart itself: 101 גיחות, 407 חתך rows
js/store.js          data layer, questions, goal loop, export
js/app.js            router and screens
css/app.css          the avionics display system
assets/make-bg.ps1   regenerates the blurred cockpit backdrop
dev/                 local review harness, NOT in the repo
```

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
- **ניווט and אוויר אוויר both had an SBT 1 and SBT 2.** Those four are prefixed
  with their section. Every other name is verbatim from the chart.
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
- **Access control.** The repo is public and so is the syllabus. Yish published
  it knowingly on 2026-08-07 and wants it gated by specific email or a passcode
  later. That needs a host with auth; the on-device model has no server.
- **Two chart rows are missing** because they were cut off in the screenshots:
  the גיחה above AW 3, and one משולבת row cut to `כחול במידת הצורך)`.
- There is **no הקפות section** in the supplied chart.
- **Not shown to the brother yet.** Wording and grouping still need his read.

## Next

1. Install on his iPhone from **Safari**, Share, Add to Home Screen. Settle the
   URL first: a PWA's stored flights are tied to its origin, so moving hosts
   later costs him his data.
2. Run one real brief and debrief end to end.
3. Confirm the Hebrew wording and the two missing chart rows.
