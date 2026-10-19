/* Notebook import is a draft-only, additive operation. No persistence or model calls here. */
(function (g) {
  'use strict';
  var kinds = ['subject', 'exercises', 'goals', 'highlights', 'safety', 'other'];
  function clean(value) { return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); }
  function key(value) { return clean(value).replace(/\s+/g, ' '); }
  function validate(value) {
    if (!value || !Array.isArray(value.sections) || value.sections.length > 24) throw Error('INVALID_RESULT');
    var count = 0;
    return { sections: value.sections.map(function (section) {
      if (!section || kinds.indexOf(section.kind) < 0 || typeof section.heading !== 'string' || section.heading.length > 160 || !Array.isArray(section.items)) throw Error('INVALID_RESULT');
      return { kind: section.kind, heading: clean(section.heading), items: section.items.map(function (item) {
        if (++count > 150 || !item || typeof item.text !== 'string' || item.text.length > 3000 || typeof item.uncertain !== 'boolean' || ['none', 'met', 'missed', 'unclear'].indexOf(item.mark) < 0) throw Error('INVALID_RESULT');
        return { text: clean(item.text), mark: item.mark, uncertain: item.uncertain };
      }) };
    }) };
  }
  // A local fallback for text copied with the phone's own text-selection tool.
  // Only explicit headings/marks are recognized; no semantic guessing.
  function parseText(text) {
    if (typeof text !== 'string' || text.length > 40000) throw Error('INVALID_RESULT');
    var headings = { 'נושא': 'subject', 'נושא טיסה': 'subject', 'חתך': 'exercises', 'סילבוס': 'exercises', 'יעדים': 'goals', 'דגשים': 'highlights', 'נקודות עיקריות': 'highlights', 'בטיחות': 'safety' };
    var sections = [], current;
    text.split(/\r?\n/).forEach(function (line) {
      var raw = clean(line); if (!raw) return;
      var title = raw.replace(/[:：]\s*$/, ''), kind = headings[title];
      if (kind) { current = { kind: kind, heading: title, items: [] }; sections.push(current); return; }
      if (!current) { current = { kind: 'other', heading: '', items: [] }; sections.push(current); }
      var mark = /[✓✔]\s*$/.test(raw) ? 'met' : /[✗✘×]\s*$/.test(raw) ? 'missed' : 'none';
      raw = raw.replace(/^[\s]*([•*-]|\d+[.)])\s+/, '').replace(/[✓✔✗✘×]\s*$/, '').trim();
      if (raw) current.items.push({ text: raw, mark: mark, uncertain: false });
    });
    return validate({ sections: sections });
  }
  function editable(q, stage) { return q && !q.archived && (q.stage === stage || (stage === 'debrief' && q.stage === 'brief' && q.inDebrief === 'edit')); }
  function targets(questions, draft, stage) {
    var out = [];
    questions.filter(function (q) { return editable(q, stage); }).forEach(function (q) {
      if (['text', 'textarea', 'list', 'goals', 'syllabus'].indexOf(q.type) < 0) return;
      out.push({ qid: q.id, type: q.type, label: q.label, role: q.role || '', itemId: null });
      if (q.type === 'syllabus' && Array.isArray(draft.answers[q.id])) draft.answers[q.id].forEach(function (item) {
        out.push({ qid: q.id, type: stage === 'brief' ? 'focus' : 'notes', label: item.text, role: '', itemId: item.id });
      });
    });
    return out;
  }
  function suggested(section, options, draft) {
    var matches = options.filter(function (t) {
      if (section.kind === 'subject') return t.role === 'subject' && !clean(draft.answers[t.qid]);
      if (section.kind === 'goals') return t.role === 'goals' && t.type === 'goals';
      if (section.kind === 'exercises') return t.type === 'syllabus';
      if (section.kind === 'highlights') return t.role === 'points' && t.type === 'list';
      if (section.kind === 'safety') return key(t.label).replace(/[:：]$/, '') === key(section.heading).replace(/[:：]$/, '') && ['text', 'textarea', 'list'].indexOf(t.type) >= 0;
      return false;
    });
    return matches.length === 1 ? options.indexOf(matches[0]) : -1;
  }
  function append(old, text) { return clean(old) ? String(old) + '\n' + text : text; }
  function plan(draft, questions, stage, rows, uid) {
    var out = JSON.parse(JSON.stringify(draft)), changes = [], skipped = 0;
    if (!Array.isArray(rows) || rows.length > 150) throw Error('INVALID_RESULT');
    rows.forEach(function (row) {
      var text = clean(row.text), target = row.target;
      if (!target || !text) { skipped++; return; }
      if (text.length > 3000) throw Error('INVALID_RESULT');
      var q = questions.find(function (q) { return q.id === target.qid; });
      if (!editable(q, stage)) throw Error('FIELD_CHANGED');
      var value = out.answers[q.id];
      if (target.itemId) {
        if (q.type !== 'syllabus' || target.type !== (stage === 'brief' ? 'focus' : 'notes') || !Array.isArray(value)) throw Error('FIELD_CHANGED');
        var ex = value.find(function (x) { return x.id === target.itemId; });
        if (!ex) throw Error('FIELD_CHANGED');
        if (String(ex[target.type] || '').split('\n').some(function (v) { return key(v) === key(text); })) { skipped++; return; }
        ex[target.type] = append(ex[target.type], text);
      } else if (q.type === 'text' || q.type === 'textarea') {
        // A scalar answer can be filled if empty; otherwise only textareas append.
        // Never replace a subject, instructor or another existing single-line answer.
        if (q.type === 'text' && clean(value)) { skipped++; return; }
        if (String(value || '').split('\n').some(function (v) { return key(v) === key(text); })) { skipped++; return; }
        out.answers[q.id] = append(value, text);
      } else if (['list', 'goals', 'syllabus'].indexOf(q.type) >= 0) {
        if (value != null && !Array.isArray(value) && clean(value)) throw Error('FIELD_CHANGED');
        if (!Array.isArray(value)) value = out.answers[q.id] = [];
        var existing = value.filter(function (item) { return key(item.text) === key(text); });
        // Existing goal grades change only through a separate explicit opt-in.
        var grade = stage === 'debrief' && q.role === 'goals' && ['met', 'missed'].indexOf(row.grade) >= 0 ? row.grade : 'open';
        if (existing.length) {
          if (existing.length === 1 && q.type === 'goals' && row.updateGrade === true && grade !== 'open' && existing[0].status !== grade) existing[0].status = grade;
          else { skipped++; return; }
        } else {
          var item = { id: uid(q.type === 'goals' ? 'g' : q.type === 'syllabus' ? 'ex' : 'i'), text: text };
          if (q.type === 'goals') Object.assign(item, { status: grade, cats: [], from: null });
          if (q.type === 'syllabus') Object.assign(item, { focus: '', notes: '' });
          value.push(item);
        }
      } else throw Error('FIELD_CHANGED');
      changes.push({ qid: q.id, text: text });
    });
    return { draft: out, changes: changes, skipped: skipped };
  }
  var api = { validate: validate, parseText: parseText, targets: targets, suggested: suggested, plan: plan, key: key };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else g.NotebookImportCore = api;
})(typeof window === 'undefined' ? globalThis : window);
