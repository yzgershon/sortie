# Sortie — handoff

Last updated: 2026-08-06

## State

**v1 built and reviewed locally. Not deployed, not on a phone yet.**

Every screen renders and was checked at a real 390x844 viewport in both themes:
Home, New debrief, Log, Sortie detail, Patterns, Settings. The data layer has
node tests covering CSV/JSON round trip with Hebrew, sortie numbering, search,
and the IndexedDB/mirror merge.

## What is NOT done

- **Never run on an actual iPhone.** Everything so far is headless Chrome on
  Windows. Safari-specific things to check first: `<dialog>` sheets,
  `navigator.share` for export, the date input, safe-area insets on a notched
  phone, and whether `navigator.storage.persist()` is granted.
- **Not deployed.** No host chosen yet, so nothing to install from.
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

## Next

1. Pick a host (Cloudflare Pages from a private repo) and deploy.
2. Install on the brother's iPhone from Safari, run one real debrief end to end.
3. Show him the screens and confirm the field grouping and Hebrew wording.
4. Then pick from the "maybe later" list in
   `C:\Dev\SecondBrain\projects\sortie\overview.md`.
