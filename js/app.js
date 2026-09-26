/* תחקיר — router, screens, interactions. Hebrew, right to left.
 *
 * Two stages per flight: תדריך before, תחקיר after. Both forms are built from
 * Store.stageQuestions(), so anything he edits in Settings shows up here.
 */
(function (global) {
  'use strict';

  var BUILD = 'v23-preview';   // keep in step with VERSION in sw.js

  var appEl, viewEl, topbarEl, tabbarEl, toasterEl, sheetEl, lockEl;
  var route = { name: 'home', param: null };
  var navCount = 0;
  var pinBuffer = '', pinMode = 'unlock', pinFirst = '';
  var draftTimer = null;
  /* Chrome hands this over when the app is installable. Holding it turns the
     "add to home screen" note from instructions into a button. Safari never
     fires it, which is why the note still explains the Share sheet. */
  var installPrompt = null;
  /* The open form's "write your draft now", or null when no form is on screen.
     One indirection so the pagehide / visibilitychange listeners are registered
     once at boot instead of once per render. */
  var formFlush = null;
  var pendingWorker = null;
  var pendingReload = false, updateApproved = false, releasePrompted = false, summaryCompact = false;

  function activateUpdate() {
    if (!pendingWorker) return;
    if (formFlush && formFlush() === false) { toast(T.saveFailedBody, 'alert'); return; }
    updateApproved = true; pendingWorker.postMessage({ type: 'ACTIVATE' }); pendingWorker = null;
  }

  /* ============================================================== helpers */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function reportActionError(e) {
    if (/STORAGE|SAVED|RECOVERY/.test(e.code || e.message || '')) toast(T.saveFailedBody, 'alert');
    else { console.error(e); toast(T.actionFailed, 'alert'); }
  }
  function on(root, sel, ev, fn) { $$(sel, root).forEach(function (n) { n.addEventListener(ev, function (e) {
    try { var result = fn(e); if (result && result.catch) result.catch(reportActionError); }
    catch (err) { reportActionError(err); }
  }); }); }

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

  /** Installing is a different gesture on each platform, and the old text only
   *  described Safari's Share sheet — which is the wrong instruction for most
   *  of the people using this. */
  function installBody() {
    var ua = String(navigator.userAgent || '');
    if (/iPhone|iPad|iPod/i.test(ua)) return T.installBodyIOS;
    if (/Android/i.test(ua)) return T.installBodyAndroid;
    return T.installBodyGeneric;
  }

  /** A toast, optionally with one action on it. `act` is {label, run} and buys
   *  the extra time it needs to be read and tapped — an undo nobody can reach
   *  in 2.5s is decoration. Only two are ever on screen: they used to stack up
   *  and cover the field being typed into. */
  function toast(msg, ic, act) {
    while (toasterEl.children.length >= 2) toasterEl.firstElementChild.remove();
    var t = document.createElement('div');
    t.className = 'toast' + (act ? ' toast--act' : '');
    t.innerHTML = icon(ic || 'checkCircle') + '<span>' + esc(msg) + '</span>' +
      (act ? '<button class="toast__b" type="button">' + esc(act.label) + '</button>' : '');
    toasterEl.appendChild(t);
    var done = false;
    function close() {
      if (done) return;
      done = true;
      t.classList.add('is-out');
      setTimeout(function () { t.remove(); }, 200);
    }
    if (act) {
      t.querySelector('.toast__b').addEventListener('click', function () {
        close(); haptic(12); act.run();
      });
    }
    setTimeout(close, act ? 7000 : 2500);
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

  function saveFile(name, text, mime, kind) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    if (navigator.canShare && navigator.share) {
      try {
        var f = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [f] })) {
          navigator.share({ files: [f], title: name })
            .then(function () { Store.markExported(kind); }).catch(function () {});
          return;
        }
      } catch (e) {}
    }
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    Store.markExported(kind);
  }
  function stamp() {
    var d = new Date();
    return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /* =============================================================== router */

  function go(p) { location.hash = '#/' + p; }

  var ROUTES = ['home', 'brief', 'debrief', 'log', 'flight', 'trends', 'settings', 'summary', 'syllabus',
    'notebook', 'progress', 'feedback', 'whatsnew', 'recovery'];

  function navigate() {
    // leaving a form saves what is in it, including via the back button
    if (formFlush) {
      var flushed = false; try { flushed = formFlush() !== false; } catch (e) {}
      if (!flushed) {
        history.replaceState(null, '', '#/' + route.name + (route.param ? '/' + encodeURIComponent(route.param) : ''));
        toast(T.saveFailedBody, 'alert'); return;
      }
    }
    var h = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var n = h[0] || 'home';
    if (ROUTES.indexOf(n) === -1) n = 'home';
    route = { name: n, param: h[1] ? decodeURIComponent(h[1]) : null };
    navCount++;
    render();
    global.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
    if (pendingWorker && !formFlush) activateUpdate();
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
      (route.name !== 'notebook' ? '<a class="iconbtn notebook-shortcut" href="#/notebook" aria-label="' + esc(T.notebook) + '">' + icon('notebook') + '</a>' : '') +
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
    // the outgoing screen's draft hook dies with its DOM
    formFlush = null;
    document.body.dataset.route = route.name;
    var formish = route.name === 'brief' || route.name === 'debrief';
    tabbarEl.hidden = formish;
    viewEl.classList.toggle('view--noTabs', formish);
    if (!formish) renderTabs();
    var screens = { home: screenHome, brief: screenForm, debrief: screenForm, log: screenLog,
       flight: screenDetail, trends: screenTrends, settings: screenSettings,
       summary: screenSummary, syllabus: screenSyllabus };
    if (screens[route.name]) screens[route.name]();
    else Features.render(route, { view: viewEl, topbar: renderTopbar, toast: toast, sheet: openSheet, confirm: confirmSheet,
      go: go, build: BUILD, progress: syllabusProgress, saveFile: saveFile, setFlush: function (fn) { formFlush = fn; } });
    autosizeAll();
    if (pendingReload && !formFlush) { location.reload(); return; }
    maybeRelease();
  }

  function maybeRelease() {
    if (releasePrompted || /preview/.test(BUILD) || appEl.hidden || !lockEl.hidden || route.name !== 'home' || Store.settings().releaseSeen === BUILD) return;
    releasePrompted = true;
    openSheet({ title: T.whatsNew, text: T.releaseIntro,
      body: '<ul class="release-highlights">' + T.releaseItems.map(function (item) { return '<li><b>' + esc(item[0]) + '</b><p>' + esc(item[1]) + '</p></li>'; }).join('') + '</ul>',
      actions: [{ label: T.understood, cls: 'btn--lit', keepOpen: true, run: function (sh) { if (Store.set('releaseSeen', BUILD)) sh.close(); else toast(T.saveFailedBody, 'alert'); } },
        { label: T.releaseDetails, run: function () { go('whatsnew'); } }]
    });
  }

  function empty(ic, t, p) {
    return '<div class="empty"><div class="empty__icon">' + icon(ic) + '</div>' +
      '<h3>' + esc(t) + '</h3><p>' + esc(p) + '</p></div>';
  }

  /* ================================================================= home */

  function screenHome() {
    var all = Store.all(), done = Store.done(), waiting = Store.openBriefs();
    var open = waiting[0] || null;
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
        { day: 'numeric', month: 'long', year: 'numeric' })) + '</div><div class="course-label">' + esc(Store.course().label) + '</div>' +
    '</div>';

    h += '<div class="feature-links"><a class="feature-link" href="#/progress">' + icon('trending') + '<span><b>' + esc(T.courseProgress) + '</b><small>' + esc(Store.course().label) + '</small></span></a>' +
      '<a class="feature-link" href="#/notebook">' + icon('notebook') + '<span><b>' + esc(T.notebookTitle) + '</b><small>' + esc(T.noteNew) + '</small></span></a></div>' +
      (Store.readDraft() ? '<a class="btn btn--block" href="#/brief">' + icon('pencil') + esc(T.resumeDraft) + '</a>' : '');

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

    /* Everything still waiting on a תחקיר, not just the newest. Flying several
       times a week means forgetting one is routine, and showing only the most
       recent left the older one visible nowhere but the log. */
    if (open) {
      var subQ = Store.roleQuestion('subject') || Store.question('q_subject');
      var subj = subQ ? (open.answers[subQ.id] || '') : '';
      h += '<section class="panel panel--amber brackets">' +
        '<div class="panel__head">' + icon('flag') +
          '<span class="panel__t">' + esc(T.briefsWaiting(waiting.length)) + '</span>' +
          '<span class="panel__a">' + esc(T.capBrief) + '</span></div>' +
        '<div class="panel__body stack">' +
          (subj ? '<div style="font-size:var(--t-17);font-weight:700" dir="auto">' + esc(subj) + '</div>' : '') +
          '<div class="dim" style="font-size:var(--t-12)">' + esc(fmtLong(open.flownAt)) + '</div>' +
          '<button class="btn btn--amber btn--block btn--lg" data-godebrief="' + esc(open.id) + '">' +
            icon('check') + esc(T.openBrief) + '</button>' +
          '<button class="btn btn--quiet btn--block" data-gobrief="' + esc(open.id) + '">' +
            icon('pencil') + esc(T.editBrief) + '</button>' +
          (waiting.length > 1
            ? '<div class="waitmore"><span class="waitmore__k">' + esc(T.alsoWaiting) + '</span>' +
              waiting.slice(1).map(function (r) {
                var t = subQ ? (r.answers[subQ.id] || '') : '';
                return '<button class="waitmore__r" data-godebrief="' + esc(r.id) + '">' +
                  '<span dir="auto">' + esc(t || fmtDate(r.flownAt)) + '</span>' +
                  '<span class="mono">' + esc(fmtNum(r.flownAt)) + '</span></button>';
              }).join('') + '</div>'
            : '') +
        '</div></section>';
    } else {
      h += '<button class="btn btn--lit btn--block btn--lg" data-new>' +
        icon('plus') + esc(T.newBrief) + '</button>';
    }

    /* First run. 27 people got a link and no manual, and the three things that
       make this app worth opening are all invisible from an empty screen. */
    if (!all.length && !s.startDismissed) {
      h += '<section class="panel panel--cyan"><div class="panel__head">' + icon('info') +
        '<span class="panel__t">' + esc(T.startTitle) + '</span></div>' +
        '<div class="panel__body"><ol class="howto">' +
          '<li>' + esc(T.startB1) + '</li>' +
          '<li>' + esc(T.startB2) + '</li>' +
          '<li>' + esc(T.startB3) + '</li>' +
        '</ol><button class="btn btn--quiet btn--block" data-startdone style="margin-top:var(--s-3)">' +
          esc(T.startGo) + '</button></div></section>';
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

    /* Backup, where it can actually be seen. It used to be a note inside
       הגדרות, which is the one screen a pilot never opens; everything here
       exists on exactly one phone. */
    var sinceExport = daysSince(s.lastBackup);
    if (all.length >= 3 && (sinceExport === null || sinceExport >= 10)) {
      h += '<div class="note note--warn">' + icon('alert') +
        '<div><b>' + esc(T.backupHomeTitle) + '</b><br>' + esc(T.backupHomeBody) +
        '<br><button class="btn btn--amber" data-backupnow style="min-height:36px;margin-top:8px;font-size:var(--t-12)">' +
        icon('download') + esc(T.backupNow) + '</button></div></div>';
    }

    if (!isStandalone() && !s.installDismissed) {
      h += '<div class="note note--info">' + icon('info') +
        '<div><b>' + esc(T.installTitle) + '</b><br>' + esc(installBody()) +
        '<br><div class="note__acts">' +
          (installPrompt
            ? '<button class="btn btn--lit" data-installnow style="min-height:36px;font-size:var(--t-12)">' +
              icon('download') + esc(T.installNow) + '</button>'
            : '') +
          '<button class="btn btn--quiet" data-dismiss style="min-height:36px;font-size:var(--t-12)">' +
          esc(T.gotIt) + '</button></div></div></div>';
    }

    h += '</div>';
    viewEl.innerHTML = h;

    on(viewEl, '[data-new]', 'click', function () { go('brief'); });
    on(viewEl, '[data-startdone]', 'click', function () { Store.set('startDismissed', true); screenHome(); });
    on(viewEl, '[data-backupnow]', 'click', function () {
      if (!Store.count()) return toast(T.noFlights, 'alert');
      saveFile('tahkir-backup-' + stamp() + '.json', Store.toJSON(), 'application/json', 'backup');
      setTimeout(screenHome, 500);
    });
    on(viewEl, '[data-installnow]', 'click', function () {
      if (!installPrompt) return;
      var p = installPrompt; installPrompt = null;
      p.prompt();
      p.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') toast(T.installedToast, 'download');
        screenHome();
      }).catch(function () {});
    });
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
    on(viewEl, '#newGoal', 'keydown', function (e) {
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
  function monthKey(iso) { return String(iso || '').slice(0, 7); }
  function monthLabel(iso) {
    var d = parseISO(iso), now = new Date();
    return d.toLocaleDateString('he-IL', d.getFullYear() === now.getFullYear()
      ? { month: 'long' } : { month: 'long', year: 'numeric' });
  }

  /** The category a waiting goal belongs to, so it is obvious why a goal is
   *  sitting there and which flight will bring it back. */
  function catChip(g) {
    if (!g.cats || !g.cats.length) return '';
    return '<span class="goalrow__cat" dir="auto">' + esc(g.cats.join(' · ')) + '</span>';
  }

  function flightRow(r, selectable) {
    var dm = dayMon(r.flownAt);
      var qs = Store.questionFor(r, 'subject') || Store.question('q_subject');
    var subj = qs ? (r.answers[qs.id] || '') : '';
    var qi = Store.questionFor(r, 'instructor');
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
          (inst ? ' · ' + esc(inst) : '') + ' · ' + esc(r.course ? Courses.label(r.course) : T.unknownCourse) + '</span>' +
      '</span>' +
      (selectable ? '' : icon('chevRight', { cls: 'frow__chev' })) + '</button>';
  }

  /* ================================================================= form */

  function screenForm() {
    var isBrief = route.name === 'brief';
    var stage = isBrief ? 'brief' : 'debrief';
    var rec, isNew = false, restored = false;

    /* Every form autosaves now, keyed by stage and record id. Before this only
       a brand-new תדריך did, so the תחקיר — the long one, written standing on
       the apron with a dozen exercise notes in it — lived in the DOM and
       nowhere else until the save button was pressed. A phone call, a flat
       battery, or iOS discarding a backgrounded PWA took the lot. */
    if (route.param) {
      rec = Store.get(route.param);
      if (!rec) { go('log'); return; }
      rec = JSON.parse(JSON.stringify(rec));
      var draft = Store.readDraft(rec.id, stage);
      if (draft && draft.answers) {
        var base = draft.baseUpdatedAt == null ? draft.updatedAt : draft.baseUpdatedAt;
        if (base != null && +base !== +rec.updatedAt) {
          viewEl.innerHTML = empty('alert', T.draftConflict, T.draftConflictBody);
          openSheet({ title: T.draftConflict, text: T.draftConflictBody, actions: [
            { label: T.useSaved, cls: 'btn--lit', run: function () { if (!Store.recoverySnapshot('draft-conflict')) return toast(T.saveFailedBody, 'alert'); Store.clearDraft(rec.id, stage); render(); } },
            { label: T.useDraft, run: function () { if (!Store.recoverySnapshot('draft-conflict')) return toast(T.saveFailedBody, 'alert'); draft.baseUpdatedAt = rec.updatedAt; if (Store.saveDraft(draft, stage)) render(); } },
            { label: T.cancel, run: function () { go('log'); } }
          ] });
          return;
        }
        rec = Object.assign({}, rec, draft); restored = true;
      }
    } else if (isBrief) {
      var fresh = Store.readDraft();
      rec = fresh || Store.newBrief();
      if (!rec.answers) rec.answers = {};
      isNew = true; restored = !!fresh;
    } else { go('home'); return; }
    var savedVersion = rec.id && Store.get(rec.id);
    var baseUpdatedAt = savedVersion ? savedVersion.updatedAt : null;
    if (!rec.id) rec.id = Store.uid('f');
    if (isNew) rec.draftNew = true;
    var draftId = isNew ? '' : rec.id;

    var qs = Store.stageQuestions(stage);
    var qNext = Store.roleQuestion('goalsNext');   // target of the ✗ carry
    var qGoals = Store.roleQuestion('goals');      // where carried goals land
    var qSubj = Store.roleQuestion('subject');
    var qSyl = qs.filter(function (q) { return q.type === 'syllabus'; })[0];
    /* Goals he pulled back out after they were carried in. Without this the
       next keystroke in נושא טיסה puts them straight back. */
    var dismissed = rec.dismissed || {};
    /* The candidates currently on offer when a typed גיחה matches more than
       one entry, in the order they are drawn. */
    var pending = [];
    /* A fingerprint of the syllabus rows as autofill left them. If the list
       still matches, an automatic pick may be swapped for another silently;
       once he has typed in it, it is his and swapping asks first. */
    var autoSig = null;

    renderTopbar({
      title: isBrief ? T.briefTitle : T.debriefTitle,
      sub: isBrief ? T.capBrief : T.capDebrief,
      back: true, backTo: ''
    });

    var datePanel = '<div class="panel"><div class="panel__body">' +
      '<div class="field"><label class="field__label" for="f_date"><b>' + esc(T.hDate) + '</b>' +
        '<span class="cap">DATE</span></label>' +
        '<input class="input input--num" id="f_date" type="date" value="' + esc(rec.flownAt) + '"></div>' +
    '</div></div>';

    /* At the תחקיר the brief's plain answers are already filled in and rarely
       change, but they used to occupy the first four panels — so the pilot who
       has just landed scrolls past תאריך, פיריט, נושא טיסה and מדריך, plus the
       whole category chip cloud, before reaching a single field he came to
       write. They fold into one strip now, with the real inputs still in the
       DOM behind it so collect() is unchanged. יעדים and סילבוס never fold:
       grading goals and writing notes per exercise IS the debrief. */
    var FOLDABLE = ['text', 'textarea', 'choice', 'number', 'date'];
    function foldable(q) {
      return !isBrief && q.stage === 'brief' && FOLDABLE.indexOf(q.type) !== -1;
    }
    function foldValue(q) {
      var v = rec.answers[q.id];
      if (q.type === 'choice' || q.type === 'text' || q.type === 'number') {
        return String(v == null ? '' : v).trim();
      }
      if (q.type === 'date') return v ? fmtFull(v) : '';
      return String(v == null ? '' : v).trim().split('\n')[0];
    }

    var h = '<div class="formprog"><span class="formprog__fill" id="progFill"></span></div>' +
      '<div class="stack-4">' +
      /* Autosave means a half-filled form comes back, which is the point — but
         it also means there has to be a way to say "not that one, start over".
         Without it a draft you no longer want is impossible to get rid of. */
      (restored
        ? '<div class="note note--info">' + icon('pencil') +
          '<div><b>' + esc(T.draftRestored) + '</b>' +
          '<div class="note__acts"><button type="button" class="btn btn--quiet" data-draftdrop ' +
          'style="min-height:34px;font-size:var(--t-12)">' + esc(T.draftDiscard) + '</button></div></div></div>'
        : '');

    var folded = qs.filter(foldable);
    if (!folded.length) {
      h += datePanel;
      qs.forEach(function (q) {
        var optional = isBrief && !q.role && q.type !== 'syllabus';
        h += optional ? '<details class="panel optional-field"' + (Store.answerToText(q, rec.answers[q.id]) ? ' open' : '') + '><summary>' + esc(q.label) + '</summary><div class="panel__body">' : '<div class="panel"><div class="panel__body">';
        h += fieldFor(q, rec.answers[q.id], false) + (optional ? '</div></details>' : '</div></div>');
      });
    } else {
      h += '<section class="panel fold" id="briefFold">' +
        '<button type="button" class="fold__head" data-foldtoggle aria-expanded="false">' +
          icon('flag') + '<span class="fold__t">' + esc(T.fromBrief) + '</span>' +
          '<span class="fold__a">' + esc(T.edit) + '</span>' +
          icon('chevDown', { cls: 'fold__c' }) + '</button>' +
        '<div class="fold__sum">' +
          '<div class="fold__r"><span class="fold__k">' + esc(T.hDate) + '</span>' +
            '<span class="fold__v mono">' + esc(fmtFull(rec.flownAt)) + '</span></div>' +
          folded.map(function (q) {
            var v = foldValue(q);
            return '<div class="fold__r"><span class="fold__k" dir="auto">' + esc(q.label) + '</span>' +
              '<span class="fold__v' + (v ? '' : ' is-empty') + '" dir="auto">' +
              esc(v || T.notAnswered) + '</span></div>';
          }).join('') +
        '</div>' +
        '<div class="fold__body" hidden>' + datePanel +
          folded.map(function (q) {
            return '<div class="panel panel--amber"><div class="panel__body">' +
              fieldFor(q, rec.answers[q.id], true) + '</div></div>';
          }).join('') +
        '</div></section>';

      qs.forEach(function (q) {
        if (foldable(q)) return;
        var carried = q.stage === 'brief';
        h += '<div class="panel' + (carried ? ' panel--amber' : '') + '"><div class="panel__body">' +
          fieldFor(q, rec.answers[q.id], carried) + '</div></div>';
      });
    }

    h += '</div>' +
      '<div class="savebar"><div class="savebar__inner">' +
        '<span class="savestate" id="saveState">' + esc(T.draftSaving) + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--lit" data-save>' + icon('check') +
          esc(isBrief ? T.saveBrief : T.saveDebrief) + '</button>' +
      '</div></div>';

    viewEl.innerHTML = '<div id="formRoot">' + h + '</div>';
    var root = $('#formRoot');
    Object.keys(rec.buffers || {}).forEach(function (key) {
      var parts = key.split(':'), el = $('[data-' + parts[0] + '="' + parts.slice(1).join(':') + '"]', root);
      if (el) el.value = rec.buffers[key];
    });

    on(root, '[data-foldtoggle]', 'click', function (e) {
      var sec = $('#briefFold'), body = $('.fold__body', sec), sum = $('.fold__sum', sec);
      var open = body.hidden;
      body.hidden = !open; sum.hidden = open;
      sec.classList.toggle('is-open', open);
      e.currentTarget.setAttribute('aria-expanded', String(open));
      // a textarea measured while hidden reports no height at all
      if (open) $$('.ta', body).forEach(autosize);
      haptic();
    });

    on(root, '[data-draftdrop]', 'click', function () {
      confirmSheet({
        title: T.draftDiscard, text: T.draftDiscardBody, confirmLabel: T.delete, danger: true,
        onConfirm: function () {
          clearTimeout(draftTimer);
          formFlush = null;                        // or leaving re-writes it
          Store.clearDraft(draftId, stage);
          if (isNew) { render(); }                 // straight back to a blank תדריך
          else { route.param = rec.id; render(); } // back to what is actually saved
        }
      });
    });

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
        /* A question with options offers them as add-on tokens (so "AW" then a
           number), while previous answers replace the field outright.
           נושא טיסה takes its tokens from the COURSE rather than from the saved
           question: the two courses have different series, and options stored
           on the question would still be the old course's the moment anybody
           switched — which would quietly file every flight under no category
           at all and take the goal loop down with it. */
        var cats = (q.role === 'subject')
          ? Store.categoryVocab(rec.course || Store.courseId())
          : ((q.options && q.options.length) ? q.options : []);
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
          }).join('') + '</div>' : '') + (q.role === 'subject' ? '<button type="button" class="btn btn--quiet" data-flightpicker>' + icon('search') + esc(T.pickFlight) + '</button>' : '');
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
      var cls = 'goalrow' + (g.suggested ? ' is-suggested' : '') + (g.status === 'met' ? ' is-met' : g.status === 'missed' ? ' is-missed' : '');
      // the categories ride along so the chip survives a draft reload, which is
      // the whole explanation of why the goal is sitting there
      return '<div class="' + cls + '" data-goalid="' + esc(g.id) + '" data-gs="' + esc(g.status || 'open') +
        '" data-cats="' + esc((g.cats || []).join('|')) + '" data-origin="' + esc(g.from || '') +
        '" data-from="' + esc(g.carryOf || '') + '" data-source-id="' + esc(g.sourceId || '') +
        '" data-course="' + esc(g.course || '') + '" data-suggested="' + esc(g.suggested || '') +
        '" data-original-text="' + esc(g.originalText == null ? g.text : g.originalText) + '">' +
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
        // several גיחות answer to the same name in מתקדם, so when the chart
        // cannot tell them apart it asks instead of picking one
        '<div class="opts" data-expick="' + esc(q.id) + '" hidden></div>' +
        '<button type="button" class="btn btn--block" data-exload="' + esc(q.id) + '" hidden>' +
          icon('download') + esc(T.loadSyllabus) +
          '<span class="btn__hint" data-exloadname></span></button>' +
        // says so when a גיחה is not in the chart. Without this the syllabus
        // just stays empty and there is no way to tell a typo from a gap.
        '<span class="field__hint" data-exnomatch hidden></span>' +
        '<div class="ginfo" id="gichaInfo" hidden></div>' +
        '</div>';
    }

    /* At the תדריך each exercise carries its own דגש. At the תחקיר that דגש is
       shown back as reference and the notes box records what happened. */
    function exRow(x, i, withNotes) {
      var focus = String(x.focus || '');
      return '<div class="ex' + (x.notes && x.notes.trim() ? ' ex--done' : '') +
        '" data-exid="' + esc(x.id) + '" data-focus="' + esc(focus) + '" data-notes="' + esc(x.notes || '') + '">' +
        '<div class="ex__top">' +
          '<span class="ex__n">' + (i + 1) + '</span>' +
          '<input class="ex__t" type="text" dir="auto" value="' + esc(x.text) + '" data-extext>' +
          '<span class="ex__grip" data-grip role="button" tabindex="0" aria-label="' + esc(T.reorderKeys) + '">' +
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
      return '<div class="field">' + label(q, false) +
        '<div class="duration"><input class="input input--num" id="f_' + esc(q.id) + '" data-minutes="' + esc(q.id) +
        '" type="number" min="0" step="1" inputmode="numeric" value="' + sel + '"><span>' + esc(T.minutesUnit) + '</span></div></div>';
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
      rec.syllabusEntry = { course: rec.course || Store.courseId(), name: entry.name };
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

    /** The entry the subject names, plus every other one it could have meant.
     *
     *  "SBT" is five sessions in מתקדם and "הכנות 1" is both a simulator session
     *  and an air sortie. Rather than stop and ask, the likeliest one is filled
     *  in and the alternatives stay on screen as one-tap corrections — an extra
     *  tap on every ambiguous גיחה costs more than being occasionally wrong in
     *  a way that is visible and instantly fixable. */
    function matchEntry() {
      if (!global.SyllabusRef) return { entry: null, options: [] };
      var subject = currentSubject();
      /* A bare category is not a גיחה, it is somebody halfway through typing
         one — or a tap on the chip above. "מבנה" matches all nine מבנה sorties
         and filling the first would drop eight exercises into the form before
         he has said which flight this is. */
      if (isBareCategory(subject)) return { entry: null, options: [] };
      var c = SyllabusRef.candidates(subject, rec.course);
      return { entry: c.length ? bestOf(c) : null, options: c };
    }

    function isBareCategory(subject) {
      var s = SyllabusRef.norm(subject);
      if (!s) return true;
      return Store.categoryVocab(rec.course || Store.courseId()).some(function (cat) { return SyllabusRef.norm(cat) === s; });
    }

    /** An air sortie beats a simulator session of the same name: you fly more
     *  than you sim, and the simulator one is the one wearing a badge. */
    function bestOf(list) {
      var air = list.filter(function (f) { return !f.sim; });
      return (air.length ? air : list)[0];
    }

    /** What the syllabus list holds right now, so a later tap can tell whether
     *  it is still exactly what was filled in automatically or whether he has
     *  since written in it. Only the former may be replaced silently. */
    function exSignature() {
      var listEl = qSyl && $('[data-ex="' + qSyl.id + '"]');
      if (!listEl) return '';
      return $$('.ex', listEl).map(function (r) {
        var f = $('[data-exfocus]', r), n = $('[data-exnotes]', r);
        return $('[data-extext]', r).value + '' + (f ? f.value : '') + '' + (n ? n.value : '');
      }).join('');
    }

    /** Returns how many exercises it filled in, so the caller can say it once
     *  together with the goals rather than firing a second toast on top. */
    function refreshSyllabusMatch(autofill) {
      if (!qSyl || !qSubj || !global.SyllabusRef) return 0;
      var btn = $('[data-exload="' + qSyl.id + '"]');
      if (!btn) return 0;
      var subject = currentSubject();
      var m = matchEntry();
      var entry = m.entry;
      // an entry with no חתך rows has nothing to offer
      btn.hidden = !entry || !entry.items.length;

      /* Only complain once it looks like he has finished naming a גיחה — every
         one of them carries a number — so this stays quiet while he types. */
      var note = $('[data-exnomatch]', btn.parentElement);
      if (note) {
        var named = /\d/.test(subject) && subject.trim().length > 2;
        var ambiguous = m.options.length > 1;
        note.hidden = (!!entry || !named) && !ambiguous;
        if (ambiguous) note.textContent = T.pickedGicha;
        else if (!entry && named) note.textContent = T.noSyllabusFor(subject.trim());
      }

      /* More than one candidate: the likeliest is filled in below, and the rest
         stay here so getting it wrong costs one tap rather than making every
         ambiguous גיחה cost one. */
      var pickEl = $('[data-expick="' + qSyl.id + '"]');
      if (pickEl) {
        if (m.options.length > 1) {
          pickEl.hidden = false;
          pickEl.innerHTML = m.options.map(function (f, i) {
            return '<button type="button" class="opt opt--sm" data-pick="' + i + '" dir="auto"' +
              ' aria-pressed="' + (f === entry) + '">' +
              esc(f.name) + (f.sim ? '<span class="simtag">' + esc(T.simBadge) + '</span>' : '') +
              '</button>';
          }).join('');
          pending = m.options;
        } else { pickEl.hidden = true; pickEl.innerHTML = ''; pending = []; }
      }

      // what the chart says about this גיחה, shown while briefing it
      showGichaInfo(entry);

      if (!entry || !entry.items.length) return 0;
      $('[data-exloadname]', btn).textContent = entry.name;

      var listEl = $('[data-ex="' + qSyl.id + '"]');
      var isEmpty = !$$('.ex', listEl).some(function (r) {
        return $('[data-extext]', r).value.trim();
      });
      if (autofill && isEmpty) {
        var filled = fillSyllabus(entry, true);
        autoSig = exSignature();
        return filled;
      }
      return 0;
    }

    /* The chart carries more than exercises: a planned duration, notes for the
       גיחה, and notes for the מאמן. All of it is briefing material, so it is
       shown while briefing rather than buried in the reference screen. */
    function showGichaInfo(entry) {
      var box = $('#gichaInfo');
      if (!box) return;
      if (!entry || (!entry.note && !entry.instNote && !entry.minutes && !entry.sim)) {
        box.hidden = true; box.innerHTML = ''; return;
      }
      box.hidden = false;
      box.innerHTML =
        '<div class="ginfo__h">' + icon('info') +
          '<span dir="auto">' + esc(entry.name) + '</span>' +
          (entry.sim ? '<span class="simtag">' + esc(T.simBadge) + '</span>' : '') +
          (entry.minutes ? '<span class="ginfo__m mono">' + entry.minutes + '′</span>' : '') +
        '</div>' +
        (entry.sim ? '<p class="ginfo__t ginfo__t--warn" dir="auto">' + esc(T.simHint) + '</p>' : '') +
        (entry.opens ? '<p class="ginfo__t" dir="auto">' + esc(entry.opens) + '</p>' : '') +
        (entry.note
          ? '<p class="ginfo__k">' + esc(T.gichaNote) + '</p>' +
            '<p class="ginfo__t" dir="auto">' + esc(entry.note) + '</p>' : '') +
        (entry.instNote
          ? '<p class="ginfo__k">' + esc(T.gichaInstNote) + '</p>' +
            '<p class="ginfo__t" dir="auto">' + esc(entry.instNote) + '</p>' : '');
    }

    /** The מתקדם chart recommends goals per גיחה. They go in as ordinary goals
     *  he can edit or delete — they are graded ✓/✗ and a ✗ carries forward, so
     *  they have to be his, not the chart's. Only ever added to an EMPTY list,
     *  the same rule the exercises follow, so nothing he wrote is replaced. */
    function fillSyllabusGoals(entry) {
      if (!isBrief || !qGoals || !entry || !entry.goals || !entry.goals.length) return 0;
      var listEl = $('[data-goals="' + qGoals.id + '"]');
      if (!listEl) return 0;
      var have = {};
      $$('.goalrow', listEl).forEach(function (r) { have[goalTextOf(r).trim()] = 1; });
      var added = 0;
      entry.goals.forEach(function (t) {
        t = String(t).trim();
        if (!t || have[t]) return;
        have[t] = 1;
        listEl.insertAdjacentHTML('beforeend', goalRow(Store.normalizeGoal({ text: t, suggested: entry.name, originalText: t }), false));
        listEl.lastElementChild.classList.add('is-suggested');
        added++;
      });
      if (added) { haptic(10); touched(); }
      return added;
    }

    /* ---------- goals carried in by category ----------
       What he missed on the last AW flight comes back on the next AW flight and
       nowhere else. The category is not known until he types נושא טיסה, so these
       arrive as he types rather than when the form opens. */
    function refreshGoalCarry(announce) {
      if (!isBrief || !qGoals || !qSubj) return 0;
      var listEl = $('[data-goals="' + qGoals.id + '"]');
      if (!listEl) return 0;

      var cats = Store.categoriesInText(currentSubject(), rec.course);
      var want = Store.pendingGoalsFor(cats, rec.course).filter(function (g) {
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

      if (added) { haptic(10); touched(); }
      return added;
    }

    /* One line, not two toasts. Typing a גיחה used to fire "4 exercises
       loaded" and "2 goals added" at the same moment, and the pair covered the
       field being typed into. */
    function onSubjectChanged(announce) {
      if (rec.syllabusEntry && qSubj) {
        var currentSubject = $('[data-q="' + qSubj.id + '"]');
        if (currentSubject && (isBareCategory(currentSubject.value) || !SyllabusRef.candidates(currentSubject.value, rec.course || Store.courseId()).some(function (e) { return e.name === rec.syllabusEntry.name; }))) rec.syllabusEntry = null;
      }
      var ex = refreshSyllabusMatch(announce) || 0;
      var goals = refreshGoalCarry(announce) || 0;
      /* The chart's recommended goals go in only after the carry has run, so a
         goal he actually missed last time is never displaced by a suggestion
         with the same wording. */
      var sugg = 0;
      if (announce) sugg = fillSyllabusGoals(matchEntry().entry) || 0;
      if (!announce || (!ex && !goals && !sugg)) return;
      var bits = [];
      if (ex) bits.push(T.syllabusFilled(ex));
      if (goals) bits.push(T.goalsPulled(goals));
      if (sugg) bits.push(T.goalsSuggested(sugg));
      toast(bits.join(' · '), ex ? 'list3' : 'target');
    }

    if (qSubj) {
      on(root, '[data-flightpicker]', 'click', function () {
        var entries = SyllabusRef.all(rec.course || Store.courseId());
        openSheet({ title: T.pickFlight, body: '<input class="input" id="flightPickerSearch" type="search" dir="auto" aria-label="' + esc(T.searchSyllabus) + '" placeholder="' + esc(T.searchSyllabus) + '"><div id="flightPickerResults" class="flight-picker"></div>', actions: [{ label: T.cancel }], onOpen: function (sh) {
          function paintPicker() {
            var query = SyllabusRef.norm($('#flightPickerSearch', sh).value);
            var visible = entries.filter(function (entry) { return !query || SyllabusRef.norm(entry.name + ' ' + entry.section).indexOf(query) !== -1; });
            $('#flightPickerResults', sh).innerHTML = visible.map(function (entry, i) { return '<button class="item" type="button" data-catalogue="' + i + '"><span class="item__b"><b dir="auto">' + esc(entry.name) + '</b><small>' + esc(entry.section) + (entry.sim ? ' · ' + esc(T.simBadge) : '') + '</small></span></button>'; }).join('') || '<p>' + esc(T.noMatches) + '</p>';
            on(sh, '[data-catalogue]', 'click', function (e) {
              var entry = visible[+e.currentTarget.dataset.catalogue];
              $('[data-q="' + qSubj.id + '"]', root).value = entry.name; sh.close(); onSubjectChanged(true);
              rec.syllabusEntry = { course: rec.course || Store.courseId(), name: entry.name }; touched();
            });
          }
          $('#flightPickerSearch', sh).oninput = paintPicker; paintPicker();
        } });
      });
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
                  answers: {}, createdAt: rec.createdAt, course: rec.course,
                  baseUpdatedAt: baseUpdatedAt, draftNew: isNew, buffers: {}, dismissed: dismissed,
                  syllabusEntry: rec.syllabusEntry || null };
      ['goalinput', 'iteminput', 'exinput'].forEach(function (kind) {
        $$('[data-' + kind + ']', root).forEach(function (el) { if (el.value) out.buffers[kind + ':' + el.dataset[kind]] = el.value; });
      });
      qs.forEach(function (q) {
        if (q.stage === 'brief' && !isBrief && q.inDebrief === 'readonly') return;
        if (q.type === 'goals') {
          out.answers[q.id] = $$('[data-goals="' + q.id + '"] .goalrow').map(function (row) {
            return { id: row.dataset.goalid, text: goalTextOf(row),
                     status: row.dataset.gs || 'open',
                     cats: (row.dataset.cats || '').split('|').filter(Boolean), from: row.dataset.origin || null,
                     carryOf: row.dataset.from || null, sourceId: row.dataset.sourceId || null,
                     course: row.dataset.course || null, suggested: row.dataset.suggested || null,
                     originalText: row.dataset.originalText };
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
              notes: n ? n.value : (row.dataset.notes || '')
            };
          });
        } else if (q.type === 'minutes') {
          var w = $('[data-minutes="' + q.id + '"]');
          out.answers[q.id] = w ? Math.max(0, Math.round(+w.value || 0)) : rec.answers[q.id];
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
      var state = $('#saveState'); if (state) state.textContent = T.draftSaving;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(writeDraft, 500);
    }

    function writeDraft() {
      clearTimeout(draftTimer);
      if (!viewEl.contains(root)) return;      // the screen is already gone
      var ok = Store.saveDraft(collect(), stage);
      var el = $('#saveState');
      if (el) {
        el.textContent = ok ? T.draftSaved : T.saveFailed;
      }
      return ok;
    }

    /* Flush on the way out rather than trusting the 500ms timer to have fired.
       Handed to the one set of listeners registered in boot(); registering them
       here would add another three on every render of a form. */
    formFlush = writeDraft;

    root.addEventListener('input', function (e) {
      if (e.target.matches('.ta, .ex__notes')) autosize(e.target);
      touched();
    });
    root.addEventListener('keydown', function (e) {
      if (!e.target.matches('[data-grip]') || ['ArrowUp', 'ArrowDown'].indexOf(e.key) === -1) return;
      e.preventDefault(); var row = e.target.closest('.ex'), sibling = e.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      if (e.key === 'ArrowUp') row.parentElement.insertBefore(row, sibling); else row.parentElement.insertBefore(sibling, row);
      renumberEx(row.parentElement); e.target.focus(); touched();
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
        if (input) { input.value = fill.dataset.val; haptic(); touched(); if (qSubj && fill.dataset.fill === qSubj.id) onSubjectChanged(true); }
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

      /* Correcting an automatic pick between גיחות with the same name. The
         chosen name is written back into נושא טיסה so the record says which one
         it was and re-opening the draft resolves to the same entry.
         What was filled in automatically may be swapped out silently; anything
         he has typed since is his, and asks first. */
      var pk = e.target.closest('[data-pick]');
      if (pk) {
        var chosen = pending[+pk.dataset.pick];
        if (!chosen) return;
        var editedSuggested = $$('.goalrow.is-suggested').some(function (r) { return goalTextOf(r) !== r.dataset.originalText; });
        var untouched = autoSig !== null && exSignature() === autoSig && !editedSuggested;
        var lst2 = $('[data-ex="' + qSyl.id + '"]');
        var empty2 = !lst2 || !$$('.ex', lst2).some(function (r) { return $('[data-extext]', r).value.trim(); });

        function swap() {
          var subjEl2 = qSubj && $('[data-q="' + qSubj.id + '"]');
          if (subjEl2) subjEl2.value = chosen.name;
          // the goals the last pick suggested go with it; his own stay
          var gl = qGoals && $('[data-goals="' + qGoals.id + '"]');
          if (gl) $$('.goalrow.is-suggested', gl).forEach(function (r) {
            if (goalTextOf(r) === r.dataset.originalText) r.remove();
            else { r.classList.remove('is-suggested'); r.dataset.suggested = ''; }
          });
          var n2 = fillSyllabus(chosen, true);
          var g2 = fillSyllabusGoals(chosen);
          autoSig = exSignature();
          refreshSyllabusMatch(false);
          refreshGoalCarry(false);
          var bits2 = [];
          if (n2) bits2.push(T.syllabusFilled(n2));
          if (g2) bits2.push(T.goalsSuggested(g2));
          if (bits2.length) toast(bits2.join(' · '), 'list3');
          touched();
        }

        if (untouched || (empty2 && !editedSuggested)) swap();
        else confirmSheet({
          title: T.replaceSyllabus, text: T.replaceSyllabusBody,
          confirmLabel: T.confirm, onConfirm: swap
        });
        return;
      }

      var xl = e.target.closest('[data-exload]');
      if (xl) {
        var entry = SyllabusRef.lookup(currentSubject(), rec.course);
        if (!entry) return;
        var lst = $('[data-ex="' + xl.dataset.exload + '"]');
        var has = $$('.ex', lst).some(function (r) { return $('[data-extext]', r).value.trim(); });
        function loadIt() {
          var n = fillSyllabus(entry, true), g = fillSyllabusGoals(entry);
          var bits = [T.syllabusFilled(n)];
          if (g) bits.push(T.goalsSuggested(g));
          toast(bits.join(' · '), 'list3');
        }
        if (!has) { loadIt(); return; }
        confirmSheet({
          title: T.replaceSyllabus, text: T.replaceSyllabusBody, confirmLabel: T.confirm,
          onConfirm: loadIt
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

    var saving = false;
    on(viewEl, '[data-save]', 'click', function (event) {
      if (saving) return;
      // A visible unfinished add-field is still user work; commit it on Save.
      $$('[data-goalinput]', root).forEach(function (el) { if (el.value.trim()) pushGoal(el.dataset.goalinput); });
      $$('[data-iteminput]', root).forEach(function (el) { if (el.value.trim()) pushItem(el.dataset.iteminput); });
      $$('[data-exinput]', root).forEach(function (el) { if (el.value.trim()) pushEx(el.dataset.exinput); });
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
      saving = true; var saveButton = event.currentTarget; saveButton.disabled = true; saveButton.textContent = T.draftSaving;
      Store.save(d).then(function (saved) {
        // the draft has served its purpose; leaving it would reopen the form
        // with a copy of what is now saved
        clearTimeout(draftTimer);
        formFlush = null;
        Store.clearDraft(draftId, stage);
        haptic(16);
        toast(isBrief ? T.briefSavedToast : T.debriefSavedToast);
        go(isBrief ? '' : 'flight/' + saved.id);
      }).catch(function (err) {
        saving = false; saveButton.disabled = false; saveButton.textContent = isBrief ? T.saveBrief : T.saveDebrief;
        writeDraft(); toast(err.code === 'EDIT_CONFLICT' ? T.draftConflictBody : T.saveFailedBody, 'alert', { label: T.exportJson, run: function () {
          var backup = JSON.parse(Store.toJSON()); backup.drafts[Store.draftKey(isNew ? null : rec.id, stage)] = JSON.stringify({ at: Date.now(), rec: collect() });
          saveFile('sortie-recovery-' + stamp() + '.json', JSON.stringify(backup, null, 2), 'application/json');
        } });
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
  var logFilters = { course: '', stage: '', from: '', to: '', instructor: '' };

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
    selected = {};
    Store.done().forEach(function (r) {
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
    var weekN = Store.done().filter(function (r) {
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
            '<button class="opt opt--sm" data-selshown>' + icon('check') + esc(T.selectAllShown) + '</button>' +
            '<button class="opt opt--sm" data-selclear>' + esc(T.clearSel) + '</button>' +
          '</div>'
        : '<div class="search">' + icon('search') +
          '<input class="input" id="q" type="search" dir="auto" autocomplete="off" placeholder="' +
            esc(T.search) + '" value="' + esc(logQuery) + '"></div>') +
      /* The chips stay up while selecting. They used to disappear, which made
         "summarise all my ניווט flights" a hand-pick through the whole log. */
      (opts.length ? '<div class="opts" id="logChips">' +
        '<button class="opt opt--sm" data-f="" aria-pressed="' + (!anyCat) + '">' + esc(T.all) + '</button>' +
        opts.map(function (o) {
          return '<button class="opt opt--sm" data-f="' + esc(o) + '" dir="auto" aria-pressed="' +
            (!!logCats[o]) + '">' + esc(o) +
            '<span class="opt__n mono">' + used[o] + '</span></button>';
        }).join('') + '</div>' : '') +
      '<details class="log-filter-details"><summary>' + esc(T.logFilters) + '</summary><div class="log-filter-grid">' +
        '<label>' + esc(T.courseSection) + '<select class="input" data-logfilter="course"><option value="">' + esc(T.allCourses) + '</option>' + Courses.all().map(function (c) { return '<option value="' + c.id + '"' + (logFilters.course === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + esc(T.allStages) + '<select class="input" data-logfilter="stage">' + [['', T.allStages], ['done', T.completedOnly], ['brief', T.pendingOnly]].map(function (x) { return '<option value="' + x[0] + '"' + (logFilters.stage === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>' +
        '<label>' + esc(T.fromDate) + '<input class="input" type="date" data-logfilter="from" value="' + esc(logFilters.from) + '"></label>' +
        '<label>' + esc(T.toDate) + '<input class="input" type="date" data-logfilter="to" value="' + esc(logFilters.to) + '"></label>' +
        '<label>' + esc(T.instructorFilter) + '<input class="input" type="search" data-logfilter="instructor" value="' + esc(logFilters.instructor) + '"></label>' +
      '</div></details><div id="logResults"></div></div>' +
      (logSelect
        ? '<div class="savebar"><div class="savebar__inner">' +
            '<span class="savestate" id="selCount">' + selCount() + ' SELECTED</span>' +
            '<span class="spacer"></span>' +
            '<button class="btn btn--lit" data-summary>' + icon('list3') + esc(T.makeSummary) + '</button>' +
          '</div></div>'
        : '');

    viewEl.classList.toggle('view--noTabs', logSelect);

    function shownRows() {
      var picked = Object.keys(logCats).filter(function (k) { return logCats[k]; });
      return Store.search(logQuery).filter(function (r) {
        if (logFilters.course && r.course !== logFilters.course) return false;
        if (logFilters.stage && r.stage !== logFilters.stage) return false;
        if (logFilters.from && r.flownAt < logFilters.from) return false;
        if (logFilters.to && r.flownAt > logFilters.to) return false;
        var qi = Store.questionFor(r, 'instructor');
        if (logFilters.instructor && String(qi && r.answers[qi.id] || '').toLowerCase().indexOf(logFilters.instructor.toLowerCase()) === -1) return false;
        if (!picked.length) return true;
        var cats = Store.categoriesOf(r);
        // matching ANY selected category, so picking AW and ניווט shows both
        return picked.some(function (c) { return cats.indexOf(c) !== -1; });
      });
    }

    function paint() {
      var rows = shownRows();
      if (!rows.length) {
        $('#logResults').innerHTML = empty('search', Store.count() ? T.noMatches : T.noFlights,
          Store.count() ? T.noMatchesHint : T.noFlightsHint);
        return;
      }
      /* Grouped by month. One flat list is fine at three flights and unreadable
         at a hundred and twenty, which is where a full course ends up. */
      var out = '', month = null;
      rows.forEach(function (r) {
        var m = monthKey(r.flownAt);
        if (m !== month) {
          if (month !== null) out += '</div></div>';
          month = m;
          out += '<div class="panel"><div class="listhead">' + esc(monthLabel(r.flownAt)) + '</div>' +
            '<div class="list">';
        }
        out += flightRow(r, logSelect);
      });
      out += '</div></div>';
      $('#logResults').innerHTML = out;
    }
    on(viewEl, '[data-logfilter]', 'input', function (e) { logFilters[e.currentTarget.dataset.logfilter] = e.currentTarget.value; paint(); });
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
      if (e.target.closest('[data-selshown]')) {
        shownRows().forEach(function (r) { selected[r.id] = true; });
        writeSel(); haptic(12); screenLog(); return;
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
      // a real date, not "לפני 4 ימים" — this is a permanent record and it gets
      // read next to a logbook weeks later
      title: fmtNum(r.flownAt), sub: pending ? T.capBrief : T.capDebrief,
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
        onConfirm: function () {
          return Store.remove(r.id).then(function (gone) {
            // a debrief is the only copy of that conversation there is, so the
            // confirm is backed by an actual way out
            toast(T.deletedToast, 'trash', {
              label: T.undo,
              run: function () {
                Store.restore(gone).then(function () {
                  toast(T.restoredToast, 'checkCircle');
                  go('flight/' + gone.id);
                }).catch(reportActionError);
              }
            });
            go('log');
          }).catch(reportActionError);
        }
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

  var tlField = null, trendScope = { course: '', from: '', to: '' };

  function screenTrends() {
    renderTopbar({ title: T.navTrends, sub: T.capTrends });
    var done = Store.done().filter(function (r) { return (!trendScope.course || r.course === trendScope.course) && (!trendScope.from || r.flownAt >= trendScope.from) && (!trendScope.to || r.flownAt <= trendScope.to); });
    var filters = '<details class="log-filters"' + (trendScope.course || trendScope.from || trendScope.to ? ' open' : '') + '><summary>' + esc(T.logFilters) + '</summary><div class="log-filters__grid"><label>' + esc(T.courseLabel) + '<select class="input" data-trendscope="course"><option value="">' + esc(T.allCourses) + '</option>' + Courses.all().map(function (c) { return '<option value="' + c.id + '"' + (trendScope.course === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></label>' + ['from', 'to'].map(function (key) { return '<label>' + esc(key === 'from' ? T.fromDate : T.toDate) + '<input class="input" type="date" data-trendscope="' + key + '" value="' + esc(trendScope[key]) + '"></label>'; }).join('') + '</div></details>';
    function bindFilters() { on(viewEl, '[data-trendscope]', 'change', function (e) { trendScope[e.currentTarget.dataset.trendscope] = e.currentTarget.value; screenTrends(); }); }
    if (!done.length) { viewEl.innerHTML = filters + empty('trending', T.trendsEmpty, T.trendsEmptyHint); bindFilters(); return; }

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

    /* `list` belongs here too. When נקודות עיקריות became an itemized list it
       silently dropped out of this picker, so the one field worth reading
       across a whole term was the one you could not pick. */
    var textQs = Store.questions(true).filter(function (q) {
      return q.type === 'textarea' || q.type === 'text' || q.type === 'list';
    });
    if (!tlField || !textQs.some(function (q) { return q.id === tlField; })) {
      tlField = textQs.length ? textQs[0].id : null;
    }
    var missRows = Object.keys(miss).sort(function (a, b) { return miss[b] - miss[a]; }).slice(0, 6);
    var missMax = missRows.length ? miss[missRows[0]] : 1;
    // "recurring" means it came back, so count the ones seen more than once —
    // the readout used to show every goal missed even once under that label
    var recurringN = Object.keys(miss).filter(function (k) { return miss[k] > 1; }).length;

    var h = '<div class="stack-4 stagger">' + filters +
      '<div class="readouts">' +
        ro('cyan', 'clock', T.totalMinutes, 'HOURS', (mins / 60).toFixed(1)) +
        ro('', 'layers', T.rFlights, 'FLIGHTS', String(done.length)) +
        ro('green', 'target', T.goalRate, 'GOALS', rate + '<small>%</small>') +
        ro('amber', 'alert', T.repeatedGoals, 'REPEAT', String(recurringN)) +
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

    // the panel lists every goal that was missed, so it is titled that way; the
    // ones that actually came back are marked, which is the useful distinction
    if (missRows.length) {
      h += '<section class="panel panel--red"><div class="panel__head">' + icon('alert') +
        '<span class="panel__t">' + esc(T.missedGoals) + '</span>' +
        (recurringN ? '<span class="panel__a">' + esc(T.recurringTag) + ' ' + recurringN + '</span>' : '') +
        '</div><div class="panel__body"><div class="bars">' +
        missRows.map(function (k, i) {
          return '<button type="button" class="goal-history" data-goalhistory="' + i + '">' + bar(k, miss[k], missMax, done.length, i, true, miss[k] > 1) + '</button>';
        }).join('') +
        '</div></div></section>';
    }

    if (tlField) {
      h += '<section class="stack"><h2 class="h-sect">' + esc(T.readAcross) + '</h2>' +
        '<div class="seg seg--wrap">' + textQs.map(function (q) {
          return '<button data-tlf="' + esc(q.id) + '" aria-pressed="' + (tlField === q.id) + '">' +
            esc(q.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="panel"><div class="panel__body"><div class="tl">' + (function () {
          // linesOf handles both shapes, so a list question reads as its bullets
          // instead of stringifying to [object Object]
          var rows = done.map(function (r) {
            return { r: r, lines: Store.linesOf(r.answers[tlField]) };
          }).filter(function (x) { return x.lines.length; }).slice(0, 20);
          if (!rows.length) return '<p class="dim" style="font-size:var(--t-13)">' + esc(T.nothingHere) + '</p>';
          return rows.map(function (x) {
            return '<div class="tlrow"><div class="tlrow__m">' + esc(fmtNum(x.r.flownAt)) + '</div>' +
              x.lines.map(function (t) {
                return '<div class="tlrow__t" dir="auto">' + esc(t) + '</div>';
              }).join('') + '</div>';
          }).join('');
        })() + '</div></div></div></section>';
    }

    h += syllabusProgressPanel();
    h += instructorPanel(done);

    viewEl.innerHTML = h + '</div>';
    bindFilters();
    on(viewEl, '[data-goalhistory]', 'click', function (e) {
      var text = missRows[+e.currentTarget.dataset.goalhistory];
      var rows = done.map(function (r) { var q = Store.questionFor(r, 'goals'); var goal = q && (r.answers[q.id] || []).find(function (g) { return g.text.trim() === text; }); return { record: r, goal: goal }; }).filter(function (x) { return x.goal; });
      openSheet({ title: text, text: T.goalHistoryHint, body: '<div class="group">' + rows.map(function (x) { return '<a class="item" data-historyflight="' + esc(x.record.id) + '" href="#/flight/' + encodeURIComponent(x.record.id) + '"><span>' + esc(fmtFull(x.record.flownAt)) + '</span><b>' + esc(x.goal.status === 'met' ? T.goalsMet : x.goal.status === 'missed' ? T.goalsMissed : T.notAnswered) + '</b></a>'; }).join('') + '</div>', actions: [{ label: T.cancel }], onOpen: function (sh) { on(sh, '[data-historyflight]', 'click', function () { sh.close(); }); } });
    });
    on(viewEl, '[data-tlf]', 'click', function (e) { tlField = e.currentTarget.dataset.tlf; screenTrends(); });
    on(viewEl, '[data-gosyl]', 'click', function () { go('syllabus'); });
    // an instructor's name is already searchable across every answer, so this
    // needs no new filter — it just aims the log's search at them
    on(viewEl, '[data-instq]', 'click', function (e) {
      logQuery = e.currentTarget.dataset.instq; logCats = {}; go('log');
    });

    function ro(tone, ic, k, cap, v) {
      return '<div class="readout' + (tone ? ' readout--' + tone : '') + '">' +
        '<div class="readout__k">' + icon(ic) + '<span>' + esc(k) + '</span></div>' +
        '<div class="readout__v">' + v + '</div><div class="readout__s">' + esc(cap) + '</div></div>';
    }
    function bar(label, n, max, total, i, red, flag) {
      return '<div class="bar"><div class="bar__top">' +
        '<span class="bar__label" dir="auto">' + esc(label) +
          (flag ? '<span class="tagline tagline--amber">' + esc(T.recurringTag) + '</span>' : '') + '</span>' +
        '<span class="bar__val">' + n + (total ? ' · ' + Math.round(n / total * 100) + '%' : '') + '</span></div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' + Math.round(n / max * 100) +
        '%;animation-delay:' + (i * 34) + 'ms' + (red ? ';background:var(--red);box-shadow:none' : '') +
        '"></div></div></div>';
    }
  }

  /* ================================================== syllabus + instructors */

  /** Which גיחות in the chart this pilot has already flown, worked out from the
   *  נושא טיסה he typed rather than from anything he has to maintain. */
  function syllabusProgress() {
    if (!global.SyllabusRef || !SyllabusRef.count()) return null;
    var flownNames = {};
    Store.done().forEach(function (r) {
      if (r.course !== Store.courseId()) return;
      var q = Store.questionFor(r, 'subject') || Store.question('q_subject');
      if (!q) return;
      var e = r.syllabusEntry && r.syllabusEntry.course === r.course
        ? SyllabusRef.all(r.course).filter(function (x) { return x.name === r.syllabusEntry.name; })[0]
        : (SyllabusRef.candidates(r.answers[q.id], r.course).length === 1 ? SyllabusRef.lookup(r.answers[q.id], r.course) : null);
      if (e) flownNames[e.name] = (flownNames[e.name] || 0) + 1;
    });

    var sections = [], byName = {}, next = null, doneN = 0;
    SyllabusRef.all().forEach(function (e) {
      var sec = e.section || '—';
      if (!byName[sec]) { byName[sec] = { name: sec, total: 0, done: 0 }; sections.push(byName[sec]); }
      byName[sec].total++;
      if (flownNames[e.name]) { byName[sec].done++; doneN++; }
      else if (!next) next = e;
    });
    return { sections: sections, done: doneN, total: SyllabusRef.count(), next: next, flown: flownNames };
  }

  function syllabusProgressPanel() {
    var p = syllabusProgress();
    if (!p) return '';
    var pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    return '<section class="panel"><div class="panel__head">' + icon('list3') +
      '<span class="panel__t">' + esc(T.sylProgress) + '</span>' +
      '<span class="panel__a mono">' + pct + '%</span></div>' +
      '<div class="panel__body">' +
        '<p class="field__hint" style="margin-bottom:var(--s-3)">' + esc(T.sylDone(p.done, p.total)) + '</p>' +
        (p.done
          ? '<div class="bars">' + p.sections.map(function (s, i) {
              return '<div class="bar"><div class="bar__top">' +
                '<span class="bar__label" dir="auto">' + esc(s.name) + '</span>' +
                '<span class="bar__val mono">' + s.done + '/' + s.total + '</span></div>' +
                '<div class="bar__track"><div class="bar__fill" style="width:' +
                  Math.round(s.done / Math.max(1, s.total) * 100) +
                  '%;animation-delay:' + (i * 30) + 'ms"></div></div></div>';
            }).join('') + '</div>'
          : '<p class="dim" style="font-size:var(--t-13)">' + esc(T.sylNoneYet) + '</p>') +
        (p.next
          ? '<div class="nextup"><span class="nextup__k">' + esc(T.sylNext) + '</span>' +
            '<span class="nextup__v" dir="auto">' + esc(p.next.name) + '</span>' +
            '<span class="nextup__s" dir="auto">' + esc(p.next.section || '') + '</span></div>'
          : '<div class="nextup"><span class="nextup__v">' + esc(T.sylNextNone) + '</span></div>') +
        '<button class="btn btn--block" data-gosyl style="margin-top:var(--s-3)">' +
          icon('list3') + esc(T.sylOpenChart) + '</button>' +
      '</div></section>';
  }

  /** Debriefs are instructor-driven, so "what does this one keep marking me on"
   *  is the question the goal loop is already half answering. */
  function instructorPanel(done) {
    var qi = Store.roleQuestion('instructor') || Store.question('q_instructor');
    var qg = Store.roleQuestion('goals');
    if (!qi) return '';                       // he deleted the question; nothing to group by

    var by = {}, order = [];
    done.forEach(function (r) {
      qi = Store.questionFor(r, 'instructor'); qg = Store.questionFor(r, 'goals');
      if (!qi) return;
      var name = String(r.answers[qi.id] || '').trim();
      if (!name) return;
      if (!by[name]) { by[name] = { name: name, n: 0, met: 0, tot: 0, miss: {} }; order.push(by[name]); }
      var e = by[name];
      e.n++;
      if (qg) (r.answers[qg.id] || []).forEach(function (g) {
        var t = String(g.text || '').trim();
        if (!t || g.status === 'open') return;
        e.tot++;
        if (g.status === 'met') e.met++;
        else e.miss[t] = (e.miss[t] || 0) + 1;
      });
    });
    if (!order.length) return '';
    order.sort(function (a, b) { return b.n - a.n || a.name.localeCompare(b.name); });

    return '<section class="panel"><div class="panel__head">' + icon('target') +
      '<span class="panel__t">' + esc(T.byInstructor) + '</span>' +
      '<span class="panel__a mono">' + order.length + '</span></div>' +
      '<div class="panel__body"><div class="instlist">' +
        order.map(function (e) {
          var top = Object.keys(e.miss).sort(function (a, b) { return e.miss[b] - e.miss[a]; }).slice(0, 3);
          return '<button class="inst" data-instq="' + esc(e.name) + '">' +
            '<span class="inst__top">' +
              '<span class="inst__n" dir="auto">' + esc(e.name) + '</span>' +
              '<span class="inst__m mono">' + (e.tot ? Math.round(e.met / e.tot * 100) + '%' : '—') + '</span>' +
            '</span>' +
            '<span class="inst__s">' + esc(T.instFlights(e.n)) + '</span>' +
            (top.length
              ? '<span class="inst__tags">' + top.map(function (t) {
                  return '<span class="inst__tag" dir="auto">' + esc(t) +
                    (e.miss[t] > 1 ? ' ×' + e.miss[t] : '') + '</span>';
                }).join('') + '</span>'
              : '') +
          '</button>';
        }).join('') +
      '</div></div></section>';
  }

  /* ============================================================= settings */

  function screenSettings() {
    renderTopbar({ title: T.settings, sub: T.capSet });
    var s = Store.settings(), since = daysSince(s.lastBackup), qs = Store.questions();

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

      '<section class="stack"><h2 class="h-sect">' + esc(T.courseSection) + '</h2><div class="group">' +
        (global.Courses ? Courses.all().map(function (c) {
          var on = Store.courseId() === c.id;
          return '<button class="item' + (on ? ' item--on' : '') + '" data-coursepick="' + esc(c.id) + '">' +
            '<span class="item__ic">' + icon(on ? 'checkCircle' : 'flag') + '</span>' +
            '<span class="item__b"><span class="item__t" dir="auto">' + esc(c.label) + '</span>' +
            '<span class="item__s">' + esc(T.courseSyllabusCount(SyllabusRef.count(c.id), c.label)) +
            '</span></span></button>';
        }).join('') : '') +
        item('list3', T.syllabusRef,
             T.syllabusRefSub(global.SyllabusRef ? SyllabusRef.count() : 0), 'syllabus') +
      '</div></section>' +

      '<section class="stack"><h2 class="h-sect">' + esc(T.yourData) + '</h2><div class="group">' +
        item('download', T.exportCsv, T.exportCsvSub, 'export-csv') +
        item('download', T.exportJson, T.exportJsonSub, 'export-json') +
        item('upload', T.importJson, T.importJsonSub, 'import-json') +
        item('layers', T.recovery, T.backupRecoveryBody, 'recovery') + '</div></section>' +
      '<section class="stack"><div class="group">' + item('notebook', T.notebookTitle, T.onDeviceOnly, 'notebook') +
        item('trending', T.courseProgress, T.progressSub, 'progress') + item('pencil', T.feedback, T.feedbackSub, 'feedback') +
        item('flag', T.whatsNew, BUILD, 'whatsnew') + '</div></section>' +

      // only when the gate is actually configured; otherwise there is no account
      (global.Auth && Auth.enabled() && Auth.session()
        ? '<section class="stack"><h2 class="h-sect">' + esc(T.account) + '</h2><div class="group">' +
            '<div class="item"><span class="item__ic">' + icon('lock') + '</span>' +
            '<span class="item__b"><span class="item__t" dir="auto">' +
              esc(Auth.session().email) + '</span>' +
            '<span class="item__s">' + esc(T.signedInAs('')).trim() + '</span></span></div>' +
            '<button class="item" data-signout><span class="item__ic">' + icon('x') + '</span>' +
            '<span class="item__b"><span class="item__t">' + esc(T.signOut) + '</span></span></button>' +
          '</div></section>'
        : '') +

      '<section class="stack"><h2 class="h-sect">' + esc(T.privacy) + '</h2><div class="group">' +
        item('lock', s.pin ? T.changeCode : T.setCode,
             Store.cryptoReady() ? (s.pin ? T.codeOn : T.codeOff) : T.needsHttps, 'pin-set') +
        (s.pin ? item('x', T.removeCode, '', 'pin-off') : '') + '</div>' +
        '<p class="dim" style="font-size:var(--t-12);line-height:1.6">' + esc(T.privacyNote) + '</p></section>' +

      '<details class="advanced-settings"><summary>' + esc(T.advancedSettings) + '</summary><div class="group"><button class="item item--danger" data-clear>' +
        '<span class="item__ic">' + icon('trash') + '</span><span class="item__b">' +
        '<span class="item__t">' + esc(T.deleteAll) + '</span>' +
        '<span class="item__s">' + esc(T.confirmDeleteAllBody) + '</span></span></button></div></details>' +

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
    on(viewEl, '[data-coursepick]', 'click', function (e) {
      var id = e.currentTarget.dataset.coursepick;
      if (id === Store.courseId()) return;
      var c = Courses.resolve(id);
      confirmSheet({
        title: T.courseChangeTitle(c.label), text: T.courseChangeBody,
        confirmLabel: T.confirm, icon: 'flag',
        onConfirm: function () {
          Store.setCourse(id);
          toast(T.courseSwitched(c.label), 'flag');
          screenSettings();
        }
      });
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
      if (['notebook', 'progress', 'feedback', 'whatsnew', 'recovery'].indexOf(a) !== -1) { go(a); return; }
      if (a === 'export-csv') {
        if (!Store.count()) return toast(T.noFlights, 'alert');
        saveFile('tahkir-' + stamp() + '.csv', Store.toCSV(), 'text/csv');
        setTimeout(screenSettings, 400);
      }
      if (a === 'export-json') {
        saveFile('tahkir-backup-' + stamp() + '.json', Store.toJSON(), 'application/json', 'backup');
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
          var text = String(fr.result), plan = Store.inspectImport(text);
          openSheet({ title: T.importPreview, text: T.importCounts(plan),
            body: '<label class="checkline"><input type="checkbox" id="restorePreferences"' + (!Store.count() ? ' checked' : '') + '> ' + esc(T.importPreferences) + '</label><p class="field__hint">' + esc(T.importMergeHint) + '</p>',
            actions: [{ label: T.importJson, cls: 'btn--lit', keepOpen: true, run: function (sh) {
              var restore = $('#restorePreferences', sh).checked;
              $$('button', sh).forEach(function (b) { b.disabled = true; });
              Store.importJSON(text, { restorePreferences: restore }).then(function (res) {
                sh.close(); toast(T.importComplete(res)); screenSettings();
              }).catch(function () { sh.close(); toast(T.importFailed, 'alert'); });
            } }, { label: T.cancel }]
          });
        } catch (err) { toast(T.importInvalid, 'alert'); }
      };
      fr.readAsText(f); e.target.value = '';
    });

    on(viewEl, '[data-signout]', 'click', function () {
      confirmSheet({
        title: T.confirmSignOut, text: T.confirmSignOutBody, confirmLabel: T.signOut,
        icon: 'lock',
        onConfirm: function () { Auth.signOut(); location.reload(); }
      });
    });

    on(viewEl, '[data-clear]', 'click', function () {
      confirmSheet({
        title: T.confirmDeleteAll(Store.count()), text: T.confirmDeleteAllBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () { return Store.clearAll().then(function () { toast(T.deletedToast, 'trash'); go(''); }).catch(reportActionError); }
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
      body: '<div class="stack-4"><p class="field__hint">' + esc(T.questionVersionHint) + '</p>' +
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

    function subjOf(r) { var q = Store.questionFor(r, 'subject'); return q ? String(r.answers[q.id] || '').trim() : ''; }

    sorted.forEach(function (r) {
      qGoals = Store.questionFor(r, 'goals'); qPoints = Store.questionFor(r, 'points'); qSolo = Store.questionFor(r, 'solo');
      qSyl = Store.questions(true).find(function (q) { return q.type === 'syllabus' && r.answers[q.id] !== undefined; });
      qMin = Store.questions(true).find(function (q) { return q.type === 'minutes' && r.answers[q.id] !== undefined; });
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
        if (t && String(x.notes || '').trim()) ex[t] = (ex[t] || 0) + 1;
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
      var subject = Store.questionFor(r, 'subject'), instructor = Store.questionFor(r, 'instructor');
      if (subject && r.answers[subject.id]) bits.push(r.answers[subject.id]);
      if (instructor && r.answers[instructor.id]) bits.push(r.answers[instructor.id]);
      var minutes = Store.questions(true).find(function (q) { return q.type === 'minutes' && r.answers[q.id] !== undefined; });
      if (minutes && r.answers[minutes.id]) bits.push(r.answers[minutes.id] + ' ' + T.minutesUnit);
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

    if (!summaryCompact) h += '<h2>' + esc(T.secFlights) + '</h2>';
    (summaryCompact ? [] : s.records).forEach(function (r) {
      h += '<h3>' + esc(head(r)) + '</h3>';
      var q = Store.questions(true).find(function (q) { return q.type === 'syllabus' && r.answers[q.id] !== undefined; });
      if (!q) return;
      var xs = (r.answers[q.id] || []).filter(function (x) { return String(x.text || '').trim(); });
      var told = xs.filter(function (x) { return String(x.notes || '').trim(); });
      var rest = xs.filter(function (x) { return !String(x.notes || '').trim(); });
      if (told.length) h += list(told, function (x) {
        return '<b>' + esc(x.text) + ':</b> ' + esc(String(x.notes).trim()) +
          (String(x.focus || '').trim() ? ' <i>(' + esc(x.focus) + ')</i>' : '');
      });
      if (rest.length) {
        h += '<p class="also">' + esc(T.plannedExercises) +
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
    var recs = Store.done().filter(function (r) { return selected[r.id]; });
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
    if (!summaryCompact && s.exercises.length) h += sec(T.documentedExercises, '', rows(s.exercises));
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

    h += '<div class="stack"><p class="field__hint">' + esc(T.summaryCompletedOnly) + '</p>' +
      '<div class="seg"><button class="seg__b" data-summarymode="short" aria-pressed="' + summaryCompact + '">' + esc(T.summaryShort) + '</button><button class="seg__b" data-summarymode="full" aria-pressed="' + !summaryCompact + '">' + esc(T.summaryFull) + '</button></div>' +
      '<button class="btn btn--lit btn--block btn--lg" data-copydoc>' + icon('copy') + esc(T.copyDoc) + '</button>' +
      '<button class="btn btn--block" data-exportdoc>' + icon('download') + esc(T.exportDoc) + '</button>' +
      '<p class="dim" style="font-size:var(--t-12);line-height:1.6;text-align:center">' + esc(T.docHint) + '</p>' +
    '</div></div>';

    viewEl.innerHTML = h;

    on(viewEl, '[data-summarymode]', 'click', function (e) { summaryCompact = e.currentTarget.dataset.summarymode === 'short'; screenSummary(); });
    on(viewEl, '[data-copydoc]', 'click', function () {
      var html = summaryDocHTML(s);
      var clean = new DOMParser().parseFromString(html, 'text/html');
      var plain = clean.body.innerHTML.replace(/<[^>]+>/g, function (m) {
        return /<\/(h1|h2|h3|li|p)>/.test(m) ? '\n' : '';
      }).replace(/\n{3,}/g, '\n\n').trim();
      var decoded = document.createElement('textarea'); decoded.innerHTML = plain; plain = decoded.value;
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
  var sylOpen = {};   // which גיחות are expanded, kept across repaints

  function screenSyllabus() {
    renderTopbar({ title: T.syllabusRef, sub: 'SYLLABUS', back: true, backTo: 'settings' });
    var all = global.SyllabusRef ? SyllabusRef.all() : [];

    if (!all.length) {
      viewEl.innerHTML = empty('list3', T.syllabusRefEmpty, T.syllabusRefEmptyHint);
      return;
    }
    var prog = syllabusProgress() || { flown: {}, done: 0, total: all.length };

    viewEl.innerHTML = '<div class="stack-4 stagger">' +
      '<div class="search">' + icon('search') +
        '<input class="input" id="sq" type="search" dir="auto" autocomplete="off" placeholder="' +
        esc(T.searchSyllabus) + '"></div>' +
      '<div class="sylbar"><div class="sylbar__t">' + esc(T.sylDone(prog.done, prog.total)) + '</div>' +
        '<div class="sylbar__track"><div class="sylbar__fill" style="width:' +
          Math.round(prog.done / Math.max(1, prog.total) * 100) + '%"></div></div></div>' +
      '<div id="sylResults"></div></div>';

    /* Collapsed by default. Every גיחה expanded meant 125 panels and 445 rows
       in the DOM at once, which is a very long thumb-scroll to find one. A
       search opens what it matched, so nothing is hidden behind a tap. */
    function paint(filter) {
      var f = SyllabusRef.norm(filter || '');
      var rows = all.filter(function (e) {
        if (!f) return true;
        if (SyllabusRef.norm(e.name).indexOf(f) !== -1) return true;
        if (e.raw && SyllabusRef.norm(e.raw).indexOf(f) !== -1) return true;
        if (e.section && SyllabusRef.norm(e.section).indexOf(f) !== -1) return true;
        if (e.items.some(function (i) { return SyllabusRef.norm(i).indexOf(f) !== -1; })) return true;
        return (e.goals || []).some(function (i) { return SyllabusRef.norm(i).indexOf(f) !== -1; });
      });
      if (!rows.length) {
        $('#sylResults').innerHTML = empty('search', T.noMatches, T.noMatchesHint);
        return;
      }

      var out = '', section = null;
      rows.forEach(function (e) {
        var sec = e.section || '—';
        if (sec !== section) {
          if (section !== null) out += '</div>';
          section = sec;
          out += '<h2 class="h-sect" dir="auto">' + esc(sec) + '</h2><div class="sylgroup">';
        }
        var open = !!f || !!sylOpen[e.name];
        var flown = !!prog.flown[e.name];
        out += '<section class="sylrow' + (open ? ' is-open' : '') + (flown ? ' is-flown' : '') + '">' +
          '<button type="button" class="sylrow__head" data-syl="' + esc(e.name) + '" aria-expanded="' + open + '">' +
            (flown ? '<span class="sylrow__tick">' + icon('check') + '</span>'
                   : '<span class="sylrow__tick sylrow__tick--off"></span>') +
            '<span class="sylrow__n" dir="auto">' + esc(e.name) + '</span>' +
            (e.sim ? '<span class="simtag">' + esc(T.simBadge) + '</span>' : '') +
            (flown ? '<span class="tagline">' + esc(T.sylFlown) + '</span>' : '') +
            '<span class="sylrow__c mono">' + (e.minutes ? e.minutes + '′' : e.items.length) + '</span>' +
            icon('chevDown', { cls: 'sylrow__chev' }) +
          '</button>' +
          (open
            ? (e.items.length
                ? '<div class="exlist">' + e.items.map(function (t, i) {
                    return '<div class="ex"><div class="ex__top">' +
                      '<span class="ex__n">' + (i + 1) + '</span>' +
                      '<span class="ex__t" dir="auto" style="display:flex;align-items:center">' +
                        esc(t) + '</span></div></div>';
                  }).join('') + '</div>'
                : '') +
              /* The מתקדם chart recommends goals and carries notes per גיחה.
                 ראשוני has neither, so none of this draws there. */
              ((e.goals && e.goals.length)
                ? '<div class="sylextra"><p class="ginfo__k">' + esc(T.suggestedGoals) + '</p>' +
                  '<div class="bullets">' + e.goals.map(function (t) {
                    return '<div class="bullet bullet--ro"><span class="bullet__d"></span>' +
                      '<span class="bullet__t" dir="auto">' + esc(t) + '</span></div>';
                  }).join('') + '</div></div>'
                : '') +
              ((e.note || e.instNote || e.opens)
                ? '<div class="sylextra">' +
                  (e.opens ? '<p class="ginfo__t" dir="auto">' + esc(e.opens) + '</p>' : '') +
                  (e.note ? '<p class="ginfo__k">' + esc(T.gichaNote) + '</p>' +
                    '<p class="ginfo__t" dir="auto">' + esc(e.note) + '</p>' : '') +
                  (e.instNote ? '<p class="ginfo__k">' + esc(T.gichaInstNote) + '</p>' +
                    '<p class="ginfo__t" dir="auto">' + esc(e.instNote) + '</p>' : '') +
                  '</div>'
                : '')
            : '') +
        '</section>';
      });
      out += '</div>';
      $('#sylResults').innerHTML = out;
    }
    paint('');

    $('#sq').addEventListener('input', function (e) { paint(e.target.value); });
    $('#sylResults').addEventListener('click', function (e) {
      var b = e.target.closest('[data-syl]');
      if (!b) return;
      var n = b.dataset.syl;
      sylOpen[n] = !sylOpen[n];
      haptic();
      paint($('#sq').value);
    });
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
  function closeLock() { lockEl.hidden = true; appEl.hidden = false; maybeRelease(); }

  /* ================================================================= boot */

  /* ================================================================= gate */

  /** The Google sign-in screen. Only ever shown when auth-config.js carries a
   *  client id — with none, `Auth.resolve()` answers 'off' and this never runs,
   *  so a half-finished setup cannot lock anyone out of their own flights. */
  function showGate(a) {
    var gate = document.getElementById('authGate');
    appEl.hidden = true; lockEl.hidden = true; gate.hidden = false;

    var body, note, acts;
    if (a.state === 'denied') {
      body = T.gateDenied(a.email);
      note = T.gateDeniedNote;
      acts = [{ label: T.gateOther, cls: 'btn--lit', run: Auth.signIn }];
    } else if (a.state === 'error') {
      body = T.gateFailed + (navigator.onLine === false ? ' ' + T.gateNoNet : '');
      note = a.why ? String(a.why) : '';
      acts = [{ label: T.gateRetry, cls: 'btn--lit', run: Auth.signIn }];
    } else {
      body = T.gateBody;
      note = T.gateOffline;
      acts = [{ label: T.gateSignIn, cls: 'btn--lit', run: Auth.signIn }];
    }

    document.getElementById('gateBody').textContent = body;
    document.getElementById('gateNote').textContent = note;
    document.getElementById('gateActs').innerHTML = acts.map(function (x, i) {
      return '<button class="btn btn--block btn--lg ' + (x.cls || '') + '" data-gate="' + i + '">' +
        esc(x.label) + '</button>';
    }).join('');
    on(gate, '[data-gate]', 'click', function (e) {
      var x = acts[+e.currentTarget.dataset.gate];
      if (!x) return;
      e.currentTarget.disabled = true;
      e.currentTarget.textContent = T.gateChecking;
      x.run();
    });
  }

  /* =============================================================== course */

  /** Asked once, straight after signing in, because it decides which syllabus
   *  a גיחה is looked up in and which categories the goal loop groups by.
   *  Where the address is on the roster the right answer is preselected, so
   *  this is a confirmation rather than a question — but it is still a choice,
   *  since somebody moving up a stage will be on the old roster line.
   *
   *  Rendered into the gate's shell, which is already full-screen and already
   *  the thing on screen at this moment. */
  function showCoursePicker(suggested, done) {
    var gate = document.getElementById('coursePicker');
    appEl.hidden = true; lockEl.hidden = true;
    document.getElementById('authGate').hidden = true;
    gate.hidden = false;

    var pick = suggested || Courses.defaultId;
    var body = document.getElementById('courseBody');
    var note = document.getElementById('courseNote');
    var acts = document.getElementById('courseActs');

    body.textContent = T.coursePrompt;
    note.textContent = T.courseChangeable;

    function paint() {
      acts.innerHTML =
        '<div class="courses">' + Courses.all().map(function (c) {
          return '<button type="button" class="course" data-course="' + esc(c.id) + '"' +
            ' aria-pressed="' + (c.id === pick) + '">' +
            '<span class="course__n" dir="auto">' + esc(c.label) + '</span>' +
            '<span class="course__s mono">' + SyllabusRef.count(c.id) + ' גיחות</span>' +
            (c.id === suggested
              ? '<span class="course__tag">' + esc(T.courseSuggested) + '</span>' : '') +
            '</button>';
        }).join('') + '</div>' +
        '<p class="gate__body" style="margin:var(--s-3) 0 0">' + esc(T.courseBody) + '</p>' +
        '<button class="btn btn--lit btn--block btn--lg" data-coursego style="margin-top:var(--s-4)">' +
          esc(T.courseConfirm) + '</button>';

      on(acts, '[data-course]', 'click', function (e) {
        pick = e.currentTarget.dataset.course; haptic(); paint();
      });
      on(acts, '[data-coursego]', 'click', function () {
        Store.setCourse(pick);
        gate.hidden = true;
        haptic(16);
        done();
      });
    }
    paint();
  }

  function boot() {
    appEl = document.getElementById('app');
    viewEl = document.getElementById('view');
    topbarEl = document.getElementById('topbar');
    tabbarEl = document.getElementById('tabbar');
    toasterEl = document.getElementById('toaster');
    sheetEl = document.getElementById('sheet');
    lockEl = document.getElementById('lockScreen');
    sheetEl.addEventListener('click', function (e) { if (e.target === sheetEl) sheetEl.close(); });
    var storageNotified = false;
    global.addEventListener('sortie:storage-error', function () {
      if (!storageNotified && !appEl.hidden) { storageNotified = true; toast(T.saveFailedBody, 'alert'); }
    });

    /* Registered once, not per render. pagehide is the event iOS actually
       delivers when a PWA is swiped away, and hidden covers backgrounding —
       between them an unsaved form survives the phone being put down. */
    function flushForm() { if (formFlush) { try { formFlush(); } catch (e) {} } }
    global.addEventListener('pagehide', flushForm);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushForm();
    });
    global.addEventListener('beforeinstallprompt', function (e) {
      e.preventDefault();
      installPrompt = e;
      /* Only redraw a screen that is actually on screen. This fires on the
         gated page too, and without the guard it rendered the whole home
         screen — flights and all — into the DOM behind the sign-in gate. */
      if (appEl && !appEl.hidden && route.name === 'home') screenHome();
    });
    global.addEventListener('appinstalled', function () { installPrompt = null; });

    Store.init().then(function () {
      applyTheme();
      global.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (Store.settings().theme === 'auto') applyTheme();
      });
      /* Auth.resolve() must run before navigate(): Google answers in the URL
         fragment, which is where the router looks, and resolve() is what takes
         the token out of it and puts the real route back. */
      return Auth.resolve();
    }).then(function (a) {
      if (a.state !== 'off' && a.state !== 'ok') { showGate(a); return; }
      /* The course has to be settled before anything renders: the categories
         under נושא טיסה, the syllabus a גיחה resolves in, and the goal loop's
         idea of "the same kind of flight" all come from it. */
      if (Store.coursePicked()) { Store.applyCourse(); return start(); }
      var who = a.email || (global.Auth && Auth.session() && Auth.session().email) || '';
      return (global.Auth && Auth.enabled() ? Auth.courseFor(who) : Promise.resolve(null))
        .catch(function () { return null; })
        .then(function (suggested) {
          /* If the roster already knows which stage this address is on, just
             set it. Asking someone to confirm a fact the app is certain about
             is a tap that buys nothing, and it is the first thing they see.
             The picker is still there for anyone NOT on the roster, and the
             choice is still theirs to change in הגדרות. */
          if (suggested) {
            Store.setCourse(suggested);
            Store.applyCourse();
            return start();
          }
          showCoursePicker(null, function () { Store.applyCourse(); start(); });
        });
    }).then(null, function (err) {
      appEl.hidden = false;
      viewEl.innerHTML = '<section class="empty"><h1>' + esc(T.startupError) + '</h1><p>' + esc(T.startupErrorBody) + '</p><button class="btn" id="retryBoot">' + esc(T.retry) + '</button><button class="btn" id="emergencyExport">' + esc(T.rawRecovery) + '</button></section>';
      $('#retryBoot').onclick = function () { location.reload(); };
      $('#emergencyExport').onclick = function () {
        var blob = new Blob([Store.emergencyJSON()], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'sortie-raw-recovery.json'; a.click(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      };
      console.error('Sortie startup failed', err);
    });

    function start() {
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
          if (formFlush && !updateApproved) {
            pendingReload = true;
            toast(T.updateReady, 'download', { label: T.updateNow, run: function () { if (formFlush() !== false) location.reload(); } });
            return;
          }
          reloading = true;
          location.reload();
        });
        navigator.serviceWorker.register('sw.js').then(function (reg) {
          function ready(worker) {
            if (!worker) return;
            pendingWorker = worker;
            if (formFlush) toast(T.updateReady, 'download', { label: T.updateNow, run: activateUpdate });
            else activateUpdate();
          }
          if (reg.waiting) ready(reg.waiting);
          reg.addEventListener('updatefound', function () {
            var worker = reg.installing;
            if (worker) worker.addEventListener('statechange', function () { if (worker.state === 'installed') ready(reg.waiting); });
          });
          reg.update().catch(function () {});
        }).catch(function () {});
      }
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
