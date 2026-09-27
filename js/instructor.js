/* Instructor views are read-only. Never load another cadet into the local Store. */
(function (g) {
  'use strict';
  var epoch = 0, I = g.T.instructorEnglish;
  function isEnglish(route) {
    return route.name === 'instructor' || route.name === 'cloud' && (route.param === 'instructor' || g.Cloud.status().role === 'instructor');
  }
  function courseLabel(id) { return I.courseLabels[id] || I.reportUnassigned; }
  function labelFor(q) {
    var known = I.questionLabels[q.id];
    // A renamed/default or new custom question is cadet-authored text.
    return known && q.label === known[0] ? known[1] : q.label;
  }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function when(v, english) {
    var date = v && typeof v.toDate === 'function' ? v.toDate() : v ? new Date(v.seconds ? v.seconds * 1000 : v) : null;
    return date && !isNaN(date.getTime()) ? date.toLocaleString(english === false ? 'he-IL' : 'en-GB') : (english === false ? g.T : I).cloudNever;
  }
  function decode(row) {
    var p = JSON.parse(row.payload);
    if (p.schema !== 1 || !p.record || typeof p.record.id !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.record.flownAt) ||
        !p.record.answers || typeof p.record.answers !== 'object' || Array.isArray(p.record.answers) || !Array.isArray(p.questions) ||
        !['brief', 'done'].includes(p.record.stage)) throw Error('INVALID_CLOUD_RECORD');
    p.questions.forEach(function (q) {
      if (!q || typeof q.id !== 'string' || typeof q.label !== 'string' || typeof q.type !== 'string') throw Error('INVALID_CLOUD_QUESTION');
      var value = p.record.answers[q.id];
      if (['goals', 'syllabus'].includes(q.type) && value !== undefined && (!Array.isArray(value) || value.some(function (x) { return !x || typeof x.text !== 'string'; }))) throw Error('INVALID_CLOUD_ANSWER');
      if (Array.isArray(value) && value.some(function (x) { return x == null; })) throw Error('INVALID_CLOUD_ANSWER');
    });
    return Object.assign({}, p, { cloudId: row.id, receivedAt: row.receivedAt, digest: row.digest });
  }
  function question(p, role) { return p.questions.find(function (q) { return q.role === role && p.record.answers[q.id] !== undefined; }); }
  function subject(p) { var q = question(p, 'subject'); return q ? String(p.record.answers[q.id] || '') : ''; }
  function answer(q, value) {
    if (Array.isArray(value)) return value.map(function (x) {
      if (typeof x !== 'object' || !x) return String(x);
      return [x.text, x.focus ? I.reportBriefFocus + ': ' + x.focus : '', x.notes,
        q.type === 'goals' ? (x.status === 'met' ? I.goalMet : x.status === 'missed' ? I.goalMissed : I.reportNotGraded) : ''].filter(Boolean).join('\n');
    }).join('\n\n');
    return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  function coverage(rows, course) {
    var names = new Set();
    rows.filter(function (p) { return !p.deletedAt && p.record.stage === 'done' && p.record.course === course; }).forEach(function (p) {
      var r = p.record, entry = r.syllabusEntry && r.syllabusEntry.course === course
        ? g.SyllabusRef.all(course).find(function (e) { return e.name === r.syllabusEntry.name; })
        : (g.SyllabusRef.candidates(subject(p), course).length === 1 ? g.SyllabusRef.lookup(subject(p), course) : null);
      if (entry) names.add(entry.name);
    });
    return { done: names.size, total: g.Courses.get(course) ? g.SyllabusRef.count(course) : 0 };
  }
  function report(rows) {
    var payloads = new Map(rows.map(function (p) { return [p.record, p]; }));
    var data = {
      labelFor: labelFor,
      questionsFor: function (r) { return payloads.get(r).questions; },
      questionFor: function (r, role) { return question(payloads.get(r), role); },
      categoriesOf: function (r) {
        if (r.course) return g.Store.categoriesInText(subject(payloads.get(r)), r.course);
        return Array.from(new Set(g.Courses.all().flatMap(function (c) { return g.Store.categoriesInText(subject(payloads.get(r)), c.id); })));
      }
    };
    return g.Summary.build(rows.filter(function (p) { return !p.deletedAt; }).map(function (p) { return p.record; }), data, { strings: I, courseLabel: courseLabel });
  }
  function details(p, history) {
    return '<details class="cloud-flight"><summary><span><b dir="auto">' + esc(subject(p) || p.record.flownAt) + '</b><small>' +
      esc(p.record.flownAt) + ' · ' + esc(p.record.stage === 'done' ? I.stageDebrief : I.stageBrief) +
      (p.deletedAt ? ' · ' + esc(I.instructorDeleted) : '') + '</small></span>' + g.icon('chevDown') + '</summary>' +
      '<div class="cloud-flight__body">' + p.questions.map(function (q) {
        var value = answer(q, p.record.answers[q.id]);
        return value ? '<section><h3 dir="auto">' + esc(labelFor(q)) + '</h3><p dir="auto">' + esc(value) + '</p></section>' : '';
      }).join('') + '<p class="fineprint">' + esc(I.instructorReceived) + ': ' + esc(when(p.receivedAt)) + '</p>' +
      (history ? '<button class="btn btn--quiet" data-history="' + esc(p.cloudId) + '">' + esc(I.instructorHistory) + '</button><div data-versions="' + esc(p.cloudId) + '"></div>' : '') + '</div></details>';
  }
  function statusPanel(ctx) {
    var s = g.Cloud.status(), english = isEnglish(g.Instructor.route || { name: 'cloud' }), T = english ? I : g.T;
    if (ctx.language) ctx.language(english);
    ctx.topbar({ title: T.cloudTitle, back: true, backLabel: T.back, backTo: english ? 'instructor' : 'settings' });
    ctx.view.innerHTML = '<section class="cloud-panel stack"><h1>' + esc(T.cloudTitle) + '</h1><p>' + esc(T.cloudScope) + '</p><p class="cloud-state" role="status">' +
      esc(T.cloudStates[s.phase] || T.cloudStates.error) + '</p><p dir="auto">' + esc(s.email || '') + '</p>' +
      (g.Cloud.enabled() ? '<p class="fineprint">' + esc(T.cloudPrivacy) + '</p>' : '<p>' + esc(T.cloudDisabled) + '</p>') +
      (['signin', 'account-mismatch'].includes(s.phase) ? '<button class="btn btn--lit" data-cloud-signin>' + esc(T.cloudConnect) + '</button>' : '') +
      (s.role === 'instructor' ? '<a class="btn btn--lit" href="#/instructor">' + esc(T.instructorTitle) + '</a>' : '') +
      (s.role === 'cadet' && s.phase !== 'unlinked' ? '<dl class="cloud-sync-stats"><dt>' + esc(T.cloudPending) + '</dt><dd>' + (+s.pending || 0) + '</dd><dt>' +
        esc(T.cloudConflicts) + '</dt><dd>' + (+s.conflicts || 0) + '</dd><dt>' + esc(T.cloudLastSync) + '</dt><dd>' + esc(when(s.lastSync, english)) + '</dd></dl>' : '') +
      (g.Cloud.enabled() ? '<button class="btn btn--quiet" data-cloud-retry>' + esc(T.cloudRefresh) + '</button>' : '') +
      (english && s.role === 'instructor' ? '<button class="btn btn--quiet" data-cloud-signout>' + esc(T.signOut) + '</button>' : '') + '</section>';
    var button = ctx.view.querySelector('[data-cloud-signin]'); if (button) button.onclick = g.Auth.signIn;
    button = ctx.view.querySelector('[data-cloud-retry]'); if (button) button.onclick = g.Cloud.retry;
    button = ctx.view.querySelector('[data-cloud-signout]'); if (button) button.onclick = async function () {
      button.disabled = true;
      try { await g.Auth.signOut(); location.reload(); }
      catch (_) { button.disabled = false; ctx.toast(T.cloudSignoutError, 'alert'); }
    };
  }
  async function render(route, ctx) {
    var run = ++epoch, T = I;
    if (route.name === 'cloud') { statusPanel(ctx); return; }
    ctx.topbar({ title: T.instructorTitle, back: true, backLabel: T.back, backTo: 'cloud/instructor', actions: [{ id: 'connection', ic: 'settings', label: T.cloudTitle, run: function () { ctx.go('cloud/instructor'); } }] });
    if (g.Cloud.enabled() && g.Cloud.status().phase === 'connecting') {
      ctx.view.innerHTML = '<p role="status" data-cloud-pending>' + esc(T.cloudStates.connecting) + '</p>'; return;
    }
    if (g.Cloud.status().role !== 'instructor') {
      ctx.view.innerHTML = '<section class="empty"><h1>' + esc(T.instructorTitle) + '</h1><p>' + esc(g.Cloud.enabled() ? T.instructorDenied : T.cloudDisabled) + '</p><a class="btn" href="#/cloud/instructor">' + esc(T.cloudTitle) + '</a></section>'; return;
    }
    ctx.view.innerHTML = '<p role="status">' + esc(T.cloudLoading) + '</p>';
    function current() { return run === epoch && document.body.dataset.route === 'instructor' && g.Cloud.status().role === 'instructor'; }
    try {
      var roster = await g.Cloud.roster(); if (!current()) return;
      if (route.param) {
        var cadet = roster.find(function (x) { return x.id === route.param; });
        if (!cadet) throw Error('CADET_NOT_ASSIGNED');
        var raw = await g.Cloud.flights(cadet.id); if (!current()) return;
        var rows = [], invalid = 0;
        raw.forEach(function (r) { try { rows.push(decode(r)); } catch (_) { invalid++; } });
        showCadet(cadet, rows, invalid, ctx, current);
      } else showRoster(roster, ctx);
    } catch (_) {
      if (!current()) return;
      ctx.view.innerHTML = '<section class="empty"><p role="alert">' + esc(T.cloudLoadError) + '</p><button class="btn" data-instructor-retry>' + esc(T.cloudRefresh) + '</button></section>';
      ctx.view.querySelector('button').onclick = function () { render(route, ctx); };
    }
  }
  function courseOptions() { return '<option value="">' + esc(I.instructorAllCourses) + '</option>' + g.Courses.all().map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(courseLabel(c.id)) + '</option>'; }).join(''); }
  function showRoster(rows, ctx) {
    var T = I;
    ctx.view.innerHTML = '<div class="stack instructor"><header><span class="chip">' + esc(T.cloudReadOnly) + '</span><h1>' + esc(T.instructorTitle) + '</h1><p>' + esc(T.instructorSub) + '</p></header>' +
      '<div class="cloud-filters"><label>' + esc(T.instructorSearch) + '<input type="search" dir="auto" data-cadet-search></label><label>' + esc(T.course) + '<select data-course-filter>' + courseOptions() + '</select></label></div>' +
      '<p class="fineprint">' + esc(T.instructorAsOf) + '</p><div data-roster class="cloud-roster"></div><button class="btn btn--quiet" data-refresh-roster>' + esc(T.cloudRefresh) + '</button></div>';
    function paint() {
      var q = ctx.view.querySelector('[data-cadet-search]').value.trim().toLocaleLowerCase(), c = ctx.view.querySelector('select').value;
      ctx.view.querySelector('[data-roster]').innerHTML = rows.filter(function (r) { return (!c || r.course === c) && (!q || (r.name + ' ' + (r.email || '')).toLocaleLowerCase().includes(q)); })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'en'); }).map(function (r) {
          return '<a class="cloud-cadet" href="#/instructor/' + encodeURIComponent(r.id) + '"><span class="cloud-avatar" aria-hidden="true">' + esc(String(r.name || '').slice(0, 1)) + '</span><span><b dir="auto">' + esc(r.name || r.id) + '</b><small>' + esc(courseLabel(r.course)) + '</small><small>' + esc(T.cloudLastSync) + ': ' + esc(when(r.lastSyncAt)) + '</small></span>' + g.icon('chevRight') + '</a>';
        }).join('') || '<p>' + esc(T.instructorEmpty) + '</p>';
    }
    ctx.view.querySelector('input').oninput = paint; ctx.view.querySelector('select').onchange = paint;
    ctx.view.querySelector('[data-refresh-roster]').onclick = function () { render({ name: 'instructor' }, ctx); }; paint();
  }
  function showCadet(cadet, rows, invalid, ctx, current) {
    var T = I, cover = coverage(rows, cadet.course), reportURL;
    ctx.view.innerHTML = '<div class="stack instructor"><a href="#/instructor">' + esc(T.instructorBack) + '</a><header><span class="chip">' + esc(T.cloudReadOnly) + '</span><h1 dir="auto">' + esc(cadet.name) + '</h1><p>' + esc(courseLabel(cadet.course)) + ' · ' + esc(T.cloudLastSync) + ': ' + esc(when(cadet.lastSyncAt)) + '</p></header>' +
      '<p class="fineprint">' + esc(T.instructorAsOf) + '</p>' + (invalid ? '<p role="alert">' + esc(T.instructorDataError) + '</p>' : '') +
      '<section class="cloud-progress"><h2>' + esc(T.instructorCoverage) + '</h2><strong dir="ltr">' + cover.done + ' / ' + cover.total + '</strong><progress max="' + (cover.total || 1) + '" value="' + cover.done + '"></progress><p class="fineprint">' + esc(T.instructorCoverageNote) + '</p></section>' +
      '<div data-cadet-stats class="cloud-stats"></div><details class="cloud-filter-panel"><summary>' + esc(T.instructorFilters) + '</summary><div class="cloud-filters"><label>' + esc(T.instructorFrom) + '<input type="date" data-from></label><label>' + esc(T.instructorTo) + '<input type="date" data-to></label><label class="cloud-filter-wide">' + esc(T.instructorSearchFlight) + '<input type="search" dir="auto" data-flight-search></label><label>' + esc(T.course) + '<select data-record-course>' + courseOptions() + '</select></label><label>' + esc(T.instructorAllStages) + '<select data-stage><option value="">' + esc(T.instructorAllStages) + '</option><option value="brief">' + esc(T.stageBrief) + '</option><option value="done">' + esc(T.stageDebrief) + '</option></select></label></div>' +
      '<div class="cloud-actions"><button class="btn btn--quiet" data-week>' + esc(T.instructorWeek) + '</button><button class="btn btn--quiet" data-clear-filters>' + esc(T.instructorClear) + '</button></div>' +
      '<label class="cloud-checkbox"><input type="checkbox" data-deleted>' + esc(T.instructorShowDeleted) + '</label></details>' +
      '<div class="cloud-actions"><button class="btn" data-report>' + esc(T.instructorReport) + '</button><button class="btn btn--quiet" data-refresh-cadet>' + esc(T.cloudRefresh) + '</button></div><div data-report-preview></div><div data-cloud-flights class="stack"></div></div>';
    var $ = function (s) { return ctx.view.querySelector(s); }, selected = [];
    function paint() {
      var from = $('[data-from]').value, to = $('[data-to]').value, q = $('[data-flight-search]').value.trim().toLocaleLowerCase(), stage = $('[data-stage]').value, c = $('[data-record-course]').value;
      selected = rows.filter(function (p) { var r = p.record; return (!p.deletedAt || $('[data-deleted]').checked) && (!from || r.flownAt >= from) && (!to || r.flownAt <= to) && (!stage || r.stage === stage) && (!c || r.course === c) && (!q || JSON.stringify(r.answers).toLocaleLowerCase().includes(q)); }).sort(function (a, b) { return b.record.flownAt.localeCompare(a.record.flownAt); });
      var s = report(selected);
      $('[data-cadet-stats]').innerHTML = [[T.instructorDone, s.flights], [T.instructorBriefs, selected.filter(function (p) { return !p.deletedAt && p.record.stage === 'brief'; }).length], [T.instructorHours, s.hours]].map(function (x) { return '<div><strong>' + esc(x[1]) + '</strong><span>' + esc(x[0]) + '</span></div>'; }).join('');
      $('[data-cloud-flights]').innerHTML = selected.map(function (p) { return details(p, true); }).join('') || '<p>' + esc(T.instructorNoFlights) + '</p>';
      $('[data-report-preview]').innerHTML = ''; if (reportURL) { URL.revokeObjectURL(reportURL); reportURL = null; }
      ctx.view.querySelectorAll('[data-history]').forEach(function (button) { button.onclick = async function () {
        button.disabled = true;
        try {
          var versions = await g.Cloud.revisions(cadet.id, button.dataset.history); if (!current()) return;
          var target = button.nextElementSibling;
          target.innerHTML = versions.map(decode).sort(function (a, b) { return (+b.record.updatedAt || 0) - (+a.record.updatedAt || 0); }).map(function (p) { return details(p, false); }).join('');
        } catch (_) { if (current()) ctx.toast(T.cloudLoadError, 'alert'); }
        finally { if (current()) button.disabled = false; }
      }; });
    }
    ctx.view.querySelectorAll('input,select').forEach(function (el) { el.addEventListener(el.type === 'search' ? 'input' : 'change', paint); });
    $('[data-week]').onclick = function () {
      var date = new Date(), start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
      var end = new Date(start); end.setDate(start.getDate() + 6);
      function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
      $('[data-from]').value = iso(start); $('[data-to]').value = iso(end); paint();
    };
    $('[data-clear-filters]').onclick = function () { ctx.view.querySelectorAll('input,select').forEach(function (el) { el.value = ''; if (el.type === 'checkbox') el.checked = false; }); paint(); };
    $('[data-refresh-cadet]').onclick = function () { render({ name: 'instructor', param: cadet.id }, ctx); };
    $('[data-report]').onclick = function () {
      var html = g.Summary.documentHTML(report(selected), { compact: false, identity: cadet.name, strings: I, lang: 'en', dir: 'ltr', courseLabel: courseLabel });
      var preview = $('[data-report-preview]'); preview.innerHTML = '<a class="btn btn--quiet" data-report-download download="sortie-instructor-report.doc">' + esc(T.instructorDownload) + '</a><iframe class="cloud-report" sandbox title="' + esc(T.instructorReport) + '"></iframe>';
      preview.querySelector('iframe').srcdoc = html;
      if (reportURL) URL.revokeObjectURL(reportURL);
      reportURL = URL.createObjectURL(new Blob([html], { type: 'application/msword;charset=utf-8' })); preview.querySelector('a').href = reportURL;
    };
    paint();
  }
  g.addEventListener('sortie:cloud-status', function () {
    // Do not redraw a cadet's editor or reset an instructor's active filters.
    if (document.body.dataset.route === 'cloud' && g.Instructor.context) statusPanel(g.Instructor.context);
    if (document.body.dataset.route === 'instructor' && g.Instructor.context &&
        (g.Cloud.status().role !== 'instructor' || !g.Instructor.context.view.querySelector('.instructor'))) {
      var param = String(location.hash).split('/')[2];
      render({ name: 'instructor', param: param ? decodeURIComponent(param) : null }, g.Instructor.context);
    }
  });
  g.Instructor = { render: function (route, ctx) { g.Instructor.context = ctx; g.Instructor.route = route; return render(route, ctx); },
    isEnglish: isEnglish, labelFor: labelFor, decode: decode, coverage: coverage, report: report };
})(window);
