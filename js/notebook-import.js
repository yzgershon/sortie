/* Mobile notebook review. The source photo stays in memory and is uploaded only
   by the explicit Read photo action. No record, history or notebook is sent. */
(function (g) {
  'use strict';
  var C = g.NotebookImportCore;
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var activeClose = null;
  function configured() { return (g.NOTEBOOK_IMPORT_CONFIG || {}).endpoint === 'https://sortie-notebook-reader.yzgershon.workers.dev/readNotebook'; }
  function errorText(code) {
    return ({ OFFLINE: T.scanOffline, UNAVAILABLE: T.scanUnavailable, SIGN_IN: T.scanSignIn, FORBIDDEN: T.scanSignIn,
      TOO_MANY: T.scanLimit, INVALID_IMAGE: T.scanImageError, INVALID_RESULT: T.scanResultError,
      TIMEOUT: T.scanTimeout, FIELD_CHANGED: T.scanChanged, STORAGE: T.saveFailedBody })[code] || T.scanFailed;
  }
  async function prepare(file) {
    if (!file || file.size > 20 * 1024 * 1024 || !/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)) throw Error('INVALID_IMAGE');
    var url = URL.createObjectURL(file), img = new Image();
    try {
      await new Promise(function (resolve, reject) { img.onload = resolve; img.onerror = function () { reject(Error('INVALID_IMAGE')); }; img.src = url; });
      if (!img.naturalWidth || img.naturalWidth * img.naturalHeight > 60000000) throw Error('INVALID_IMAGE');
      // Canvas redraw removes EXIF/GPS metadata. The browser handles photo orientation.
      var scale = Math.min(1, 2400 / Math.max(img.naturalWidth, img.naturalHeight));
      var canvas = document.createElement('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      var ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var data = canvas.toDataURL('image/jpeg', .88);
      if (data.length > 4500000) throw Error('INVALID_IMAGE');
      return data;
    } finally { URL.revokeObjectURL(url); }
  }
  function open(options) {
    if (activeClose) activeClose();
    var dialog = document.createElement('dialog'); dialog.className = 'scan'; dialog.setAttribute('aria-label', T.scanTitle);
    var photo = '', controller = null, generation = 0, rows = [], selected = [], closed = false, compareScroll = null;
    var base = options.current(), fields = C.targets(options.questions(), base, options.stage), restoredReview = base.notebookImport;
    var originalFocus = document.activeElement;
    dialog.innerHTML = '<header class="scan__head"><div><small>' + esc(T.scanEyebrow) + '</small><h2>' + esc(T.scanTitle) + '</h2></div>' +
      '<div class="scan__actions"><button type="button" class="iconbtn" data-scan-compare hidden aria-pressed="false" aria-label="' + esc(T.scanPhoto) + '">' + icon('notebook') + '</button>' +
      '<button type="button" class="iconbtn" data-scan-close aria-label="' + esc(T.scanClose) + '">' + icon('x') + '</button></div></header>' +
      '<div class="scan__body"><p class="scan__hint">' + esc(T.scanIntro) + '</p><div class="scan__source">' +
      '<label class="btn btn--block" for="scanFile">' + icon('upload') + esc(T.scanChoose) + '</label>' +
      '<input id="scanFile" class="scan__file" type="file" accept="image/*">' +
      '<details data-scan-photo hidden><summary>' + esc(T.scanPhoto) + '</summary><img class="scan__photo" alt="' + esc(T.scanPhoto) + '"></details>' +
      '<p class="scan__hint">' + esc(configured() ? T.scanPrivacy : T.scanUnavailable) + '</p>' +
      '<button type="button" class="btn btn--lit btn--block" data-scan-read disabled>' + esc(T.scanRead) + '</button>' +
      '<button type="button" class="btn btn--block" data-scan-resume hidden>' + esc(T.scanResume) + '</button>' +
      '<details class="scan__paste"><summary>' + esc(T.scanPaste) + '</summary><label class="field__label" for="scanText">' + esc(T.scanPasteHint) + '</label>' +
      '<textarea id="scanText" class="ta" rows="7" dir="auto" maxlength="40000"></textarea>' +
      '<button type="button" class="btn btn--block" data-scan-parse>' + esc(T.scanOrganize) + '</button></details></div>' +
      '<p class="scan__status" role="status" aria-live="polite"></p><div data-scan-review></div></div>' +
      '<footer class="scan__foot" hidden><p data-scan-summary></p><label class="scan__check"><input type="checkbox" data-scan-checked><span>' + esc(T.scanChecked) + '</span></label>' +
      '<button type="button" class="btn btn--lit btn--block" data-scan-apply disabled>' + esc(T.scanApply) + '</button></footer>';
    document.body.appendChild(dialog);
    var $ = function (s) { return dialog.querySelector(s); };
    var status = $('.scan__status'), review = $('[data-scan-review]'), foot = $('.scan__foot');
    function say(text) { status.textContent = text; }
    function close() {
      if (closed) return; closed = true; generation++;
      if (controller) controller.abort();
      photo = ''; rows = []; selected = [];
      dialog.close(); dialog.remove(); g.removeEventListener('hashchange', close); g.removeEventListener('sortie:session-ended', close); g.removeEventListener('sortie:access-denied', close);
      if (activeClose === close) activeClose = null;
      if (originalFocus && originalFocus.isConnected) originalFocus.focus();
    }
    activeClose = close;
    g.addEventListener('hashchange', close); g.addEventListener('sortie:session-ended', close); g.addEventListener('sortie:access-denied', close);
    dialog.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    $('[data-scan-close]').onclick = close;
    $('[data-scan-compare]').onclick = function () {
      if (compareScroll === null) {
        compareScroll = dialog.scrollTop;
        $('[data-scan-photo]').open = true;
        $('[data-scan-photo]').scrollIntoView({ block: 'start' });
      } else { dialog.scrollTop = compareScroll; compareScroll = null; }
      this.setAttribute('aria-pressed', String(compareScroll !== null));
      this.setAttribute('aria-label', compareScroll === null ? T.scanPhoto : T.scanBackToReview);
    };
    $('[data-scan-resume]').onclick = function () {
      review.hidden = false; foot.hidden = !rows.length; this.hidden = true;
      summarize(true); say(T.scanResumed);
      if (rows.length) review.querySelector('h3').scrollIntoView({ block: 'start' });
    };
    function selections() {
      return rows.map(function (row, i) {
        var card = review.querySelector('[data-scan-row="' + i + '"]');
        return { text: card.querySelector('textarea').value, target: fields[+card.querySelector('[data-scan-target]').value] || null,
          grade: card.querySelector('[data-scan-grade]').value, updateGrade: card.querySelector('[data-scan-update]').checked };
      });
    }
    function stash() {
      var sections = [];
      rows.forEach(function (row, i) {
        var last = sections[sections.length - 1];
        if (!last || last.heading !== (row.heading || '')) { last = { kind: 'other', heading: row.heading || '', items: [] }; sections.push(last); }
        last.items.push({ text: selected[i].text, uncertain: row.uncertain, mark: row.mark });
      });
      if (options.stash && !options.stash({ sections: sections, selections: selected, pastedText: $('#scanText').value })) say(T.saveFailedBody);
    }
    function summarize(reset) {
      if (reset) $('[data-scan-checked]').checked = false;
      try {
        selected = selections();
        var result = C.plan(options.current(), options.questions(), options.stage, selected, function () { return 'preview'; });
        $('[data-scan-summary]').textContent = T.scanSummary(result.changes.length, result.skipped);
        $('[data-scan-apply]').disabled = !result.changes.length || !$('[data-scan-checked]').checked;
        rows.forEach(function (_, i) {
          var card = review.querySelector('[data-scan-row="' + i + '"]'), target = selected[i].target;
          var grading = target && target.type === 'goals' && target.role === 'goals' && options.stage === 'debrief';
          card.querySelector('[data-scan-grading]').hidden = !grading;
          var old = target && options.current().answers[target.qid];
          card.querySelector('[data-scan-existing]').hidden = !(grading && Array.isArray(old) && old.some(function (x) { return C.key(x.text) === C.key(selected[i].text); }));
        });
        stash();
      } catch (err) { say(errorText(err.message)); $('[data-scan-apply]').disabled = true; }
    }
    function show(value) {
      var parsed = C.validate(value); rows = []; review.innerHTML = '';
      parsed.sections.forEach(function (section) {
        var heading = document.createElement('h3'); heading.tabIndex = -1; heading.textContent = section.heading || T.scanOther; review.appendChild(heading);
        var suggested = C.suggested(section, fields, options.current());
        section.items.forEach(function (item) {
          var i = rows.length; item.heading = section.heading; rows.push(item);
          var destination = item.uncertain || item.mark === 'unclear' || item.text.indexOf('[לא ברור]') >= 0 ? -1 : suggested;
          var card = document.createElement('section'); card.className = 'scan__row'; card.dataset.scanRow = i;
          card.innerHTML = (item.uncertain || item.mark === 'unclear' ? '<p class="scan__uncertain">' + icon('alert') + esc(T.scanUncertain) + '</p>' : '') +
            '<label class="field__label" for="scanRow' + i + '">' + esc(T.scanText) + '</label>' +
            '<textarea id="scanRow' + i + '" class="ta" dir="auto" rows="2" maxlength="3000">' + esc(item.text) + '</textarea>' +
            '<label class="field__label" for="scanTarget' + i + '">' + esc(T.scanDestination) + '</label>' +
            '<select class="input" data-scan-target id="scanTarget' + i + '"><option value="-1">' + esc(T.scanSkip) + '</option>' +
            fields.map(function (f, j) { return '<option value="' + j + '"' + (j === destination ? ' selected' : '') + '>' + esc((f.type === 'focus' ? T.scanFocus + ': ' : f.type === 'notes' ? T.scanNotes + ': ' : '') + f.label) + '</option>'; }).join('') + '</select>' +
            '<div data-scan-grading><label class="field__label" for="scanGrade' + i + '">' + esc(T.scanGrade) + '</label>' +
            '<select class="input" data-scan-grade id="scanGrade' + i + '">' + ['open', 'met', 'missed'].map(function (s) { return '<option value="' + s + '"' + (item.mark === s ? ' selected' : '') + '>' + esc(T['scanGrade_' + s]) + '</option>'; }).join('') + '</select>' +
            '<label class="scan__check" data-scan-existing hidden><input type="checkbox" data-scan-update><span>' + esc(T.scanUpdateGrade) + '</span></label></div>';
          review.appendChild(card);
        });
      });
      foot.hidden = !rows.length;
      $('[data-scan-resume]').hidden = true;
      say(rows.length ? T.scanReviewHint : T.scanEmpty);
      summarize(true);
      // Keep the phone keyboard closed until the cadet chooses a line to edit.
      if (rows.length) { review.querySelector('h3').focus({ preventScroll: true }); review.querySelector('h3').scrollIntoView({ block: 'start' }); }
    }
    review.addEventListener('input', function () { summarize(true); });
    review.addEventListener('change', function () { summarize(true); });
    $('[data-scan-checked]').onchange = function () { summarize(false); };
    $('#scanFile').onchange = async function () {
      var run = ++generation; if (controller) controller.abort();
      photo = ''; $('[data-scan-read]').disabled = true;
      foot.hidden = true; review.hidden = true;
      $('[data-scan-resume]').hidden = !rows.length;
      compareScroll = null; $('[data-scan-compare]').hidden = true;
      $('[data-scan-compare]').setAttribute('aria-pressed', 'false');
      $('[data-scan-compare]').setAttribute('aria-label', T.scanPhoto);
      $('[data-scan-photo]').hidden = true; $('.scan__photo').removeAttribute('src');
      say(T.scanPreparing);
      try {
        var data = await prepare(this.files[0]);
        if (closed || run !== generation) return;
        photo = data; $('.scan__photo').src = data; $('[data-scan-photo]').hidden = false; $('[data-scan-photo]').open = true;
        $('[data-scan-compare]').hidden = false;
        $('[data-scan-read]').disabled = !configured(); say(configured() ? T.scanReady : T.scanUnavailable);
      } catch (err) { if (!closed && run === generation) say(errorText(err.message)); }
    };
    $('[data-scan-parse]').onclick = function () {
      generation++; if (controller) controller.abort();
      $('[data-scan-read]').disabled = !photo || !configured();
      try { review.hidden = false; show(C.parseText($('#scanText').value)); } catch (err) { say(errorText(err.message)); }
    };
    $('[data-scan-read]').onclick = async function () {
      if (!photo || !configured()) return;
      if (navigator.onLine === false) { say(T.scanOffline); return; }
      var endpoint = g.NOTEBOOK_IMPORT_CONFIG.endpoint;
      var run = ++generation; controller = new AbortController(); var timedOut = false;
      var timeout = setTimeout(function () { timedOut = true; controller.abort(); }, 330000);
      this.disabled = true; foot.hidden = true; review.hidden = true; $('[data-scan-resume]').hidden = true; say(T.scanReading);
      try {
        if (!g.Cloud || !Cloud.notebookToken) throw Error('SIGN_IN');
        var signal = controller.signal;
        var token = await Promise.race([Cloud.notebookToken(), new Promise(function (_, reject) {
          signal.addEventListener('abort', function () { reject(Error('TIMEOUT')); }, { once: true });
        })]);
        if (closed || run !== generation) return;
        var response = await fetch(endpoint, { method: 'POST', signal: controller.signal, redirect: 'error',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, credentials: 'omit', cache: 'no-store',
          body: JSON.stringify({ image: photo }) });
        var value = await response.json();
        if (!response.ok) throw Error(value.error || 'FAILED');
        if (!closed && run === generation) { review.hidden = false; show(value); }
      } catch (err) { if (!closed && run === generation) say(errorText(timedOut ? 'TIMEOUT' : err.message)); }
      finally { clearTimeout(timeout); if (!closed && run === generation) { $('[data-scan-read]').disabled = false; $('[data-scan-resume]').hidden = !rows.length || !review.hidden; } }
    };
    $('[data-scan-apply]').onclick = function () {
      if (this.disabled || !$('[data-scan-checked]').checked) return;
      this.disabled = true;
      try {
        var result = C.plan(options.current(), options.questions(), options.stage, selections(), Store.uid);
        if (!result.changes.length) { summarize(false); return; }
        options.apply(result.draft); close(); options.done(result.changes.length);
      } catch (err) { summarize(false); say(errorText(err.message)); }
    };
    $('#scanText').oninput = stash;
    dialog.showModal(); $('[data-scan-close]').focus();
    if (restoredReview) {
      try {
        $('#scanText').value = String(restoredReview.pastedText || '').slice(0, 40000);
        show(restoredReview);
        (restoredReview.selections || []).forEach(function (selection, i) {
          var card = review.querySelector('[data-scan-row="' + i + '"]'); if (!card) return;
          var t = selection.target;
          card.querySelector('[data-scan-target]').value = fields.findIndex(function (f) { return t && f.qid === t.qid && f.type === t.type && f.itemId === t.itemId; });
          card.querySelector('[data-scan-grade]').value = ['met', 'missed'].indexOf(selection.grade) >= 0 ? selection.grade : 'open';
          card.querySelector('[data-scan-update]').checked = selection.updateGrade === true;
        });
        summarize(true); say(T.scanRestored);
      } catch (err) { say(T.scanResultError); }
    }
  }
  g.NotebookImport = { open: open, configured: configured, prepare: prepare };
})(window);
