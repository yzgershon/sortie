/* תחקיר — router, screens, interactions. Hebrew, right to left.
 *
 * The debrief form is built from Store.questions(), so every label, type and
 * option the pilot edits in Settings shows up here without a code change.
 */
(function (global) {
  'use strict';

  var appEl, viewEl, topbarEl, tabbarEl, toasterEl, sheetEl, lockEl;
  var route = { name: 'home', param: null };
  var navCount = 0;
  var pinBuffer = '', pinMode = 'unlock', pinFirst = '';

  /* ============================================================== helpers */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(root, sel, ev, fn) { $$(sel, root).forEach(function (n) { n.addEventListener(ev, fn); }); }

  function parseISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2] || 1);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = parseISO(iso);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((today - d) / 86400000);
    if (diff === 0) return T.today;
    if (diff === 1) return T.yesterday;
    if (diff > 1 && diff < 7) return T.daysAgo(diff);
    return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  }
  function fmtDateLong(iso) {
    if (!iso) return '';
    return parseISO(iso).toLocaleDateString('he-IL',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function dayMonth(iso) {
    var d = parseISO(iso);
    return { d: d.getDate(), m: d.toLocaleDateString('he-IL', { month: 'short' }) };
  }
  function daysSince(ts) { return ts ? Math.floor((Date.now() - ts) / 86400000) : null; }

  function isStandalone() {
    return global.navigator.standalone === true ||
      global.matchMedia('(display-mode: standalone)').matches;
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
    }, 2600);
  }

  function openSheet(opts) {
    sheetEl.innerHTML =
      '<div class="sheet__panel">' +
        '<div class="sheet__grab"></div>' +
        (opts.title ? '<h2 class="sheet__title">' + esc(opts.title) + '</h2>' : '') +
        (opts.text ? '<p class="sheet__text">' + esc(opts.text) + '</p>' : '') +
        (opts.body || '') +
        '<div class="stack" style="margin-top:var(--s-5)">' +
          (opts.actions || []).map(function (a, i) {
            return '<button class="btn btn--block ' + (a.cls || 'btn--ghost') +
              '" data-act="' + i + '">' + (a.icon ? icon(a.icon) : '') + esc(a.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';
    on(sheetEl, '[data-act]', 'click', function (e) {
      var a = (opts.actions || [])[+e.currentTarget.dataset.act];
      if (!a) return;
      if (a.keepOpen) { a.run && a.run(sheetEl); return; }
      sheetEl.close();
      a.run && a.run();
    });
    if (opts.onOpen) opts.onOpen(sheetEl);
    if (!sheetEl.open) sheetEl.showModal();
  }

  function confirmSheet(o) {
    openSheet({
      title: o.title, text: o.text,
      actions: [
        { label: o.confirmLabel || T.confirm, cls: o.danger ? 'btn--danger' : 'btn--primary',
          icon: o.icon, run: o.onConfirm },
        { label: T.cancel, cls: 'btn--quiet' }
      ]
    });
  }

  function applyTheme() {
    var pref = Store.settings().theme, mode = pref;
    if (pref === 'auto') {
      mode = global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', mode);
  }

  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    if (navigator.canShare && navigator.share) {
      try {
        var file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name })
            .then(function () { Store.markExported(); }).catch(function () {});
          return;
        }
      } catch (e) {}
    }
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
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

  function go(path) { location.hash = '#/' + path; }

  function navigate() {
    var h = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    var name = h[0] || 'home';
    if (['home', 'new', 'edit', 'log', 'debrief', 'patterns', 'settings'].indexOf(name) === -1) name = 'home';
    route = { name: name, param: h[1] ? decodeURIComponent(h[1]) : null };
    navCount++;
    render();
    global.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }

  var TABS = [
    { id: 'home',     label: T.navHome,     ic: 'horizon'  },
    { id: 'log',      label: T.navLog,      ic: 'layers'   },
    { id: 'patterns', label: T.navPatterns, ic: 'trending' },
    { id: 'settings', label: T.navSettings, ic: 'settings' }
  ];

  function renderTabs() {
    var cur = route.name === 'debrief' ? 'log' : route.name;
    tabbarEl.innerHTML = TABS.map(function (t) {
      return '<a class="tab" href="#/' + (t.id === 'home' ? '' : t.id) + '"' +
        (t.id === cur ? ' aria-current="page"' : '') + '>' + icon(t.ic) +
        '<span>' + esc(t.label) + '</span></a>';
    }).join('');
  }

  function renderTopbar(cfg) {
    topbarEl.innerHTML =
      (cfg.back ? '<button class="iconbtn iconbtn--flip" data-back aria-label="חזרה">' +
        icon('chevLeft') + '</button>' : '') +
      '<div class="topbar__title">' + esc(cfg.title || '') +
        (cfg.sub ? ' <span class="topbar__sub">' + esc(cfg.sub) + '</span>' : '') + '</div>' +
      (cfg.actions || []).map(function (a) {
        return '<button class="iconbtn' + (a.accent ? ' iconbtn--accent' : '') +
          '" data-topact="' + a.id + '" aria-label="' + esc(a.label) + '">' + icon(a.ic) + '</button>';
      }).join('');
    on(topbarEl, '[data-back]', 'click', function () {
      if (navCount > 1) history.back(); else go(cfg.backTo || '');
    });
    on(topbarEl, '[data-topact]', 'click', function (e) {
      var a = (cfg.actions || []).filter(function (x) { return x.id === e.currentTarget.dataset.topact; })[0];
      a && a.run && a.run();
    });
  }

  function render() {
    document.body.dataset.route = route.name;
    var formish = route.name === 'new' || route.name === 'edit';
    tabbarEl.hidden = formish;
    viewEl.classList.toggle('view--noTabs', formish);
    if (!formish) renderTabs();
    ({ home: screenHome, new: screenForm, edit: screenForm, log: screenLog,
       debrief: screenDetail, patterns: screenPatterns, settings: screenSettings })[route.name]();
    autosizeAll();
  }

  function emptyState(ic, title, text) {
    return '<div class="empty"><div class="empty__icon">' + icon(ic) + '</div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p></div>';
  }

  /* ============================================================ home */

  function screenHome() {
    var all = Store.all();
    var recent = all.slice(0, 4);
    var s = Store.settings();
    var goals = Store.nextGoals();

    renderTopbar({
      title: T.app,
      actions: [{ id: 'new', ic: 'plus', label: T.newDebrief, accent: true, run: function () { go('new'); } }]
    });

    /* --- tiles --- */
    var qHours = Store.questions().filter(function (q) { return q.type === 'number'; })[0];
    var hours = 0;
    if (qHours) {
      all.forEach(function (r) {
        var v = parseFloat(r.answers[qHours.id]);
        if (!isNaN(v)) hours += v;
      });
    }
    var met = 0, tot = 0;
    var qThis = Store.roleQuestion('goalsThis');
    if (qThis) {
      all.forEach(function (r) {
        (r.answers[qThis.id] || []).forEach(function (g) {
          if (!g.text.trim() || g.status === 'open') return;
          tot++; if (g.status === 'met') met++;
        });
      });
    }
    var weekAgo = Date.now() - 7 * 86400000;
    var thisWeek = all.filter(function (r) { return parseISO(r.flownAt).getTime() > weekAgo; }).length;

    var html = '<div class="stack-6 stagger">';

    html +=
      '<div class="hero">' +
        '<div class="hero__date">' + esc(new Date().toLocaleDateString('he-IL',
          { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>' +
        '<h1 class="hero__h">' + esc(all.length ? T.greetingReady : T.greetingFirst) + '</h1>' +
      '</div>';

    html +=
      '<div class="tiles">' +
        tile('blue', 'clock', T.statHours, (Math.round(hours * 10) / 10).toFixed(1),
             all.length + ' ' + T.statHoursSub) +
        tile('violet', 'layers', T.statDebriefs, String(all.length), '') +
        tile('teal', 'target', T.statGoals, tot ? Math.round(met / tot * 100) + '<small>%</small>' : '0<small>%</small>',
             tot ? met + '/' + tot : '') +
        tile('amber', 'trending', T.statStreak, String(thisWeek), T.statFlights) +
      '</div>';

    /* --- next flight --- */
    html +=
      '<section class="panel panel--amber">' +
        '<div class="panel__head">' + icon('flag') +
          '<span class="panel__t">' + esc(T.nextFlight) + '</span>' +
          (goals.length ? '<span class="panel__a mono">' + goals.length + '</span>' : '') +
        '</div>' +
        '<div class="panel__body">' +
          (goals.length
            ? '<div class="goals" style="margin-bottom:var(--s-3)">' + goals.map(function (g) {
                return '<div class="goalrow">' +
                  '<span class="goalrow__t">' + esc(g.text) + '</span>' +
                  '<button class="iconbtn" data-goaldel="' + esc(g.id) + '" aria-label="' + esc(T.remove) + '">' +
                    icon('x') + '</button></div>';
              }).join('') + '</div>'
            : '<div class="empty" style="padding:var(--s-4) 0"><h3>' + esc(T.noGoalsYet) + '</h3>' +
              '<p>' + esc(T.noGoalsHint) + '</p></div>') +
          '<div class="goaladd">' +
            '<input class="input" id="newGoal" type="text" dir="auto" enterkeyhint="done" placeholder="' + esc(T.addGoal) + '">' +
            '<button class="btn btn--ghost" data-goaladd>' + icon('plus') + '</button>' +
          '</div>' +
        '</div>' +
      '</section>';

    html +=
      '<button class="btn btn--primary btn--lg btn--block" data-new>' +
        icon('plus') + esc(T.newDebrief) +
        (Store.nextSortieNo() ? '<span class="btn__hint mono">' + esc(Store.nextSortieNo()) + '</span>' : '') +
      '</button>';

    /* --- recent --- */
    html +=
      '<section class="panel">' +
        '<div class="panel__head">' + icon('list3') +
          '<span class="panel__t">' + esc(T.recentDebriefs) + '</span>' +
          (all.length ? '<a class="panel__a" href="#/log">' + esc(T.viewAll) + ' ' + all.length + '</a>' : '') +
        '</div>' +
        '<div class="panel__body' + (recent.length ? ' panel__body--flush' : '') + '">' +
          (recent.length
            ? '<div class="list">' + recent.map(debriefRow).join('') + '</div>'
            : emptyState('layers', T.noDebriefs, T.noDebriefsHint)) +
        '</div>' +
      '</section>';

    if (!isStandalone() && !s.installDismissed) {
      html += '<div class="note note--info">' + icon('info') +
        '<div><b>' + esc(T.installTitle) + '</b><br>' + esc(T.installBody) +
        '<br><button class="btn btn--quiet" data-dismiss style="min-height:36px;padding:0;margin-top:6px;font-size:var(--t-13)">' +
        esc(T.gotIt) + '</button></div></div>';
    }

    html += '</div>';
    viewEl.innerHTML = html;

    on(viewEl, '[data-new]', 'click', function () { go('new'); });
    on(viewEl, '.drow', 'click', function (e) { go('debrief/' + e.currentTarget.dataset.id); });
    on(viewEl, '[data-dismiss]', 'click', function () { Store.set('installDismissed', true); render(); });
    on(viewEl, '[data-goaldel]', 'click', function (e) {
      Store.removeNextGoal(e.currentTarget.dataset.goaldel); haptic(); screenHome();
    });

    function addGoal() {
      var el = $('#newGoal');
      var v = el.value.trim();
      if (!v) return;
      Store.addNextGoal(v); haptic(12); screenHome();
      var again = $('#newGoal'); if (again) again.focus();
    }
    on(viewEl, '[data-goaladd]', 'click', addGoal);
    $('#newGoal').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); addGoal(); }
    });

    function tile(tone, ic, k, v, sub) {
      return '<div class="tile tile--' + tone + '">' +
        '<div class="tile__top"><span class="tile__ic">' + icon(ic) + '</span>' +
          '<span class="tile__k">' + esc(k) + '</span></div>' +
        '<div class="tile__v mono">' + v + '</div>' +
        (sub ? '<div class="tile__s">' + esc(sub) + '</div>' : '') + '</div>';
    }
  }

  /** One-line summary for a debrief row: the first answered text question. */
  function previewOf(r) {
    var qs = Store.questions();
    for (var i = 0; i < qs.length; i++) {
      var q = qs[i];
      if (q.type !== 'textarea' && q.type !== 'text') continue;
      var v = r.answers[q.id];
      if (v && String(v).trim()) return String(v).replace(/\s+/g, ' ').trim();
    }
    return '';
  }

  function badgesOf(r) {
    return Store.questions().filter(function (q) { return q.type === 'choice'; })
      .map(function (q) { return r.answers[q.id]; })
      .filter(function (v) { return v && String(v).trim(); })
      .slice(0, 2)
      .map(function (v) { return '<span class="badge">' + esc(v) + '</span>'; }).join('');
  }

  function debriefRow(r) {
    var dm = dayMonth(r.flownAt);
    var prev = previewOf(r);
    return '<button class="drow" data-id="' + esc(r.id) + '">' +
      '<span class="drow__d"><b>' + dm.d + '</b><span>' + esc(dm.m) + '</span></span>' +
      '<span class="drow__body">' +
        '<span class="drow__top">' + badgesOf(r) +
          '<span class="dim" style="font-size:var(--t-12)">' + esc(fmtDate(r.flownAt)) + '</span>' +
        '</span>' +
        (prev ? '<span class="drow__prev" dir="auto">' + esc(prev) + '</span>' : '') +
      '</span>' + icon('chevRight', { cls: 'drow__chev' }) + '</button>';
  }

  /* ============================================================ form */

  var draftTimer = null;

  function screenForm() {
    var editing = route.name === 'edit';
    var rec;

    if (editing) {
      rec = Store.get(route.param);
      if (!rec) { go('log'); return; }
      rec = JSON.parse(JSON.stringify(rec));
    } else {
      rec = Store.readDraft() || { flownAt: Store.todayISO(), answers: {} };
      if (!rec.answers) rec.answers = {};
    }

    var qs = Store.questions();
    var qThis = Store.roleQuestion('goalsThis');
    var qNext = Store.roleQuestion('goalsNext');
    var qSortie = Store.roleQuestion('sortieNo');

    // a new debrief starts with the live goal list already on the page
    if (!editing && qThis && !(rec.answers[qThis.id] || []).length) {
      rec.answers[qThis.id] = Store.nextGoals().map(function (g) {
        return { id: g.id, text: g.text, status: 'open' };
      });
    }
    if (!editing && qSortie && !rec.answers[qSortie.id]) {
      rec.answers[qSortie.id] = Store.nextSortieNo();
    }

    renderTopbar({
      title: editing ? T.editDebriefTitle : T.newDebriefTitle,
      back: true, backTo: editing ? 'debrief/' + rec.id : ''
    });

    var html =
      '<div class="formprog"><span class="formprog__fill" id="progFill"></span></div>' +
      '<div class="stack-6">' +
      '<div class="field">' +
        '<label class="field__label" for="f_date">תאריך</label>' +
        '<input class="input input--num" id="f_date" type="date" value="' + esc(rec.flownAt) + '">' +
      '</div>';

    qs.forEach(function (q) {
      html += q.type === 'goals'
        ? goalsField(q, rec.answers[q.id] || [], q.role === 'goalsThis')
        : plainField(q, rec.answers[q.id]);
    });

    html +=
      (editing ? '<button class="btn btn--danger btn--block" data-del>' + icon('trash') + esc(T.deleteDebrief) + '</button>' : '') +
      '</div>' +
      '<div class="savebar"><div class="savebar__inner">' +
        '<span class="savestate" id="saveState">' + (editing ? '' : esc(T.draftSaving)) + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" data-save>' + icon('check') +
          esc(editing ? T.saveChanges : T.save) + '</button>' +
      '</div></div>';

    viewEl.innerHTML = '<div id="formRoot">' + html + '</div>';
    var root = $('#formRoot');

    function plainField(q, val) {
      var id = 'f_' + q.id;
      var body;
      if (q.type === 'textarea') {
        body = '<textarea class="ta" id="' + id + '" data-q="' + esc(q.id) + '" dir="auto" rows="2" ' +
          'placeholder="' + esc(T.yourAnswer) + '">' + esc(val || '') + '</textarea>';
      } else if (q.type === 'choice') {
        body = '<div class="chips" data-choice="' + esc(q.id) + '">' +
          q.options.map(function (o) {
            return '<button type="button" class="chip chip--sm" data-opt="' + esc(o) + '" dir="auto" ' +
              'aria-pressed="' + (String(val) === String(o)) + '">' + esc(o) + '</button>';
          }).join('') + '</div>';
      } else if (q.type === 'number') {
        body = '<input class="input input--num" id="' + id + '" data-q="' + esc(q.id) + '" type="number" ' +
          'inputmode="decimal" step="0.1" placeholder="0.0" value="' + esc(val || '') + '">';
      } else if (q.type === 'date') {
        body = '<input class="input input--num" id="' + id + '" data-q="' + esc(q.id) + '" type="date" value="' + esc(val || '') + '">';
      } else {
        body = '<input class="input" id="' + id + '" data-q="' + esc(q.id) + '" type="text" dir="auto" ' +
          'autocomplete="off" placeholder="' + esc(T.yourAnswer) + '" value="' + esc(val || '') + '">';
      }
      return '<div class="field">' +
        '<label class="field__label" for="' + id + '">' + esc(q.label) + '</label>' +
        (q.hint ? '<span class="field__hint">' + esc(q.hint) + '</span>' : '') + body + '</div>';
    }

    function goalsField(q, list, withStatus) {
      return '<div class="field">' +
        '<span class="field__label">' + esc(q.label) + '</span>' +
        (withStatus ? '<span class="field__hint">' + esc(T.goalsThisFlightHint) + '</span>' : '') +
        '<div class="goals" data-goals="' + esc(q.id) + '" data-status="' + (withStatus ? '1' : '') + '">' +
          list.map(function (g) { return goalRow(g, withStatus); }).join('') +
        '</div>' +
        '<div class="goaladd">' +
          '<input class="input" data-goalinput="' + esc(q.id) + '" type="text" dir="auto" ' +
            'enterkeyhint="done" placeholder="' + esc(T.addGoal) + '">' +
          '<button type="button" class="btn btn--ghost" data-goalpush="' + esc(q.id) + '">' + icon('plus') + '</button>' +
        '</div></div>';
    }

    function goalRow(g, withStatus) {
      var cls = 'goalrow' + (g.status === 'met' ? ' is-met' : g.status === 'missed' ? ' is-missed' : '');
      return '<div class="' + cls + '" data-goalid="' + esc(g.id) + '" data-gs="' + esc(g.status || 'open') + '">' +
        '<span class="goalrow__t" dir="auto">' + esc(g.text) +
          (g.status === 'missed' ? '<span class="goalrow__from">' + esc(T.carriedOver) + '</span>' : '') +
        '</span>' +
        (withStatus
          ? '<span class="vx">' +
              '<button type="button" data-v="met" aria-label="' + esc(T.goalMet) + '" aria-pressed="' +
                (g.status === 'met') + '">' + icon('check') + '</button>' +
              '<button type="button" data-v="missed" aria-label="' + esc(T.goalMissed) + '" aria-pressed="' +
                (g.status === 'missed') + '">' + icon('x') + '</button>' +
            '</span>'
          : '<button type="button" class="iconbtn" data-goalx aria-label="' + esc(T.remove) + '">' + icon('x') + '</button>') +
      '</div>';
    }

    function collect() {
      var out = { id: rec.id, flownAt: $('#f_date').value || Store.todayISO(),
                  answers: {}, createdAt: rec.createdAt };
      qs.forEach(function (q) {
        if (q.type === 'goals') {
          out.answers[q.id] = $$('[data-goals="' + q.id + '"] .goalrow').map(function (row) {
            return { id: row.dataset.goalid, text: $('.goalrow__t', row).firstChild.textContent,
                     status: row.dataset.gs || 'open' };
          });
        } else if (q.type === 'choice') {
          var picked = $('[data-choice="' + q.id + '"] .chip[aria-pressed="true"]');
          out.answers[q.id] = picked ? picked.dataset.opt : '';
        } else {
          var el = $('[data-q="' + q.id + '"]');
          out.answers[q.id] = el ? el.value : '';
        }
      });
      // answers to questions he has since deleted stay on the record
      Object.keys(rec.answers).forEach(function (k) {
        if (out.answers[k] === undefined) out.answers[k] = rec.answers[k];
      });
      return out;
    }

    function progress() {
      var d = collect();
      var filled = 0, total = 0;
      qs.forEach(function (q) {
        total++;
        var v = d.answers[q.id];
        if (q.type === 'goals') { if ((v || []).some(function (g) { return g.text.trim(); })) filled++; }
        else if (String(v == null ? '' : v).trim()) filled++;
      });
      $('#progFill').style.width = Math.round(filled / Math.max(1, total) * 100) + '%';
    }

    function touched() {
      progress();
      if (editing) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        Store.saveDraft(collect());
        var el = $('#saveState');
        if (el) {
          el.textContent = T.draftSaved;
          setTimeout(function () { if (el.isConnected) el.textContent = T.draftSaving; }, 1400);
        }
      }, 500);
    }

    root.addEventListener('input', function (e) {
      if (e.target.classList.contains('ta')) autosize(e.target);
      if (e.target.matches('.ta, .input')) touched();
    });

    root.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-choice] .chip');
      if (chip) {
        var wrap = chip.closest('[data-choice]');
        var was = chip.getAttribute('aria-pressed') === 'true';
        $$('.chip', wrap).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        chip.setAttribute('aria-pressed', String(!was));
        haptic(); touched();
        return;
      }

      var vx = e.target.closest('.vx button');
      if (vx) {
        var row = vx.closest('.goalrow');
        var want = vx.dataset.v;
        var next = row.dataset.gs === want ? 'open' : want;
        row.dataset.gs = next;
        row.classList.toggle('is-met', next === 'met');
        row.classList.toggle('is-missed', next === 'missed');
        $$('.vx button', row).forEach(function (b) {
          b.setAttribute('aria-pressed', String(b.dataset.v === next));
        });
        haptic(next === 'met' ? 12 : 6);
        touched();
        return;
      }

      if (e.target.closest('[data-goalx]')) {
        e.target.closest('.goalrow').remove(); touched(); return;
      }

      var push = e.target.closest('[data-goalpush]');
      if (push) { pushGoal(push.dataset.goalpush); }
    });

    function pushGoal(qid) {
      var input = $('[data-goalinput="' + qid + '"]');
      var v = input.value.trim();
      if (!v) return;
      var withStatus = $('[data-goals="' + qid + '"]').dataset.status === '1';
      $('[data-goals="' + qid + '"]').insertAdjacentHTML('beforeend',
        goalRow(Store.normalizeGoal({ text: v }), withStatus));
      input.value = ''; input.focus();
      haptic(); touched();
    }

    $$('[data-goalinput]', root).forEach(function (el) {
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); pushGoal(el.dataset.goalinput); }
      });
    });

    on(viewEl, '[data-save]', 'click', function () {
      var d = collect();
      var any = qs.some(function (q) {
        var v = d.answers[q.id];
        return q.type === 'goals'
          ? (v || []).some(function (g) { return g.text.trim(); })
          : String(v == null ? '' : v).trim();
      });
      if (!any) { toast(T.needSomething, 'alert'); return; }
      Store.save(d).then(function (saved) {
        Store.clearDraft(); haptic(16);
        toast(editing ? T.updatedToast : T.savedToast);
        go('debrief/' + saved.id);
      });
    });

    on(viewEl, '[data-del]', 'click', function () {
      confirmSheet({
        title: T.confirmDeleteDebrief(fmtDateLong(rec.flownAt)), text: T.confirmDeleteBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () {
          Store.remove(rec.id).then(function () { toast(T.deletedToast, 'trash'); go('log'); });
        }
      });
    });

    progress();
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 48) + 'px';
  }
  function autosizeAll() { $$('.ta', viewEl).forEach(autosize); }

  /* ============================================================ log */

  var logQuery = '', logFilter = '';

  function screenLog() {
    renderTopbar({
      title: T.logTitle, sub: Store.count() ? String(Store.count()) : '',
      actions: [{ id: 'new', ic: 'plus', label: T.newDebrief, accent: true, run: function () { go('new'); } }]
    });

    // filter chips come from the first choice question he kept
    var qFilter = Store.questions().filter(function (q) { return q.type === 'choice'; })[0];
    var opts = [];
    if (qFilter) {
      opts = qFilter.options.slice();
      Store.all().forEach(function (r) {
        var v = r.answers[qFilter.id];
        if (v && opts.indexOf(v) === -1) opts.push(v);
      });
    }

    viewEl.innerHTML =
      '<div class="stack-4" id="logRoot">' +
        '<div class="search">' + icon('search') +
          '<input class="input" id="q" type="search" dir="auto" autocomplete="off" ' +
            'placeholder="' + esc(T.search) + '" value="' + esc(logQuery) + '">' +
        '</div>' +
        (opts.length
          ? '<div class="chips" id="logChips">' +
              '<button class="chip chip--sm" data-f="" aria-pressed="' + (!logFilter) + '">' + esc(T.all) + '</button>' +
              opts.map(function (o) {
                return '<button class="chip chip--sm" data-f="' + esc(o) + '" dir="auto" aria-pressed="' +
                  (logFilter === o) + '">' + esc(o) + '</button>';
              }).join('') + '</div>'
          : '') +
        '<div id="logResults"></div>' +
      '</div>';

    function paint() {
      var rows = Store.search(logQuery).filter(function (r) {
        return !logFilter || (qFilter && r.answers[qFilter.id] === logFilter);
      });
      $('#logResults').innerHTML = rows.length
        ? '<div class="panel"><div class="list">' + rows.map(debriefRow).join('') + '</div></div>'
        : emptyState('search', Store.count() ? T.noMatches : T.noDebriefs,
                     Store.count() ? T.noMatchesHint : T.noDebriefsHint);
    }
    paint();

    $('#q').addEventListener('input', function (e) { logQuery = e.target.value; paint(); });
    $('#logRoot').addEventListener('click', function (e) {
      var chip = e.target.closest('#logChips .chip');
      if (chip) {
        logFilter = chip.dataset.f;
        $$('#logChips .chip').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.dataset.f === logFilter));
        });
        paint(); return;
      }
      var row = e.target.closest('.drow');
      if (row) go('debrief/' + row.dataset.id);
    });
  }

  /* ============================================================ detail */

  function screenDetail() {
    var r = Store.get(route.param);
    if (!r) { go('log'); return; }

    renderTopbar({
      title: fmtDate(r.flownAt), back: true, backTo: 'log',
      actions: [
        { id: 'share', ic: 'share', label: T.shareDebrief, run: function () {
          var text = Store.asText(r, fmtDateLong);
          if (navigator.share) navigator.share({ title: T.app, text: text }).catch(function () {});
          else if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(T.copiedToast); });
        } },
        { id: 'edit', ic: 'pencil', label: T.edit, accent: true, run: function () { go('edit/' + r.id); } }
      ]
    });

    // show every question that is live, plus archived ones he already answered
    var qs = Store.questions(true).filter(function (q) {
      return !q.archived || hasAnswer(q, r.answers[q.id]);
    });

    viewEl.innerHTML =
      '<div class="stack-6 stagger">' +
        '<div class="dhero">' +
          '<div class="eyebrow">' + esc(T.debriefOn) + '</div>' +
          '<div class="dhero__d">' + esc(fmtDateLong(r.flownAt)) + '</div>' +
          '<div class="dhero__meta">' + badgesOf(r) + '</div>' +
        '</div>' +
        '<section class="card card--pad">' + qs.map(function (q) {
          return answerBlock(q, r.answers[q.id]);
        }).join('') + '</section>' +
        '<div class="stack">' +
          '<button class="btn btn--ghost btn--block" data-copy>' + icon('copy') + esc(T.copyText) + '</button>' +
          '<button class="btn btn--quiet btn--block" data-del>' + icon('trash') + esc(T.deleteDebrief) + '</button>' +
        '</div>' +
      '</div>';

    on(viewEl, '[data-copy]', 'click', function () {
      var text = Store.asText(r, fmtDateLong);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { toast(T.copiedToast); });
    });
    on(viewEl, '[data-del]', 'click', function () {
      confirmSheet({
        title: T.confirmDeleteDebrief(fmtDateLong(r.flownAt)), text: T.confirmDeleteBody,
        confirmLabel: T.delete, danger: true, icon: 'trash',
        onConfirm: function () {
          Store.remove(r.id).then(function () { toast(T.deletedToast, 'trash'); go('log'); });
        }
      });
    });

    function hasAnswer(q, v) {
      if (q.type === 'goals') return (v || []).some(function (g) { return g.text.trim(); });
      return v != null && String(v).trim() !== '';
    }

    function answerBlock(q, v) {
      var cls = 'answer' + (q.archived ? ' answer--archived' : '');
      if (q.type === 'goals') {
        var list = (v || []).filter(function (g) { return g.text.trim(); });
        return '<div class="' + cls + '"><div class="answer__q">' + esc(q.label) + '</div>' +
          (list.length
            ? '<div class="goals" style="margin-top:var(--s-2)">' + list.map(function (g) {
                return '<div class="goalrow' + (g.status === 'met' ? ' is-met' : g.status === 'missed' ? ' is-missed' : '') + '">' +
                  '<span class="goalrow__t" dir="auto">' + esc(g.text) + '</span>' +
                  '<span class="vx"><button type="button" disabled data-v="' + esc(g.status) + '" ' +
                    'aria-pressed="true" tabindex="-1">' +
                    icon(g.status === 'met' ? 'check' : g.status === 'missed' ? 'x' : 'chevDown') +
                  '</button></span></div>';
              }).join('') + '</div>'
            : '<div class="answer__a is-empty">' + esc(T.notAnswered) + '</div>') +
        '</div>';
      }
      var txt = v == null ? '' : String(v);
      return '<div class="' + cls + '"><div class="answer__q">' + esc(q.label) + '</div>' +
        '<div class="answer__a' + (txt.trim() ? '' : ' is-empty') + '" dir="auto">' +
          esc(txt.trim() ? txt : T.notAnswered) + '</div></div>';
    }
  }

  /* ============================================================ patterns */

  var tlField = null;

  function screenPatterns() {
    renderTopbar({ title: T.patternsTitle });
    var all = Store.all();
    if (!all.length) {
      viewEl.innerHTML = emptyState('trending', T.patternsEmpty, T.patternsEmptyHint);
      return;
    }

    var qThis = Store.roleQuestion('goalsThis');
    var met = 0, tot = 0, missCount = {};
    if (qThis) {
      all.forEach(function (r) {
        (r.answers[qThis.id] || []).forEach(function (g) {
          if (!g.text.trim()) return;
          if (g.status === 'met') { met++; tot++; }
          else if (g.status === 'missed') {
            tot++;
            missCount[g.text.trim()] = (missCount[g.text.trim()] || 0) + 1;
          }
        });
      });
    }
    var follow = tot ? Math.round(met / tot * 100) : 0;

    var weeks = [];
    for (var w = 7; w >= 0; w--) {
      var end = new Date(); end.setHours(23, 59, 59, 999); end.setDate(end.getDate() - w * 7);
      var start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      weeks.push({
        n: all.filter(function (r) {
          var t = parseISO(r.flownAt).getTime();
          return t >= start.getTime() && t <= end.getTime();
        }).length,
        label: String(start.getDate())
      });
    }
    var wMax = Math.max(1, Math.max.apply(null, weeks.map(function (x) { return x.n; })));

    var choiceQs = Store.questions().filter(function (q) { return q.type === 'choice'; });
    var textQs = Store.questions().filter(function (q) { return q.type === 'textarea' || q.type === 'text'; });
    if (!tlField || !textQs.some(function (q) { return q.id === tlField; })) {
      tlField = textQs.length ? textQs[0].id : null;
    }

    var missRows = Object.keys(missCount)
      .sort(function (a, b) { return missCount[b] - missCount[a]; }).slice(0, 6);
    var missMax = missRows.length ? missCount[missRows[0]] : 1;

    var html = '<div class="stack-6 stagger">';

    html += '<div class="tiles">' +
      '<div class="tile tile--violet"><div class="tile__top"><span class="tile__ic">' + icon('layers') +
        '</span><span class="tile__k">' + esc(T.statDebriefs) + '</span></div>' +
        '<div class="tile__v mono">' + all.length + '</div></div>' +
      '<div class="tile tile--teal"><div class="tile__top"><span class="tile__ic">' + icon('target') +
        '</span><span class="tile__k">' + esc(T.goalFollowThrough) + '</span></div>' +
        '<div class="tile__v mono">' + follow + '<small>%</small></div>' +
        '<div class="tile__s">' + met + '/' + tot + '</div></div>' +
      '</div>';

    html += '<section class="panel"><div class="panel__head">' + icon('trending') +
      '<span class="panel__t">' + esc(T.debriefsPerWeek) + '</span></div><div class="panel__body">' +
      '<div class="weeks">' + weeks.map(function (x, i) {
        return '<div class="week"><div class="week__bar' + (x.n ? '' : ' is-zero') + '" style="height:' +
          Math.max(4, Math.round(x.n / wMax * 56)) + 'px;animation-delay:' + (i * 30) + 'ms"></div>' +
          '<div class="week__l">' + esc(x.label) + '</div></div>';
      }).join('') + '</div>' +
      '<p class="dim" style="font-size:var(--t-11);margin-top:var(--s-2);text-align:center">' +
        esc(T.lastWeeks) + '</p></div></section>';

    choiceQs.forEach(function (q) {
      var counts = {};
      all.forEach(function (r) {
        var v = r.answers[q.id];
        if (v && String(v).trim()) counts[v] = (counts[v] || 0) + 1;
      });
      var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
      if (!keys.length) return;
      var max = counts[keys[0]], total = keys.reduce(function (s, k) { return s + counts[k]; }, 0);
      html += '<section class="panel"><div class="panel__head">' + icon('filter') +
        '<span class="panel__t">' + esc(q.label) + '</span></div><div class="panel__body"><div class="bars">' +
        keys.map(function (k, i) { return bar(k, counts[k], max, total, i); }).join('') +
        '</div></div></section>';
    });

    if (missRows.length) {
      html += '<section class="panel"><div class="panel__head">' + icon('alert') +
        '<span class="panel__t">' + esc(T.repeatedGoals) + '</span></div><div class="panel__body"><div class="bars">' +
        missRows.map(function (k, i) { return bar(k, missCount[k], missMax, all.length, i, true); }).join('') +
        '</div></div></section>';
    }

    if (tlField) {
      html += '<section class="stack">' +
        '<h2 class="h-sect">' + esc(T.readAcross) + '</h2>' +
        '<div class="seg">' + textQs.slice(0, 4).map(function (q) {
          return '<button data-tlf="' + esc(q.id) + '" aria-pressed="' + (tlField === q.id) + '">' +
            esc(q.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="card card--pad"><div class="tl">' + (function () {
          var rows = all.filter(function (r) { return String(r.answers[tlField] || '').trim(); }).slice(0, 20);
          if (!rows.length) return '<p class="dim" style="font-size:var(--t-13)">' + esc(T.nothingInField) + '</p>';
          return rows.map(function (r) {
            return '<div class="tlrow"><div class="tlrow__m">' + esc(fmtDate(r.flownAt)) + '</div>' +
              '<div class="tlrow__t" dir="auto">' + esc(r.answers[tlField]) + '</div></div>';
          }).join('');
        })() + '</div></div></section>';
    }

    html += '</div>';
    viewEl.innerHTML = html;

    on(viewEl, '[data-tlf]', 'click', function (e) { tlField = e.currentTarget.dataset.tlf; screenPatterns(); });

    function bar(label, n, max, total, i, rose) {
      return '<div class="bar"><div class="bar__top">' +
        '<span class="bar__label" dir="auto">' + esc(label) + '</span>' +
        '<span class="bar__val">' + n + (total ? ' · ' + Math.round(n / total * 100) + '%' : '') + '</span></div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' + Math.round(n / max * 100) +
          '%;animation-delay:' + (i * 40) + 'ms' + (rose ? ';background:var(--rose)' : '') + '"></div></div></div>';
    }
  }

  /* ============================================================ settings */

  function screenSettings() {
    renderTopbar({ title: T.settingsTitle });
    var s = Store.settings();
    var since = daysSince(s.lastExport);
    var qs = Store.questions();

    viewEl.innerHTML =
      '<div class="stack-6 stagger">' +

      (since === null || since >= 14
        ? '<div class="note">' + icon('alert') + '<div><b>' + esc(T.backupTitle) + '</b><br>' +
          esc(since === null ? T.backupNever : T.backupDays(since)) + ' ' + esc(T.backupBody) + '</div></div>'
        : '') +

      '<section class="stack"><h2 class="h-sect">' + esc(T.appearance) + '</h2>' +
        '<div class="seg">' +
          [['dark', T.themeDark], ['light', T.themeLight], ['auto', T.themeAuto]].map(function (t) {
            return '<button data-theme-set="' + t[0] + '" aria-pressed="' + (s.theme === t[0]) + '">' +
              esc(t[1]) + '</button>';
          }).join('') + '</div></section>' +

      '<section class="stack">' +
        '<h2 class="h-sect">' + esc(T.questions) + '</h2>' +
        '<p class="dim" style="font-size:var(--t-12);line-height:1.6;margin-top:-4px">' + esc(T.questionsHint) + '</p>' +
        '<div class="group">' + qs.map(function (q, i) {
          var locked = Store.isProtected(q);
          return '<div class="qrow' + (locked ? ' qrow--sys' : '') + '" data-qid="' + esc(q.id) + '">' +
            '<span class="qrow__b">' +
              '<span class="qrow__t">' + esc(q.label) + '</span>' +
              '<span class="qrow__s">' + esc(typeLabel(q.type)) +
                (q.options.length ? ' · ' + esc(q.options.join(' / ')) : '') + '</span>' +
            '</span>' +
            '<span class="qrow__acts">' +
              '<button data-qmove="-1" aria-label="' + esc(T.moveUp) + '"' + (i === 0 ? ' disabled' : '') + '>' + icon('chevUp') + '</button>' +
              '<button data-qmove="1" aria-label="' + esc(T.moveDown) + '"' + (i === qs.length - 1 ? ' disabled' : '') + '>' + icon('chevDown') + '</button>' +
              '<button data-qedit aria-label="' + esc(T.editQuestion) + '">' + icon('pencil') + '</button>' +
              (locked ? '' : '<button data-qdel aria-label="' + esc(T.delete) + '">' + icon('trash') + '</button>') +
            '</span></div>';
        }).join('') +
        '<button class="item" data-qadd><span class="item__ic">' + icon('plus') + '</span>' +
          '<span class="item__b"><span class="item__t">' + esc(T.addQuestion) + '</span></span></button>' +
        '</div>' +
        '<button class="btn btn--quiet btn--block" data-qreset style="min-height:40px;font-size:var(--t-13)">' +
          esc(T.restoreDefaults) + '</button>' +
      '</section>' +

      '<section class="stack"><h2 class="h-sect">' + esc(T.yourData) + '</h2><div class="group">' +
        item('download', T.exportCsv, T.exportCsvSub, 'export-csv') +
        item('download', T.exportJson, T.exportJsonSub, 'export-json') +
        item('upload', T.importJson, T.importJsonSub, 'import-json') +
      '</div></section>' +

      '<section class="stack"><h2 class="h-sect">' + esc(T.privacy) + '</h2><div class="group">' +
        item('lock', s.pin ? T.changeCode : T.setCode,
             Store.cryptoReady() ? (s.pin ? T.codeOn : T.codeOff) : T.needsHttps, 'pin-set') +
        (s.pin ? item('x', T.removeCode, '', 'pin-off') : '') +
      '</div>' +
      '<p class="dim" style="font-size:var(--t-12);line-height:1.6">' + esc(T.privacyNote) + '</p></section>' +

      '<section class="stack"><div class="group">' +
        '<button class="item item--danger" data-clear><span class="item__ic">' + icon('trash') + '</span>' +
        '<span class="item__b"><span class="item__t">' + esc(T.deleteAll) + '</span>' +
        '<span class="item__s">' + esc(T.cannotUndo) + '</span></span></button>' +
      '</div></section>' +

      '<p class="dim" style="font-size:var(--t-11);text-align:center">' + esc(T.app) + ' · ' +
        esc(T.storageNote) + ' · ' + Store.count() + ' ' + esc(T.onThisDevice) + '</p>' +
      '</div>' +
      '<input type="file" id="importFile" accept=".json,application/json" hidden>';

    function item(ic, title, sub, act) {
      return '<button class="item" data-act="' + act + '"><span class="item__ic">' + icon(ic) + '</span>' +
        '<span class="item__b"><span class="item__t">' + esc(title) + '</span>' +
        (sub ? '<span class="item__s">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="item__r">' + icon('chevRight', { cls: 'chev' }) + '</span></button>';
    }

    on(viewEl, '[data-theme-set]', 'click', function (e) {
      Store.set('theme', e.currentTarget.dataset.themeSet); applyTheme(); screenSettings();
    });

    on(viewEl, '[data-qmove]', 'click', function (e) {
      var row = e.currentTarget.closest('.qrow');
      Store.moveQuestion(row.dataset.qid, +e.currentTarget.dataset.qmove);
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
        title: T.restoreDefaults, text: T.confirmDeleteQuestionBody,
        confirmLabel: T.confirm,
        onConfirm: function () { Store.resetQuestions(); screenSettings(); }
      });
    });

    on(viewEl, '[data-act]', 'click', function (e) {
      var act = e.currentTarget.dataset.act;
      if (act === 'export-csv') {
        if (!Store.count()) return toast(T.noDebriefs, 'alert');
        saveFile('tahkir-' + stamp() + '.csv', Store.toCSV(), 'text/csv');
        setTimeout(screenSettings, 400);
      }
      if (act === 'export-json') {
        if (!Store.count()) return toast(T.noDebriefs, 'alert');
        saveFile('tahkir-backup-' + stamp() + '.json', Store.toJSON(), 'application/json');
        setTimeout(screenSettings, 400);
      }
      if (act === 'import-json') $('#importFile').click();
      if (act === 'pin-set') openLock('set', T.chooseCode);
      if (act === 'pin-off') {
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
      fr.readAsText(f);
      e.target.value = '';
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
    return ({ text: T.typeText, textarea: T.typeTextarea, choice: T.typeChoice,
              number: T.typeNumber, date: T.typeDate, goals: T.typeGoals })[t] || t;
  }

  /** Add or edit one question. This is what keeps Yish out of the loop. */
  function questionSheet(q) {
    var isNew = !q;
    var cur = q || { label: '', type: 'text', options: [], hint: '', role: null };

    openSheet({
      title: isNew ? T.addQuestion : T.editQuestion,
      body:
        '<div class="stack-4">' +
          '<div class="field"><label class="field__label" for="qLabel">' + esc(T.questionLabel) + '</label>' +
            '<input class="input" id="qLabel" type="text" dir="auto" value="' + esc(cur.label) + '"></div>' +
          (Store.isProtected(cur)
            ? '<p class="dim" style="font-size:var(--t-12)">' + esc(T.systemQuestion) + '</p>'
            : '<div class="field"><span class="field__label">' + esc(T.questionType) + '</span>' +
              '<div class="chips" id="qType">' +
                ['text', 'textarea', 'choice', 'number', 'date'].map(function (t) {
                  return '<button type="button" class="chip chip--sm" data-t="' + t + '" aria-pressed="' +
                    (cur.type === t) + '">' + esc(typeLabel(t)) + '</button>';
                }).join('') + '</div></div>') +
          '<div class="field" id="qOptWrap"' + (cur.type === 'choice' ? '' : ' hidden') + '>' +
            '<label class="field__label" for="qOpts">' + esc(T.questionOptions) + '</label>' +
            '<span class="field__hint">' + esc(T.questionOptionsHint) + '</span>' +
            '<textarea class="ta" id="qOpts" dir="auto" rows="4">' + esc(cur.options.join('\n')) + '</textarea>' +
          '</div>' +
        '</div>',
      actions: [
        { label: isNew ? T.add : T.save, cls: 'btn--primary', icon: 'check', keepOpen: true, run: function (sh) {
          var label = $('#qLabel', sh).value.trim();
          if (!label) { $('#qLabel', sh).focus(); return; }
          var typeBtn = $('#qType .chip[aria-pressed="true"]', sh);
          var type = Store.isProtected(cur) ? cur.type : (typeBtn ? typeBtn.dataset.t : 'text');
          var options = $('#qOpts', sh).value.split('\n').map(function (o) { return o.trim(); })
            .filter(Boolean);
          if (isNew) Store.addQuestion({ label: label, type: type, options: options });
          else Store.updateQuestion(cur.id, { label: label, type: type, options: options });
          sh.close(); screenSettings();
          toast(isNew ? T.savedToast : T.updatedToast);
        } },
        { label: T.cancel, cls: 'btn--quiet' }
      ],
      onOpen: function (sh) {
        on(sh, '#qType .chip', 'click', function (e) {
          $$('#qType .chip', sh).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
          e.currentTarget.setAttribute('aria-pressed', 'true');
          $('#qOptWrap', sh).hidden = e.currentTarget.dataset.t !== 'choice';
        });
        setTimeout(function () { $('#qLabel', sh).focus(); }, 120);
      }
    });
  }

  /* ============================================================ lock */

  function renderKeypad() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'del'];
    $('#keypad').innerHTML = keys.map(function (k) {
      if (k === 'del') return '<button class="key key--fn" data-key="del" aria-label="מחיקה">' + icon('delete') + '</button>';
      if (k === 'cancel') return '<button class="key key--fn" data-key="cancel"></button>';
      return '<button class="key" data-key="' + k + '">' + k + '</button>';
    }).join('');
    on(lockEl, '[data-key]', 'click', function (e) { pinKey(e.currentTarget.dataset.key); });
  }
  function drawPin() {
    $('#pinDots').innerHTML = [0, 1, 2, 3].map(function (i) {
      return '<i class="' + (i < pinBuffer.length ? 'is-on' : '') + '"></i>';
    }).join('');
  }
  function lockHint(text, err) {
    var h = $('#lockHint');
    h.textContent = text;
    h.classList.toggle('is-err', !!err);
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
    var entered = pinBuffer;
    pinBuffer = '';
    if (pinMode === 'unlock') {
      Store.checkPin(entered).then(function (ok) {
        if (ok) { closeLock(); return; }
        drawPin(); lockHint(T.wrongCode, true); haptic(40);
      });
      return;
    }
    if (pinMode === 'set') { pinFirst = entered; pinMode = 'confirm'; drawPin(); lockHint(T.repeatCode); return; }
    if (pinMode === 'confirm') {
      if (entered !== pinFirst) {
        pinMode = 'set'; pinFirst = ''; drawPin(); lockHint(T.codeMismatch, true); haptic(40); return;
      }
      Store.setPin(entered).then(function (ok) {
        closeLock();
        toast(ok ? T.codeOnToast : T.codeFailed, ok ? 'lock' : 'alert');
        if (route.name === 'settings') screenSettings();
      });
    }
  }
  function openLock(mode, hint) {
    pinMode = mode; pinBuffer = ''; pinFirst = '';
    lockEl.hidden = false;
    appEl.hidden = mode === 'unlock';
    renderKeypad(); drawPin(); lockHint(hint || T.enterCode);
    var cancel = $('[data-key="cancel"]', lockEl);
    if (cancel) cancel.textContent = mode === 'unlock' ? '' : T.cancel;
  }
  function closeLock() { lockEl.hidden = true; appEl.hidden = false; }

  /* ============================================================ boot */

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

      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})(window);
