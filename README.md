# Sortie

A daily flight debrief app for iPhone. Replaces the "Daily Flight Debrief" Google
Form with something that closes the loop: the goals you set at the end of one
sortie are the first thing you see before the next one.

Built for Yish's brother. Hebrew flight categories stay in Hebrew.

## What it does

Same seven questions as the form, grouped into the three phases of a debrief:

| Phase | Fields |
|---|---|
| — | Sortie #, Date flown, Flight Category |
| **Diagnose** | Observed Deficit, Root Cause, Match Point, Tags *(new, optional)* |
| **Extract** | Top 3 |
| **Commit** | Target Goals For Next Sortie |

Flight categories ship as `הקפות · AW · מבנה · ניווט · BFM · שילוב`, plus "Other"
and a category editor in Settings. Every one of them is editable, in Hebrew or
English.

On top of the form:

- **Goals carry forward.** Last sortie's Target Goals appear on the home screen
  as a checklist for the flight you are about to brief. Tap one when you hit it.
- **Sortie log** with full-text search across every answer, in both languages,
  and category filter chips.
- **Patterns** — sorties per week, category mix, goal follow-through rate, the
  tags that keep repeating, and one answer read across every sortie in a row
  (the fastest way to spot a recurring root cause).
- **Auto sortie numbering**, drafts that survive a phone call mid-entry.
- **Export** to CSV (opens in Sheets/Excel with the Hebrew intact) or a JSON
  backup that restores everything.
- **Screen code** — optional 4-digit lock.
- **Works with no signal.** Installed to the home screen it opens full screen.

## Privacy

There is no server, no account, and no analytics. Nothing typed into the app
leaves the phone. The only way data moves is when you explicitly export a file
and choose where it goes.

The screen code deters someone picking up the phone; it is not encryption.

## Stack

Plain HTML, CSS and JavaScript. No build step, no dependencies, no framework.
A PWA, so it installs to the iPhone home screen from Safari.

```
index.html              app shell
css/app.css             design tokens + every component
js/store.js             data layer (IndexedDB + localStorage mirror)
js/app.js               router + screens
js/icons.js             inline SVG icon set
sw.js                   service worker (offline)
manifest.webmanifest    home-screen install
icons/                  app icons + make-icons.ps1 to regenerate them
```

### Storage

IndexedDB is the store of record with a localStorage mirror alongside it. On
boot the two are **merged by id, newest wins** — neither is trusted to be
complete, because IndexedDB can hold a half-committed write if the app was
killed mid-save and the mirror can be capped by quota. Every IndexedDB call has
a 2 second deadline; if it misses, the app still boots off the mirror rather
than hanging on a blank screen.

iOS can evict site data for web apps that go unused. Installing to the home
screen and running `navigator.storage.persist()` (the app asks on every boot)
makes that unlikely, but **the export in Settings is the real backup** — the app
nags if it has been more than 14 days.

## Running it locally

```bash
cd C:\Dev\sortie
python -m http.server 8899 --bind 127.0.0.1
```

Then open `http://127.0.0.1:8899/`.

There is a local review harness at `dev/preview.html` that renders the app in a
390x844 phone frame with buttons to jump between screens, switch themes, and
load sample debriefs.

**`dev/` is deliberately not in this repo** (see `.gitignore`). It is a local
tool only. Publishing it would put `dev/seed.html` on the live site, and that
page overwrites stored debriefs with sample data — a live URL that quietly
destroys real ones. Keep it local.

## Deploying

Static files, so anything with HTTPS works. HTTPS is required: without it iOS
will not install to the home screen and the screen code cannot hash.

Currently on **GitHub Pages**, served from `main` at the repo root:
`https://yzgershon.github.io/sortie/`. Pushing to `main` redeploys.

**Bump `VERSION` in `sw.js` on every deploy** or phones keep serving the old
cached build. GitHub Pages sends `max-age=600` on assets, so a bumped service
worker reaches phones within about ten minutes of a push.

The repo is public because GitHub Pages will not serve a private repo on a free
plan. Nothing here is secret and no user data is in the repo, but if that
changes, the free ways to host a private copy are Cloudflare Pages or Firebase
Hosting. Note that Cloudflare's CLI cannot be installed on a Windows ARM64
machine, so that route means the dashboard.

## Installing on the iPhone

Open the URL in **Safari** (not Chrome), then Share → **Add to Home Screen**.
It then opens full screen with its own icon and works offline.
