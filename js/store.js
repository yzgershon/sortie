/* Sortie — data layer.
 *
 * Everything lives on the device. There is no server, no account, no analytics
 * and no network call after the app is installed. IndexedDB is the store of
 * record; localStorage keeps a mirror so a corrupt/blocked IDB can still be
 * recovered. Reads are served from an in-memory array so rendering stays sync.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'sortie';
  var DB_VER = 1;
  var STORE = 'sorties';
  var LS_MIRROR = 'sortie:mirror';
  var LS_SETTINGS = 'sortie:settings';
  var LS_DRAFT = 'sortie:draft';
  var SCHEMA = 1;

  var DEFAULT_CATEGORIES = ['הקפות', 'AW', 'מבנה', 'ניווט', 'BFM', 'שילוב'];

  var db = null;
  var dbHealthy = false; // false => the localStorage mirror is the store of record
  var cache = [];        // all sorties, newest first
  var settings = null;

  /* ---------------------------------------------------------------- utils */

  function uid() {
    return 's_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function todayISO(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* IndexedDB can hang instead of failing — a blocked version upgrade, Safari
   * private browsing, storage pressure. Never let that stall the boot: every
   * IDB call resolves within a deadline, and if it misses we fall back to the
   * localStorage mirror rather than showing a blank screen after a flight. */
  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(v);
      }
      var timer = setTimeout(function () { finish(fallback); }, ms);
      promise.then(finish, function () { finish(fallback); });
    });
  }

  /* ------------------------------------------------------------ indexeddb */

  function openDB() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); }
      catch (e) { return resolve(null); }

      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          var os = d.createObjectStore(STORE, { keyPath: 'id' });
          os.createIndex('flownAt', 'flownAt');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }

  function idbAll() {
    return new Promise(function (resolve) {
      if (!db) return resolve(null);
      try {
        var tx = db.transaction(STORE, 'readonly');
        var rq = tx.objectStore(STORE).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function idbPut(rec) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(rec);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function idbDelete(id) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(id);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function idbClear() {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  function mirror() {
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(cache)); }
    catch (e) { /* quota — IDB is still the store of record */ }
  }

  function readMirror() {
    try { return JSON.parse(localStorage.getItem(LS_MIRROR) || '[]'); }
    catch (e) { return []; }
  }

  /* -------------------------------------------------------------- records */

  function normalize(r) {
    return {
      id: r.id || uid(),
      sortieNo: String(r.sortieNo == null ? '' : r.sortieNo).trim(),
      category: r.category || '',
      flownAt: r.flownAt || todayISO(),
      observedDeficit: r.observedDeficit || '',
      rootCause: r.rootCause || '',
      matchPoint: r.matchPoint || '',
      top3: Array.isArray(r.top3) ? r.top3.slice(0, 6) : ['', '', ''],
      targetGoals: (Array.isArray(r.targetGoals) ? r.targetGoals : []).map(function (g) {
        return typeof g === 'string'
          ? { text: g, done: false }
          : { text: g.text || '', done: !!g.done };
      }),
      tags: Array.isArray(r.tags) ? r.tags : [],
      createdAt: r.createdAt || Date.now(),
      // preserved, not stamped: load paths compare updatedAt to pick a winner.
      // save() bumps it explicitly.
      updatedAt: r.updatedAt || r.createdAt || Date.now()
    };
  }

  /** Newest first: by flight date, then by creation time. */
  function sortRecords(a, b) {
    if (a.flownAt !== b.flownAt) return a.flownAt < b.flownAt ? 1 : -1;
    return b.createdAt - a.createdAt;
  }

  function resort() { cache.sort(sortRecords); }

  /* ------------------------------------------------------------- settings */

  function defaultSettings() {
    return {
      schema: SCHEMA,
      theme: 'dark',
      categories: DEFAULT_CATEGORIES.slice(),
      pin: null,
      lastExport: 0,
      installDismissed: false
    };
  }

  function loadSettings() {
    var s;
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null'); }
    catch (e) { s = null; }
    var base = defaultSettings();
    if (s && typeof s === 'object') {
      Object.keys(base).forEach(function (k) {
        if (s[k] !== undefined) base[k] = s[k];
      });
    }
    if (!Array.isArray(base.categories) || !base.categories.length) {
      base.categories = DEFAULT_CATEGORIES.slice();
    }
    return base;
  }

  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); }
    catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ pin */

  function bufToB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function b64ToBuf(b64) {
    var s = atob(b64), a = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return a;
  }

  function cryptoReady() {
    return !!(global.crypto && global.crypto.subtle && global.isSecureContext);
  }

  function derive(pin, saltBytes) {
    var enc = new TextEncoder();
    return crypto.subtle
      .importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: saltBytes, iterations: 150000, hash: 'SHA-256' },
          key, 256
        );
      });
  }

  function setPin(pin) {
    if (!cryptoReady()) return Promise.resolve(false);
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return derive(pin, salt).then(function (bits) {
      settings.pin = { salt: bufToB64(salt), hash: bufToB64(bits) };
      saveSettings();
      return true;
    });
  }

  function checkPin(pin) {
    if (!settings.pin || !cryptoReady()) return Promise.resolve(true);
    return derive(pin, b64ToBuf(settings.pin.salt)).then(function (bits) {
      return bufToB64(bits) === settings.pin.hash;
    }).catch(function () { return false; });
  }

  function clearPin() { settings.pin = null; saveSettings(); }

  /* --------------------------------------------------------------- export */

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // Byte-order mark, written as an escape so no tool can silently strip it.
  var BOM = String.fromCharCode(0xFEFF);

  function toCSV() {
    var head = ['Date', 'Sortie #', 'Flight Category', 'Observed Deficit',
      'Root Cause', 'Match Point', 'Top 3',
      'Target Goals For Next Sortie', 'Goals Achieved', 'Tags', 'Logged At'];
    var rows = cache.slice().reverse().map(function (r) {
      var goals = r.targetGoals.filter(function (g) { return g.text.trim(); });
      return [
        r.flownAt, r.sortieNo, r.category, r.observedDeficit, r.rootCause, r.matchPoint,
        r.top3.filter(Boolean).map(function (t, i) { return (i + 1) + '. ' + t; }).join(' | '),
        goals.map(function (g, i) { return (i + 1) + '. ' + g.text; }).join(' | '),
        goals.filter(function (g) { return g.done; }).length + '/' + goals.length,
        r.tags.join(', '),
        new Date(r.createdAt).toISOString()
      ].map(csvCell).join(',');
    });
    // Excel and Sheets need the BOM or they render the Hebrew as mojibake
    return BOM + head.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
  }

  function toJSON() {
    return JSON.stringify({
      app: 'sortie', schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      categories: settings.categories,
      sorties: cache
    }, null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : data.sorties;
    if (!Array.isArray(list)) throw new Error('No sorties found in that file.');

    var byId = {};
    cache.forEach(function (r) { byId[r.id] = r; });

    var added = 0, updated = 0;
    var writes = list.map(function (raw) {
      var rec = normalize(raw);
      if (byId[rec.id]) {
        // keep whichever record was touched last
        if ((raw.updatedAt || 0) <= (byId[rec.id].updatedAt || 0)) return null;
        Object.assign(byId[rec.id], rec);
        updated++;
        return idbPut(byId[rec.id]);
      }
      cache.push(rec); byId[rec.id] = rec; added++;
      return idbPut(rec);
    }).filter(Boolean);

    if (Array.isArray(data.categories) && data.categories.length) {
      data.categories.forEach(function (c) {
        if (settings.categories.indexOf(c) === -1) settings.categories.push(c);
      });
      saveSettings();
    }

    resort(); mirror();
    return Promise.all(writes).then(function () {
      return { added: added, updated: updated };
    });
  }

  /* -------------------------------------------------------------- drafts */

  function saveDraft(d) {
    try { localStorage.setItem(LS_DRAFT, JSON.stringify(d)); } catch (e) {}
  }
  function readDraft() {
    try { return JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); }
    catch (e) { return null; }
  }
  function clearDraft() {
    try { localStorage.removeItem(LS_DRAFT); } catch (e) {}
  }

  /* ------------------------------------------------------------------ api */

  var Store = {
    DEFAULT_CATEGORIES: DEFAULT_CATEGORIES,
    todayISO: todayISO,
    uid: uid,

    init: function () {
      settings = loadSettings();
      return withTimeout(openDB(), 2000, null).then(function (d) {
        db = d;
        return withTimeout(idbAll(), 2000, null);
      }).then(function (rows) {
        // rows === null means IDB is missing, blocked, or too slow to trust
        dbHealthy = rows !== null;

        // Union both stores by id rather than picking one. Neither is trusted
        // to be complete: IDB can hold a half-committed restore if the app was
        // killed mid-write, and the mirror can be stale or capped by quota.
        // Preferring one store outright silently loses debriefs, which is the
        // one bug this app cannot have.
        var byId = {};
        readMirror().forEach(function (raw) {
          var r = normalize(raw); byId[r.id] = r;
        });
        (rows || []).forEach(function (raw) {
          var r = normalize(raw);
          var have = byId[r.id];
          if (!have || (r.updatedAt || 0) >= (have.updatedAt || 0)) byId[r.id] = r;
        });
        cache = Object.keys(byId).map(function (k) { return byId[k]; });
        resort();
        mirror();

        // Backfill whatever IDB is missing so the two stores converge.
        if (db && dbHealthy) {
          var inDb = {};
          (rows || []).forEach(function (r) { inDb[r.id] = 1; });
          cache.forEach(function (r) { if (!inDb[r.id]) idbPut(clone(r)); });
        }
        // Ask the browser to keep this data. Home-screen installs are the ones
        // that actually get granted; ignore the answer either way.
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(function () {});
        }
        return Store;
      });
    },

    /* records */
    all: function () { return cache; },
    count: function () { return cache.length; },
    get: function (id) {
      for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i];
      return null;
    },
    latest: function () { return cache[0] || null; },

    /** Next sortie number, guessed from the most recent numeric one. */
    nextSortieNo: function () {
      for (var i = 0; i < cache.length; i++) {
        var m = /(\d+)\s*$/.exec(cache[i].sortieNo || '');
        if (m) {
          var prefix = cache[i].sortieNo.slice(0, m.index);
          return prefix + String(parseInt(m[1], 10) + 1);
        }
      }
      return '';
    },

    save: function (rec) {
      var existing = rec.id ? Store.get(rec.id) : null;
      var out;
      if (existing) {
        out = normalize(Object.assign({}, existing, rec));
        Object.assign(existing, out);
        out = existing;
      } else {
        out = normalize(rec);
        cache.push(out);
      }
      out.updatedAt = Date.now();
      resort(); mirror();
      return idbPut(clone(out)).then(function () { return out; });
    },

    remove: function (id) {
      cache = cache.filter(function (r) { return r.id !== id; });
      mirror();
      return idbDelete(id);
    },

    clearAll: function () {
      cache = [];
      mirror(); clearDraft();
      return idbClear();
    },

    /** Full-text search across every answer. */
    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return cache;
      return cache.filter(function (r) {
        var hay = [
          r.sortieNo, r.category, r.observedDeficit, r.rootCause, r.matchPoint,
          r.top3.join(' '),
          r.targetGoals.map(function (g) { return g.text; }).join(' '),
          r.tags.join(' '), r.flownAt
        ].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
    },

    /** Every tag ever used, most frequent first. */
    allTags: function () {
      var counts = {};
      cache.forEach(function (r) {
        r.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
      });
      return Object.keys(counts)
        .sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); })
        .map(function (t) { return { tag: t, n: counts[t] }; });
    },

    /** Where the data actually lives, so Settings can say so honestly. */
    storageMode: function () { return dbHealthy ? 'indexeddb' : 'local'; },

    /* settings */
    settings: function () { return settings; },
    set: function (k, v) { settings[k] = v; saveSettings(); },

    setPin: setPin,
    checkPin: checkPin,
    clearPin: clearPin,
    cryptoReady: cryptoReady,

    /* transfer */
    toCSV: toCSV,
    toJSON: toJSON,
    importJSON: importJSON,
    markExported: function () { settings.lastExport = Date.now(); saveSettings(); },

    /* drafts */
    saveDraft: saveDraft,
    readDraft: readDraft,
    clearDraft: clearDraft
  };

  global.Store = Store;
})(window);
