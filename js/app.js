/* Sortie — router, screens, interactions.
 *
 * Screens: Home, Debrief form (new / edit), Log, Sortie detail, Patterns, Settings.
 * Everything renders from Store's in-memory cache, so screen swaps are instant.
 */
(function (global) {
  'use strict';

  var appEl, viewEl, topbarEl, tabbarEl, toasterEl, sheetEl, lockEl;
  var route = { name: 'home', param: null };
  var navCount = 0;
  var pinBuffer = '';
  var pinMode = 'unlock';   // unlock | set | confirm | verify-off
  var pinFirst = '';

  /* ============================================================== helpers */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function on(root, sel, ev, fn) {
    $$(sel, root).forEach(function (n) { n.addEventListener(ev, fn); });
  }

  /** "2026-08-06" -> a local-midnight Date. Never let the browser read it as UTC. */
  function parseISO(iso) {
    var p = String(iso || '').split('-');
    return new Date(+p[0], +p[1] - 1, +p[2] || 1);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = parseISO(iso);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff > 1 && diff < 7) return diff + ' days ago';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
      (d.getFullYear() !== today.getFullYear() ? " '" + String(d.getFullYear()).slice(2) : '');
  }

  function fmtDateLong(iso) {
    if (!iso) return '';
    return parseISO(iso).toLocaleDateString(undefined, {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function daysSince(ts) {
    if (!ts) return null;
    return Math.floor((Date.now() - ts) / 86400000);
  }

  /** True when the first strong character is Hebrew or Arabic, so the row can
   *  mirror and put its marker on the reading-start side. */
  function isRTL(s) {
    var m = /[A-Za-z֐-׿؀-ۿ܀-ݏ]/.exec(String(s || ''));
    return !!m && /[֐-׿؀-ۿ܀-ݏ]/.test(m[0]);
  }

  function isStandalone() {
    return global.navigator.standalone === true ||
      global.matchMedia('(display-mode: standalone)').matches;
  }

  function haptic(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms || 8); } catch (e) {} }
  }

  /* --------------------------------------------------------------- toasts */

  function toast(msg, iconName) {
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = (iconName ? icon(iconName) : icon('checkCircle')) + '<span>' + esc(msg) + '</span>';
    toasterEl.appendChild(t);
    setTimeout(function () {
      t.classList.add('is-out');
      setTimeout(function () { t.remove(); }, 200);
    }, 2600);
  }

  /* --------------------------------------------------------------- sheets */

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

  function confirmSheet(opts) {
    openSheet({
      title: opts.title,
      text: opts.text,
      actions: [
        { label: opts.confirmLabel || 'Confirm', cls: opts.danger ? 'btn--danger' : 'btn--primary',
          icon: opts.icon, run: opts.onConfirm },
        { label: 'Cancel', cls: 'btn--quiet' }
      ]
    });
  }

  /* ---------------------------------------------------------------- theme */

  function applyTheme() {
    var pref = Store.settings().theme;
    var mode = pref;
    if (pref === 'auto') {
      mode = global.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', mode);
  }

  /* ================================================================ files */

  function saveFile(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });

    if (navigator.canShare && navigator.share) {
      try {
        var file = new File([blob], name, { type: mime });
        if (navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: name })
            .then(function () { Store.markExported(); })
            .catch(function () {});
          return;
        }
      } catch (e) { /* fall through to download */ }
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
    return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  }

  /* =============================================================== router */

  function parseHash() {
    var h = (location.hash || '#/').replace(/^#\/?/, '');
    var seg = h.split('/');
    var name = seg[0] || 'home';
    return { name: name, param: seg[1] ? decodeURIComponent(seg[1]) : null };
  }

  function go(path) { location.hash = '#/' + path; }

  function navigate() {
    var next = parseHash();
    var valid = ['home', 'new', 'edit', 'log', 'sortie', 'patterns', 'settings'];
    if (valid.indexOf(next.name) === -1) next = { name: 'home', param: null };
    route = next;
    navCount++;
    render();
    global.scrollTo(0, 0);
    viewEl.focus({ preventScroll: true });
  }

  /* =============================================================== chrome */

  var TABS = [
    { id: 'home',     label: 'Home',     ic: 'horizon'  },
    { id: 'log',      label: 'Log',      ic: 'layers'   },
    { id: 'patterns', label: 'Patterns', ic: 'trending' },
    { id: 'settings', label: 'Settings', ic: 'settings' }
  ];

  function renderTabs() {
    var current = route.name;
    if (current === 'sortie') current = 'log';
    tabbarEl.innerHTML = TABS.map(function (t) {
      return '<a class="tab" href="#/' + (t.id === 'home' ? '' : t.id) + '"' +
        (t.id === current ? ' aria-current="page"' : '') + '>' +
        icon(t.ic) + '<span>' + t.label + '</span></a>';
    }).join('');
  }

  function renderTopbar(cfg) {
    topbarEl.innerHTML =
      (cfg.back
        ? '<button class="iconbtn" data-back aria-label="Back">' + icon('chevLeft') + '</button>'
        : '') +
      '<div class="topbar__title">' + esc(cfg.title || '') +
        (cfg.sub ? ' <span class="topbar__sub">' + esc(cfg.sub) + '</span>' : '') +
      '</div>' +
      (cfg.actions || []).map(function (a) {
        return '<button class="iconbtn' + (a.accent ? ' iconbtn--accent' : '') +
          '" data-topact="' + a.id + '" aria-label="' + esc(a.label) + '">' + icon(a.ic) + '</button>';
      }).join('');

    on(topbarEl, '[data-back]', 'click', function () {
      // Prefer real history so back lands where the user actually came from.
      // If this screen was the app's entry point there is nothing to go back
      // to, so fall through to a sensible parent screen.
      if (navCount > 1) history.back();
      else go(cfg.backTo || '');
    });
    on(topbarEl, '[data-topact]', 'click', function (e) {
      var a = (cfg.actions || []).filter(function (x) { return x.id === e.currentTarget.dataset.topact; })[0];
      a && a.run && a.run();
    });
  }

  function render() {
    var fn = ({
      home: screenHome, new: screenForm, edit: screenForm,
      log: screenLog, sortie: screenDetail,
      patterns: screenPatterns, settings: screenSettings
    })[route.name];

    document.body.dataset.route = route.name;

    // the form owns the bottom of the screen, so the tab bar steps aside
    var formish = route.name === 'new' || route.name === 'edit';
    tabbarEl.hidden = formish;
    viewEl.classList.toggle('view--noTabs', formish);
    if (!formish) renderTabs();

    fn();
    autosizeAll();
  }

  /* ============================================================ screen: home */

  function screenHome() {
    var last = Store.latest();
    var recent = Store.all().slice(0, 5);
    var s = Store.settings();

    renderTopbar({
      title: 'Sortie',
      actions: [{ id: 'new', ic: 'plus', label: 'New debrief', accent: true,
        run: function () { go('new'); } }]
    });

    var html = '<div class="stack-6 stagger">';

    /* hero */
    html +=
      '<div class="hero">' +
        '<div class="hero__date">' + esc(new Date().toLocaleDateString(undefined,
          { weekday: 'long', day: 'numeric', month: 'long' })) + '</div>' +
        '<h1 class="hero__h">' + (last ? 'Ready to fly.' : 'First debrief.') + '</h1>' +
      '</div>';

    /* carry-forward goals — what you set last time, to fly on today */
    if (last) {
      var goals = last.targetGoals.filter(function (g) { return g.text.trim(); });
      if (goals.length) {
        var done = goals.filter(function (g) { return g.done; }).length;
        html +=
          '<section class="carry">' +
            '<div class="carry__head">' +
              '<span class="carry__label">Goals for this flight</span>' +
              '<span class="carry__from">from sortie ' + esc(last.sortieNo || '—') + '</span>' +
            '</div>' +
            '<h2 class="carry__title">Target Goals For Next Sortie</h2>' +
            '<div>' + goals.map(function (g, i) {
              return '<button class="goal' + (isRTL(g.text) ? ' is-rtl' : '') +
                '" data-goal="' + i + '" aria-pressed="' + (!!g.done) + '">' +
                '<span class="goal__box">' + icon('check') + '</span>' +
                '<span class="goal__text bidi" dir="auto">' + esc(g.text) + '</span>' +
              '</button>';
            }).join('') + '</div>' +
            '<div class="carry__progress">' +
              '<span class="mono" data-goalcount>' + done + '/' + goals.length + '</span>' +
              '<span class="meter"><span class="meter__fill" style="width:' +
                Math.round(done / goals.length * 100) + '%"></span></span>' +
              '<span data-goalnote>' + (done === goals.length ? 'All hit' : 'Tap when you hit one') + '</span>' +
            '</div>' +
          '</section>';
      }
    }

    /* primary action */
    html +=
      '<button class="btn btn--primary btn--lg btn--block" data-new>' +
        icon('plus') + 'New debrief' +
        (Store.nextSortieNo()
          ? '<span class="btn__hint mono">' + esc(Store.nextSortieNo()) + '</span>'
          : '') +
      '</button>';

    /* recent */
    if (recent.length) {
      html +=
        '<section class="stack">' +
          '<div class="row">' +
            '<h2 class="h-sect">Recent</h2><span class="spacer"></span>' +
            '<a class="dim" href="#/log" style="font-size:var(--t-13);font-weight:600;text-decoration:none">All ' +
              Store.count() + '</a>' +
          '</div>' +
          '<div class="list">' + recent.map(sortieRow).join('') + '</div>' +
        '</section>';
    } else {
      html += emptyState('horizon', 'No sorties logged yet',
        'Log your first debrief after the next flight. Everything stays on this phone.');
    }

    /* install hint */
    if (!isStandalone() && !s.installDismissed) {
      html +=
        '<div class="note note--info" data-install>' + icon('info') +
          '<div><b>Add Sortie to your home screen.</b><br>' +
          'Share button, then "Add to Home Screen". It opens full screen and works with no signal.' +
          '<br><button class="btn btn--quiet" data-dismiss-install style="min-height:36px;padding:0;margin-top:6px;font-size:var(--t-13)">Got it</button></div>' +
        '</div>';
    }

    html += '</div>';
    viewEl.innerHTML = html;

    on(viewEl, '[data-new]', 'click', function () { go('new'); });
    on(viewEl, '.srow', 'click', function (e) { go('sortie/' + e.currentTarget.dataset.id); });
    on(viewEl, '[data-dismiss-install]', 'click', function () {
      Store.set('installDismissed', true); render();
    });

    on(viewEl, '[data-goal]', 'click', function (e) {
      var btn = e.currentTarget;
      var i = +btn.dataset.goal;
      var rec = Store.latest();
      var filled = rec.targetGoals.filter(function (g) { return g.text.trim(); });
      var target = filled[i];
      if (!target) return;
      target.done = !target.done;
      btn.setAttribute('aria-pressed', String(target.done));
      haptic(target.done ? 12 : 6);

      var done = filled.filter(function (g) { return g.done; }).length;
      var wrap = btn.closest('.carry');
      $('.meter__fill', wrap).style.width = Math.round(done / filled.length * 100) + '%';
      $('[data-goalcount]', wrap).textContent = done + '/' + filled.length;
      $('[data-goalnote]', wrap).textContent =
        done === filled.length ? 'All hit' : 'Tap when you hit one';

      Store.save(rec);
    });
  }

  function sortieRow(r) {
    var preview = r.observedDeficit || r.rootCause || r.matchPoint ||
      r.top3.filter(Boolean)[0] || 'No notes';
    return '<button class="srow" data-id="' + esc(r.id) + '">' +
      '<span class="srow__no"><b>' + esc(r.sortieNo || '—') + '</b><span>sortie</span></span>' +
      '<span class="srow__body">' +
        '<span class="srow__top">' +
          (r.category ? '<span class="badge" dir="auto">' + esc(r.category) + '</span>' : '') +
          '<span class="srow__date">' + esc(fmtDate(r.flownAt)) + '</span>' +
        '</span>' +
        '<span class="srow__prev" dir="auto">' + esc(preview) + '</span>' +
      '</span>' +
      icon('chevRight', { cls: 'srow__chev' }) +
    '</button>';
  }

  function emptyState(ic, title, text, action) {
    return '<div class="empty">' +
      '<div class="empty__icon">' + icon(ic) + '</div>' +
      '<h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' +
      (action || '') + '</div>';
  }

  /* ============================================================ screen: form */

  var draftTimer = null;

  function screenForm() {
    var editing = route.name === 'edit';
    var rec;

    if (editing) {
      rec = Store.get(route.param);
      if (!rec) { go('log'); return; }
      rec = JSON.parse(JSON.stringify(rec));
    } else {
      var draft = Store.readDraft();
      rec = draft || {
        id: '', sortieNo: Store.nextSortieNo(), category: '',
        flownAt: Store.todayISO(),
        observedDeficit: '', rootCause: '', matchPoint: '',
        top3: ['', '', ''], targetGoals: [{ text: '', done: false }], tags: []
      };
    }

    // Top 3 always shows three lines; goals always show at least one.
    rec.top3 = rec.top3 || [];
    while (rec.top3.length < 3) rec.top3.push('');
    rec.targetGoals = rec.targetGoals || [];
    if (!rec.targetGoals.length) rec.targetGoals = [{ text: '', done: false }];
    rec.tags = rec.tags || [];

    renderTopbar({
      title: editing ? 'Edit sortie ' + (rec.sortieNo || '') : 'New debrief',
      back: true,
      backTo: editing ? 'sortie/' + rec.id : ''
    });

    var cats = Store.settings().categories;
    var known = cats.indexOf(rec.category) !== -1;
    var isOther = !!rec.category && !known;

    var html =
      '<div class="formprog"><span class="formprog__fill" id="progFill"></span></div>' +
      '<div class="stack-6">' +

      /* ---- identify ---- */
      '<section class="stack-4">' +
        '<div class="field">' +
          '<label class="field__label" for="f_no">Sortie #</label>' +
          '<input class="input input--num" id="f_no" data-f="sortieNo" type="text" ' +
            'inputmode="numeric" autocomplete="off" enterkeyhint="next" ' +
            'placeholder="e.g. 142" value="' + esc(rec.sortieNo) + '">' +
        '</div>' +

        '<div class="field">' +
          '<label class="field__label" for="f_date">Date flown</label>' +
          '<input class="input input--num" id="f_date" data-f="flownAt" type="date" ' +
            'value="' + esc(rec.flownAt) + '">' +
        '</div>' +

        '<div class="field">' +
          '<span class="field__label">Flight Category</span>' +
          '<div class="chips" id="catChips">' +
            cats.map(function (c) {
              return '<button type="button" class="chip" data-cat="' + esc(c) + '" dir="auto" ' +
                'aria-pressed="' + (rec.category === c) + '">' + esc(c) + '</button>';
            }).join('') +
            '<button type="button" class="chip" data-cat-other aria-pressed="' + isOther + '">Other</button>' +
          '</div>' +
          '<input class="input" id="f_catOther" data-f="categoryOther" type="text" dir="auto" ' +
            'placeholder="Type the category" value="' + esc(isOther ? rec.category : '') + '"' +
            (isOther ? '' : ' hidden') + '>' +
        '</div>' +
      '</section>' +

      /* ---- diagnose ---- */
      '<section class="phase phase--diagnose">' +
        '<div class="phase__head"><span class="phase__n">01</span><span class="phase__t">Diagnose</span></div>' +
        '<p class="phase__d">What broke, and why.</p>' +
        field('Observed Deficit', 'observedDeficit', rec.observedDeficit, 'What did not meet standard?') +
        field('Root Cause', 'rootCause', rec.rootCause, 'Why did it happen?') +
        field('Match Point', 'matchPoint', rec.matchPoint, '') +
        tagsField(rec.tags) +
      '</section>' +

      /* ---- extract ---- */
      '<section class="phase phase--extract">' +
        '<div class="phase__head"><span class="phase__n">02</span><span class="phase__t">Extract</span></div>' +
        '<p class="phase__d">The lessons worth keeping.</p>' +
        '<div class="field">' +
          '<span class="field__label">Top 3</span>' +
          '<div class="lines" id="top3Lines">' +
            rec.top3.map(function (t, i) { return lineRow(i, t, 'top3', false); }).join('') +
          '</div>' +
        '</div>' +
      '</section>' +

      /* ---- commit ---- */
      '<section class="phase phase--commit">' +
        '<div class="phase__head"><span class="phase__n">03</span><span class="phase__t">Commit</span></div>' +
        '<p class="phase__d">These show on your home screen before the next flight.</p>' +
        '<div class="field">' +
          '<span class="field__label">Target Goals For Next Sortie</span>' +
          '<div class="lines" id="goalLines">' +
            rec.targetGoals.map(function (g, i) { return lineRow(i, g.text, 'goal', true); }).join('') +
          '</div>' +
          '<button type="button" class="addline" data-add-goal>' + icon('plus') + 'Add goal</button>' +
        '</div>' +
      '</section>' +

      (editing ? '<button class="btn btn--danger btn--block" data-del>' + icon('trash') + 'Delete this sortie</button>' : '') +
      '</div>' +

      '<div class="savebar"><div class="savebar__inner">' +
        '<span class="savestate" id="saveState">' + (editing ? '' : 'Draft saved as you type') + '</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn btn--primary" data-save>' + icon('check') +
          (editing ? 'Save changes' : 'Save debrief') + '</button>' +
      '</div></div>';

    // Wrapped in its own root so the delegated listeners below die with the
    // markup on the next render instead of stacking up.
    viewEl.innerHTML = '<div id="formRoot">' + html + '</div>';
    var root = $('#formRoot');

    /* ---- field helpers ---- */
    function field(label, key, val, hint) {
      return '<div class="field">' +
        '<label class="field__label" for="f_' + key + '">' + esc(label) + '</label>' +
        (hint ? '<span class="field__hint">' + esc(hint) + '</span>' : '') +
        '<textarea class="ta" id="f_' + key + '" data-f="' + key + '" dir="auto" rows="2" ' +
          'placeholder="Your answer">' + esc(val) + '</textarea>' +
      '</div>';
    }

    function tagsField(tags) {
      var all = Store.allTags().slice(0, 12);
      return '<div class="field">' +
        '<span class="field__label">' + 'Tags <span class="dim" style="font-weight:400">optional</span></span>' +
        '<span class="field__hint">Tag the cause so Patterns can show what keeps repeating.</span>' +
        '<div class="chips" id="tagChips">' +
          all.map(function (t) {
            return '<button type="button" class="chip chip--sm" data-tag="' + esc(t.tag) + '" dir="auto" ' +
              'aria-pressed="' + (tags.indexOf(t.tag) !== -1) + '">' + esc(t.tag) + '</button>';
          }).join('') +
          tags.filter(function (t) {
            return all.every(function (a) { return a.tag !== t; });
          }).map(function (t) {
            return '<button type="button" class="chip chip--sm" data-tag="' + esc(t) + '" dir="auto" aria-pressed="true">' + esc(t) + '</button>';
          }).join('') +
        '</div>' +
        '<input class="input" id="f_newTag" type="text" dir="auto" enterkeyhint="done" ' +
          'placeholder="Add a tag, then Enter">' +
      '</div>';
    }

    /* ---- wiring ---- */

    function collect() {
      var out = {
        id: rec.id,
        sortieNo: $('#f_no').value,
        flownAt: $('#f_date').value || Store.todayISO(),
        category: currentCategory(),
        observedDeficit: $('#f_observedDeficit').value,
        rootCause: $('#f_rootCause').value,
        matchPoint: $('#f_matchPoint').value,
        top3: $$('#top3Lines .ta').map(function (t) { return t.value; }),
        targetGoals: $$('#goalLines .ta').map(function (t, i) {
          var prev = rec.targetGoals[i];
          return { text: t.value, done: prev ? !!prev.done : false };
        }),
        tags: $$('#tagChips .chip[aria-pressed="true"]').map(function (c) { return c.dataset.tag; }),
        createdAt: rec.createdAt
      };
      return out;
    }

    function currentCategory() {
      var picked = $('#catChips .chip[data-cat][aria-pressed="true"]');
      if (picked) return picked.dataset.cat;
      if ($('#catChips [data-cat-other]').getAttribute('aria-pressed') === 'true') {
        return $('#f_catOther').value.trim();
      }
      return '';
    }

    function progress() {
      var d = collect();
      var slots = [
        d.sortieNo.trim(), d.category.trim(), d.observedDeficit.trim(),
        d.rootCause.trim(), d.matchPoint.trim(),
        d.top3.filter(function (t) { return t.trim(); }).join(''),
        d.targetGoals.filter(function (g) { return g.text.trim(); }).length ? 'x' : ''
      ];
      var filled = slots.filter(Boolean).length;
      $('#progFill').style.width = Math.round(filled / slots.length * 100) + '%';
    }

    function touched() {
      progress();
      if (editing) return;
      clearTimeout(draftTimer);
      draftTimer = setTimeout(function () {
        Store.saveDraft(collect());
        var el = $('#saveState');
        if (el) {
          el.textContent = 'Draft saved';
          setTimeout(function () { if (el.isConnected) el.textContent = 'Draft saved as you type'; }, 1400);
        }
      }, 500);
    }

    /* One delegated input handler, so goal lines added later behave the same
       as the ones rendered up front. */
    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.classList.contains('ta')) autosize(t);
      if (t.matches('.ta, .input')) touched();
    });

    /* One delegated click handler for every control inside the form. */
    root.addEventListener('click', function (e) {
      var catChip = e.target.closest('#catChips .chip');
      if (catChip) {
        var wasOn = catChip.getAttribute('aria-pressed') === 'true';
        $$('#catChips .chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
        catChip.setAttribute('aria-pressed', String(!wasOn));
        var other = $('#f_catOther');
        var otherOn = catChip.hasAttribute('data-cat-other') && !wasOn;
        other.hidden = !otherOn;
        if (otherOn) other.focus();
        haptic(); touched();
        return;
      }

      var tagChip = e.target.closest('#tagChips .chip');
      if (tagChip) {
        tagChip.setAttribute('aria-pressed',
          String(tagChip.getAttribute('aria-pressed') !== 'true'));
        haptic(); touched();
        return;
      }

      var rm = e.target.closest('#goalLines .line__x');
      if (rm) {
        if ($$('#goalLines .line').length <= 1) $('#goalLines .ta').value = '';
        else { rm.closest('.line').remove(); renumber('#goalLines'); }
        touched();
        return;
      }

      if (e.target.closest('[data-add-goal]')) {
        var wrap = $('#goalLines');
        wrap.insertAdjacentHTML('beforeend', lineRow(wrap.children.length, '', 'goal', true));
        var ta = wrap.lastElementChild.querySelector('.ta');
        autosize(ta); ta.focus();
        touched();
      }
    });

    $('#f_newTag').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var v = e.target.value.trim();
      if (!v) return;
      var existing = $$('#tagChips .chip').filter(function (c) {
        return c.dataset.tag === v;
      })[0];
      if (existing) {
        existing.setAttribute('aria-pressed', 'true');
      } else {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'chip chip--sm'; b.dataset.tag = v;
        b.dir = 'auto'; b.setAttribute('aria-pressed', 'true'); b.textContent = v;
        $('#tagChips').appendChild(b);
      }
      e.target.value = '';
      touched();
    });

    on(viewEl, '[data-save]', 'click', function () {
      var d = collect();
      if (!d.sortieNo.trim() && !d.observedDeficit.trim() && !d.rootCause.trim()) {
        toast('Add a sortie number or a note first', 'alert');
        $('#f_no').focus();
        return;
      }
      Store.save(d).then(function (saved) {
        Store.clearDraft();
        haptic(16);
        toast(editing ? 'Sortie updated' : 'Debrief logged');
        go('sortie/' + saved.id);
      });
    });

    on(viewEl, '[data-del]', 'click', function () {
      confirmSheet({
        title: 'Delete sortie ' + (rec.sortieNo || '') + '?',
        text: 'This removes the debrief from this phone. It cannot be undone.',
        confirmLabel: 'Delete', danger: true, icon: 'trash',
        onConfirm: function () {
          Store.remove(rec.id).then(function () { toast('Deleted', 'trash'); go('log'); });
        }
      });
    });

    progress();
  }

  function lineRow(i, val, kind, removable) {
    return '<div class="line">' +
      '<span class="line__n">' + (i + 1) + '</span>' +
      '<textarea class="ta" data-f="' + kind + '" dir="auto" rows="1" placeholder="Your answer">' +
        esc(val) + '</textarea>' +
      (removable ? '<button type="button" class="line__x" aria-label="Remove line">' + icon('x') + '</button>' : '') +
    '</div>';
  }

  function renumber(sel) {
    $$(sel + ' .line').forEach(function (l, i) { $('.line__n', l).textContent = i + 1; });
  }

  function autosize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(ta.scrollHeight, 48) + 'px';
  }
  function autosizeAll() { $$('.ta', viewEl).forEach(autosize); }

  /* ============================================================= screen: log */

  var logQuery = '', logCat = '';

  function screenLog() {
    renderTopbar({
      title: 'Log',
      sub: Store.count() ? String(Store.count()) : '',
      actions: [{ id: 'new', ic: 'plus', label: 'New debrief', accent: true,
        run: function () { go('new'); } }]
    });

    var cats = Store.settings().categories.slice();
    Store.all().forEach(function (r) {
      if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
    });

    viewEl.innerHTML =
      '<div class="stack-4" id="logRoot">' +
        '<div class="search">' + icon('search') +
          '<input class="input" id="q" type="search" dir="auto" autocomplete="off" ' +
            'placeholder="Search every answer" value="' + esc(logQuery) + '">' +
        '</div>' +
        '<div class="chips" id="logChips">' +
          '<button class="chip chip--sm" data-cat="" aria-pressed="' + (!logCat) + '">All</button>' +
          cats.map(function (c) {
            return '<button class="chip chip--sm" data-cat="' + esc(c) + '" dir="auto" aria-pressed="' +
              (logCat === c) + '">' + esc(c) + '</button>';
          }).join('') +
        '</div>' +
        '<div id="logResults"></div>' +
      '</div>';

    var root = $('#logRoot');

    /* Only the results block re-renders while typing, so the caret and the
       keyboard stay put. */
    function paintResults() {
      var rows = Store.search(logQuery).filter(function (r) {
        return !logCat || r.category === logCat;
      });
      $('#logResults').innerHTML = rows.length
        ? '<div class="list stagger">' + rows.map(sortieRow).join('') + '</div>'
        : emptyState('search',
            Store.count() ? 'Nothing matches' : 'No sorties yet',
            Store.count() ? 'Try a different word, or clear the filter.'
                          : 'Your debriefs will stack up here.');
    }
    paintResults();

    $('#q').addEventListener('input', function (e) {
      logQuery = e.target.value;
      paintResults();
    });

    root.addEventListener('click', function (e) {
      var chip = e.target.closest('#logChips .chip');
      if (chip) {
        logCat = chip.dataset.cat;
        $$('#logChips .chip').forEach(function (c) {
          c.setAttribute('aria-pressed', String(c.dataset.cat === logCat));
        });
        paintResults();
        return;
      }
      var row = e.target.closest('.srow');
      if (row) go('sortie/' + row.dataset.id);
    });
  }

  /* ========================================================== screen: detail */

  function screenDetail() {
    var r = Store.get(route.param);
    if (!r) { go('log'); return; }

    renderTopbar({
      title: 'Sortie ' + (r.sortieNo || ''),
      back: true, backTo: 'log',
      actions: [
        { id: 'share', ic: 'share', label: 'Share debrief', run: function () { shareOne(r); } },
        { id: 'edit', ic: 'pencil', label: 'Edit', accent: true, run: function () { go('edit/' + r.id); } }
      ]
    });

    var goals = r.targetGoals.filter(function (g) { return g.text.trim(); });
    var top3 = r.top3.filter(function (t) { return t.trim(); });

    viewEl.innerHTML =
      '<div class="stack-6 stagger">' +
        '<div class="dhero">' +
          '<div class="mono dim" style="font-size:var(--t-11);letter-spacing:.09em;text-transform:uppercase">Sortie</div>' +
          '<div class="dhero__n">' + esc(r.sortieNo || '—') + '</div>' +
          '<div class="dhero__meta">' +
            (r.category ? '<span class="chip chip--sm chip--static is-on" dir="auto">' + esc(r.category) + '</span>' : '') +
            '<span class="dim" style="font-size:var(--t-13)">' + esc(fmtDateLong(r.flownAt)) + '</span>' +
          '</div>' +
        '</div>' +

        '<section class="card" style="padding:var(--s-5)">' +
          answer('Observed Deficit', r.observedDeficit, 'rose') +
          answer('Root Cause', r.rootCause, 'rose') +
          answer('Match Point', r.matchPoint, 'rose') +
          (r.tags.length
            ? '<div class="answer"><div class="answer__q">Tags</div><div class="chips">' +
              r.tags.map(function (t) {
                return '<span class="chip chip--sm chip--static" dir="auto">' + esc(t) + '</span>';
              }).join('') + '</div></div>'
            : '') +
        '</section>' +

        '<section class="card" style="padding:var(--s-5)">' +
          '<div class="answer answer--teal">' +
            '<div class="answer__q">Top 3</div>' +
            (top3.length
              ? '<ol class="olist">' + top3.map(function (t, i) {
                  return '<li' + (isRTL(t) ? ' class="is-rtl"' : '') + '><b>' + (i + 1) +
                    '</b><span dir="auto">' + esc(t) + '</span></li>';
                }).join('') + '</ol>'
              : '<div class="answer__a"></div>') +
          '</div>' +
        '</section>' +

        '<section class="card" style="padding:var(--s-5)">' +
          '<div class="answer answer--amber">' +
            '<div class="answer__q">Target Goals For Next Sortie</div>' +
            (goals.length
              ? '<div>' + goals.map(function (g, i) {
                  return '<button class="goal' + (isRTL(g.text) ? ' is-rtl' : '') +
                    '" data-dgoal="' + i + '" aria-pressed="' + (!!g.done) + '">' +
                    '<span class="goal__box">' + icon('check') + '</span>' +
                    '<span class="goal__text bidi" dir="auto">' + esc(g.text) + '</span></button>';
                }).join('') + '</div>'
              : '<div class="answer__a"></div>') +
          '</div>' +
        '</section>' +

        '<div class="stack">' +
          '<button class="btn btn--ghost btn--block" data-copy>' + icon('copy') + 'Copy as text</button>' +
          '<button class="btn btn--quiet btn--block" data-del>' + icon('trash') + 'Delete sortie</button>' +
        '</div>' +
      '</div>';

    function answer(q, a, tone) {
      return '<div class="answer answer--' + tone + '">' +
        '<div class="answer__q">' + esc(q) + '</div>' +
        '<div class="answer__a" dir="auto">' + esc(a || '') + '</div></div>';
    }

    on(viewEl, '[data-dgoal]', 'click', function (e) {
      var i = +e.currentTarget.dataset.dgoal;
      var g = goals[i];
      g.done = !g.done;
      e.currentTarget.setAttribute('aria-pressed', String(g.done));
      haptic(g.done ? 12 : 6);
      Store.save(r);
    });

    on(viewEl, '[data-copy]', 'click', function () {
      var text = asText(r);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast('Copied'); },
          function () { toast('Could not copy', 'alert'); });
      } else { toast('Copy is not available here', 'alert'); }
    });

    on(viewEl, '[data-del]', 'click', function () {
      confirmSheet({
        title: 'Delete sortie ' + (r.sortieNo || '') + '?',
        text: 'This removes the debrief from this phone. It cannot be undone.',
        confirmLabel: 'Delete', danger: true, icon: 'trash',
        onConfirm: function () {
          Store.remove(r.id).then(function () { toast('Deleted', 'trash'); go('log'); });
        }
      });
    });
  }

  function asText(r) {
    var L = [];
    L.push('Daily Flight Debrief');
    L.push('Sortie # ' + (r.sortieNo || '—') + '  ·  ' + fmtDateLong(r.flownAt));
    if (r.category) L.push('Flight Category: ' + r.category);
    L.push('');
    L.push('Observed Deficit: ' + (r.observedDeficit || '—'));
    L.push('Root Cause: ' + (r.rootCause || '—'));
    L.push('Match Point: ' + (r.matchPoint || '—'));
    var t3 = r.top3.filter(function (t) { return t.trim(); });
    if (t3.length) { L.push(''); L.push('Top 3:'); t3.forEach(function (t, i) { L.push('  ' + (i + 1) + '. ' + t); }); }
    var g = r.targetGoals.filter(function (x) { return x.text.trim(); });
    if (g.length) {
      L.push(''); L.push('Target Goals For Next Sortie:');
      g.forEach(function (x, i) { L.push('  ' + (i + 1) + '. ' + x.text + (x.done ? '  [done]' : '')); });
    }
    if (r.tags.length) { L.push(''); L.push('Tags: ' + r.tags.join(', ')); }
    return L.join('\n');
  }

  function shareOne(r) {
    var text = asText(r);
    if (navigator.share) {
      navigator.share({ title: 'Sortie ' + (r.sortieNo || ''), text: text }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast('Copied to clipboard'); });
    }
  }

  /* ======================================================== screen: patterns */

  var tlField = 'rootCause';

  function screenPatterns() {
    renderTopbar({ title: 'Patterns' });
    var all = Store.all();

    if (!all.length) {
      viewEl.innerHTML = emptyState('trending', 'Nothing to see yet',
        'Log a few sorties and this fills in with what keeps repeating.');
      return;
    }

    /* stats */
    var now = Date.now();
    var last30 = all.filter(function (r) {
      return parseISO(r.flownAt).getTime() > now - 30 * 86400000;
    }).length;

    var allGoals = [], doneGoals = 0;
    all.forEach(function (r) {
      r.targetGoals.forEach(function (g) {
        if (!g.text.trim()) return;
        allGoals.push(g); if (g.done) doneGoals++;
      });
    });
    var follow = allGoals.length ? Math.round(doneGoals / allGoals.length * 100) : 0;

    /* category distribution */
    var catCount = {};
    all.forEach(function (r) {
      var k = r.category || 'Uncategorised';
      catCount[k] = (catCount[k] || 0) + 1;
    });
    var catRows = Object.keys(catCount)
      .sort(function (a, b) { return catCount[b] - catCount[a]; });
    var catMax = Math.max.apply(null, catRows.map(function (k) { return catCount[k]; }));

    /* weekly cadence — eight 7-day buckets ending today */
    var weeks = [];
    for (var w = 7; w >= 0; w--) {
      var end = new Date(); end.setHours(23, 59, 59, 999);
      end.setDate(end.getDate() - w * 7);
      var start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      var n = all.filter(function (r) {
        var t = parseISO(r.flownAt).getTime();
        return t >= start.getTime() && t <= end.getTime();
      }).length;
      weeks.push({ n: n, label: String(start.getDate()) });
    }
    var wMax = Math.max(1, Math.max.apply(null, weeks.map(function (x) { return x.n; })));

    /* tags */
    var tags = Store.allTags().slice(0, 6);
    var tagMax = tags.length ? tags[0].n : 1;

    var FIELDS = [
      { k: 'observedDeficit', l: 'Deficit' },
      { k: 'rootCause', l: 'Root Cause' },
      { k: 'matchPoint', l: 'Match Point' }
    ];

    viewEl.innerHTML =
      '<div class="stack-6 stagger">' +

        '<div class="stats">' +
          stat(all.length, 'sorties logged', '') +
          stat(last30, 'in the last 30 days', 'accent') +
          stat(follow + '%', 'goals hit', 'amber') +
          stat(catRows.length, 'categories flown', '') +
        '</div>' +

        '<section class="stack">' +
          '<h2 class="h-sect">Sorties per week</h2>' +
          '<div class="card" style="padding:var(--s-4)">' +
            '<div class="weeks">' + weeks.map(function (x, i) {
              return '<div class="week">' +
                '<div class="week__bar' + (x.n ? '' : ' is-zero') + '" style="height:' +
                  Math.max(4, Math.round(x.n / wMax * 56)) + 'px;animation-delay:' + (i * 30) + 'ms" ' +
                  'title="' + x.n + ' sorties"></div>' +
                '<div class="week__l">' + esc(x.label) + '</div></div>';
            }).join('') + '</div>' +
            '<p class="dim" style="font-size:var(--t-11);margin-top:var(--s-2);text-align:center">' +
              'last 8 weeks · bar label is the week start</p>' +
          '</div>' +
        '</section>' +

        '<section class="stack">' +
          '<h2 class="h-sect">Flight category</h2>' +
          '<div class="card" style="padding:var(--s-4)"><div class="bars">' +
            catRows.map(function (k, i) {
              return bar(k, catCount[k], catMax, all.length, i);
            }).join('') +
          '</div></div>' +
        '</section>' +

        (tags.length ? '<section class="stack">' +
          '<h2 class="h-sect">What keeps repeating</h2>' +
          '<div class="card" style="padding:var(--s-4)"><div class="bars">' +
            tags.map(function (t, i) { return bar(t.tag, t.n, tagMax, all.length, i); }).join('') +
          '</div></div>' +
        '</section>' : '') +

        '<section class="stack">' +
          '<h2 class="h-sect">Read one answer across every sortie</h2>' +
          '<div class="seg">' + FIELDS.map(function (f) {
            return '<button data-tlf="' + f.k + '" aria-pressed="' + (tlField === f.k) + '">' + f.l + '</button>';
          }).join('') + '</div>' +
          '<div class="card" style="padding:var(--s-5)"><div class="tl">' +
            (function () {
              var rows = all.filter(function (r) { return (r[tlField] || '').trim(); }).slice(0, 20);
              if (!rows.length) return '<p class="dim" style="font-size:var(--t-13)">Nothing written in this field yet.</p>';
              return rows.map(function (r) {
                return '<div class="tlrow">' +
                  '<div class="tlrow__m">' + esc(r.sortieNo || '—') + ' · ' + esc(fmtDate(r.flownAt)) +
                    (r.category ? ' · ' + esc(r.category) : '') + '</div>' +
                  '<div class="tlrow__t" dir="auto">' + esc(r[tlField]) + '</div></div>';
              }).join('');
            })() +
          '</div></div>' +
        '</section>' +
      '</div>';

    on(viewEl, '[data-tlf]', 'click', function (e) {
      tlField = e.currentTarget.dataset.tlf;
      screenPatterns();
    });

    function stat(v, k, tone) {
      return '<div class="stat' + (tone ? ' stat--' + tone : '') + '">' +
        '<div class="stat__v">' + esc(v) + '</div><div class="stat__k">' + esc(k) + '</div></div>';
    }
    function bar(label, n, max, total, i) {
      return '<div class="bar">' +
        '<div class="bar__top">' +
          '<span class="bar__label" dir="auto">' + esc(label) + '</span>' +
          '<span class="bar__val">' + n + ' · ' + Math.round(n / total * 100) + '%</span>' +
        '</div>' +
        '<div class="bar__track"><div class="bar__fill" style="width:' +
          Math.round(n / max * 100) + '%;animation-delay:' + (i * 40) + 'ms"></div></div>' +
      '</div>';
    }
  }

  /* ======================================================== screen: settings */

  function screenSettings() {
    renderTopbar({ title: 'Settings' });
    var s = Store.settings();
    var since = daysSince(s.lastExport);

    viewEl.innerHTML =
      '<div class="stack-6 stagger">' +

        (since === null || since >= 14
          ? '<div class="note">' + icon('alert') +
            '<div><b>Back up your debriefs.</b><br>' +
            (since === null ? 'You have never exported.' : 'Last export was ' + since + ' days ago.') +
            ' Everything lives only on this phone. Export a file and keep it somewhere safe.</div></div>'
          : '') +

        '<section class="stack">' +
          '<h2 class="h-sect">Appearance</h2>' +
          '<div class="seg">' +
            ['dark', 'light', 'auto'].map(function (t) {
              return '<button data-theme-set="' + t + '" aria-pressed="' + (s.theme === t) + '">' +
                t.charAt(0).toUpperCase() + t.slice(1) + '</button>';
            }).join('') +
          '</div>' +
        '</section>' +

        '<section class="stack">' +
          '<h2 class="h-sect">Flight categories</h2>' +
          '<div class="group">' +
            s.categories.map(function (c, i) {
              return '<div class="item">' +
                '<span class="item__b"><span class="item__t bidi" dir="auto">' + esc(c) + '</span></span>' +
                '<button class="iconbtn" data-cat-del="' + i + '" aria-label="Remove category">' +
                  icon('x') + '</button></div>';
            }).join('') +
            '<button class="item" data-cat-add>' +
              '<span class="item__ic">' + icon('plus') + '</span>' +
              '<span class="item__b"><span class="item__t">Add a category</span></span></button>' +
          '</div>' +
        '</section>' +

        '<section class="stack">' +
          '<h2 class="h-sect">Your data</h2>' +
          '<div class="group">' +
            item('download', 'Export spreadsheet', Store.count() + ' sorties as CSV', 'export-csv') +
            item('download', 'Export backup file', 'JSON, restores everything', 'export-json') +
            item('upload', 'Import a backup', 'Merges with what is here', 'import-json') +
          '</div>' +
        '</section>' +

        '<section class="stack">' +
          '<h2 class="h-sect">Privacy</h2>' +
          '<div class="group">' +
            item('lock', s.pin ? 'Change screen code' : 'Set a screen code',
              Store.cryptoReady() ? (s.pin ? 'Code is on' : 'Off') : 'Needs an https address', 'pin-set') +
            (s.pin ? item('x', 'Turn off screen code', '', 'pin-off') : '') +
          '</div>' +
          '<p class="dim" style="font-size:var(--t-12);line-height:1.55">' +
            'Sortie has no account and no server. Nothing you type here leaves this phone. ' +
            'The screen code stops someone picking up your phone and reading it, but it does not encrypt the file.' +
          '</p>' +
        '</section>' +

        '<section class="stack">' +
          '<div class="group">' +
            '<button class="item item--danger" data-clear>' +
              '<span class="item__ic">' + icon('trash') + '</span>' +
              '<span class="item__b"><span class="item__t">Delete all debriefs</span>' +
              '<span class="item__s">Cannot be undone</span></span></button>' +
          '</div>' +
        '</section>' +

        '<p class="dim" style="font-size:var(--t-11);text-align:center">Sortie · works offline · ' +
          esc(Store.count()) + ' sorties on this device<br>storage: ' +
          (Store.storageMode() === 'indexeddb' ? 'database' : 'browser storage (limited)') + '</p>' +
      '</div>' +
      '<input type="file" id="importFile" accept=".json,application/json" hidden>';

    function item(ic, title, sub, act) {
      return '<button class="item" data-act="' + act + '">' +
        '<span class="item__ic">' + icon(ic) + '</span>' +
        '<span class="item__b"><span class="item__t">' + esc(title) + '</span>' +
        (sub ? '<span class="item__s">' + esc(sub) + '</span>' : '') + '</span>' +
        '<span class="item__r">' + icon('chevRight') + '</span></button>';
    }

    on(viewEl, '[data-theme-set]', 'click', function (e) {
      Store.set('theme', e.currentTarget.dataset.themeSet);
      applyTheme(); screenSettings();
    });

    on(viewEl, '[data-cat-del]', 'click', function (e) {
      var i = +e.currentTarget.dataset.catDel;
      var cats = Store.settings().categories.slice();
      var removed = cats.splice(i, 1)[0];
      Store.set('categories', cats);
      toast('Removed ' + removed, 'x');
      screenSettings();
    });

    on(viewEl, '[data-cat-add]', 'click', function () {
      openSheet({
        title: 'Add a flight category',
        body: '<input class="input" id="newCat" type="text" dir="auto" placeholder="Hebrew or English" enterkeyhint="done">',
        actions: [
          { label: 'Add', cls: 'btn--primary', icon: 'plus', keepOpen: true, run: function (sh) {
            var v = $('#newCat', sh).value.trim();
            if (!v) return;
            var cats = Store.settings().categories.slice();
            if (cats.indexOf(v) === -1) cats.push(v);
            Store.set('categories', cats);
            sh.close(); screenSettings(); toast('Added ' + v);
          } },
          { label: 'Cancel', cls: 'btn--quiet' }
        ],
        onOpen: function (sh) { setTimeout(function () { $('#newCat', sh).focus(); }, 120); }
      });
    });

    on(viewEl, '[data-act]', 'click', function (e) {
      var act = e.currentTarget.dataset.act;
      if (act === 'export-csv') {
        if (!Store.count()) return toast('Nothing to export yet', 'alert');
        saveFile('sortie-debriefs-' + stamp() + '.csv', Store.toCSV(), 'text/csv');
        setTimeout(screenSettings, 400);
      }
      if (act === 'export-json') {
        if (!Store.count()) return toast('Nothing to export yet', 'alert');
        saveFile('sortie-backup-' + stamp() + '.json', Store.toJSON(), 'application/json');
        setTimeout(screenSettings, 400);
      }
      if (act === 'import-json') $('#importFile').click();
      if (act === 'pin-set') startPinSetup();
      if (act === 'pin-off') {
        confirmSheet({
          title: 'Turn off the screen code?',
          text: 'Anyone who picks up your phone will be able to open Sortie.',
          confirmLabel: 'Turn it off', danger: true,
          onConfirm: function () { Store.clearPin(); toast('Screen code off', 'lock'); screenSettings(); }
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
            toast('Imported ' + res.added + ' new, ' + res.updated + ' updated');
            screenSettings();
          });
        } catch (err) {
          toast('That file could not be read', 'alert');
        }
      };
      fr.readAsText(f);
      e.target.value = '';
    });

    on(viewEl, '[data-clear]', 'click', function () {
      confirmSheet({
        title: 'Delete all ' + Store.count() + ' debriefs?',
        text: 'Everything on this phone goes. Export a backup first if you might want it later.',
        confirmLabel: 'Delete everything', danger: true, icon: 'trash',
        onConfirm: function () {
          Store.clearAll().then(function () { toast('All debriefs deleted', 'trash'); go(''); });
        }
      });
    });
  }

  /* ============================================================ lock screen */

  function renderKeypad() {
    var keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'del'];
    $('#keypad').innerHTML = keys.map(function (k) {
      if (k === 'del') return '<button class="key key--fn" data-key="del" aria-label="Delete">' + icon('delete') + '</button>';
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
    if (k === 'cancel') {
      if (pinMode === 'unlock') return;
      closeLock(); return;
    }
    if (pinBuffer.length >= 4) return;
    pinBuffer += k;
    haptic(6);
    drawPin();
    if (pinBuffer.length === 4) setTimeout(submitPin, 140);
  }

  function submitPin() {
    var entered = pinBuffer;
    pinBuffer = '';

    if (pinMode === 'unlock') {
      Store.checkPin(entered).then(function (ok) {
        if (ok) { closeLock(); return; }
        drawPin(); lockHint('Wrong code', true); haptic(40);
      });
      return;
    }

    if (pinMode === 'set') {
      pinFirst = entered; pinMode = 'confirm';
      drawPin(); lockHint('Enter it again');
      return;
    }

    if (pinMode === 'confirm') {
      if (entered !== pinFirst) {
        pinMode = 'set'; pinFirst = ''; drawPin();
        lockHint('Those did not match. Start again.', true); haptic(40);
        return;
      }
      Store.setPin(entered).then(function (ok) {
        closeLock();
        toast(ok ? 'Screen code on' : 'Could not set a code here', ok ? 'lock' : 'alert');
        if (route.name === 'settings') screenSettings();
      });
    }
  }

  function openLock(mode, hint) {
    pinMode = mode; pinBuffer = ''; pinFirst = '';
    lockEl.hidden = false;
    appEl.hidden = mode === 'unlock';
    renderKeypad(); drawPin(); lockHint(hint || 'Enter your code');
    var cancel = $('[data-key="cancel"]', lockEl);
    if (cancel) cancel.textContent = mode === 'unlock' ? '' : 'Cancel';
  }

  function closeLock() {
    lockEl.hidden = true;
    appEl.hidden = false;
  }

  function startPinSetup() {
    openLock('set', 'Choose a 4 digit code');
  }

  /* ================================================================== boot */

  function boot() {
    appEl = document.getElementById('app');
    viewEl = document.getElementById('view');
    topbarEl = document.getElementById('topbar');
    tabbarEl = document.getElementById('tabbar');
    toasterEl = document.getElementById('toaster');
    sheetEl = document.getElementById('sheet');
    lockEl = document.getElementById('lockScreen');

    Store.init().then(function () {
      applyTheme();
      global.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (Store.settings().theme === 'auto') applyTheme();
      });

      global.addEventListener('hashchange', navigate);

      if (Store.settings().pin) {
        openLock('unlock');  // hides the app until the code is right
        navigate();          // render behind the lock so unlocking is instant
      } else {
        appEl.hidden = false;
        navigate();
      }

      if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(function () {});
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

})(window);
