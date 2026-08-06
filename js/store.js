/* תחקיר — data layer.
 *
 * Everything lives on the device. No server, no account, no analytics, no
 * network call after install. IndexedDB is the store of record with a
 * localStorage mirror; the two are merged by id on boot so a half-committed
 * write can never lose a debrief.
 *
 * v2 model: the debrief is no longer fixed fields in code. The pilot owns a
 * list of QUESTIONS, and each debrief stores ANSWERS keyed by question id.
 * Two questions carry the roles goalsThis / goalsNext and drive the goal
 * carry-forward loop; they can be renamed and reordered but not deleted.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'sortie';
  var DB_VER = 1;
  var STORE = 'sorties';
  var LS_MIRROR = 'sortie:mirror';
  var LS_SETTINGS = 'sortie:settings';
  var LS_DRAFT = 'sortie:draft';
  var SCHEMA = 2;

  var db = null;
  var dbHealthy = false;
  var cache = [];
  var settings = null;

  /* ------------------------------------------------- default question set */

  function defaultQuestions() {
    return [
      { id: 'q_sortie',     label: 'מספר גיחה',        type: 'text',     role: 'sortieNo' },
      { id: 'q_period',     label: 'פיריט',             type: 'choice',   options: ['1', '2', '3', '4'] },
      { id: 'q_category',   label: 'קטגוריית טיסה',     type: 'choice',
        options: ['הקפות', 'AW', 'מבנה', 'ניווט', 'BFM', 'שילוב'] },
      { id: 'q_subject',    label: 'נושא טיסה',         type: 'text' },
      { id: 'q_instructor', label: 'מדריך',             type: 'text' },
      { id: 'q_hours',      label: 'שעות טיסה',         type: 'number' },
      { id: 'q_solo',       label: 'אישור לסולו',       type: 'choice',   options: ['כן', 'לא'] },
      { id: 'q_deficit',    label: 'ליקוי שנצפה',       type: 'textarea' },
      { id: 'q_cause',      label: 'שורש הבעיה',        type: 'textarea' },
      { id: 'q_match',      label: 'נקודת השוואה',      type: 'textarea' },
      { id: 'q_top3',       label: '3 מסקנות עיקריות',  type: 'textarea' },
      { id: 'q_tags',       label: 'תגיות',             type: 'text' },
      { id: 'q_goals_this', label: 'יעדים יומיים',      type: 'goals',    role: 'goalsThis' },
      { id: 'q_goals_next', label: 'יעדים לטיסה הבאה',  type: 'goals',    role: 'goalsNext' }
    ].map(function (q, i) {
      q.order = i; q.archived = false; q.hint = q.hint || '';
      return q;
    });
  }

  var TYPES = ['text', 'textarea', 'choice', 'number', 'date', 'goals'];

  // Only the two ends of the goal loop are undeletable. Everything else,
  // including the sortie number, is his to remove.
  var PROTECTED = ['goalsThis', 'goalsNext'];
  function isProtected(q) { return !!q && PROTECTED.indexOf(q.role) !== -1; }

  /* ---------------------------------------------------------------- utils */

  function uid(p) {
    return (p || 's') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 7);
  }

  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

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
          d.createObjectStore(STORE, { keyPath: 'id' }).createIndex('flownAt', 'flownAt');
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
        var rq = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        rq.onsuccess = function () { resolve(rq.result || []); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
  }

  function idbWrite(fn) {
    return new Promise(function (resolve) {
      if (!db) return resolve(false);
      try {
        var tx = db.transaction(STORE, 'readwrite');
        fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  var idbPut = function (r) { return idbWrite(function (os) { os.put(r); }); };
  var idbDelete = function (id) { return idbWrite(function (os) { os.delete(id); }); };
  var idbClear = function () { return idbWrite(function (os) { os.clear(); }); };

  function mirror() {
    try { localStorage.setItem(LS_MIRROR, JSON.stringify(cache)); } catch (e) {}
  }
  function readMirror() {
    try { return JSON.parse(localStorage.getItem(LS_MIRROR) || '[]'); }
    catch (e) { return []; }
  }

  /* ------------------------------------------------------------- settings */

  function defaultSettings() {
    return {
      schema: SCHEMA,
      theme: 'dark',
      questions: defaultQuestions(),
      nextGoals: [],          // the live list for the upcoming flight
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
      // v1 stored a flat `categories` array and no questions at all
      if (!Array.isArray(s.questions) || !s.questions.length) {
        base.questions = defaultQuestions();
        if (Array.isArray(s.categories) && s.categories.length) {
          base.questions.forEach(function (q) {
            if (q.id === 'q_category') q.options = s.categories.slice();
          });
        }
      }
    }
    base.questions = base.questions.map(normalizeQuestion);
    ensureRoles(base.questions);
    if (!Array.isArray(base.nextGoals)) base.nextGoals = [];
    base.nextGoals = base.nextGoals.map(normalizeGoal);
    base.schema = SCHEMA;
    return base;
  }

  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }

  function normalizeQuestion(q, i) {
    return {
      id: q.id || uid('q'),
      label: String(q.label || '').trim() || 'שאלה',
      type: TYPES.indexOf(q.type) === -1 ? 'text' : q.type,
      options: Array.isArray(q.options) ? q.options.filter(function (o) { return String(o).trim(); }) : [],
      hint: q.hint || '',
      role: q.role || null,
      archived: !!q.archived,
      order: typeof q.order === 'number' ? q.order : i
    };
  }

  /** The goal loop needs one question at each end; put them back if lost. */
  function ensureRoles(qs) {
    ['goalsThis', 'goalsNext'].forEach(function (role) {
      if (qs.some(function (q) { return q.role === role && !q.archived; })) return;
      var def = defaultQuestions().filter(function (q) { return q.role === role; })[0];
      def.order = qs.length;
      qs.push(def);
    });
  }

  function normalizeGoal(g) {
    if (typeof g === 'string') g = { text: g };
    return {
      id: g.id || uid('g'),
      text: String(g.text == null ? '' : g.text),
      status: ['open', 'met', 'missed'].indexOf(g.status) === -1 ? 'open' : g.status
    };
  }

  /* -------------------------------------------------------------- records */

  function normalize(r) {
    var out = {
      id: r.id || uid('d'),
      flownAt: r.flownAt || todayISO(),
      answers: {},
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.updatedAt || r.createdAt || Date.now()
    };

    if (r.answers && typeof r.answers === 'object') {
      Object.keys(r.answers).forEach(function (k) { out.answers[k] = r.answers[k]; });
    } else {
      // migrate a v1 record onto the default question ids
      var m = {
        q_sortie: r.sortieNo, q_category: r.category,
        q_deficit: r.observedDeficit, q_cause: r.rootCause, q_match: r.matchPoint,
        q_top3: Array.isArray(r.top3)
          ? r.top3.filter(Boolean).map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n')
          : r.top3,
        q_tags: Array.isArray(r.tags) ? r.tags.join(', ') : r.tags
      };
      Object.keys(m).forEach(function (k) {
        if (m[k] !== undefined && m[k] !== null && m[k] !== '') out.answers[k] = m[k];
      });
      if (Array.isArray(r.targetGoals) && r.targetGoals.length) {
        out.answers.q_goals_next = r.targetGoals.map(function (g) {
          return normalizeGoal({ text: g.text, status: g.done ? 'met' : 'open' });
        });
      }
    }

    // goal answers are always arrays of goal objects
    goalQuestionIds().forEach(function (qid) {
      var v = out.answers[qid];
      out.answers[qid] = Array.isArray(v) ? v.map(normalizeGoal) : [];
    });

    return out;
  }

  function goalQuestionIds() {
    if (!settings) return ['q_goals_this', 'q_goals_next'];
    return settings.questions
      .filter(function (q) { return q.type === 'goals'; })
      .map(function (q) { return q.id; });
  }

  function roleQuestion(role) {
    var live = settings.questions.filter(function (q) { return q.role === role && !q.archived; });
    return live[0] || null;
  }

  function sortRecords(a, b) {
    if (a.flownAt !== b.flownAt) return a.flownAt < b.flownAt ? 1 : -1;
    return b.createdAt - a.createdAt;
  }
  function resort() { cache.sort(sortRecords); }

  /* ------------------------------------------------------------------ pin */

  function bufToB64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
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
  function derive(pin, salt) {
    return crypto.subtle
      .importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
      });
  }

  /* --------------------------------------------------------------- export */

  var BOM = String.fromCharCode(0xFEFF);

  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function answerToText(q, v) {
    if (q.type === 'goals') {
      return (Array.isArray(v) ? v : []).filter(function (g) { return g.text.trim(); })
        .map(function (g) {
          return g.text + (g.status === 'met' ? ' [הושג]' : g.status === 'missed' ? ' [לא הושג]' : '');
        }).join(' | ');
    }
    return v == null ? '' : String(v);
  }

  /** Columns follow the question list, so the sheet tracks whatever he edits. */
  function toCSV() {
    var qs = settings.questions.slice().sort(function (a, b) { return a.order - b.order; });
    var head = ['תאריך'].concat(qs.map(function (q) { return q.label; }));
    var rows = cache.slice().reverse().map(function (r) {
      return [r.flownAt].concat(qs.map(function (q) {
        return answerToText(q, r.answers[q.id]);
      })).map(csvCell).join(',');
    });
    return BOM + head.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
  }

  function toJSON() {
    return JSON.stringify({
      app: 'sortie', schema: SCHEMA,
      exportedAt: new Date().toISOString(),
      questions: settings.questions,
      nextGoals: settings.nextGoals,
      debriefs: cache
    }, null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.debriefs || data.sorties);
    if (!Array.isArray(list)) throw new Error('no debriefs');

    if (Array.isArray(data.questions) && data.questions.length) {
      var byId = {};
      settings.questions.forEach(function (q) { byId[q.id] = q; });
      data.questions.map(normalizeQuestion).forEach(function (q) {
        if (!byId[q.id]) settings.questions.push(q);
      });
      ensureRoles(settings.questions);
      saveSettings();
    }

    var have = {};
    cache.forEach(function (r) { have[r.id] = r; });

    var added = 0, updated = 0, writes = [];
    list.forEach(function (raw) {
      var rec = normalize(raw);
      if (have[rec.id]) {
        if ((rec.updatedAt || 0) <= (have[rec.id].updatedAt || 0)) return;
        Object.assign(have[rec.id], rec); updated++;
        writes.push(idbPut(clone(have[rec.id])));
      } else {
        cache.push(rec); have[rec.id] = rec; added++;
        writes.push(idbPut(clone(rec)));
      }
    });

    resort(); mirror();
    return Promise.all(writes).then(function () {
      return { added: added, updated: updated };
    });
  }

  /* ------------------------------------------------------------------ api */

  var Store = {
    TYPES: TYPES,
    todayISO: todayISO,
    uid: uid,
    normalizeGoal: normalizeGoal,

    init: function () {
      settings = loadSettings();
      return withTimeout(openDB(), 2000, null).then(function (d) {
        db = d;
        return withTimeout(idbAll(), 2000, null);
      }).then(function (rows) {
        dbHealthy = rows !== null;

        var byId = {};
        readMirror().forEach(function (raw) { var r = normalize(raw); byId[r.id] = r; });
        (rows || []).forEach(function (raw) {
          var r = normalize(raw), have = byId[r.id];
          if (!have || (r.updatedAt || 0) >= (have.updatedAt || 0)) byId[r.id] = r;
        });
        cache = Object.keys(byId).map(function (k) { return byId[k]; });
        resort(); mirror(); saveSettings();

        if (db && dbHealthy) {
          var inDb = {};
          (rows || []).forEach(function (r) { inDb[r.id] = 1; });
          cache.forEach(function (r) { if (!inDb[r.id]) idbPut(clone(r)); });
        }
        if (navigator.storage && navigator.storage.persist) {
          navigator.storage.persist().catch(function () {});
        }
        return Store;
      });
    },

    /* --- questions --- */
    questions: function (includeArchived) {
      return settings.questions
        .filter(function (q) { return includeArchived || !q.archived; })
        .sort(function (a, b) { return a.order - b.order; });
    },
    question: function (id) {
      return settings.questions.filter(function (q) { return q.id === id; })[0] || null;
    },
    roleQuestion: roleQuestion,
    isProtected: isProtected,

    addQuestion: function (q) {
      var out = normalizeQuestion(q, settings.questions.length);
      out.order = settings.questions.length;
      settings.questions.push(out);
      saveSettings();
      return out;
    },
    updateQuestion: function (id, patch) {
      var q = Store.question(id);
      if (!q) return null;
      if (patch.label !== undefined) q.label = String(patch.label).trim() || q.label;
      if (patch.hint !== undefined) q.hint = patch.hint;
      // a goal question cannot stop being one without breaking the carry loop
      if (patch.type !== undefined && !isProtected(q) && TYPES.indexOf(patch.type) !== -1) q.type = patch.type;
      if (patch.options !== undefined) {
        q.options = patch.options.filter(function (o) { return String(o).trim(); });
      }
      saveSettings();
      return q;
    },
    /** Archive, never destroy: old debriefs keep showing the answers. */
    removeQuestion: function (id) {
      var q = Store.question(id);
      if (!q || isProtected(q)) return false;
      q.archived = true;
      saveSettings();
      return true;
    },
    moveQuestion: function (id, dir) {
      var live = Store.questions();
      var i = live.findIndex(function (q) { return q.id === id; });
      var j = i + dir;
      if (i === -1 || j < 0 || j >= live.length) return false;
      var a = live[i], b = live[j], t = a.order;
      a.order = b.order; b.order = t;
      saveSettings();
      return true;
    },
    resetQuestions: function () {
      settings.questions = defaultQuestions();
      saveSettings();
    },

    /* --- goals for the next flight (the live list) --- */
    nextGoals: function () { return settings.nextGoals; },
    setNextGoals: function (list) {
      settings.nextGoals = (list || []).map(normalizeGoal)
        .filter(function (g) { return g.text.trim(); });
      saveSettings();
      return settings.nextGoals;
    },
    addNextGoal: function (text) {
      var g = normalizeGoal({ text: text });
      settings.nextGoals.push(g);
      saveSettings();
      return g;
    },
    removeNextGoal: function (id) {
      settings.nextGoals = settings.nextGoals.filter(function (g) { return g.id !== id; });
      saveSettings();
    },

    /* --- debriefs --- */
    all: function () { return cache; },
    count: function () { return cache.length; },
    get: function (id) {
      for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i];
      return null;
    },
    latest: function () { return cache[0] || null; },

    nextSortieNo: function () {
      var q = roleQuestion('sortieNo');
      if (!q) return '';
      for (var i = 0; i < cache.length; i++) {
        var v = String(cache[i].answers[q.id] || '');
        var m = /(\d+)\s*$/.exec(v);
        if (m) return v.slice(0, m.index) + String(parseInt(m[1], 10) + 1);
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

      // Roll the goal loop forward: whatever he set for next time, plus every
      // goal he marked as missed, becomes the live list for the next flight.
      var qThis = roleQuestion('goalsThis');
      var qNext = roleQuestion('goalsNext');
      var carry = [];
      if (qNext) {
        (out.answers[qNext.id] || []).forEach(function (g) {
          if (g.text.trim()) carry.push({ text: g.text });
        });
      }
      if (qThis) {
        (out.answers[qThis.id] || []).forEach(function (g) {
          if (g.status === 'missed' && g.text.trim()) carry.push({ text: g.text });
        });
      }
      var seen = {};
      settings.nextGoals = carry.filter(function (g) {
        var k = g.text.trim();
        if (seen[k]) return false;
        seen[k] = 1; return true;
      }).map(normalizeGoal);
      saveSettings();

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
      settings.nextGoals = [];
      saveSettings(); mirror(); Store.clearDraft();
      return idbClear();
    },

    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return cache;
      var qs = Store.questions(true);
      return cache.filter(function (r) {
        var hay = [r.flownAt];
        qs.forEach(function (question) {
          hay.push(answerToText(question, r.answers[question.id]));
        });
        return hay.join(' ').toLowerCase().indexOf(q) !== -1;
      });
    },

    /** Plain-text rendering of a whole debrief, for copy and share. */
    asText: function (r, fmtDate) {
      var L = ['תחקיר', (fmtDate ? fmtDate(r.flownAt) : r.flownAt), ''];
      Store.questions(true).forEach(function (q) {
        var v = r.answers[q.id];
        var txt = answerToText(q, v);
        if (!txt) return;
        if (q.type === 'goals') {
          L.push(q.label + ':');
          (v || []).filter(function (g) { return g.text.trim(); }).forEach(function (g) {
            L.push('  ' + (g.status === 'met' ? '✓' : g.status === 'missed' ? '✗' : '•') + ' ' + g.text);
          });
        } else {
          L.push(q.label + ': ' + txt);
        }
      });
      return L.join('\n');
    },

    /* --- settings --- */
    settings: function () { return settings; },
    set: function (k, v) { settings[k] = v; saveSettings(); },
    storageMode: function () { return dbHealthy ? 'indexeddb' : 'local'; },

    setPin: function (pin) {
      if (!cryptoReady()) return Promise.resolve(false);
      var salt = crypto.getRandomValues(new Uint8Array(16));
      return derive(pin, salt).then(function (bits) {
        settings.pin = { salt: bufToB64(salt), hash: bufToB64(bits) };
        saveSettings();
        return true;
      });
    },
    checkPin: function (pin) {
      if (!settings.pin || !cryptoReady()) return Promise.resolve(true);
      return derive(pin, b64ToBuf(settings.pin.salt))
        .then(function (bits) { return bufToB64(bits) === settings.pin.hash; })
        .catch(function () { return false; });
    },
    clearPin: function () { settings.pin = null; saveSettings(); },
    cryptoReady: cryptoReady,

    /* --- transfer --- */
    toCSV: toCSV,
    toJSON: toJSON,
    importJSON: importJSON,
    answerToText: answerToText,
    markExported: function () { settings.lastExport = Date.now(); saveSettings(); },

    /* --- drafts --- */
    saveDraft: function (d) {
      try { localStorage.setItem(LS_DRAFT, JSON.stringify(d)); } catch (e) {}
    },
    readDraft: function () {
      try { return JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); }
      catch (e) { return null; }
    },
    clearDraft: function () {
      try { localStorage.removeItem(LS_DRAFT); } catch (e) {}
    }
  };

  global.Store = Store;
})(window);
