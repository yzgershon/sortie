/* תחקיר — data layer.
 *
 * On-device only. IndexedDB is the store of record with a localStorage mirror;
 * the two are merged by id on boot so a half-committed write cannot lose data.
 *
 * v3 model: one RECORD per flight, filled in two stages.
 *   תדריך  (brief)   — filled before the flight
 *   תחקיר  (debrief) — filled after, prefilled from the brief
 *
 * Questions are data the pilot owns. Each carries a `stage`, and brief
 * questions declare how they appear in the debrief:
 *   inDebrief: 'edit'     prefilled and editable   (נושא טיסה, סילבוס)
 *   inDebrief: 'readonly' shown as reference only  (דגשים)
 *   inDebrief: 'none'     brief only               (בטיחות שתודרכה)
 */
(function (global) {
  'use strict';

  var DB_NAME = 'sortie', DB_VER = 1, STORE = 'sorties';
  var LS_MIRROR = 'sortie:mirror', LS_SETTINGS = 'sortie:settings', LS_DRAFT = 'sortie:draft';
  var SCHEMA = 4;

  var db = null, dbHealthy = false, cache = [], settings = null;

  var TYPES = ['text', 'textarea', 'choice', 'number', 'minutes', 'date', 'goals', 'syllabus', 'list'];
  var STAGES = ['brief', 'debrief'];

  /* Only the goal loop is structural; everything else is his to delete. */
  var PROTECTED = ['goals', 'goalsNext'];
  function isProtected(q) { return !!q && PROTECTED.indexOf(q.role) !== -1; }

  function defaultQuestions() {
    return [
      /* ---- תדריך ---- */
      { id: 'q_period',     label: 'פיריט',        type: 'choice', options: ['1', '2', '3', '4'],
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_subject',    label: 'נושא טיסה',    type: 'text', suggest: true, role: 'subject',
        options: ['AW', 'ניווט', 'הקפות', 'מבנה', 'גנ״מ', 'מ״מ', 'משולבת', 'לילה', 'סולו', 'א״א', 'מאמן'],
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_instructor', label: 'מדריך',        type: 'text', suggest: true,
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_area',       label: 'איזור',        type: 'text', suggest: true,
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_goals',      label: 'יעדים',        type: 'goals', role: 'goals',
        stage: 'brief', inDebrief: 'edit' },
      // דגשים are written per exercise inside the syllabus, not as one blob
      { id: 'q_syllabus',   label: 'סילבוס',       type: 'syllabus',
        stage: 'brief', inDebrief: 'edit' },
      { id: 'q_safety_b',   label: 'בטיחות',       type: 'textarea',
        stage: 'brief', inDebrief: 'none' },

      /* ---- תחקיר ---- */
      { id: 'q_minutes',    label: 'דקות טיסה',    type: 'minutes',  stage: 'debrief' },
      { id: 'q_points',     label: 'נקודות עיקריות', type: 'list',    stage: 'debrief' },
      { id: 'q_safety_d',   label: 'בטיחות',       type: 'textarea', stage: 'debrief' },
      { id: 'q_solo',       label: 'אישור לסולו',  type: 'choice', options: ['כן', 'לא'], role: 'solo',
        stage: 'debrief' },
      { id: 'q_goals_next', label: 'יעדים לטיסה הבאה', type: 'goals', role: 'goalsNext', stage: 'debrief' }
    ].map(function (q, i) {
      q.order = i; q.archived = false; q.hint = q.hint || '';
      return q;
    });
  }

  /* ---------------------------------------------------------------- utils */

  function uid(p) {
    return (p || 'r') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }
  function todayISO(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
      '-' + String(d.getDate()).padStart(2, '0');
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function withTimeout(promise, ms, fallback) {
    return new Promise(function (resolve) {
      var settled = false;
      function finish(v) { if (settled) return; settled = true; clearTimeout(t); resolve(v); }
      var t = setTimeout(function () { finish(fallback); }, ms);
      promise.then(finish, function () { finish(fallback); });
    });
  }

  /* ------------------------------------------------------------ indexeddb */

  function openDB() {
    return new Promise(function (resolve) {
      if (!global.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
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

  function mirror() { try { localStorage.setItem(LS_MIRROR, JSON.stringify(cache)); } catch (e) {} }
  function readMirror() {
    try { return JSON.parse(localStorage.getItem(LS_MIRROR) || '[]'); } catch (e) { return []; }
  }

  /* ------------------------------------------------------------- settings */

  function defaultSettings() {
    return {
      schema: SCHEMA, mig: 0, theme: 'dark',
      questions: defaultQuestions(),
      nextGoals: [],
      pin: null, lastExport: 0, installDismissed: false
    };
  }

  /* Targeted migrations. Bumping SCHEMA rebuilds the whole question list from
     the defaults, which throws away anything he renamed or added; these change
     one field and leave the rest of his setup alone. */
  var MIG = 2;
  function migrate(base) {
    var m = +base.mig || 0;
    function byId(id) {
      return base.questions.filter(function (q) { return q.id === id; })[0] || null;
    }
    if (m < 1) {
      // נקודות עיקריות is an itemized list now, not one block of text
      var qp = byId('q_points');
      if (qp && qp.type === 'textarea') qp.type = 'list';
      m = 1;
    }
    if (m < 2) {
      // the solo call is found by role, so renaming it keeps the home readout
      var qs = byId('q_solo');
      if (qs && !qs.role) qs.role = 'solo';
      m = 2;
    }
    base.mig = MIG;
  }

  function normalizeQuestion(q, i) {
    var type = TYPES.indexOf(q.type) === -1 ? 'text' : q.type;
    var stage = STAGES.indexOf(q.stage) === -1 ? 'debrief' : q.stage;
    var inDebrief = q.inDebrief;
    if (stage === 'brief' && ['edit', 'readonly', 'none'].indexOf(inDebrief) === -1) inDebrief = 'edit';
    return {
      id: q.id || uid('q'),
      label: String(q.label || '').trim() || 'שאלה',
      type: type,
      stage: stage,
      inDebrief: stage === 'brief' ? inDebrief : null,
      options: Array.isArray(q.options) ? q.options.filter(function (o) { return String(o).trim(); }) : [],
      suggest: !!q.suggest,
      hint: q.hint || '',
      role: q.role || null,
      archived: !!q.archived,
      order: typeof q.order === 'number' ? q.order : i
    };
  }

  function ensureRoles(qs) {
    [['goals', 'brief'], ['goalsNext', 'debrief']].forEach(function (pair) {
      if (qs.some(function (q) { return q.role === pair[0] && !q.archived; })) return;
      var def = defaultQuestions().filter(function (q) { return q.role === pair[0]; })[0];
      def.order = qs.length;
      qs.push(def);
    });
  }

  function loadSettings() {
    var s;
    try { s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null'); } catch (e) { s = null; }
    var base = defaultSettings();
    if (s && typeof s === 'object') {
      Object.keys(base).forEach(function (k) { if (s[k] !== undefined) base[k] = s[k]; });
      // anything older than v3 predates the brief/debrief split
      if (!Array.isArray(s.questions) || !s.questions.length || (s.schema || 0) < SCHEMA) {
        base.questions = defaultQuestions();
      }
    }
    base.questions = base.questions.map(normalizeQuestion);
    ensureRoles(base.questions);

    // Categories added in later versions get merged into the existing question
    // rather than forcing a rebuild, so his own edits survive the update.
    (function () {
      var live = base.questions.filter(function (q) { return q.role === 'subject'; })[0];
      var def = defaultQuestions().filter(function (q) { return q.role === 'subject'; })[0];
      if (!live || !def) return;
      def.options.forEach(function (o) {
        if (live.options.indexOf(o) === -1) live.options.push(o);
      });
    })();
    migrate(base);
    base.nextGoals = (Array.isArray(base.nextGoals) ? base.nextGoals : []).map(normalizeGoal);
    base.schema = SCHEMA;
    return base;
  }
  function saveSettings() {
    try { localStorage.setItem(LS_SETTINGS, JSON.stringify(settings)); } catch (e) {}
  }

  /** A goal. `cats` is which flight categories it is waiting on: a goal missed
   *  on an AW flight comes back on the next AW flight and nowhere else. Empty
   *  means it belongs to no category in particular and rides the next flight
   *  whatever it is — that is what a goal typed on the home screen gets. */
  function normalizeGoal(g) {
    if (typeof g === 'string') g = { text: g };
    return {
      id: g.id || uid('g'),
      text: String(g.text == null ? '' : g.text),
      status: ['open', 'met', 'missed'].indexOf(g.status) === -1 ? 'open' : g.status,
      cats: Array.isArray(g.cats)
        ? g.cats.map(String).filter(function (c) { return c.trim(); })
        : []
    };
  }
  /** One line of an itemized answer, e.g. a נקודות עיקריות bullet. */
  function normalizeItem(x) {
    if (typeof x === 'string') x = { text: x };
    return { id: x.id || uid('i'), text: String(x.text == null ? '' : x.text) };
  }
  /** A syllabus row. `focus` is the דגש written at the תדריך, `notes` is what
   *  actually happened, written at the תחקיר. */
  function normalizeEx(x) {
    if (typeof x === 'string') x = { text: x };
    return {
      id: x.id || uid('x'),
      text: String(x.text == null ? '' : x.text),
      focus: String(x.focus == null ? '' : x.focus),
      notes: String(x.notes == null ? '' : x.notes)
    };
  }

  /* -------------------------------------------------------------- records */

  function typeOf(qid) {
    var q = Store.question(qid);
    return q ? q.type : null;
  }

  function normalize(r) {
    var out = {
      id: r.id || uid('f'),
      flownAt: r.flownAt || todayISO(),
      stage: r.stage === 'done' ? 'done' : 'brief',   // brief = flown not yet debriefed
      answers: {},
      createdAt: r.createdAt || Date.now(),
      updatedAt: r.updatedAt || r.createdAt || Date.now()
    };
    var src = (r.answers && typeof r.answers === 'object') ? r.answers : {};
    Object.keys(src).forEach(function (k) { out.answers[k] = src[k]; });

    // coerce the structured types no matter which version wrote them
    (settings ? settings.questions : defaultQuestions()).forEach(function (q) {
      if (q.type === 'goals') {
        var g = out.answers[q.id];
        out.answers[q.id] = Array.isArray(g) ? g.map(normalizeGoal) : [];
      } else if (q.type === 'syllabus') {
        var x = out.answers[q.id];
        if (typeof x === 'string') {
          x = x.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
        }
        out.answers[q.id] = Array.isArray(x) ? x.map(normalizeEx) : [];
      } else if (q.type === 'list') {
        // answers written while this was a plain text box split into bullets
        var li = out.answers[q.id];
        if (typeof li === 'string') {
          li = li.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
        }
        out.answers[q.id] = Array.isArray(li) ? li.map(normalizeItem) : [];
      }
    });
    return out;
  }

  /* Categories are recognised as key phrases inside נושא טיסה, so "AW 3" and
     "ניווט 5" both match their category and the flight number is ignored.
     Hebrew gershayim get normalised because a phone keyboard may produce
     either ״ or a straight quote. */
  function normCat(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[״׳"']/g, '"').replace(/\s+/g, ' ');
  }

  function categoryVocab() {
    var q = subjectQuestion();
    if (q && q.options && q.options.length) return q.options.slice();
    var found = [];
    settings.questions.forEach(function (x) {
      if (x.type === 'text' && x.options && x.options.length) found = found.concat(x.options);
    });
    return found;
  }

  function subjectQuestion() {
    return roleQuestion('subject') || Store.question('q_subject');
  }

  /* Spellings that mean a category without naming it. The syllabus matcher
     folds these too — if they only lived there, writing "אווירובטיקה 7" would
     load the right exercises and then file the flight under no category at
     all, so it would drop out of the AW filter and the AW goal carry. */
  var CAT_ALIASES = { 'אווירובטיקה': 'AW', 'מבנה מתקדם': 'מ״מ' };

  /** Which of the known categories appear in a נושא טיסה, e.g. "AW 7 לילה"
   *  is both AW and לילה. The flight number is ignored on purpose. */
  function categoriesInText(text) {
    var hay = normCat(text);
    if (!hay) return [];
    var vocab = categoryVocab();
    var out = vocab.filter(function (c) { return hay.indexOf(normCat(c)) !== -1; });
    Object.keys(CAT_ALIASES).forEach(function (alias) {
      var c = CAT_ALIASES[alias];
      if (hay.indexOf(normCat(alias)) === -1) return;
      if (vocab.indexOf(c) === -1 || out.indexOf(c) !== -1) return;
      out.push(c);
    });
    return out;
  }

  /** Which of the known categories appear in this flight's נושא טיסה. */
  function categoriesOf(rec) {
    var q = subjectQuestion();
    return q ? categoriesInText(rec.answers[q.id]) : [];
  }

  /** The goals waiting on a flight of these categories: the ones missed or set
   *  for next time on the last flight that shared a category, plus anything
   *  untagged. This is what a תדריך pulls in once he types the נושא טיסה. */
  function pendingGoalsFor(cats) {
    cats = cats || [];
    return settings.nextGoals.filter(function (g) {
      if (!g.cats.length) return true;
      return g.cats.some(function (c) { return cats.indexOf(c) !== -1; });
    });
  }

  function roleQuestion(role) {
    return settings.questions.filter(function (q) { return q.role === role && !q.archived; })[0] || null;
  }

  function sortRecords(a, b) {
    if (a.flownAt !== b.flownAt) return a.flownAt < b.flownAt ? 1 : -1;
    return b.createdAt - a.createdAt;
  }
  function resort() { cache.sort(sortRecords); }

  /* ------------------------------------------------------------------ pin */

  function bufToB64(b) { var a = new Uint8Array(b), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function b64ToBuf(x) { var s = atob(x), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function cryptoReady() { return !!(global.crypto && global.crypto.subtle && global.isSecureContext); }
  function derive(pin, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' }, k, 256);
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
    if (q.type === 'syllabus') {
      return (Array.isArray(v) ? v : []).filter(function (x) { return x.text.trim(); })
        .map(function (x) {
          return x.text +
            (x.focus.trim() ? ' (דגש: ' + x.focus + ')' : '') +
            (x.notes.trim() ? ' — ' + x.notes : '');
        }).join(' | ');
    }
    if (q.type === 'list') {
      return (Array.isArray(v) ? v : []).map(function (x) { return String(x.text || '').trim(); })
        .filter(Boolean).join(' | ');
    }
    if (q.type === 'minutes') return v ? String(v) : '';
    return v == null ? '' : String(v);
  }

  /** An itemized answer as its lines, whichever shape it is stored in. */
  function linesOf(v) {
    if (Array.isArray(v)) {
      return v.map(function (x) { return String(x && x.text != null ? x.text : x).trim(); })
        .filter(Boolean);
    }
    var s = String(v == null ? '' : v).trim();
    return s ? [s] : [];
  }

  function toCSV() {
    var qs = Store.questions().slice();
    var head = ['תאריך'].concat(qs.map(function (q) { return q.label + (q.stage === 'brief' ? ' (תדריך)' : ''); }));
    var rows = cache.slice().reverse().map(function (r) {
      return [r.flownAt].concat(qs.map(function (q) {
        return answerToText(q, r.answers[q.id]);
      })).map(csvCell).join(',');
    });
    return BOM + head.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
  }

  function toJSON() {
    return JSON.stringify({
      app: 'tahkir', schema: SCHEMA, exportedAt: new Date().toISOString(),
      questions: settings.questions, nextGoals: settings.nextGoals, flights: cache
    }, null, 2);
  }

  function importJSON(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : (data.flights || data.debriefs || data.sorties);
    if (!Array.isArray(list)) throw new Error('no flights');

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
    return Promise.all(writes).then(function () { return { added: added, updated: updated }; });
  }

  /* ------------------------------------------------------------------ api */

  var Store = {
    TYPES: TYPES, STAGES: STAGES,
    todayISO: todayISO, uid: uid,
    normalizeGoal: normalizeGoal, normalizeEx: normalizeEx, normalizeItem: normalizeItem,
    linesOf: linesOf,

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
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
        return Store;
      });
    },

    /* --- questions --- */
    questions: function (all) {
      return settings.questions
        .filter(function (q) { return all || !q.archived; })
        .sort(function (a, b) { return a.order - b.order; });
    },
    /** Questions to render for a stage. The debrief also shows brief answers. */
    stageQuestions: function (stage, all) {
      return Store.questions(all).filter(function (q) {
        if (stage === 'brief') return q.stage === 'brief';
        return q.stage === 'debrief' || (q.stage === 'brief' && q.inDebrief !== 'none');
      });
    },
    question: function (id) {
      return settings.questions.filter(function (q) { return q.id === id; })[0] || null;
    },
    roleQuestion: roleQuestion,
    isProtected: isProtected,
    categoryVocab: categoryVocab,
    categoriesOf: categoriesOf,
    categoriesInText: categoriesInText,
    pendingGoalsFor: pendingGoalsFor,

    addQuestion: function (q) {
      var out = normalizeQuestion(q, settings.questions.length);
      out.order = settings.questions.length;
      settings.questions.push(out); saveSettings();
      return out;
    },
    updateQuestion: function (id, patch) {
      var q = Store.question(id);
      if (!q) return null;
      if (patch.label !== undefined) q.label = String(patch.label).trim() || q.label;
      if (patch.hint !== undefined) q.hint = patch.hint;
      if (patch.stage !== undefined && !isProtected(q) && STAGES.indexOf(patch.stage) !== -1) {
        q.stage = patch.stage;
        q.inDebrief = patch.stage === 'brief' ? (q.inDebrief || 'edit') : null;
      }
      if (patch.inDebrief !== undefined && q.stage === 'brief') q.inDebrief = patch.inDebrief;
      if (patch.type !== undefined && !isProtected(q) && TYPES.indexOf(patch.type) !== -1) q.type = patch.type;
      if (patch.options !== undefined) {
        q.options = patch.options.filter(function (o) { return String(o).trim(); });
      }
      saveSettings();
      return q;
    },
    removeQuestion: function (id) {
      var q = Store.question(id);
      if (!q || isProtected(q)) return false;
      q.archived = true; saveSettings();
      return true;
    },
    moveQuestion: function (id, dir) {
      var live = Store.questions();
      var i = live.findIndex(function (q) { return q.id === id; });
      var j = i + dir;
      if (i === -1 || j < 0 || j >= live.length) return false;
      var t = live[i].order; live[i].order = live[j].order; live[j].order = t;
      saveSettings();
      return true;
    },
    resetQuestions: function () { settings.questions = defaultQuestions(); saveSettings(); },

    /** Previously used answers for a question, newest first, for suggestions. */
    suggestions: function (qid) {
      var seen = {}, out = [];
      cache.forEach(function (r) {
        var v = r.answers[qid];
        if (typeof v !== 'string') return;
        v = v.trim();
        if (!v || seen[v]) return;
        seen[v] = 1; out.push(v);
      });
      return out.slice(0, 8);
    },

    /* --- goals for the next flight --- */
    nextGoals: function () { return settings.nextGoals; },
    addNextGoal: function (text) {
      var g = normalizeGoal({ text: text });
      settings.nextGoals.push(g); saveSettings();
      return g;
    },
    removeNextGoal: function (id) {
      settings.nextGoals = settings.nextGoals.filter(function (g) { return g.id !== id; });
      saveSettings();
    },
    setNextGoals: function (list) {
      settings.nextGoals = (list || []).map(normalizeGoal)
        .filter(function (g) { return g.text.trim(); });
      saveSettings();
      return settings.nextGoals;
    },

    /* --- flights --- */
    all: function () { return cache; },
    count: function () { return cache.length; },
    get: function (id) {
      for (var i = 0; i < cache.length; i++) if (cache[i].id === id) return cache[i];
      return null;
    },
    latest: function () { return cache[0] || null; },
    /** The briefed flight still waiting on its debrief, if there is one. */
    openBrief: function () {
      for (var i = 0; i < cache.length; i++) if (cache[i].stage === 'brief') return cache[i];
      return null;
    },
    done: function () { return cache.filter(function (r) { return r.stage === 'done'; }); },

    /** A fresh brief. Only the untagged goals come in here — the ones tied to a
     *  category cannot be known until he types the נושא טיסה, so the form pulls
     *  those in as he does. */
    newBrief: function () {
      var rec = { id: '', flownAt: todayISO(), stage: 'brief', answers: {} };
      var qg = roleQuestion('goals');
      if (qg) {
        rec.answers[qg.id] = pendingGoalsFor([]).map(function (g) {
          return { id: g.id, text: g.text, status: 'open' };
        });
      }
      return rec;
    },

    save: function (rec) {
      var existing = rec.id ? Store.get(rec.id) : null;
      var out;
      if (existing) {
        out = normalize(Object.assign({}, existing, rec));
        Object.assign(existing, out); out = existing;
      } else {
        out = normalize(rec);
        cache.push(out);
      }
      out.updatedAt = Date.now();

      // Roll the goal loop forward once the flight is debriefed: goals set for
      // next time, plus anything missed today, go back on the shelf TAGGED with
      // this flight's categories. They come out again on the next flight that
      // shares one, so an AW goal waits for the next AW and nothing else.
      if (out.stage === 'done') {
        var qThis = roleQuestion('goals'), qNext = roleQuestion('goalsNext');
        var cats = categoriesOf(out);
        var carry = [];
        if (qNext) (out.answers[qNext.id] || []).forEach(function (g) {
          if (g.text.trim()) carry.push(g.text.trim());
        });
        if (qThis) (out.answers[qThis.id] || []).forEach(function (g) {
          if (g.status === 'missed' && g.text.trim()) carry.push(g.text.trim());
        });

        // Everything this flight could have pulled in is settled now: the goals
        // sharing a category with it, and the untagged ones every flight gets.
        // Whatever it did not settle keeps waiting for its own category.
        var keep = settings.nextGoals.filter(function (g) {
          if (!g.cats.length) return false;
          return !g.cats.some(function (c) { return cats.indexOf(c) !== -1; });
        });

        // keyed on the categories too, so the same wording waiting on ניווט does
        // not swallow the copy this AW flight just missed
        function gkey(t, cs) { return t + ' :: ' + cs.slice().sort().join(','); }
        var seen = {};
        keep.forEach(function (g) { seen[gkey(g.text.trim(), g.cats)] = 1; });
        carry.forEach(function (t) {
          var k = gkey(t, cats);
          if (seen[k]) return;
          seen[k] = 1;
          keep.push(normalizeGoal({ text: t, cats: cats }));
        });
        settings.nextGoals = keep;
        saveSettings();
      }

      resort(); mirror();
      return idbPut(clone(out)).then(function () { return out; });
    },

    remove: function (id) {
      cache = cache.filter(function (r) { return r.id !== id; });
      mirror();
      return idbDelete(id);
    },
    clearAll: function () {
      cache = []; settings.nextGoals = [];
      saveSettings(); mirror(); Store.clearDraft();
      return idbClear();
    },

    search: function (q) {
      q = (q || '').trim().toLowerCase();
      if (!q) return cache;
      var qs = Store.questions(true);
      return cache.filter(function (r) {
        var hay = [r.flownAt];
        qs.forEach(function (question) { hay.push(answerToText(question, r.answers[question.id])); });
        return hay.join(' ').toLowerCase().indexOf(q) !== -1;
      });
    },

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
        } else if (q.type === 'syllabus') {
          L.push(q.label + ':');
          (v || []).filter(function (x) { return x.text.trim(); }).forEach(function (x) {
            L.push('  • ' + x.text);
            if (x.focus.trim()) L.push('      דגש: ' + x.focus);
            if (x.notes.trim()) L.push('      ' + x.notes);
          });
        } else if (q.type === 'list') {
          L.push(q.label + ':');
          linesOf(v).forEach(function (line) { L.push('  • ' + line); });
        } else if (q.type === 'minutes') {
          L.push(q.label + ': ' + txt + ' דק׳');
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
        saveSettings(); return true;
      });
    },
    checkPin: function (pin) {
      if (!settings.pin || !cryptoReady()) return Promise.resolve(true);
      return derive(pin, b64ToBuf(settings.pin.salt))
        .then(function (b) { return bufToB64(b) === settings.pin.hash; })
        .catch(function () { return false; });
    },
    clearPin: function () { settings.pin = null; saveSettings(); },
    cryptoReady: cryptoReady,

    toCSV: toCSV, toJSON: toJSON, importJSON: importJSON, answerToText: answerToText,
    markExported: function () { settings.lastExport = Date.now(); saveSettings(); },

    saveDraft: function (d) { try { localStorage.setItem(LS_DRAFT, JSON.stringify(d)); } catch (e) {} },
    readDraft: function () {
      try { return JSON.parse(localStorage.getItem(LS_DRAFT) || 'null'); } catch (e) { return null; }
    },
    clearDraft: function () { try { localStorage.removeItem(LS_DRAFT); } catch (e) {} }
  };

  global.Store = Store;
})(window);
