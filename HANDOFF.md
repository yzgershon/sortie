# Sortie — handoff

Last updated: 2026-08-06

## Live

**https://yzgershon.github.io/sortie/** — GitHub Pages, `main` at repo root.
Repo: `yzgershon/sortie`, **public**.

Push to `main` to redeploy. **Bump `VERSION` in `sw.js` in the same push** or
phones keep the cached build. Pages sends `max-age=600`, so a bumped service
worker reaches a phone within about ten minutes.

The repo is public because GitHub Pages will not serve a private repo on a free
plan (`HTTP 422`). Yish accepted that and wants to revisit privacy later. The
free private options are Cloudflare Pages (dashboard only, its CLI cannot
install on Windows ARM64) or Firebase Hosting (CLI works fine, needs one
`firebase login`).

## State

**v1 built, deployed, and verified live. Never run on a real iPhone.**

Every screen renders and was checked at a real 390x844 viewport in both themes:
Home, New debrief, Log, Sortie detail, Patterns, Settings. The data layer has
node tests covering CSV/JSON round trip with Hebrew, sortie numbering, search,
and the IndexedDB/mirror merge. The live site was verified for asset resolution,
HTTPS redirect, `dev/` returning 404, and the first-run empty state.

## What is NOT done

- **Never run on an actual iPhone.** Everything so far is headless Chrome on
  Windows. Safari-specific things to check first: `<dialog>` sheets,
  `navigator.share` for export, the date input, safe-area insets on a notched
  phone, and whether `navigator.storage.persist()` is granted.
- **Not shown to the brother.** Field names and the three-phase grouping are my
  reading of the form; his squadron's debrief methodology may group them
  differently. Grouping is cosmetic — the fields and their names are verbatim
  from the form.
- The **Tags** field is an addition, not on the original form. It is optional
  and drives the "what keeps repeating" panel in Patterns.

## Decisions already made

- **PWA, not native.** No Mac, no Apple Developer account. Installed to the home
  screen it is full screen with its own icon. A native app would mean $99/yr and
  a Mac.
- **On-device only.** No server, no account, no analytics, no network call after
  install. Simpler to build and the right default for sortie debriefs. This is
  why backup is an explicit export rather than cloud sync.
- **Hebrew categories verbatim.** `הקפות · AW · מבנה · ניווט · BFM · שילוב`.
  Free-text fields use `dir="auto"` so each answer renders in its own direction,
  and rows with Hebrew text mirror their checkbox/number to the right.
- **Export columns match the form's question names** so the CSV drops straight
  into the existing sheet.

## Traps

- **Bump `VERSION` in `sw.js` on every deploy.** The service worker is
  cache-first for CSS/JS. Without a bump, phones keep the old build. This bit me
  during review: edits appeared to do nothing in a reused browser profile.
- **Never prefer one storage over the other on load.** `Store.init` merges
  IndexedDB and the localStorage mirror by id. An earlier version took
  IndexedDB whenever it had any rows, and a half-committed write silently ate
  two sorties. There is a regression test for this.
- **`normalize()` must not re-stamp `updatedAt`.** Load paths compare it to pick
  a winner; only `save()` bumps it.
- Headless Chrome on Windows will not size a window below ~500px and leaks the
  system DPI into `innerWidth`. Use `dev/preview.html` for phone-accurate
  screenshots, not `--window-size`.
- IndexedDB callbacks never fire under `--virtual-time-budget`, so headless runs
  always land on the mirror path. That is a headless artifact, not a bug.
- A headless screenshot of the app inside a **cross-origin** iframe comes out
  with an empty body: the `.stagger` entrance animation uses
  `animation-fill-mode: both`, so the content sits at opacity 0 until the
  animation runs, and it does not run in time there. Screenshot the live URL
  directly. Same reason the local harness must stay same-origin.
- **The first GitHub Pages build on this repo timed out** (`Timeout reached,
  aborting!` after 10 minutes, stuck in `deployment_in_progress`). Nothing was
  wrong with the code. `gh api -X POST repos/yzgershon/sortie/pages/builds`
  triggered a rebuild that succeeded in about three minutes.

## Next

1. Install on the brother's iPhone: open the URL in **Safari** (not Chrome),
   Share, Add to Home Screen. Run one real debrief end to end.
2. Confirm the field grouping and Hebrew wording with him.
3. UI changes are the next work item and Yish wants to drive them.
4. Then pick from the "maybe later" list in
   `C:\Dev\SecondBrain\projects\sortie\overview.md`.
