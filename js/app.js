/* תחקיר — router, screens, interactions. Hebrew, right to left.
 *
 * Two stages per flight: תדריך before, תחקיר after. Both forms are built from
 * Store.stageQuestions(), so anything he edits in Settings shows up here.
 */
(function (global) {
  'use strict';

  var BUILD = 'v13';   // keep in step with VERSION in sw.js

  var appEl, viewEl, topbarEl, tabbarEl, toasterEl, sheetEl, lockEl;
  var route = { name: 'home', param: null };
  var navCount = 0;
  var pinBuffer = '', pinMode = 'unlock', pinFirst = '';
  var draftTimer = null;

  /* ============================================================== helpers */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function on(root, sel, ev, fn) { $$(sel, root).forEach(function (n) { n.addEventListener(ev, fn); }); }

  function parseISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2] || 1);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = parseISO(iso), today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((today - d) / 86400000);
    if (diff === 0) return T.today;
    if (diff === 1) return T.yesterday;
    if (diff > 1 && diff < 7) return T.daysAgo(diff);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  function fmtLong(iso) {
    return iso ? parseISO(iso).toLocaleDateString('he-IL',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  }
  /* Plain dates for anything that gets read later or printed. "לפני 3 ימים" is
     fine on the home screen and useless in a document three weeks on. */
  function fmtNum(iso) {
    if (!iso) return '';
    var d = parseISO(iso);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function fmtFull(iso) {
    return iso ? fmtNum(iso) + '.' + parseISO(iso).getFullYear() : '';
  }
  function dayMon(iso) {
    var d = parseISO(iso);
    return { d: d.getDate(), m: d.toLocaleDateString('he-IL', { month: 'short' }) };
  }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / 86400000) : null; }
  function isStandalone() {
    return global.navigator.standalone === true || global.matchMedia('(display-mode: standalone)').matches;
  }
  function haptic(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) {} } }

  function toast(msg, ic) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = icon(ic || 'checkCircle') + '<span>' + esc(msg) + '</span>';
    toasterEl.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { t.remove(); }, 200);
    }, 2500);
  }

  function openSheet(o) {
    sheetEl.innerHTML = '<div class="sheet__panel"><div class="sheet__grab"></div>' +
      (o.title ? '<h2 class="sheet__title">' + esc(o.title) + '</h2>' : '') +
      (o.text ? '<p class="sheet__text">' + esc(o.text) + '</p>' : '') +
      (o.body || '') +
      '<div class="stack" style="margin-top:var(--s-4)">' +
        (o.actions || []).map(function (a, i) {
          return '<button class="btn btn--block ' + (a.cls || '') + '" data-act="' + i + '">' +
            (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>';
        }).join('') + '</div></div>';
    on(sheetEl, '[data-act]', 'click', function (e) {
      var a = (o.actions || [])[+e.currentTarget.dataset.act];
      if (!a) return;
      if (a.keepOpen) { a.run && a.run(sheetEl); return; }
      sheetEl.close(); a.run && a.run();
    });
    if (o.onOpen) o.onOpen(sheetEl);
    if (!sheetEl.open) sheetEl.showModal();
  }
  function confirmSheet(o) {
    openSheet({
      title: o.title, text: o.text,
      actions: [
        { label: o.confirmLabel || T.confirm, cls: o.danger ? 'btn--danger' : 'btn--lit', icon: o.icon, run: o.onConfirm },
        { label: T.cancel, cls: 'btn--quiet' }
      ]
    });
  }

  function applyTheme() {
    var p = Store.settings().theme, m = p;
    if (p === 'auto') m = global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', m);
  }

  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    if (navigator.canShare && navigator.share) {
      try {
        var f = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: name })
            .then(function () { Store.markExported(); }).catch(function () {});
          return;
        }
      } catch (e) {}
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    Store.markExported();
  }
  function stamp() {
    var d = new Date();
    return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /* =============================================================== router */

  function go(p) { location.hash = '#/' + p; }

  var ROUTES = ['home', 'brief', 'debrief', 'log', 'flight', 'trends', 'settings', 'summary', 'syllabus'];

  function navigate() {
    var h = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var n = h[0] || 'home';
    if (ROUTES.indexOf(n) === -1) n = 'home';
    route = { name: n, param: h[1] ? decodeURIComponent(h[1]) : null };
    navCount++;
    render();
    global.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }

  var TABS = [
    { id: 'home',   l: T.navHome,   c: T.capHome,   ic: 'horizon'  },
    { id: 'log',    l: T.navLog,    c: T.capLog,    ic: 'layers'   },
    { id: 'trends', l: T.navTrends, c: T.capTrends, ic: 'trending' },
    { id: 'settings', l: T.navSet,  c: T.capSet,    ic: 'settings' }
  ];

  function renderTabs() {
    var cur = route.name === 'flight' ? 'log' : route.name;
    tabbarEl.innerHTML = TABS.map(function (t) {
      return '<a class="tab" href="#/' + (t.id === 'home' ? '' : t.id) + '"' +
        (t.id === cur ? ' aria-current="page"' : '') + '>' + icon(t.ic) +
        '<span>' + esc(t.l) + '</span></a>';
    }).join('');
  }

  function renderTopbar(c) {
    topbarEl.innerHTML =
      (c.back ? '<button class="iconbtn iconbtn--flip" data-back aria-label="חזרה">' + icon('chevLeft') + '</button>' : '') +
      '<div class="topbar__title">' + esc(c.title || '') + '</div>' +
      (c.sub ? '<span class="topbar__sub">' + esc(c.sub) + '</span>' : '') +
      (c.actions || []).map(function (a) {
        return '<button class="iconbtn' + (a.lit ? ' iconbtn--lit' : '') + '" data-topact="' + a.id +
          '" aria-label="' + esc(a.label) + '">' + icon(a.ic) + '</button>';
      }).join('');
    on(topbarEl, '[data-back]', 'click', function () {
      if (navCount > 1) history.back(); else go(c.backTo || '');
    });
    on(topbarEl, '[data-topact]', 'click', function (e) {
      var a = (c.actions || []).filter(function (x) { return x.id === e.currentTarget.dataset.topact; })[0];
      a && a.run && a.run();
    });
  }

  function render() {
    document.body.dataset.route = route.name;
    var formish = route.name === 'brief' || route.name === 'debrief';
    tabbarEl.hidden = formish;
    viewEl.classList.toggle('view--noTabs', formish);
    if (!formish) renderTabs();
    ({ home: screenHome, brief: screenForm, debrief: screenForm, log: screenLog,
       flight: screenDetail, trends: screenTrends, settings: screenSettings,
       summary: screenSummary, syllabus: screenSyllabus })[route.name]();
    autosizeAll();
  }

  function empty(ic, t, p) {
    return '<div class="empty"><div class="empty__icon">' + icon(ic) + '</div>' +
      '<h3>' + esc(t) + '</h3><p>' + esc(p) + '</p></div>';
  }

  /* ================================================================= home */

  function screenHome() {
    var all = Store.all(), done = Store.done(), open = Store.openBrief();
    var s = Store.settings(), goals = Store.nextGoals();

    renderTopbar({
      title: T.app,
      actions: [{ id: 'new', ic: 'plus', label: T.newBrief, lit: true, run: function () { go('brief'); } }]
    });

    var qMin = Store.questions().filter(function (q) { return q.type === 'minutes'; })[0];
    var mins = 0;
    if (qMin) done.forEach(function (r) {
      var v = parseInt(r.answers[qMin.id], 10);
      if (!isNaN(v)) mins += v;
    });
    // logged per flight in minutes, totalled here in hours the way flight time
    // is actually recorded
    var hours = (mins / 60).toFixed(1);

    var qg = Store.roleQuestion('goals'), met = 0, tot = 0;
    if (qg) done.forEach(function (r) {
      (r.answers[qg.id] || []).forEach(function (g) {
        if (!g.text.trim() || g.status === 'open') return;
        tot++; if (g.status === 'met') met++;
      });
    });
    /* Solo approvals this week: the share of the week's debriefed flights he
       was cleared to fly solo on. Read by role so renaming the question in
       הגדרות does not silently blank the readout. */
    var wk = thisWeekRange();
    function inThisWeek(r) {
      var t = parseISO(r.flownAt).getTime();
      return t >= wk.start.getTime() && t <= wk.stop.getTime();
    }
    var qSolo = Store.roleQuestion('solo');
    var soloYes = 0, soloTot = 0;
    if (qSolo) {
      var soloYesVal = (qSolo.options && qSolo.options[0]) || 'כן';
      done.forEach(function (r) {
        if (!inThisWeek(r)) return;
        var v = String(r.answers[qSolo.id] == null ? '' : r.answers[qSolo.id]).trim();
        if (!v) return;
        soloTot++;
        if (v === soloYesVal) soloYes++;
      });
    }
    var week = all.filter(inThisWeek).length;

    var h = '<div class="stack-6 stagger">';

    h += '<div class="hero">' +
      '<div class="hero__meta"><i></i>' + esc(open ? T.statusBriefed : T.statusReady) +
        ' · ' + esc(new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })) + '</div>' +
      '<h1 class="hero__h">' + esc(new Date().toLocaleDateString('he-IL', { weekday: 'long' })) + '</h1>' +
      '<div class="hero__date">' + esc(new Date().toLocaleDateString('he-IL',
        { day: 'numeric', month: 'long', year: 'numeric' })) + '</div>' +
    '</div>';

    h += '<div class="readouts">' +
      readout('cyan', 'clock', T.rHours, T.capHours, hours, mins + ' ' + T.rMinutes) +
      readout('', 'layers', T.rFlights, T.capFlights, String(done.length), '') +
      readout('green', 'target', T.rGoals, T.capGoals,
        (tot ? Math.round(met / tot * 100) : 0) + '<small>%</small>', tot ? met + '/' + tot : '') +
      (qSolo
        ? readout('amber', 'checkCircle', T.rSolo, T.capSolo,
            soloTot ? Math.round(soloYes / soloTot * 100) + '<small>%</small>' : '<small>—</small>',
            soloTot ? soloYes + '/' + soloTot + ' THIS WEEK' : '')
        : readout('amber', 'trending', T.rWeek, T.capWeek, String(week), '')) +
    '</div>';

    /* open brief, or the CTA to start one */
    if (open) {
      var subQ = Store.question('q_subject');
      var subj = subQ ? (open.answers[subQ.id] || '') : '';
      h += '<section class="panel panel--amber brackets">' +
        '<div class="panel__head">' + icon('flag') +
          '<span class="panel__t">' + esc(T.briefWaiting) + '</span>' +
          '<span class="panel__a">' + esc(T.capBrief) + '</span></div>' +
        '<div class="panel__body stack">' +
          (subj ? '<div style="font-size:var(--t-17);font-weight:700" dir="auto">' + esc(subj) + '</div>' : '') +
          '<div class="dim" style="font-size:var(--t-12)">' + esc(fmtLong(open.flownAt)) + '</div>' +
          '<button class="btn btn--amber btn--block btn--lg" data-godebrief="' + esc(open.id) + '">' +
            icon('check') + esc(T.openBrief) + '</button>' +
          '<button class="btn btn--quiet btn--block" data-gobrief="' + esc(open.id) + '">' +
            icon('pencil') + esc(T.editBrief) + '</button>' +
        '</div></section>';
    } else {
      h += '<button class="btn btn--lit btn--block btn--lg" data-new>' +
        icon('plus') + esc(T.newBrief) + '</button>';
    }

    /* carried goals */
    h += '<section class="panel">' +
      '<div class="panel__head">' + icon('target') +
        '<span class="panel__t">' + esc(T.goalsCarried) + '</span>' +
        (goals.length ? '<span class="panel__a">' + goals.length + '</span>' : '') + '</div>' +
      '<div class="panel__body">' +
        (goals.length ? '<p class="field__hint" style="margin-bottom:var(--s-2)">' +
          esc(T.goalsCarriedHint) + '</p>' : '') +
        (goals.length
          ? '<div class="goals">' + goals.map(function (g) {
              return '<div class="goalrow">' + catChip(g) +
                '<span class="goalrow__t" dir="auto">' + esc(g.text) + '</span>' +
                '<button class="rowx" data-goaldel="' + esc(g.id) + '" aria-label="' + esc(T.remove) + '">' +
                icon('x') + '</button></div>';
            }).join('') + '</div>'
          : '<div class="empty" style="padding:var(--s-4) 0"><h3>' + esc(T.noGoals) + '</h3>' +
            '<p>' + esc(T.noGoalsHint) + '</p></div>') +
        '<div class="addrow">' +
          '<input class="input" id="newGoal" type="text" dir="auto" enterkeyhint="done" placeholder="' + esc(T.addGoal) + '">' +
          '<button class="btn" data-goaladd>' + icon('plus') + '</button>' +
        '</div></div></section>';

    /* recent */
    h += '<section class="panel">' +
      '<div class="panel__head">' + icon('list3') +
        '<span class="panel__t">' + esc(T.recent) + '</span>' +
        (all.length ? '<a class="panel__a" href="#/log">' + esc(T.viewAll) + ' ' + all.length + '</a>' : '') + '</div>' +
      '<div class="panel__body' + (all.length ? ' panel__body--flush' : '') + '">' +
        // not .map(flightRow): map passes the index as the second argument, which
        // is flightRow's `selectable` flag, so every row after the first drew a
        // selection checkbox instead of its chevron
        (all.length ? '<div class="list">' + all.slice(0, 4).map(function (r) {
                        return flightRow(r);
                      }).join('') + '</div>'
                    : empty('layers', T.noFlights, T.noFlightsHint)) +
      '</div></section>';

    if (!isStandalone() && !s.installDismissed) {
      h += '<div class="note note--info">' + icon('info') +
        '<div><b>' + esc(T.installTitle) + '</b><br>' + esc(T.installBody) +
        '<br><button class="btn btn--quiet" data-dismiss style="min-height:34px;padding:0;margin-top:6px;font-size:var(--t-12)">' +
        esc(T.gotIt) + '</button></div></div>';
    }

    h += '</div>';
    viewEl.innerHTML = h;

    on(viewEl, '[data-new]', 'click', function () { go('brief'); });
    on(viewEl, '[data-godebrief]', 'click', function (e) { go('debrief/' + e.currentTarget.dataset.godebrief); });
    on(viewEl, '[data-gobrief]', 'click', function (e) { go('brief/' + e.currentTarget.dataset.gobrief); });
    on(viewEl, '.frow', 'click', function (e) { go('flight/' + e.currentTarget.dataset.id); });
    on(viewEl, '[data-dismiss]', 'click', function () { Store.set('installDismissed', true); render(); });
    on(viewEl, '[data-goaldel]', 'click', function (e) {
      Store.removeNextGoal(e.currentTarget.dataset.goaldel); haptic(); screenHome();
    });
    function addGoal() {
      var el = $('#newGoal'), v = el.value.trim();
      if (!v) return;
      Store.addNextGoal(v); haptic(12); screenHome();
      var again = $('#newGoal'); if (again) again.focus();
    }
    on(viewEl, '[data-goaladd]', 'click', addGoal);
    $('#newGoal').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addGoal(); }
    });

    function readout(tone, ic, k, cap, v, s2) {
      return '<div class="readout' + (tone ? ' readout--' + tone : '') + '">' +
        '<div class="readout__k">' + icon(ic) + '<span>' + esc(k) + '</span></div>' +
        '<div class="readout__v">' + v + '</div>' +
        '<div class="readout__s">' + esc(s2 || cap) + '</div></div>';
    }
  }

  function weekday(iso) {
    return parseISO(iso).toLocaleDateString('he-IL', { weekday: 'long' });
  }

  /** The category a waiting goal belongs to, so it is obvious why a goal is
   *  sitting there and which flight will bring it back. */
  function catChip(g) {
    if (!g.cats || !g.cats.length) return '';
    return '<span class="goalrow__cat" dir="auto">' + esc(g.cats.join(' · ')) + '</span>';
  }

  function flightRow(r, selectable) {
    var dm = dayMon(r.flownAt);
    var qs = Store.question('q_subject');
    var subj = qs ? (r.answers[qs.id] || '') : '';
    var qi = Store.question('q_instructor');
    var inst = qi ? (r.answers[qi.id] || '') : '';
    var pending = r.stage !== 'done';
    var on = !!selected[r.id];
    return '<button class="frow' + (selectable ? ' frow--sel' : '') + (on ? ' is-on' : '') +
      '" data-id="' + esc(r.id) + '"' + (selectable ? ' aria-pressed="' + on + '"' : '') + '>' +
      (selectable ? '<span class="frow__check">' + icon('check') + '</span>' : '') +
      '<span class="frow__d"><b>' + dm.d + '</b><span>' + esc(dm.m) + '</span></span>' +
      '<span class="frow__body">' +
        '<span class="frow__top">' +
          '<span class="frow__t" dir="auto">' + esc(subj || fmtDate(r.flownAt)) + '</span>' +
          (pending ? '<span class="tagline tagline--amber">' + esc(T.awaiting) + '</span>' : '') +
        '</span>' +
        '<span class="frow__s" dir="auto">' + esc(weekday(r.flownAt)) +
          (inst ? ' · ' + esc(inst) : '') + '</span>' +
      '</span>' +
      (selectable ? '' : icon('chevRight', { cls: 'frow__chev' })) + '</button>';
  }

  /* ================================================================= form */

  function screenForm() {
    var isBrief = route.name === 'brief';
    var stage = isBrief ? 'brief' : 'debrief';
    var rec, isNew = false;

    if (route.param) {
      rec = Store.get(route.param);
      if (!rec) { go('log'); return; }
      rec = JSON.parse(JSON.stringify(rec));
    } else if (isBrief) {
      rec = Store.readDraft() || Store.newBrief();
      if (!rec.answers) rec.answers = {};
      isNew = true;
    } else { go('home'); return; }

    var qs = Store.stageQuestions(stage);
    var qNext = Store.roleQuestion('goalsNext');   // target of the ✗ carry
    var qGoals = Store.roleQuestion('goals');      // where carried goals land
    var qSubj = Store.roleQuestion('subject');
    var qSyl = qs.filter(function (q) { return q.type === 'syllabus'; })[0];
    /* Goals he pulled back out after they were carried in. Without this the
       next keystroke in נושא טיסה puts them straight back. */
    var dismissed = {};

    renderTopbar({
      title: isBrief ? T.briefTitle : T.debriefTitle,
      sub: isBrief ? T.capBrief : T.capDebrief,
      back: true, backTo: ''
    });

    var h = '<div class="formprog"><span class="formprog__fill" id="progFill"></span></div>' +
      '<div class="stack-4">' +
      '<div class="panel"><div class="panel__body">' +
        '<div class="field"><label class="field__label" for="f_date"><b>' + esc(T.hDate) + '</b>' +
          '<span class="cap">DATE</span></label>' +
          '<input class="input input--num" id="f_date" type="date" value="' + esc(rec.flownAt) + '"></div>' +
      '</div></div>';

    qs.forEach(function (q) {
      var carried = q.stage === 'brief' && stage === 'debrief';
      h += '<div class="panel' + (carried ? ' panel--amber' : '') + '"><div class="panel__body">' +
        fieldFor(q, rec.answers[q.id], carried) + '</div></div>';
    });

    h += '</div>' +
      '<div class="savebar"><div class="savebar__inner">' +
        '<span class="savestate" id="saveState">' + (isNew ? esc(T.draftSaving) : '') + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--lit" data-save>' + icon('check') +
          esc(isBrief ? T.saveBrief : T.saveDebrief) + '</button>' +
      '</div></div>';

    viewEl.innerHTML = '<div id="formRoot">' + h + '</div>';
    var root = $('#formRoot');

    /* ---------- field renderers ---------- */
    function label(q, carried) {
      return '<label class="field__label" for="f_' + esc(q.id) + '"><b>' + esc(q.label) + '</b>' +
        (carried ? '<span class="cap">' + esc(T.fromBrief) + '</span>' : '') + '</label>';
    }

    function fieldFor(q, v, carried) {
      // brief-only reference shown while debriefing
      if (carried && q.inDebrief === 'readonly') {
        return '<div class="field">' + label(q, true) +
          '<div class="ro" dir="auto">' + esc(String(v || '').trim() || T.notAnswered) + '</div></div>';
      }
      // יעדים לטיסה הבאה are goals being SET, not graded, so they get no ✓/✗ —
      // they are typed straight into the row and removed with the ✗ at the end
      if (q.type === 'goals') return goalsField(q, v || [], !isBrief && q.role !== 'goalsNext');
      if (q.type === 'syllabus') return exField(q, v || [], !isBrief);
      if (q.type === 'list') return listField(q, v || [], carried);
      if (q.type === 'minutes') return minutesField(q, v);

      var body;
      if (q.type === 'textarea') {
        body = '<textarea class="ta" id="f_' + esc(q.id) + '" data-q="' + esc(q.id) + '" dir="auto" rows="2" ' +
          'placeholder="' + esc(T.yourAnswer) + '">' + esc(v || '') + '</textarea>';
      } else if (q.type === 'choice') {
        body = '<div class="opts" data-choice="' + esc(q.id) + '">' + q.options.map(function (o) {
          return '<button type="button" class="opt" data-opt="' + esc(o) + '" dir="auto" aria-pressed="' +
            (String(v) === String(o)) + '">' + esc(o) + '</button>';
        }).join('') + '</div>';
      } else if (q.type === 'number') {
        body = '<input class="input input--num" id="f_' + esc(q.id) + '" data-q="' + esc(q.id) +
          '" type="number" inputmode="decimal" value="' + esc(v || '') + '">';
      } else if (q.type === 'date') {
        body = '<input class="input input--num" id="f_' + esc(q.id) + '" data-q="' + esc(q.id) +
          '" type="date" value="' + esc(v || '') + '">';
      } else {
        // a question with options offers them as add-on tokens (so "AW" then a
        // number), while previous answers replace the field outright
        var cats = (q.options && q.options.length) ? q.options : [];
        var prev = q.suggest ? Store.suggestions(q.id).filter(function (o) {
          return cats.indexOf(o) === -1;
        }) : [];
        body = '<input class="input" id="f_' + esc(q.id) + '" data-q="' + esc(q.id) + '" type="text" ' +
          'dir="auto" autocomplete="off" placeholder="' + esc(T.yourAnswer) + '" value="' + esc(v || '') + '">' +
          (cats.length ? '<div class="sugg sugg--cat">' + cats.map(function (o) {
            return '<button type="button" data-append="' + esc(q.id) + '" data-val="' + esc(o) + '" dir="auto">' +
              esc(o) + '</button>';
          }).join('') + '</div>' : '') +
          (prev.length ? '<div class="sugg">' + prev.map(function (o) {
            return '<button type="button" data-fill="' + esc(q.id) + '" data-val="' + esc(o) + '" dir="auto">' +
              esc(o) + '</button>';
          }).join('') + '</div>' : '');
      }
      return '<div class="field">' + label(q, carried) +
        (q.hint ? '<span class="field__hint">' + esc(q.hint) + '</span>' : '') + body + '</div>';
    }

    function goalsField(q, list, withStatus) {
      var hint = withStatus ? T.goalsCarriedHint : (q.role === 'goalsNext' ? T.goalsNextHint : '');
      return '<div class="field">' + label(q, q.stage === 'brief' && !isBrief) +
        (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') +
        '<div class="goals" data-goals="' + esc(q.id) + '" data-status="' + (withStatus ? '1' : '') + '">' +
          list.map(function (g) { return goalRow(g, withStatus); }).join('') + '</div>' +
        '<div class="addrow">' +
          '<input class="input" data-goalinput="' + esc(q.id) + '" type="text" dir="auto" ' +
            'enterkeyhint="done" placeholder="' + esc(T.addGoal) + '">' +
          '<button type="button" class="btn" data-goalpush="' + esc(q.id) + '">' + icon('plus') + '</button>' +
        '</div></div>';
    }

    /* With ✓/✗ the goal is being graded, so the text is fixed and the buttons
       are the control. Without them he is writing the goal, so the text is an
       input he can fix a typo in and the ✗ deletes the row. */
    function goalRow(g, withStatus) {
      var cls = 'goalrow' + (g.status === 'met' ? ' is-met' : g.status === 'missed' ? ' is-missed' : '');
      // the categories ride along so the chip survives a draft reload, which is
      // the whole explanation of why the goal is sitting there
      return '<div class="' + cls + '" data-goalid="' + esc(g.id) + '" data-gs="' + esc(g.status || 'open') +
        '" data-cats="' + esc((g.cats || []).join('|')) + '">' +
        catChip(g) +
        (withStatus
          ? '<span class="goalrow__t" data-goaltext dir="auto"><span>' + esc(g.text) + '</span></span>' +
            '<span class="vx">' +
              '<button type="button" data-v="met" aria-label="' + esc(T.goalMet) + '" aria-pressed="' +
                (g.status === 'met') + '">' + icon('check') + '</button>' +
              '<button type="button" data-v="missed" aria-label="' + esc(T.goalMissed) + '" aria-pressed="' +
                (g.status === 'missed') + '">' + icon('x') + '</button></span>'
          : '<input class="goalrow__in" data-goaltext type="text" dir="auto" value="' + esc(g.text) + '">' +
            '<button type="button" class="rowx" data-rowx aria-label="' + esc(T.remove) + '">' + icon('x') + '</button>') +
      '</div>';
    }

    function exField(q, list, withNotes) {
      return '<div class="field">' + label(q, q.stage === 'brief' && !isBrief) +
        '<span class="field__hint">' + esc(withNotes ? T.exerciseNotes : T.dragHint) + '</span>' +
        '<div class="exlist" data-ex="' + esc(q.id) + '" data-notes="' + (withNotes ? '1' : '') + '">' +
          list.map(function (x, i) { return exRow(x, i, withNotes); }).join('') + '</div>' +
        '<div class="addrow">' +
          '<input class="input" data-exinput="' + esc(q.id) + '" type="text" dir="auto" ' +
            'enterkeyhint="done" placeholder="' + esc(T.addExercise) + '">' +
          '<button type="button" class="btn" data-expush="' + esc(q.id) + '" aria-label="' +
            esc(T.addExercise) + '">' + icon('plus') + '</button>' +
          '<button type="button" class="btn" data-exbulk="' + esc(q.id) + '" aria-label="' +
            esc(T.pasteList) + '">' + icon('list3') + '</button>' +
        '</div>' +
        '<button type="button" class="btn btn--block" data-exload="' + esc(q.id) + '" hidden>' +
          icon('download') + esc(T.loadSyllabus) +
          '<span class="btn__hint" data-exloadname></span></button>' +
        // says so when a גיחה is not in the chart. Without this the syllabus
        // just stays empty and there is no way to tell a typo from a gap.
        '<span class="field__hint" data-exnomatch hidden></span>' +
        '</div>';
    }

    /* At the תדריך each exercise carries its own דגש. At the תחקיר that דגש is
       shown back as reference and the notes box records what happened. */
    function exRow(x, i, withNotes) {
      var focus = String(x.focus || '');
      return '<div class="ex' + (x.notes && x.notes.trim() ? ' ex--done' : '') +
        '" data-exid="' + esc(x.id) + '" data-focus="' + esc(focus) + '">' +
        '<div class="ex__top">' +
          '<span class="ex__n">' + (i + 1) + '</span>' +
          '<input class="ex__t" type="text" dir="auto" value="' + esc(x.text) + '" data-extext>' +
          '<span class="ex__grip" data-grip role="button" aria-label="' + esc(T.reorder) + '">' +
            icon('grip') + '</span>' +
          '<button type="button" class="rowx" data-rowx aria-label="' + esc(T.remove) + '">' + icon('x') + '</button>' +
        '</div>' +
        (withNotes
          ? (focus.trim()
              ? '<div class="ex__focus" dir="auto">' + icon('flag') + '<span>' + esc(focus) + '</span></div>'
              : '') +
            '<textarea class="ex__notes" rows="1" dir="auto" data-exnotes placeholder="' +
              esc(T.exerciseNotes) + '">' + esc(x.notes || '') + '</textarea>'
          : '<input class="ex__focusin" type="text" dir="auto" data-exfocus placeholder="' +
              esc(T.exerciseFocus) + '" value="' + esc(focus) + '">') +
      '</div>';
    }

    /* An itemized answer: one line per point instead of a single block of text,
       so נקודות עיקריות reads as bullets an instructor can go down one by one. */
    function listField(q, list, carried) {
      return '<div class="field">' + label(q, carried) +
        (q.hint ? '<span class="field__hint">' + esc(q.hint) + '</span>' : '') +
        '<div class="bullets" data-items="' + esc(q.id) + '">' +
          list.map(itemRow).join('') + '</div>' +
        '<div class="addrow">' +
          '<input class="input" data-iteminput="' + esc(q.id) + '" type="text" dir="auto" ' +
            'enterkeyhint="done" placeholder="' + esc(T.addPoint) + '">' +
          '<button type="button" class="btn" data-itempush="' + esc(q.id) + '" aria-label="' +
            esc(T.add) + '">' + icon('plus') + '</button>' +
        '</div></div>';
    }

    function itemRow(x) {
      return '<div class="bullet" data-itemid="' + esc(x.id) + '">' +
        '<span class="bullet__d"></span>' +
        '<input class="bullet__t" type="text" dir="auto" data-itemtext value="' + esc(x.text) + '">' +
        '<button type="button" class="rowx" data-rowx aria-label="' + esc(T.remove) + '">' + icon('x') + '</button>' +
      '</div>';
    }

    function minutesField(q, v) {
      var sel = parseInt(v, 10); if (isNaN(sel)) sel = 0;
      var items = '';
      for (var i = 0; i <= 99; i++) {
        items += '<div class="wheel__i' + (i === sel ? ' is-sel' : '') + '" data-n="' + i + '">' +
          String(i).padStart(2, '0') + '</div>';
      }
      return '<div class="field">' + label(q, false) +
        '<div class="wheel" data-wheel="' + esc(q.id) + '" data-val="' + sel + '">' +
          '<div class="wheel__gate"></div>' +
          '<span class="wheel__unit">' + esc(T.minutesUnit) + '</span>' +
          '<div class="wheel__list">' + items + '</div>' +
        '</div></div>';
    }

    /* ---------- syllabus lookup ----------
       Typing a גיחה that exists in the chart fills its חתך rows in, but only
       while the list is still empty, so nothing already written is replaced
       without asking. The load button stays available to pull them in later. */
    var syllabusTimer = null;

    function currentSubject() {
      if (!qSubj) return '';
      var el = $('[data-q="' + qSubj.id + '"]');
      return el ? el.value : '';
    }

    function fillSyllabus(entry, replace) {
      var listEl = $('[data-ex="' + qSyl.id + '"]');
      if (!listEl) return 0;
      var wn = listEl.dataset.notes === '1';
      if (replace) listEl.innerHTML = '';
      entry.items.forEach(function (t) {
        listEl.insertAdjacentHTML('beforeend',
          exRow(Store.normalizeEx({ text: t }), listEl.children.length, wn));
        var ta = listEl.lastElementChild.querySelector('.ex__notes');
        if (ta) autosize(ta);
      });
      haptic(12); touched();
      return entry.items.length;
    }

    function refreshSyllabusMatch(autofill) {
      if (!qSyl || !qSubj || !global.SyllabusRef) return;
      var btn = $('[data-exload="' + qSyl.id + '"]');
      if (!btn) return;
      var subject = currentSubject();
      var entry = SyllabusRef.lookup(subject);
      // an entry with no חתך rows has nothing to offer
      btn.hidden = !entry || !entry.items.length;

      /* Only complain once it looks like he has finished naming a גיחה — every
         one of them carries a number — so this stays quiet while he types. */
      var note = $('[data-exnomatch]', btn.parentElement);
      if (note) {
        var named = /\d/.test(subject) && subject.trim().length > 2;
        note.hidden = !!entry || !named;
        if (!entry && named) note.textContent = T.noSyllabusFor(subject.trim());
      }

      if (!entry || !entry.items.length) return;
      $('[data-exloadname]', btn).textContent = entry.name;

      var listEl = $('[data-ex="' + qSyl.id + '"]');
      var isEmpty = !$$('.ex', listEl).some(function (r) {
        return $('[data-extext]', r).value.trim();
      });
      if (autofill && isEmpty) {
        var n = fillSyllabus(entry, true);
        if (n) toast(T.syllabusFilled(n), 'list3');
      }
    }

    /* ---------- goals carried in by category ----------
       What he missed on the last AW flight comes back on the next AW flight and
       nowhere else. The category is not known until he types נושא טיסה, so these
       arrive as he types rather than when the form opens. */
    function refreshGoalCarry(announce) {
      if (!isBrief || !qGoals || !qSubj) return 0;
      var listEl = $('[data-goals="' + qGoals.id + '"]');
      if (!listEl) return 0;

      var cats = Store.categoriesInText(currentSubject());
      var want = Store.pendingGoalsFor(cats).filter(function (g) {
        return g.cats.length && !dismissed[g.id];
      });

      // A goal tagged with a category the flight no longer is goes back out.
      // Keyed on the tag rather than on "did this session add it", so retyping
      // AW as מבנה clears the AW goals even across a draft reload. Goals he
      // typed himself carry no tag and are never touched.
      $$('.goalrow', listEl).forEach(function (r) {
        var rc = (r.dataset.cats || '').split('|').filter(Boolean);
        if (!rc.length) return;
        var fits = rc.some(function (c) { return cats.indexOf(c) !== -1; });
        if (!fits) r.remove();
      });

      // matched on text as well as id, so a goal he had already typed himself
      // is left alone rather than doubled
      var have = {};
      $$('.goalrow', listEl).forEach(function (r) { have[goalTextOf(r).trim()] = 1; });

      var added = 0;
      want.forEach(function (g) {
        var t = g.text.trim();
        if (!t || have[t]) return;
        have[t] = 1;
        listEl.insertAdjacentHTML('beforeend', goalRow(g, false));
        listEl.lastElementChild.classList.add('is-carried');
        added++;
      });

      if (added) {
        haptic(10); touched();
        if (announce) toast(T.goalsPulled(added), 'target');
      }
      return added;
    }

    function onSubjectChanged(announce) {
      refreshSyllabusMatch(announce);
      refreshGoalCarry(announce);
    }

    if (qSubj) {
      var subjEl = $('[data-q="' + qSubj.id + '"]');
      if (subjEl) {
        subjEl.addEventListener('input', function () {
          clearTimeout(syllabusTimer);
          syllabusTimer = setTimeout(function () { onSubjectChanged(true); }, 600);
        });
        subjEl.addEventListener('change', function () { onSubjectChanged(true); });
      }
      onSubjectChanged(false);
    }

    /* ---------- drag to reorder ---------- */
    $$('[data-ex]', root).forEach(function (listEl) {
      makeSortable(listEl, '.ex',
        function () { renumberEx(listEl); touched(); },
        function () { renumberEx(listEl); });
    });

    /* ---------- wheels ---------- */
    var ITEM_H = 42;
    $$('.wheel', root).forEach(function (w) {
      var list = $('.wheel__list', w);
      var start = +w.dataset.val || 0;
      list.scrollTop = start * ITEM_H;
      var raf = null;
      list.addEventListener('scroll', function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var idx = Math.max(0, Math.min(99, Math.round(list.scrollTop / ITEM_H)));
          if (+w.dataset.val === idx) return;
          w.dataset.val = idx;
          $$('.wheel__i', list).forEach(function (el) {
            el.classList.toggle('is-sel', +el.dataset.n === idx);
          });
          haptic(4);
          touched();
        });
      }, { passive: true });
    });

    /* ---------- collect ---------- */
    function collect() {
      var out = { id: rec.id, flownAt: $('#f_date').value || Store.todayISO(),
                  stage: isBrief ? (rec.stage === 'done' ? 'done' : 'brief') : 'done',
                  answers: {}, createdAt: rec.createdAt };
      qs.forEach(function (q) {
        if (q.stage === 'brief' && !isBrief && q.inDebrief === 'readonly') return;
        if (q.type === 'goals') {
          out.answers[q.id] = $$('[data-goals="' + q.id + '"] .goalrow').map(function (row) {
            return { id: row.dataset.goalid, text: goalTextOf(row),
                     status: row.dataset.gs || 'open',
                     cats: (row.dataset.cats || '').split('|').filter(Boolean) };
          });
        } else if (q.type === 'list') {
          out.answers[q.id] = $$('[data-items="' + q.id + '"] .bullet').map(function (row) {
            return { id: row.dataset.itemid, text: $('[data-itemtext]', row).value };
          });
        } else if (q.type === 'syllabus') {
          out.answers[q.id] = $$('[data-ex="' + q.id + '"] .ex').map(function (row) {
            var n = $('[data-exnotes]', row), f = $('[data-exfocus]', row);
            return {
              id: row.dataset.exid,
              text: $('[data-extext]', row).value,
              // the דגש is only editable at the תדריך; carry it through after
              focus: f ? f.value : (row.dataset.focus || ''),
              notes: n ? n.value : ''
            };
          });
        } else if (q.type === 'minutes') {
          var w = $('[data-wheel="' + q.id + '"]');
          out.answers[q.id] = w ? +w.dataset.val : 0;
        } else if (q.type === 'choice') {
          var p = $('[data-choice="' + q.id + '"] .opt[aria-pressed="true"]');
          out.answers[q.id] = p ? p.dataset.opt : '';
        } else {
          var el = $('[data-q="' + q.id + '"]');
          out.answers[q.id] = el ? el.value : '';
        }
      });
      Object.keys(rec.answers).forEach(function (k) {
        if (out.answers[k] === undefined) out.answers[k] = rec.answers[k];
      });
      return out;
    }

    function progress() {
      var d = collect(), filled = 0, total = 0;
      qs.forEach(function (q) {
        if (q.stage === 'brief' && !isBrief && q.inDebrief === 'readonly') return;
        total++;
        var v = d.answers[q.id];
        if (q.type === 'goals' || q.type === 'syllabus' || q.type === 'list') {
          if ((v || []).some(function (x) { return String(x.text || '').trim(); })) filled++;
        } else if (q.type === 'minutes') { if (+v > 0) filled++; }
        else if (String(v == null ? '' : v).trim()) filled++;
      });
      $('#progFill').style.width = Math.round(filled / Math.max(1, total) * 100) + '%';
    }

    function touched() {
      progress();
      if (!isNew) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        Store.saveDraft(collect());
        var el = $('#saveState');
        if (el) {
          el.textContent = T.draftSaved;
          setTimeout(function () { if (el.isConnected) el.textContent = T.draftSaving; }, 1200);
        }
      }, 500);
    }

    root.addEventListener('input', function (e) {
      if (e.target.matches('.ta, .ex__notes')) autosize(e.target);
      touched();
    });

    root.addEventListener('click', function (e) {
      var o = e.target.closest('[data-choice] .opt');
      if (o) {
        var wrap = o.closest('[data-choice]');
        var was = o.getAttribute('aria-pressed') === 'true';
        $$('.opt', wrap).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        o.setAttribute('aria-pressed', String(!was));
        haptic(); touched(); return;
      }

      var fill = e.target.closest('[data-fill]');
      if (fill) {
        var input = $('[data-q="' + fill.dataset.fill + '"]');
        if (input) { input.value = fill.dataset.val; haptic(); touched(); }
        return;
      }

      var app = e.target.closest('[data-append]');
      if (app) {
        var inp = $('[data-q="' + app.dataset.append + '"]');
        if (inp) {
          var val = app.dataset.val, cur = inp.value.trim();
          if (cur.indexOf(val) === -1) inp.value = cur ? cur + ' ' + val : val;
          inp.focus(); haptic(); touched();
          onSubjectChanged(true);
        }
        return;
      }

      var vx = e.target.closest('.vx button');
      if (vx) {
        var row = vx.closest('.goalrow'), want = vx.dataset.v;
        var next = row.dataset.gs === want ? 'open' : want;
        row.dataset.gs = next;
        row.classList.toggle('is-met', next === 'met');
        row.classList.toggle('is-missed', next === 'missed');
        $$('.vx button', row).forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.v === next));
        });
        syncCarry(row, next);
        haptic(next === 'met' ? 12 : 6); touched(); return;
      }

      var rx = e.target.closest('[data-rowx]');
      if (rx) {
        var host = rx.closest('.ex, .goalrow, .bullet');
        if (!host) return;
        var listEl = host.parentElement;
        // taking a carried goal back out has to stick, or the next keystroke in
        // נושא טיסה puts it straight back. The row id IS the waiting goal's id,
        // so this survives a draft reload too.
        if (host.dataset.goalid) dismissed[host.dataset.goalid] = 1;
        host.remove();
        if (listEl.hasAttribute('data-ex')) renumberEx(listEl);
        touched(); return;
      }

      var gp = e.target.closest('[data-goalpush]');
      if (gp) { pushGoal(gp.dataset.goalpush); return; }
      var ip = e.target.closest('[data-itempush]');
      if (ip) { pushItem(ip.dataset.itempush); return; }
      var xp = e.target.closest('[data-expush]');
      if (xp) { pushEx(xp.dataset.expush); return; }
      var xb = e.target.closest('[data-exbulk]');
      if (xb) { bulkEx(xb.dataset.exbulk); return; }

      var xl = e.target.closest('[data-exload]');
      if (xl) {
        var entry = SyllabusRef.lookup(currentSubject());
        if (!entry) return;
        var lst = $('[data-ex="' + xl.dataset.exload + '"]');
        var has = $$('.ex', lst).some(function (r) { return $('[data-extext]', r).value.trim(); });
        if (!has) { toast(T.syllabusFilled(fillSyllabus(entry, true)), 'list3'); return; }
        confirmSheet({
          title: T.replaceSyllabus, text: T.replaceSyllabusBody, confirmLabel: T.confirm,
          onConfirm: function () { toast(T.syllabusFilled(fillSyllabus(entry, true)), 'list3'); }
        });
      }
    });

    /* Marking a goal ✗ writes it straight into יעדים לטיסה הבאה, and clearing
       the ✗ takes it back out. Only rows this added carry data-from, so a goal
       he typed himself is never removed underneath him. */
    function syncCarry(row, status) {
      if (!qNext) return;
      var listEl = $('[data-goals="' + qNext.id + '"]');
      if (!listEl) return;
      var text = goalTextOf(row).trim();
      var gid = row.dataset.goalid;
      var mine = $$('.goalrow', listEl).filter(function (r) { return r.dataset.from === gid; })[0];

      if (status === 'missed') {
        if (mine || !text) return;
        var dupe = $$('.goalrow', listEl).some(function (r) {
          return goalTextOf(r).trim() === text;
        });
        if (dupe) return;
        listEl.insertAdjacentHTML('beforeend', goalRow(Store.normalizeGoal({ text: text }), false));
        var added = listEl.lastElementChild;
        added.dataset.from = gid;
        added.classList.add('is-carried');
        toast(T.carriedToNext, 'flag');
      } else if (mine) {
        mine.remove();
      }
    }

    function renumberEx(listEl) {
      $$('.ex__n', listEl).forEach(function (n, i) { n.textContent = i + 1; });
    }
    function pushGoal(qid) {
      var input = $('[data-goalinput="' + qid + '"]'), v = input.value.trim();
      if (!v) return;
      var ws = $('[data-goals="' + qid + '"]').dataset.status === '1';
      $('[data-goals="' + qid + '"]').insertAdjacentHTML('beforeend',
        goalRow(Store.normalizeGoal({ text: v }), ws));
      input.value = ''; input.focus(); haptic(); touched();
    }
    /** One bullet per line, so a block of notes can be pasted in and split. */
    function pushItemLines(qid, text) {
      var lines = splitLines(text);
      if (!lines.length) return 0;
      var listEl = $('[data-items="' + qid + '"]');
      lines.forEach(function (line) {
        listEl.insertAdjacentHTML('beforeend', itemRow(Store.normalizeItem({ text: line })));
      });
      haptic(12); touched();
      return lines.length;
    }
    function pushItem(qid) {
      var input = $('[data-iteminput="' + qid + '"]');
      if (!pushItemLines(qid, input.value)) return;
      input.value = ''; input.focus();
    }

    /** Append one row per line, so a whole syllabus can be pasted at once. */
    function pushExLines(qid, text) {
      var lines = splitLines(text);
      if (!lines.length) return 0;
      var listEl = $('[data-ex="' + qid + '"]');
      var wn = listEl.dataset.notes === '1';
      lines.forEach(function (line) {
        listEl.insertAdjacentHTML('beforeend',
          exRow(Store.normalizeEx({ text: line }), listEl.children.length, wn));
        var ta = listEl.lastElementChild.querySelector('.ex__notes');
        if (ta) autosize(ta);
      });
      haptic(12); touched();
      return lines.length;
    }

    function pushEx(qid) {
      var input = $('[data-exinput="' + qid + '"]');
      if (!pushExLines(qid, input.value)) return;
      input.value = ''; input.focus();
    }

    function bulkEx(qid) {
      openSheet({
        title: T.pasteList, text: T.pasteListHint,
        body: '<textarea class="ta" id="bulkEx" dir="auto" rows="8" placeholder="' +
              esc(T.addExercise) + '"></textarea>',
        actions: [
          { label: T.add, cls: 'btn--lit', icon: 'plus', keepOpen: true, run: function (sh) {
            var n = pushExLines(qid, $('#bulkEx', sh).value);
            sh.close();
            if (n) toast(n + ' תרגילים נוספו');
          } },
          { label: T.cancel, cls: 'btn--quiet' }
        ],
        onOpen: function (sh) { setTimeout(function () { $('#bulkEx', sh).focus(); }, 120); }
      });
    }

    $$('[data-goalinput]', root).forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); pushGoal(el.dataset.goalinput); }
      });
    });
    $$('[data-iteminput]', root).forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); pushItem(el.dataset.iteminput); }
      });
      // pasting a block of notes lands as one bullet per line
      el.addEventListener('paste', function (e) {
        var text = (e.clipboardData || global.clipboardData).getData('text');
        if (!text || text.indexOf('\n') === -1) return;
        e.preventDefault();
        var n = pushItemLines(el.dataset.iteminput, text);
        el.value = '';
        if (n) toast(T.pointsAdded(n));
      });
    });
    $$('[data-exinput]', root).forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); pushEx(el.dataset.exinput); }
      });
      // pasting a multi-line syllabus lands as one row per line
      el.addEventListener('paste', function (e) {
        var text = (e.clipboardData || global.clipboardData).getData('text');
        if (!text || text.indexOf('\n') === -1) return;
        e.preventDefault();
        var n = pushExLines(el.dataset.exinput, text);
        el.value = '';
        if (n) toast(n + ' תרגילים נוספו');
      });
    });

    on(viewEl, '[data-save]', 'click', function () {
      var d = collect();
      var any = qs.some(function (q) {
        var v = d.answers[q.id];
        if (q.type === 'goals' || q.type === 'syllabus' || q.type === 'list') {
          return (v || []).some(function (x) { return String(x.text || '').trim(); });
        }
        if (q.type === 'minutes') return +v > 0;
        return String(v == null ? '' : v).trim();
      });
      if (!any) { toast(T.needSomething, 'alert'); return; }
      Store.save(d).then(function (saved) {
        if (isNew) Store.clearDraft();
        haptic(16);
        toast(isBrief ? T.briefSavedToast : T.debriefSavedToast);
        go(isBrief ? '' : 'flight/' + saved.id);
      });
    });

    progress();
  }

  function autosize(t) { t.style.height = 'auto'; t.style.height = Math.max(t.scrollHeight, 44) + 'px'; }
  function autosizeAll() { $$('.ta, .ex__notes', viewEl).forEach(autosize); }

  /** Pasted lists already carry their own bullets or numbers; strip them so the
   *  rows are not numbered twice. */
  function splitLines(text) {
    return String(text || '').split('\n')
      .map(function (l) { return l.replace(/^\s*[-•*\d.)\]]+\s*/, '').trim(); })
      .filter(Boolean);
  }

  /** A goal row's text, whether it is being graded (fixed) or written (input). */
  function goalTextOf(row) {
    var el = $('[data-goaltext]', row);
    if (!el) return '';
    return el.tagName === 'INPUT' ? el.value : el.textContent;
  }

  /* ============================================================ drag order */

  /** Drag a row by its grip to reorder the list.
   *
   *  Pointer events, not HTML5 drag-and-drop: iOS Safari does not fire a single
   *  dragstart on touch, so the built-in API is not an option on the one device
   *  this app runs on. The grip carries `touch-action:none` so the page does not
   *  scroll out from under the drag.
   */
  function makeSortable(listEl, rowSel, onDrop, onOrder) {
    var row = null, grip = null, startY = 0, lastY = 0, dy = 0, raf = null, lastScroll = 0;

    listEl.addEventListener('pointerdown', function (e) {
      var g = e.target.closest('[data-grip]');
      if (!g || !listEl.contains(g)) return;
      var host = g.closest(rowSel);
      if (!host || host.parentElement !== listEl) return;

      e.preventDefault();
      row = host; grip = g;
      startY = lastY = e.clientY; dy = 0;
      lastScroll = global.scrollY;
      row.classList.add('is-drag');
      document.body.classList.add('is-sorting');
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', drop);
      grip.addEventListener('pointercancel', drop);
      haptic(12);
      raf = requestAnimationFrame(tick);
    });

    function move(e) { lastY = e.clientY; dy = lastY - startY; apply(); reorder(); }

    function drop() {
      if (!row) return;
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', drop);
      grip.removeEventListener('pointercancel', drop);
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      row.style.transform = '';
      row.classList.remove('is-drag');
      document.body.classList.remove('is-sorting');
      row = null; grip = null;
      haptic(8);
      if (onDrop) onDrop();
    }

    function apply() { if (row) row.style.transform = 'translateY(' + dy + 'px)'; }

    /* Dragging past the top or bottom of the screen scrolls the page. The page
       moving under a finger that has not moved changes the offset the row needs,
       so startY absorbs the scroll delta and the row stays put under the touch.
       Measured against the actual scroll position rather than the amount asked
       for, so a scroll from anywhere else is corrected the same way. */
    function tick() {
      if (!row) return;
      var EDGE = 90, SPEED = 13, vh = global.innerHeight, v = 0;
      if (lastY < EDGE) v = -SPEED * (1 - lastY / EDGE);
      else if (lastY > vh - EDGE) v = SPEED * (1 - (vh - lastY) / EDGE);
      // clamped: a pointer reported outside the viewport would otherwise scale
      // this without limit and fling the page
      v = Math.max(-SPEED, Math.min(SPEED, v));
      if (v) global.scrollBy(0, v);
      if (global.scrollY !== lastScroll) {
        startY -= (global.scrollY - lastScroll);
        lastScroll = global.scrollY;
        dy = lastY - startY; apply(); reorder();
      }
      raf = requestAnimationFrame(tick);
    }

    /** Move the row past every neighbour its centre has cleared. The loop runs
     *  until nothing changes, so a fast flick lands where the finger is rather
     *  than one place per event. */
    function reorder() {
      var moved = true, guard = 0;
      while (row && moved && guard++ < 40) {
        moved = false;
        var box = row.getBoundingClientRect();
        var mid = box.top + box.height / 2;
        var kids = Array.prototype.slice.call(listEl.children);
        for (var i = 0; i < kids.length; i++) {
          var sib = kids[i];
          if (sib === row) continue;
          var b = sib.getBoundingClientRect();
          var sibMid = b.top + b.height / 2;
          var below = (row.compareDocumentPosition(sib) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
          if (below && mid > sibMid) { place(sib.nextSibling); moved = true; break; }
          if (!below && mid < sibMid) { place(sib); moved = true; break; }
        }
      }
    }

    /* Reinserting the row shifts its layout position; the transform is adjusted
       by the same amount so it does not visibly jump under the finger. */
    function place(before) {
      var t0 = row.getBoundingClientRect().top;
      listEl.insertBefore(row, before);
      var t1 = row.getBoundingClientRect().top;
      startY += (t1 - t0);
      dy = lastY - startY;
      apply();
      // renumber as it moves, or the list reads 1 3 4 with a 2 floating over it
      if (onOrder) onOrder();
    }
  }

  /* ================================================================== log */

  var logQuery = '', logCats = {}, logSelect = false;

  /* Kept in sessionStorage so a reload on the summary screen does not lose the
     selection. It is cleared when the app is closed, which is the right life. */
  function readSel() {
    try { return JSON.parse(sessionStorage.getItem('sortie:sel') || '{}') || {}; }
    catch (e) { return {}; }
  }
  function writeSel() {
    try { sessionStorage.setItem('sortie:sel', JSON.stringify(selected)); } catch (e) {}
  }
  var selected = readSel();

  function selCount() { return Object.keys(selected).filter(function (k) { return selected[k]; }).length; }

  /** Sunday to Saturday of the week we are in. */
  function thisWeekRange() {
    var end = new Date(); end.setHours(0, 0, 0, 0);
    var start = new Date(end);
    start.setDate(start.getDate() - start.getDay());   // back to Sunday
    var stop = new Date(start); stop.setDate(stop.getDate() + 6);
    return { start: start, stop: stop };
  }

  function selectThisWeek() {
    var w = thisWeekRange();
    Store.all().forEach(function (r) {
      var t = parseISO(r.flownAt).getTime();
      if (t >= w.start.getTime() && t <= w.stop.getTime()) selected[r.id] = true;
    });
    writeSel();
  }

  function screenLog() {
    renderTopbar({
      title: logSelect ? T.nSelected(selCount()) : T.navLog,
      sub: logSelect ? '' : String(Store.count()),
      actions: logSelect
        ? [{ id: 'done', ic: 'x', label: T.cancel, run: function () {
            logSelect = false; selected = {}; writeSel(); screenLog();
          } }]
        : [
            { id: 'sel', ic: 'checkCircle', label: T.selectMode, run: function () {
              logSelect = true; screenLog();
            } },
            { id: 'new', ic: 'plus', label: T.newBrief, lit: true, run: function () { go('brief'); } }
          ]
    });

    // categories come from the vocabulary, not from the raw answers, so
    // "AW 3" and "AW 7" both sit under AW
    var vocab = Store.categoryVocab();
    var used = {};
    Store.all().forEach(function (r) {
      Store.categoriesOf(r).forEach(function (c) { used[c] = (used[c] || 0) + 1; });
    });
    var opts = vocab.filter(function (c) { return used[c]; });
    var anyCat = Object.keys(logCats).some(function (k) { return logCats[k]; });

    var wk = thisWeekRange();
    var weekN = Store.all().filter(function (r) {
      var t = parseISO(r.flownAt).getTime();
      return t >= wk.start.getTime() && t <= wk.stop.getTime();
    }).length;

    viewEl.innerHTML = '<div class="stack-4" id="logRoot">' +
      (!logSelect && Store.count()
        ? '<button class="weekbtn" data-weeksum' + (weekN ? '' : ' disabled') + '>' +
            icon('calendar') +
            '<span class="weekbtn__b"><span class="weekbtn__t">' + esc(T.weekSummary) + '</span>' +
            '<span class="weekbtn__s">' + esc(weekN ? T.nThisWeek(weekN) : T.noneThisWeek) + '</span></span>' +
            icon('chevRight', { cls: 'weekbtn__c' }) +
          '</button>'
        : '') +
      (logSelect
        ? '<div class="opts">' +
            '<button class="opt opt--sm" data-selweek>' + icon('calendar') + esc(T.selectWeek) + '</button>' +
            '<button class="opt opt--sm" data-selclear>' + esc(T.clearSel) + '</button>' +
          '</div>'
        : '<div class="search">' + icon('search') +
          '<input class="input" id="q" type="search" dir="auto" autocomplete="off" placeholder="' +
            esc(T.search) + '" value="' + esc(logQuery) + '"></div>') +
      (!logSelect && opts.length ? '<div class="opts" id="logChips">' +
        '<button class="opt opt--sm" data-f="" aria-pressed="' + (!anyCat) + '">' + esc(T.all) + '</button>' +
        opts.map(function (o) {
          return '<button class="opt opt--sm" data-f="' + esc(o) + '" dir="auto" aria-pressed="' +
            (!!logCats[o]) + '">' + esc(o) +
            '<span class="opt__n mono">' + used[o] + '</span></button>';
        }).join('') + '</div>' : '') +
      '<div id="logResults"></div></div>' +
      (logSelect
        ? '<div class="savebar"><div class="savebar__inner">' +
            '<span class="savestate" id="selCount">' + selCount() + ' SELECTED</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn--lit" data-summary>' + icon('list3') + esc(T.makeSummary) + '</button>' +
          '</div></div>'
        : '');

    viewEl.classList.toggle('view--noTabs', logSelect);

    function paint() {
      var picked = Object.keys(logCats).filter(function (k) { return logCats[k]; });
      var rows = Store.search(logQuery).filter(function (r) {
        if (!picked.length) return true;
        var cats = Store.categoriesOf(r);
        // matching ANY selected category, so picking AW and ניווט shows both
        return picked.some(function (c) { return cats.indexOf(c) !== -1; });
      });
      $('#logResults').innerHTML = rows.length
        ? '<div class="panel"><div class="list">' + rows.map(function (r) {
            return flightRow(r, logSelect);
          }).join('') + '</div></div>'
        : empty('search', Store.count() ? T.noMatches : T.noFlights,
                Store.count() ? T.noMatchesHint : T.noFlightsHint);
    }
    paint();

    if (!logSelect) {
      $('#q').addEventListener('input', function (e) { logQuery = e.target.value; paint(); });
    }

    $('#logRoot').addEventListener('click', function (e) {
      var c = e.target.closest('#logChips .opt');
      if (c) {
        if (!c.dataset.f) logCats = {};
        else logCats[c.dataset.f] = !logCats[c.dataset.f];
        var on = Object.keys(logCats).some(function (k) { return logCats[k]; });
        $$('#logChips .opt').forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.f ? !!logCats[b.dataset.f] : !on));
        });
        paint(); return;
      }

      if (e.target.closest('[data-selweek]')) {
        selectThisWeek(); haptic(12); screenLog(); return;
      }
      if (e.target.closest('[data-selclear]')) { selected = {}; writeSel(); screenLog(); return; }

      var row = e.target.closest('.frow');
      if (!row) return;
      if (logSelect) {
        selected[row.dataset.id] = !selected[row.dataset.id];
        writeSel();
        row.classList.toggle('is-on', !!selected[row.dataset.id]);
        row.setAttribute('aria-pressed', String(!!selected[row.dataset.id]));
        var n = selCount();
        $('#selCount').textContent = n + ' SELECTED';
        $('.topbar__title').textContent = T.nSelected(n);
        haptic();
      } else {
        go('flight/' + row.dataset.id);
      }
    });

    on(viewEl, '[data-summary]', 'click', function () {
      if (!selCount()) { toast(T.noneSelected, 'alert'); return; }
      go('summary');
    });

    on(viewEl, '[data-weeksum]', 'click', function () {
      selectThisWeek();
      if (!selCount()) { toast(T.noneThisWeek, 'alert'); return; }
      go('summary');
    });
  }

  /* =============================================================== detail */

  function screenDetail() {
    var r = Store.get(route.param);
    if (!r) { go('log'); return; }
    var pending = r.stage !== 'done';

    renderTopbar({
      title: fmtDate(r.flownAt), sub: pending ? T.capBrief : T.capDebrief,
      back: true, backTo: 'log',
      actions: [
        { id: 'share', ic: 'share', label: T.share, run: function () {
          var t = Store.asText(r, fmtLong);
          if (navigator.share) navigator.share({ title: T.app, text: t }).catch(function () {});
          else if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast(T.copiedToast); });
        } },
        { id: 'edit', ic: 'pencil', label: T.edit, lit: true, run: function () {
          go(pending ? 'brief/' + r.id : 'debrief/' + r.id);
        } }
      ]
    });

    var qs = Store.questions(true).filter(function (q) {
      return !q.archived || hasAns(q, r.answers[q.id]);
    });

    viewEl.innerHTML = '<div class="stack-4 stagger">' +
      '<div class="hero">' +
        '<div class="hero__meta"><i style="background:' + (pending ? 'var(--amber)' : 'var(--green)') +
          ';box-shadow:0 0 8px currentColor"></i>' + esc(pending ? T.capBrief : T.capDebrief) + '</div>' +
        '<h1 class="hero__h">' + esc(fmtLong(r.flownAt)) + '</h1>' +
      '</div>' +
      (pending
        ? '<button class="btn btn--amber btn--block btn--lg" data-godebrief>' + icon('check') +
          esc(T.openBrief) + '</button>'
        : '') +
      '<section class="panel">' + qs.map(function (q) { return answerBlock(q, r.answers[q.id]); }).join('') +
      '</section>' +
      '<div class="stack">' +
        '<button class="btn btn--block" data-copy>' + icon('copy') + esc(T.copyText) + '</button>' +
        '<button class="btn btn--quiet btn--block" data-del>' + icon('trash') + esc(T.deleteFlight) + '</button>' +
      '</div></div>';

    on(viewEl, '[data-godebrief]', 'click', function () { go('debrief/' + r.id); });
    on(viewEl, '[data-copy]', 'click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(Store.asText(r, fmtLong))
        .then(function () { toast(T.copiedToast); });
    });
    on(viewEl, '[data-del]', 'click', function () {
      confirmSheet({
        title: T.confirmDeleteFlight(fmtLong(r.flownAt)), text: T.confirmDeleteBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () { Store.remove(r.id).then(function () { toast(T.deletedToast, 'trash'); go('log'); }); }
      });
    });

    function hasAns(q, v) {
      if (q.type === 'goals' || q.type === 'syllabus' || q.type === 'list') {
        return (v || []).some(function (x) { return String(x.text || '').trim(); });
      }
      if (q.type === 'minutes') return +v > 0;
      return v != null && String(v).trim() !== '';
    }

    function answerBlock(q, v) {
      var head = '<div class="answer__q"><b>' + esc(q.label) + '</b>' +
        (q.stage === 'brief' ? '<span class="tagline">' + esc(T.capBrief) + '</span>' : '') + '</div>';

      if (q.type === 'goals') {
        var list = (v || []).filter(function (g) { return g.text.trim(); });
        return '<div class="answer">' + head + (list.length
          ? '<div class="goals">' + list.map(function (g) {
              // no badge on an ungraded goal: יעדים לטיסה הבאה are set, never
              // marked, so a grade widget there says nothing
              return '<div class="goalrow' + (g.status === 'met' ? ' is-met' : g.status === 'missed' ? ' is-missed' : '') +
                '"><span class="goalrow__t" dir="auto"><span>' + esc(g.text) + '</span></span>' +
                (g.status === 'open' ? '' :
                  '<span class="vx"><button type="button" disabled data-v="' + esc(g.status) +
                    '" aria-pressed="true" tabindex="-1">' +
                    icon(g.status === 'met' ? 'check' : 'x') +
                  '</button></span>') + '</div>';
            }).join('') + '</div>'
          : '<div class="answer__a is-empty">' + esc(T.notAnswered) + '</div>') + '</div>';
      }

      if (q.type === 'syllabus') {
        var xs = (v || []).filter(function (x) { return x.text.trim(); });
        return '<div class="answer">' + head + (xs.length
          ? '<div class="exlist">' + xs.map(function (x, i) {
              return '<div class="ex' + (x.notes.trim() ? ' ex--done' : '') + '">' +
                '<div class="ex__top"><span class="ex__n">' + (i + 1) + '</span>' +
                '<span class="ex__t" dir="auto" style="display:flex;align-items:center">' + esc(x.text) + '</span></div>' +
                (x.focus.trim() ? '<div class="ex__focus" dir="auto">' + icon('flag') +
                  '<span>' + esc(x.focus) + '</span></div>' : '') +
                (x.notes.trim() ? '<div class="ex__notes" dir="auto">' + esc(x.notes) + '</div>' : '') +
              '</div>';
            }).join('') + '</div>'
          : '<div class="answer__a is-empty">' + esc(T.notAnswered) + '</div>') + '</div>';
      }

      if (q.type === 'list') {
        var lines = Store.linesOf(v);
        return '<div class="answer">' + head + (lines.length
          ? '<div class="bullets">' + lines.map(function (t) {
              return '<div class="bullet bullet--ro"><span class="bullet__d"></span>' +
                '<span class="bullet__t" dir="auto">' + esc(t) + '</span></div>';
            }).join('') + '</div>'
          : '<div class="answer__a is-empty">' + esc(T.notAnswered) + '</div>') + '</div>';
      }

      if (q.type === 'minutes') {
        return '<div class="answer">' + head +
          '<div class="answer__a is-num">' + (+v || 0) + ' <small style="font-size:var(--t-12)">' +
          esc(T.minutesUnit) + '</small></div></div>';
      }

      var txt = v == null ? '' : String(v);
      return '<div class="answer">' + head +
        '<div class="answer__a' + (txt.trim() ? '' : ' is-empty') + '" dir="auto">' +
        esc(txt.trim() || T.notAnswered) + '</div></div>';
    }
  }

  /* =============================================================== trends */

  var tlField = null;

  function screenTrends() {
    renderTopbar({ title: T.navTrends, sub: T.capTrends });
    var done = Store.done();
    if (!done.length) { viewEl.innerHTML = empty('trending', T.trendsEmpty, T.trendsEmptyHint); return; }

    var qg = Store.roleQuestion('goals'), met = 0, tot = 0, miss = {};
    if (qg) done.forEach(function (r) {
      (r.answers[qg.id] || []).forEach(function (g) {
        if (!g.text.trim()) return;
        if (g.status === 'met') { met++; tot++; }
        else if (g.status === 'missed') { tot++; miss[g.text.trim()] = (miss[g.text.trim()] || 0) + 1; }
      });
    });
    var rate = tot ? Math.round(met / tot * 100) : 0;

    var qMin = Store.questions().filter(function (q) { return q.type === 'minutes'; })[0];
    var mins = 0;
    if (qMin) done.forEach(function (r) { var v = parseInt(r.answers[qMin.id], 10); if (!isNaN(v)) mins += v; });

    var weeks = [];
    for (var w = 7; w >= 0; w--) {
      var end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - w * 7);
      var st = new Date(end); st.setDate(st.getDate() - 6); st.setHours(0, 0, 0, 0);
      weeks.push({
        n: done.filter(function (r) {
          var t = parseISO(r.flownAt).getTime();
          return t >= st.getTime() && t <= end.getTime();
        }).length, l: String(st.getDate())
      });
    }
    var wMax = Math.max(1, Math.max.apply(null, weeks.map(function (x) { return x.n; })));

    var textQs = Store.questions().filter(function (q) {
      return q.type === 'textarea' || q.type === 'text';
    });
    if (!tlField || !textQs.some(function (q) { return q.id === tlField; })) {
      tlField = textQs.length ? textQs[0].id : null;
    }
    var missRows = Object.keys(miss).sort(function (a, b) { return miss[b] - miss[a]; }).slice(0, 6);
    var missMax = missRows.length ? miss[missRows[0]] : 1;

    var h = '<div class="stack-4 stagger">' +
      '<div class="readouts">' +
        ro('cyan', 'clock', T.totalMinutes, 'HOURS', (mins / 60).toFixed(1)) +
        ro('', 'layers', T.rFlights, 'FLIGHTS', String(done.length)) +
        ro('green', 'target', T.goalRate, 'GOALS', rate + '<small>%</small>') +
        ro('amber', 'alert', T.repeatedGoals, 'REPEAT', String(missRows.length)) +
      '</div>' +

      '<section class="panel"><div class="panel__head">' + icon('trending') +
        '<span class="panel__t">' + esc(T.flightsPerWeek) + '</span>' +
        '<span class="panel__a">8W</span></div><div class="panel__body">' +
        '<div class="weeks">' + weeks.map(function (x, i) {
          return '<div class="week"><div class="week__bar' + (x.n ? '' : ' is-zero') + '" style="height:' +
            Math.max(3, Math.round(x.n / wMax * 54)) + 'px;animation-delay:' + (i * 26) + 'ms"></div>' +
            '<div class="week__l">' + esc(x.l) + '</div></div>';
        }).join('') + '</div></div></section>';

    Store.questions().filter(function (q) { return q.type === 'choice'; }).forEach(function (q) {
      var c = {};
      done.forEach(function (r) {
        var v = r.answers[q.id];
        if (v && String(v).trim()) c[v] = (c[v] || 0) + 1;
      });
      var keys = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
      if (!keys.length) return;
      var max = c[keys[0]], total = keys.reduce(function (s, k) { return s + c[k]; }, 0);
      h += '<section class="panel"><div class="panel__head">' + icon('filter') +
        '<span class="panel__t">' + esc(q.label) + '</span></div><div class="panel__body"><div class="bars">' +
        keys.map(function (k, i) { return bar(k, c[k], max, total, i); }).join('') + '</div></div></section>';
    });

    if (missRows.length) {
      h += '<section class="panel panel--red"><div class="panel__head">' + icon('alert') +
        '<span class="panel__t">' + esc(T.repeatedGoals) + '</span></div>' +
        '<div class="panel__body"><div class="bars">' +
        missRows.map(function (k, i) { return bar(k, miss[k], missMax, done.length, i, true); }).join('') +
        '</div></div></section>';
    }

    if (tlField) {
      h += '<section class="stack"><h2 class="h-sect">' + esc(T.readAcross) + '</h2>' +
        '<div class="seg">' + textQs.slice(0, 3).map(function (q) {
          return '<button data-tlf="' + esc(q.id) + '" aria-pressed="' + (tlField === q.id) + '">' +
            esc(q.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="panel"><div class="panel__body"><div class="tl">' + (function () {
          var rows = done.filter(function (r) { return String(r.answers[tlField] || '').trim(); }).slice(0, 20);
          if (!rows.length) return '<p class="dim" style="font-size:var(--t-13)">' + esc(T.nothingHere) + '</p>';
          return rows.map(function (r) {
            return '<div class="tlrow"><div class="tlrow__m">' + esc(fmtDate(r.flownAt)) + '</div>' +
              '<div class="tlrow__t" dir="auto">' + esc(r.answers[tlField]) + '</div></div>';
          }).join('');
        })() + '</div></div></div></section>';
    }

    viewEl.innerHTML = h + '</div>';
    on(viewEl, '[data-tlf]', 'click', function (e) { tlField = e.currentTarget.dataset.tlf; screenTrends(); });

    function ro(tone, ic, k, cap, v) {
      return '<div class="readout' + (tone ? ' readout--' + tone : '') + '">' +
        '<div class="readout__k">' + icon(ic) + '<span>' + esc(k) + '</span></div>' +
        '<div class="readout__v">' + v + '</div><div class="readout__s">' + esc(cap) + '</div></div>';
    }
    function bar(label, n, max, total, i, red) {
      return '<div class="bar"><div class="bar__top">' +
        '<span class="bar__label" dir="auto">' + esc(label) + '</span>' +
        '<span class="bar__val">' + n + (total ? ' · ' + Math.round(n / total * 100) + '%' : '') + '</span></div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' + Math.round(n / max * 100) +
        '%;animation-delay:' + (i * 34) + 'ms' + (red ? ';background:var(--red);box-shadow:none' : '') +
        '"></div></div></div>';
    }
  }

  /* ============================================================= settings */

  function screenSettings() {
    renderTopbar({ title: T.settings, sub: T.capSet });
    var s = Store.settings(), since = daysSince(s.lastExport), qs = Store.questions();

    viewEl.innerHTML = '<div class="stack-6 stagger">' +
      (since === null || since >= 14
        ? '<div class="note">' + icon('alert') + '<div><b>' + esc(T.backupTitle) + '</b><br>' +
          esc(since === null ? T.backupNever : T.backupDays(since)) + ' ' + esc(T.backupBody) + '</div></div>' : '') +

      '<section class="stack"><h2 class="h-sect">' + esc(T.appearance) + '</h2><div class="seg">' +
        [['dark', T.themeDark], ['light', T.themeLight], ['auto', T.themeAuto]].map(function (t) {
          return '<button data-theme-set="' + t[0] + '" aria-pressed="' + (s.theme === t[0]) + '">' +
            esc(t[1]) + '</button>';
        }).join('') + '</div></section>' +

      '<section class="stack">' +
        '<h2 class="h-sect">' + esc(T.questions) + '</h2>' +
        '<p class="dim" style="font-size:var(--t-12);line-height:1.6;margin-top:-6px">' + esc(T.questionsHint) + '</p>' +
        '<div class="group">' + qs.map(function (q, i) {
          var lock = Store.isProtected(q);
          return '<div class="qrow' + (lock ? ' qrow--lock' : '') + '" data-qid="' + esc(q.id) + '">' +
            '<span class="qrow__b"><span class="qrow__t">' + esc(q.label) + '</span>' +
            '<span class="qrow__s">' + esc(q.stage === 'brief' ? T.stageBrief : T.stageDebrief) +
              ' · ' + esc(typeLabel(q.type)) + '</span></span>' +
            '<span class="qrow__acts">' +
              '<button data-qmove="-1" aria-label="' + esc(T.moveUp) + '"' + (i === 0 ? ' disabled' : '') + '>' + icon('chevUp') + '</button>' +
              '<button data-qmove="1" aria-label="' + esc(T.moveDown) + '"' + (i === qs.length - 1 ? ' disabled' : '') + '>' + icon('chevDown') + '</button>' +
              '<button data-qedit aria-label="' + esc(T.editQuestion) + '">' + icon('pencil') + '</button>' +
              (lock ? '' : '<button data-qdel aria-label="' + esc(T.delete) + '">' + icon('trash') + '</button>') +
            '</span></div>';
        }).join('') +
        '<button class="item" data-qadd><span class="item__ic">' + icon('plus') + '</span>' +
        '<span class="item__b"><span class="item__t">' + esc(T.addQuestion) + '</span></span></button></div>' +
        '<button class="btn btn--quiet btn--block" data-qreset style="min-height:38px;font-size:var(--t-12)">' +
          esc(T.restoreDefaults) + '</button>' +
      '</section>' +

      '<section class="stack"><div class="group">' +
        item('list3', T.syllabusRef,
             T.syllabusRefSub(global.SyllabusRef ? SyllabusRef.count() : 0), 'syllabus') +
      '</div></section>' +

      '<section class="stack"><h2 class="h-sect">' + esc(T.yourData) + '</h2><div class="group">' +
        item('download', T.exportCsv, T.exportCsvSub, 'export-csv') +
        item('download', T.exportJson, T.exportJsonSub, 'export-json') +
        item('upload', T.importJson, T.importJsonSub, 'import-json') + '</div></section>' +

      '<section class="stack"><h2 class="h-sect">' + esc(T.privacy) + '</h2><div class="group">' +
        item('lock', s.pin ? T.changeCode : T.setCode,
             Store.cryptoReady() ? (s.pin ? T.codeOn : T.codeOff) : T.needsHttps, 'pin-set') +
        (s.pin ? item('x', T.removeCode, '', 'pin-off') : '') + '</div>' +
        '<p class="dim" style="font-size:var(--t-12);line-height:1.6">' + esc(T.privacyNote) + '</p></section>' +

      '<section><div class="group"><button class="item item--danger" data-clear>' +
        '<span class="item__ic">' + icon('trash') + '</span><span class="item__b">' +
        '<span class="item__t">' + esc(T.deleteAll) + '</span>' +
        '<span class="item__s">' + esc(T.cannotUndo) + '</span></span></button></div></section>' +

      '<p class="dim" style="font-size:var(--t-10);text-align:center;font-family:var(--font-mono);letter-spacing:.1em">' +
        esc(T.app) + ' ' + BUILD + ' · ' + esc(T.offline) + ' · ' + Store.count() + ' ' + esc(T.onDevice) + '</p>' +
      '</div><input type="file" id="importFile" accept=".json,application/json" hidden>';

    function item(ic, t, sub, act) {
      return '<button class="item" data-act="' + act + '"><span class="item__ic">' + icon(ic) + '</span>' +
        '<span class="item__b"><span class="item__t">' + esc(t) + '</span>' +
        (sub ? '<span class="item__s">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="item__r">' + icon('chevRight', { cls: 'chev' }) + '</span></button>';
    }

    on(viewEl, '[data-theme-set]', 'click', function (e) {
      Store.set('theme', e.currentTarget.dataset.themeSet); applyTheme(); screenSettings();
    });
    on(viewEl, '[data-qmove]', 'click', function (e) {
      Store.moveQuestion(e.currentTarget.closest('.qrow').dataset.qid, +e.currentTarget.dataset.qmove);
      haptic(); screenSettings();
    });
    on(viewEl, '[data-qedit]', 'click', function (e) {
      questionSheet(Store.question(e.currentTarget.closest('.qrow').dataset.qid));
    });
    on(viewEl, '[data-qdel]', 'click', function (e) {
      var q = Store.question(e.currentTarget.closest('.qrow').dataset.qid);
      confirmSheet({
        title: T.confirmDeleteQuestion(q.label), text: T.confirmDeleteQuestionBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () { Store.removeQuestion(q.id); toast(T.deletedToast, 'trash'); screenSettings(); }
      });
    });
    on(viewEl, '[data-qadd]', 'click', function () { questionSheet(null); });
    on(viewEl, '[data-qreset]', 'click', function () {
      confirmSheet({
        title: T.restoreDefaults, text: T.confirmDeleteQuestionBody, confirmLabel: T.confirm,
        onConfirm: function () { Store.resetQuestions(); screenSettings(); }
      });
    });

    on(viewEl, '[data-act]', 'click', function (e) {
      var a = e.currentTarget.dataset.act;
      if (a === 'export-csv') {
        if (!Store.count()) return toast(T.noFlights, 'alert');
        saveFile('tahkir-' + stamp() + '.csv', Store.toCSV(), 'text/csv');
        setTimeout(screenSettings, 400);
      }
      if (a === 'export-json') {
        if (!Store.count()) return toast(T.noFlights, 'alert');
        saveFile('tahkir-backup-' + stamp() + '.json', Store.toJSON(), 'application/json');
        setTimeout(screenSettings, 400);
      }
      if (a === 'syllabus') { go('syllabus'); return; }
      if (a === 'import-json') $('#importFile').click();
      if (a === 'pin-set') openLock('set', T.chooseCode);
      if (a === 'pin-off') {
        confirmSheet({
          title: T.confirmCodeOff, text: T.confirmCodeOffBody, confirmLabel: T.confirm, danger: true,
          onConfirm: function () { Store.clearPin(); toast(T.codeOffToast, 'lock'); screenSettings(); }
        });
      }
    });

    $('#importFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          Store.importJSON(String(fr.result)).then(function (res) {
            toast(res.added + ' נוספו, ' + res.updated + ' עודכנו'); screenSettings();
          });
        } catch (err) { toast('לא ניתן לקרוא את הקובץ', 'alert'); }
      };
      fr.readAsText(f); e.target.value = '';
    });

    on(viewEl, '[data-clear]', 'click', function () {
      confirmSheet({
        title: T.confirmDeleteAll(Store.count()), text: T.confirmDeleteAllBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () { Store.clearAll().then(function () { toast(T.deletedToast, 'trash'); go(''); }); }
      });
    });
  }

  function typeLabel(t) {
    return ({ text: T.typeText, textarea: T.typeTextarea, choice: T.typeChoice, number: T.typeNumber,
              minutes: T.typeMinutes, date: T.typeDate, goals: T.typeGoals, syllabus: T.typeSyllabus,
              list: T.typeList })[t] || t;
  }

  function questionSheet(q) {
    var isNew = !q;
    var cur = q || { label: '', type: 'text', options: [], stage: 'debrief', inDebrief: 'edit', role: null };
    var lock = Store.isProtected(cur);

    openSheet({
      title: isNew ? T.addQuestion : T.editQuestion,
      body: '<div class="stack-4">' +
        '<div class="field"><label class="field__label" for="qLabel"><b>' + esc(T.qLabel) + '</b></label>' +
          '<input class="input" id="qLabel" type="text" dir="auto" value="' + esc(cur.label) + '"></div>' +
        '<div class="field"><span class="field__label"><b>' + esc(T.qStage) + '</b></span>' +
          '<div class="seg" id="qStage">' +
            '<button type="button" data-s="brief" aria-pressed="' + (cur.stage === 'brief') + '">' + esc(T.stageBrief) + '</button>' +
            '<button type="button" data-s="debrief" aria-pressed="' + (cur.stage === 'debrief') + '">' + esc(T.stageDebrief) + '</button>' +
          '</div></div>' +
        (lock ? '<p class="dim" style="font-size:var(--t-12)">' + esc(T.lockedQuestion) + '</p>'
              : '<div class="field"><span class="field__label"><b>' + esc(T.qType) + '</b></span>' +
                '<div class="opts" id="qType">' +
                  ['text', 'textarea', 'list', 'choice', 'number', 'minutes', 'date', 'syllabus'].map(function (t) {
                    return '<button type="button" class="opt opt--sm" data-t="' + t + '" aria-pressed="' +
                      (cur.type === t) + '">' + esc(typeLabel(t)) + '</button>';
                  }).join('') + '</div></div>') +
        '<div class="field" id="qOptWrap"' + (cur.type === 'choice' ? '' : ' hidden') + '>' +
          '<label class="field__label" for="qOpts"><b>' + esc(T.qOptions) + '</b></label>' +
          '<span class="field__hint">' + esc(T.qOptionsHint) + '</span>' +
          '<textarea class="ta" id="qOpts" dir="auto" rows="4">' + esc(cur.options.join('\n')) + '</textarea></div>' +
        '<div class="field" id="qDebWrap"' + (cur.stage === 'brief' ? '' : ' hidden') + '>' +
          '<span class="field__label"><b>' + esc(T.qInDebrief) + '</b></span>' +
          '<div class="seg" id="qDeb">' +
            [['edit', T.qInEdit], ['readonly', T.qInReadonly], ['none', T.qInNone]].map(function (o) {
              return '<button type="button" data-d="' + o[0] + '" aria-pressed="' +
                (cur.inDebrief === o[0]) + '">' + esc(o[1]) + '</button>';
            }).join('') + '</div></div>' +
      '</div>',
      actions: [
        { label: isNew ? T.add : T.save, cls: 'btn--lit', icon: 'check', keepOpen: true, run: function (sh) {
          var lbl = $('#qLabel', sh).value.trim();
          if (!lbl) { $('#qLabel', sh).focus(); return; }
          var stageBtn = $('#qStage button[aria-pressed="true"]', sh);
          var typeBtn = $('#qType .opt[aria-pressed="true"]', sh);
          var debBtn = $('#qDeb button[aria-pressed="true"]', sh);
          var patch = {
            label: lbl,
            stage: stageBtn ? stageBtn.dataset.s : 'debrief',
            type: lock ? cur.type : (typeBtn ? typeBtn.dataset.t : 'text'),
            options: $('#qOpts', sh).value.split('\n').map(function (o) { return o.trim(); }).filter(Boolean),
            inDebrief: debBtn ? debBtn.dataset.d : 'edit'
          };
          if (isNew) Store.addQuestion(patch); else Store.updateQuestion(cur.id, patch);
          sh.close(); screenSettings(); toast(T.savedToast);
        } },
        { label: T.cancel, cls: 'btn--quiet' }
      ],
      onOpen: function (sh) {
        on(sh, '#qStage button', 'click', function (e) {
          $$('#qStage button', sh).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          e.currentTarget.setAttribute('aria-pressed', 'true');
          $('#qDebWrap', sh).hidden = e.currentTarget.dataset.s !== 'brief';
        });
        on(sh, '#qType .opt', 'click', function (e) {
          $$('#qType .opt', sh).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          e.currentTarget.setAttribute('aria-pressed', 'true');
          $('#qOptWrap', sh).hidden = e.currentTarget.dataset.t !== 'choice';
        });
        on(sh, '#qDeb button', 'click', function (e) {
          $$('#qDeb button', sh).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
          e.currentTarget.setAttribute('aria-pressed', 'true');
        });
        setTimeout(function () { $('#qLabel', sh).focus(); }, 120);
      }
    });
  }

  /* ============================================================== summary */

  /** Rolls a set of flights into the things worth reviewing with an instructor:
   *  which goals stuck, which keep coming back, and what was worked on. */
  function buildSummary(recs) {
    var qGoals = Store.roleQuestion('goals');
    var qNext = Store.roleQuestion('goalsNext');
    var qSyl = Store.questions().filter(function (q) { return q.type === 'syllabus'; })[0];
    var qMin = Store.questions().filter(function (q) { return q.type === 'minutes'; })[0];
    var qSubj = Store.roleQuestion('subject') || Store.question('q_subject');
    var qInst = Store.question('q_instructor');
    var qPoints = Store.question('q_points'), qSafety = Store.question('q_safety_d');
    var qSolo = Store.roleQuestion('solo');
    var soloYesVal = qSolo ? ((qSolo.options && qSolo.options[0]) || 'כן') : '';

    var sorted = recs.slice().sort(function (a, b) { return a.flownAt < b.flownAt ? -1 : 1; });
    var minutes = 0, met = {}, missed = {}, focus = {}, ex = {}, points = [], safety = [];
    var soloYes = 0, soloTot = 0;

    function subjOf(r) { return qSubj ? String(r.answers[qSubj.id] || '').trim() : ''; }

    sorted.forEach(function (r) {
      if (qSolo) {
        var sv = String(r.answers[qSolo.id] == null ? '' : r.answers[qSolo.id]).trim();
        if (sv) { soloTot++; if (sv === soloYesVal) soloYes++; }
      }
      if (qMin) { var m = parseInt(r.answers[qMin.id], 10); if (!isNaN(m)) minutes += m; }
      if (qGoals) (r.answers[qGoals.id] || []).forEach(function (g) {
        var t = String(g.text || '').trim();
        if (!t) return;
        if (g.status === 'met') met[t] = (met[t] || 0) + 1;
        else if (g.status === 'missed') missed[t] = (missed[t] || 0) + 1;
      });
      if (qSyl) (r.answers[qSyl.id] || []).forEach(function (x) {
        var t = String(x.text || '').trim();
        if (t) ex[t] = (ex[t] || 0) + 1;
        var f = String(x.focus || '').trim();
        if (f) focus[f] = (focus[f] || 0) + 1;
      });
      if (qPoints) {
        var p = Store.linesOf(r.answers[qPoints.id]);
        if (p.length) points.push({ d: r.flownAt, subj: subjOf(r), lines: p });
      }
      if (qSafety) {
        var s = String(r.answers[qSafety.id] || '').trim();
        if (s) safety.push({ d: r.flownAt, subj: subjOf(r), lines: [s] });
      }
    });

    function rank(obj) {
      return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a] || a.localeCompare(b); })
        .map(function (k) { return { t: k, n: obj[k] }; });
    }
    var metL = rank(met), missedL = rank(missed), focusL = rank(focus), exL = rank(ex);
    var recurring = missedL.filter(function (x) { return x.n > 1; });
    var repeatFocus = focusL.filter(function (x) { return x.n > 1; });

    var from = sorted.length ? fmtLong(sorted[0].flownAt) : '';
    var to = sorted.length ? fmtLong(sorted[sorted.length - 1].flownAt) : '';
    // plain dates for the document, which gets read long after "לפני 3 ימים"
    // has stopped meaning anything
    var fromN = sorted.length ? fmtFull(sorted[0].flownAt) : '';
    var toN = sorted.length ? fmtFull(sorted[sorted.length - 1].flownAt) : '';

    return {
      range: sorted.length ? (from === to ? from : T.summaryOf(from, to)) : '',
      dateRange: sorted.length ? (fromN === toN ? fromN : T.summaryOf(fromN, toN)) : '',
      flights: sorted.length, minutes: minutes,
      hours: (minutes / 60).toFixed(1),
      solo: { yes: soloYes, total: soloTot },
      met: metL, missed: missedL, recurring: recurring,
      focus: repeatFocus, exercises: exL, points: points, safety: safety,
      records: sorted,
      q: { qSubj: qSubj, qInst: qInst, qMin: qMin, qSyl: qSyl, qGoals: qGoals, qNext: qNext }
    };
  }

  /** The same summary as a standalone HTML document, which Google Docs opens
   *  and converts. There is no Docs API here on purpose: that would need an
   *  account and a server, and nothing in this app leaves the phone.
   *
   *  Kept deliberately short. Every date is a real date, never "לפני 3 ימים",
   *  because this is read weeks later. The per-flight detail carries only the
   *  exercises he wrote something about — the rest go on one line — and the
   *  full exercise tally is gone, since it only repeated that detail. */
  function summaryDocHTML(s) {
    function list(items, fmt) {
      return '<ul>' + items.map(function (i) { return '<li>' + fmt(i) + '</li>'; }).join('') + '</ul>';
    }
    function head(r) {
      var bits = [fmtFull(r.flownAt)];
      if (s.q.qSubj && r.answers[s.q.qSubj.id]) bits.push(r.answers[s.q.qSubj.id]);
      if (s.q.qInst && r.answers[s.q.qInst.id]) bits.push(r.answers[s.q.qInst.id]);
      if (s.q.qMin && r.answers[s.q.qMin.id]) bits.push(r.answers[s.q.qMin.id] + ' ' + T.minutesUnit);
      return bits.join(' · ');
    }
    function dated(entries) {
      return entries.map(function (i) {
        return '<p class="d">' + esc(fmtFull(i.d)) + (i.subj ? ' · ' + esc(i.subj) : '') + '</p>' +
          list(i.lines, function (t) { return esc(t); });
      }).join('');
    }

    var stats = [T.docStats(s.flights, s.hours)];
    if (s.solo.total) stats.push(T.docSolo(s.solo.yes, s.solo.total));

    var h = '<h1>' + esc(T.summaryTitle) + '</h1>' +
      '<p class="sub">' + esc(s.dateRange) + ' &nbsp;·&nbsp; ' + esc(stats.join(' · ')) + '</p>';

    if (s.met.length || s.missed.length) {
      h += '<h2>' + esc(T.secGoals) + '</h2>';
      if (s.met.length) {
        h += '<p class="d">' + esc(T.goalsMet) + ' (' + s.met.length + ')</p>' +
          list(s.met, function (i) { return esc(i.t) + (i.n > 1 ? ' &times;' + i.n : ''); });
      }
      if (s.missed.length) {
        h += '<p class="d">' + esc(T.goalsMissed) + ' (' + s.missed.length + ')</p>' +
          list(s.missed, function (i) { return esc(i.t) + (i.n > 1 ? ' &times;' + i.n : ''); });
      }
    }
    if (s.recurring.length) {
      h += '<h2>' + esc(T.secRepeatGoals) + '</h2>' +
        list(s.recurring, function (i) { return '<b>' + esc(i.t) + '</b> · ' + esc(T.inNFlights(i.n)); });
    }
    if (s.focus.length) {
      h += '<h2>' + esc(T.secFocus) + '</h2>' +
        list(s.focus, function (i) { return esc(i.t) + ' · ' + esc(T.timesN(i.n)); });
    }
    if (s.points.length) h += '<h2>' + esc(T.secPoints) + '</h2>' + dated(s.points);
    if (s.safety.length) h += '<h2>' + esc(T.secSafety) + '</h2>' + dated(s.safety);

    h += '<h2>' + esc(T.secFlights) + '</h2>';
    s.records.forEach(function (r) {
      h += '<h3>' + esc(head(r)) + '</h3>';
      if (!s.q.qSyl) return;
      var xs = (r.answers[s.q.qSyl.id] || []).filter(function (x) { return String(x.text || '').trim(); });
      var told = xs.filter(function (x) { return String(x.notes || '').trim(); });
      var rest = xs.filter(function (x) { return !String(x.notes || '').trim(); });
      if (told.length) h += list(told, function (x) {
        return '<b>' + esc(x.text) + ':</b> ' + esc(String(x.notes).trim()) +
          (String(x.focus || '').trim() ? ' <i>(' + esc(x.focus) + ')</i>' : '');
      });
      // the ones with nothing written about them still count as flown, but they
      // do not deserve a bullet each
      if (rest.length) {
        h += '<p class="also">' + esc(T.alsoFlown) +
          esc(rest.map(function (x) { return x.text.trim(); }).join(' · ')) + '</p>';
      }
    });

    return '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">' +
      '<title>' + esc(T.summaryTitle) + '</title><style>' +
      'body{font-family:Arial,sans-serif;direction:rtl;text-align:right;line-height:1.45;color:#111;font-size:11pt}' +
      'h1{font-size:19pt;margin:0}' +
      'h2{font-size:12.5pt;margin:14pt 0 3pt;padding-bottom:2pt;border-bottom:1px solid #bbb}' +
      'h3{font-size:10.5pt;margin:9pt 0 1pt;color:#1a3a5c}' +
      'p{margin:0}p.sub{color:#555;font-size:10pt;margin:2pt 0 0}' +
      'p.d{margin:5pt 0 1pt;font-size:10pt;font-weight:bold;color:#444}' +
      'p.also{margin:1pt 0 0;font-size:9.5pt;color:#666}' +
      'ul{margin:1pt 0 4pt;padding-inline-start:16pt}li{margin:1pt 0}' +
      'i{color:#8a6d00;font-size:9.5pt}' +
      '</style></head><body>' + h + '</body></html>';
  }

  function screenSummary() {
    var recs = Store.all().filter(function (r) { return selected[r.id]; });
    renderTopbar({ title: T.summary, sub: 'SUMMARY', back: true, backTo: 'log' });

    if (!recs.length) {
      viewEl.innerHTML = empty('list3', T.noneSelected, T.noneSelectedHint) +
        '<div class="stack" style="margin-top:var(--s-4)">' +
        '<button class="btn btn--lit btn--block" data-pickweek>' + icon('calendar') +
          esc(T.selectWeek) + '</button>' +
        '<a class="btn btn--block" href="#/log">' + esc(T.pickManually) + '</a></div>';
      on(viewEl, '[data-pickweek]', 'click', function () {
        selectThisWeek();
        if (!selCount()) { toast(T.noneThisWeek, 'alert'); return; }
        screenSummary();
      });
      return;
    }

    var wk = thisWeekRange();
    var isWeek = recs.every(function (r) {
      var t = parseISO(r.flownAt).getTime();
      return t >= wk.start.getTime() && t <= wk.stop.getTime();
    });
    var s = buildSummary(recs);

    function sec(title, tone, body) {
      return '<section class="panel' + (tone ? ' panel--' + tone : '') + '">' +
        '<div class="panel__head">' + icon('list3') + '<span class="panel__t">' + esc(title) + '</span></div>' +
        '<div class="panel__body">' + body + '</div></section>';
    }
    function rows(items, cls) {
      return '<div class="sumlist">' + items.map(function (i) {
        return '<div class="sumrow' + (cls ? ' ' + cls : '') + '">' +
          '<span class="sumrow__t" dir="auto">' + esc(i.t) + '</span>' +
          '<span class="sumrow__n mono">' + i.n + '</span></div>';
      }).join('') + '</div>';
    }

    var h = '<div class="stack-4 stagger">' +
      '<div class="hero">' +
        '<div class="hero__meta"><i></i>SUMMARY</div>' +
        '<h1 class="hero__h">' + esc(isWeek ? T.summaryTitle : T.summaryCustom) + '</h1>' +
        '<div class="hero__date">' + esc(s.range) + '</div>' +
      '</div>' +
      '<div class="readouts">' +
        '<div class="readout readout--cyan"><div class="readout__k">' + icon('layers') +
          '<span>' + esc(T.rFlights) + '</span></div><div class="readout__v">' + s.flights +
          '</div><div class="readout__s">FLIGHTS</div></div>' +
        // hours, with the minutes underneath — the same way home reads, and the
        // way flight time is actually talked about
        '<div class="readout readout--amber"><div class="readout__k">' + icon('clock') +
          '<span>' + esc(T.rHours) + '</span></div><div class="readout__v">' + s.hours +
          '</div><div class="readout__s">' + s.minutes + ' ' + esc(T.rMinutes) + '</div></div>' +
      '</div>';

    if (s.met.length) h += sec(T.goalsMet + ' (' + s.met.length + ')', 'green', rows(s.met, 'is-met'));
    if (s.missed.length) h += sec(T.goalsMissed + ' (' + s.missed.length + ')', 'red', rows(s.missed, 'is-missed'));
    if (s.recurring.length) h += sec(T.secRepeatGoals, 'red', rows(s.recurring, 'is-missed'));
    if (s.focus.length) h += sec(T.secFocus, 'amber', rows(s.focus));
    if (s.exercises.length) h += sec(T.secExercises, '', rows(s.exercises));
    /* dates, not "לפני 3 ימים" — the summary is read next to a logbook */
    function timeline(entries) {
      return '<div class="tl">' + entries.map(function (p) {
        return '<div class="tlrow"><div class="tlrow__m">' + esc(fmtNum(p.d)) +
            (p.subj ? '<span class="tlrow__s" dir="auto">' + esc(p.subj) + '</span>' : '') + '</div>' +
          p.lines.map(function (t) {
            return '<div class="tlrow__t" dir="auto">' + esc(t) + '</div>';
          }).join('') + '</div>';
      }).join('') + '</div>';
    }
    if (s.points.length) h += sec(T.secPoints, '', timeline(s.points));
    if (s.safety.length) h += sec(T.secSafety, 'amber', timeline(s.safety));

    h += '<div class="stack">' +
      '<button class="btn btn--lit btn--block btn--lg" data-copydoc>' + icon('copy') + esc(T.copyDoc) + '</button>' +
      '<button class="btn btn--block" data-exportdoc>' + icon('download') + esc(T.exportDoc) + '</button>' +
      '<p class="dim" style="font-size:var(--t-12);line-height:1.6;text-align:center">' + esc(T.docHint) + '</p>' +
    '</div></div>';

    viewEl.innerHTML = h;

    on(viewEl, '[data-copydoc]', 'click', function () {
      var html = summaryDocHTML(s);
      var plain = html.replace(/<[^>]+>/g, function (m) {
        return /<\/(h1|h2|h3|li|p)>/.test(m) ? '\n' : '';
      }).replace(/\n{3,}/g, '\n\n').trim();
      if (global.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plain], { type: 'text/plain' })
        })]).then(function () { toast(T.copiedDoc); },
                  function () { fallbackCopy(plain); });
      } else { fallbackCopy(plain); }
      function fallbackCopy(t) {
        if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { toast(T.copiedToast); });
      }
    });

    on(viewEl, '[data-exportdoc]', 'click', function () {
      saveFile('tahkir-summary-' + stamp() + '.doc', summaryDocHTML(s), 'application/msword');
    });
  }

  /* ============================================================= syllabus */

  /** The training chart, read-only. Typing a גיחה into נושא טיסה pulls its
   *  חתך rows into the תדריך; this is where he can see the whole thing. */
  function screenSyllabus() {
    renderTopbar({ title: T.syllabusRef, sub: 'SYLLABUS', back: true, backTo: 'settings' });
    var all = global.SyllabusRef ? SyllabusRef.all() : [];

    if (!all.length) {
      viewEl.innerHTML = empty('list3', T.syllabusRefEmpty, T.syllabusRefEmptyHint);
      return;
    }

    viewEl.innerHTML = '<div class="stack-4 stagger">' +
      '<div class="search">' + icon('search') +
        '<input class="input" id="sq" type="search" dir="auto" autocomplete="off" placeholder="' +
        esc(T.search) + '"></div>' +
      '<div id="sylResults"></div></div>';

    function paint(filter) {
      var f = SyllabusRef.norm(filter || '');
      var rows = all.filter(function (e) {
        if (!f) return true;
        if (SyllabusRef.norm(e.name).indexOf(f) !== -1) return true;
        return e.items.some(function (i) { return SyllabusRef.norm(i).indexOf(f) !== -1; });
      });
      $('#sylResults').innerHTML = rows.length
        ? rows.map(function (e) {
            return '<section class="panel" style="margin-bottom:var(--s-3)">' +
              '<div class="panel__head">' + icon('flag') +
                '<span class="panel__t" dir="auto">' + esc(e.name) +
                  (e.section ? ' <span class="dim" style="font-weight:500;font-size:var(--t-11)">' +
                    esc(e.section) + '</span>' : '') + '</span>' +
                '<span class="panel__a mono">' + e.items.length + '</span></div>' +
              '<div class="panel__body"><div class="exlist">' +
                e.items.map(function (t, i) {
                  return '<div class="ex"><div class="ex__top">' +
                    '<span class="ex__n">' + (i + 1) + '</span>' +
                    '<span class="ex__t" dir="auto" style="display:flex;align-items:center">' +
                      esc(t) + '</span></div></div>';
                }).join('') +
              '</div></div></section>';
          }).join('')
        : empty('search', T.noMatches, T.noMatchesHint);
    }
    paint('');
    $('#sq').addEventListener('input', function (e) { paint(e.target.value); });
  }

  /* ================================================================= lock */

  function renderKeypad() {
    var keys = ['1','2','3','4','5','6','7','8','9','cancel','0','del'];
    $('#keypad').innerHTML = keys.map(function (k) {
      if (k === 'del') return '<button class="key key--fn" data-key="del" aria-label="מחיקה">' + icon('delete') + '</button>';
      if (k === 'cancel') return '<button class="key key--fn" data-key="cancel"></button>';
      return '<button class="key" data-key="' + k + '">' + k + '</button>';
    }).join('');
    on(lockEl, '[data-key]', 'click', function (e) { pinKey(e.currentTarget.dataset.key); });
  }
  function drawPin() {
    $('#pinDots').innerHTML = [0,1,2,3].map(function (i) {
      return '<i class="' + (i < pinBuffer.length ? 'is-on' : '') + '"></i>';
    }).join('');
  }
  function lockHint(t, err) {
    var h = $('#lockHint'); h.textContent = t; h.classList.toggle('is-err', !!err);
    if (err) setTimeout(function () { h.classList.remove('is-err'); }, 500);
  }
  function pinKey(k) {
    if (k === 'del') { pinBuffer = pinBuffer.slice(0, -1); drawPin(); return; }
    if (k === 'cancel') { if (pinMode !== 'unlock') closeLock(); return; }
    if (pinBuffer.length >= 4) return;
    pinBuffer += k; haptic(6); drawPin();
    if (pinBuffer.length === 4) setTimeout(submitPin, 140);
  }
  function submitPin() {
    var e = pinBuffer; pinBuffer = '';
    if (pinMode === 'unlock') {
      Store.checkPin(e).then(function (ok) {
        if (ok) return closeLock();
        drawPin(); lockHint(T.wrongCode, true); haptic(40);
      });
      return;
    }
    if (pinMode === 'set') { pinFirst = e; pinMode = 'confirm'; drawPin(); lockHint(T.repeatCode); return; }
    if (pinMode === 'confirm') {
      if (e !== pinFirst) { pinMode = 'set'; pinFirst = ''; drawPin(); lockHint(T.codeMismatch, true); haptic(40); return; }
      Store.setPin(e).then(function (ok) {
        closeLock(); toast(ok ? T.codeOnToast : T.codeFailed, ok ? 'lock' : 'alert');
        if (route.name === 'settings') screenSettings();
      });
    }
  }
  function openLock(mode, hint) {
    pinMode = mode; pinBuffer = ''; pinFirst = '';
    lockEl.hidden = false; appEl.hidden = mode === 'unlock';
    renderKeypad(); drawPin(); lockHint(hint || T.enterCode);
    var c = $('[data-key="cancel"]', lockEl);
    if (c) c.textContent = mode === 'unlock' ? '' : T.cancel;
  }
  function closeLock() { lockEl.hidden = true; appEl.hidden = false; }

  /* ================================================================= boot */

  function boot() {
    appEl = document.getElementById('app');
    viewEl = document.getElementById('view');
    topbarEl = document.getElementById('topbar');
    tabbarEl = document.getElementById('tabbar');
    toasterEl = document.getElementById('toaster');
    sheetEl = document.getElementById('sheet');
    lockEl = document.getElementById('lockScreen');
    sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) sheetEl.close(); });

    Store.init().then(function () {
      applyTheme();
      global.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (Store.settings().theme === 'auto') applyTheme();
      });
      global.addEventListener('hashchange', navigate);
      if (Store.settings().pin) { openLock('unlock'); navigate(); }
      else { appEl.hidden = false; navigate(); }
      /* The service worker serves the shell cache-first, which means a fresh
         deploy would otherwise only appear on the SECOND launch: the first one
         renders the cached build while the new one downloads behind it. When a
         new worker takes over, reload once so the update lands immediately.
         `hadController` keeps the very first install from reloading. */
      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        var hadController = !!navigator.serviceWorker.controller;
        var reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', function () {
          if (!hadController || reloading) return;
          reloading = true;
          location.reload();
        });
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          if (reg) reg.update().catch(function () {});
        }).catch(function () {});
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
