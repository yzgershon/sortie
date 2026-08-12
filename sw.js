/* Sortie — service worker.
 *
 * The app shell is cached on install so Sortie opens with no signal at all.
 * Google Fonts are cached the first time they load, then served from cache.
 * Nothing here ever uploads anything: there is no server to upload to.
 */
/* Bump VERSION on every deploy: old caches are dropped on activate. */
var VERSION = 'sortie-v19';
var SHELL = VERSION + '-shell';
var ASSETS = VERSION + '-assets';

var SHELL_FILES = [
  './',
  './index.html',
  './css/app.css',
  './js/strings.js',
  './js/auth-config.js',
  './js/auth.js',
  './js/syllabus.js',
  './js/syllabus-data.js',
  './js/icons.js',
  './js/store.js',
  './js/app.js',
  './manifest.webmanifest',
  './assets/cockpit.jpg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL)
      .then(function (c) { return c.addAll(SHELL_FILES); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  var sameOrigin = url.origin === self.location.origin;
  var isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  if (!sameOrigin && !isFont) return;

  // Fonts: cache-first and keep forever. They never change under a given URL.
  if (isFont) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(ASSETS).then(function (c) { c.put(req, copy); });
          return res;
        }).catch(function () { return hit; });
      })
    );
    return;
  }

  // Navigations: network-first so a redeploy lands, cache as the fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (hit) {
          return hit || caches.match('./');
        });
      })
    );
    return;
  }

  // The app's own JS and CSS: network-first, cache as the fallback.
  //
  // Cache-first was wrong here. It meant a fresh deploy only appeared on the
  // SECOND launch, because the first served the cached build while the new one
  // downloaded behind it, so updates looked like they had simply not shipped.
  // Network-first means being online always gets the current build; the cache
  // is still a complete copy, so with no signal the app opens exactly as
  // before. These files total ~120KB, so the round trip costs little.
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(SHELL).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || Response.error();
      });
    })
  );
});
