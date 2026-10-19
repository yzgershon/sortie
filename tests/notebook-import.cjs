const assert = require('node:assert/strict');
const C = require('../js/notebook-import-core.js');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
const qs = [
  { id: 'renamed-subject', type: 'text', role: 'subject', stage: 'brief', inDebrief: 'edit', label: 'נושא חדש' },
  { id: 'g', type: 'goals', role: 'goals', stage: 'brief', inDebrief: 'edit', label: 'מטרות' },
  { id: 's', type: 'syllabus', stage: 'brief', inDebrief: 'edit', label: 'תרגילים' },
  { id: 'b', type: 'textarea', stage: 'brief', inDebrief: 'none', label: 'בטיחות' },
  { id: 'd', type: 'textarea', stage: 'debrief', label: 'בטיחות' },
  { id: 'p', type: 'list', role: 'points', stage: 'debrief', label: 'נקודות' },
  { id: 'n', type: 'goals', role: 'goalsNext', stage: 'debrief', label: 'להמשך' },
  { id: 'r', type: 'text', stage: 'brief', inDebrief: 'readonly', label: 'לקריאה' },
  { id: 'gone', type: 'text', stage: 'brief', archived: true, label: 'ישן' },
  { id: 'solo', type: 'choice', role: 'solo', stage: 'debrief', label: 'אישור' }
];
const draft = { id: 'f', course: null, flownAt: '2026-01-01', stage: 'done', baseUpdatedAt: 9, createdAt: 1,
  buffers: { 'goalinput:g': 'עדיין מקליד' }, dismissed: { dismissed: 1 }, answers: {
    'renamed-subject': 'קיים', g: [{ id: 'goal', text: 'הכנה לשיעור', status: 'open', cats: ['לילה'], from: 'older', carryOf: null, course: 'rishoni' }],
    s: [{ id: 'ex', text: 'תרגיל לדוגמה', focus: 'דגש קיים', notes: 'הערה קיימת' }],
    b: 'בטיחות תדריך', d: 'בטיחות תחקיר', p: [{ id: 'point', text: 'ישן' }], n: [], r: 'קריאה', gone: 'ארכיון'
  } };
const target = (qid, stage = 'debrief') => C.targets(qs, draft, stage).find(t => t.qid === qid && !t.itemId);
let id = 0;
const plan = (rows, stage = 'debrief') => C.plan(draft, qs, stage, rows, () => 'new-' + (++id));
test('explicit Hebrew headings and terminal marks only', () => {
  const r = C.parseText('מבחן 5\nחתך:\n1. תרגיל לדוגמה\nיעדים:\n• הכנה לשיעור ✓\n2. קריאת חומר ×\nדגשים\n45 דקות\nAW text X');
  assert.equal(r.sections[0].kind, 'other'); assert.equal(r.sections[2].items[0].mark, 'met'); assert.equal(r.sections[2].items[1].mark, 'missed');
  assert.equal(r.sections[3].items[0].text, '45 דקות'); assert.equal(r.sections[3].items[1].mark, 'none');
});
test('no silent truncation', () => { assert.throws(() => C.parseText('x'.repeat(40001))); assert.throws(() => C.parseText(Array(151).fill('line').join('\n'))); });
test('invalid model structure is rejected', () => { assert.throws(() => C.validate({ sections: [{ kind: 'goals', heading: '', items: [{ text: 'x', mark: 'yes', uncertain: false }] }] })); });
test('field visibility and custom IDs respected', () => {
  const opts = C.targets(qs, draft, 'debrief'); assert(!opts.some(x => ['b', 'r', 'gone', 'solo'].includes(x.qid)));
  const empty = structuredClone(draft); empty.answers['renamed-subject'] = '';
  assert.equal(opts[C.suggested({ kind: 'subject' }, opts, empty)].qid, 'renamed-subject');
});
test('existing subject is not suggested or replaced', () => { assert.equal(C.suggested({ kind: 'subject' }, C.targets(qs, draft, 'brief'), draft), -1); assert.equal(plan([{ text: 'חדש', target: target('renamed-subject') }]).changes.length, 0); });
test('general brief highlights are left for explicit mapping', () => assert.equal(C.suggested({ kind: 'highlights' }, C.targets(qs, draft, 'brief'), draft), -1));
test('ambiguous custom syllabus choices are not guessed', () => {
  const opts = C.targets(qs.concat({ id: 's2', type: 'syllabus', stage: 'brief', label: 'עוד' }), draft, 'brief');
  assert.equal(C.suggested({ kind: 'exercises' }, opts, draft), -1);
});
test('safety goes to current stage only', () => { const opts = C.targets(qs, draft, 'debrief'); assert.equal(opts[C.suggested({ kind: 'safety', heading: 'בטיחות' }, opts, draft)].qid, 'd'); });
test('photo heading punctuation still maps to current-stage safety', () => { const opts = C.targets(qs, draft, 'debrief'); assert.equal(opts[C.suggested({ kind: 'safety', heading: 'בטיחות:' }, opts, draft)].qid, 'd'); assert.equal(C.suggested({ kind: 'safety', heading: 'בטיחות אחרת:' }, opts, draft), -1); });
test('append preserves text and unrelated record metadata', () => {
  const before = JSON.stringify(draft), r = plan([{ text: 'תוספת', target: target('d') }]);
  assert.equal(r.draft.answers.d, 'בטיחות תחקיר\nתוספת'); assert.equal(r.draft.answers.b, draft.answers.b);
  assert.deepEqual(r.draft.buffers, draft.buffers); assert.deepEqual(r.draft.dismissed, draft.dismissed); assert.equal(r.draft.course, null); assert.equal(r.draft.baseUpdatedAt, 9); assert.equal(JSON.stringify(draft), before);
});
test('exact duplicate list rows are skipped', () => assert.equal(plan([{ text: 'ישן', target: target('p') }]).changes.length, 0));
test('new rows have new IDs', () => { const r = plan([{ text: 'א', target: target('p') }, { text: 'ב', target: target('p') }]); assert.equal(new Set(r.draft.answers.p.map(x => x.id)).size, 3); });
test('existing goal grade requires its own opt-in', () => { const r = plan([{ text: 'הכנה לשיעור', grade: 'met', target: target('g') }]); assert.equal(r.draft.answers.g[0].status, 'open'); });
test('explicit grade update preserves goal identity/provenance', () => {
  const r = plan([{ text: 'הכנה לשיעור', grade: 'met', updateGrade: true, target: target('g') }]);
  assert.deepEqual(r.draft.answers.g[0], { ...draft.answers.g[0], status: 'met' });
});
test('ambiguous duplicate goals never change grades', () => {
  const copy = structuredClone(draft); copy.answers.g.push({ ...copy.answers.g[0], id: 'another' });
  assert.equal(C.plan(copy, qs, 'debrief', [{ text: 'הכנה לשיעור', grade: 'met', updateGrade: true, target: target('g') }], () => 'id').changes.length, 0);
});
test('brief goals are never graded by import', () => assert.equal(plan([{ text: 'חדש', grade: 'met', target: target('g', 'brief') }], 'brief').draft.answers.g[1].status, 'open'));
test('next-flight goals are never graded', () => assert.equal(plan([{ text: 'חדש', grade: 'missed', target: target('n') }]).draft.answers.n[0].status, 'open'));
test('exercise focus and debrief notes stay separate', () => {
  const notes = C.targets(qs, draft, 'debrief').find(x => x.itemId === 'ex'), r = plan([{ text: 'תוספת', target: notes }]);
  assert.equal(r.draft.answers.s[0].notes, 'הערה קיימת\nתוספת'); assert.equal(r.draft.answers.s[0].focus, 'דגש קיים');
});
test('cannot update protected or changed fields', () => {
  for (const qid of ['r', 'gone', 'b', 'solo', 'missing']) assert.throws(() => plan([{ text: 'x', target: { qid } }]), /FIELD_CHANGED/);
  assert.throws(() => plan([{ text: 'x', target: { qid: 's', itemId: 'ex', type: 'focus' } }]), /FIELD_CHANGED/);
});
test('old scalar list answers are never silently discarded', () => {
  const copy = structuredClone(draft); copy.answers.p = 'legacy';
  assert.throws(() => C.plan(copy, qs, 'debrief', [{ text: 'x', target: target('p') }], () => 'id'), /FIELD_CHANGED/);
});
test('second application is idempotent for appended content', () => {
  const rows = [{ text: 'חדש', target: target('p') }, { text: 'חדש', target: target('d') }], first = plan(rows);
  assert.equal(C.plan(first.draft, qs, 'debrief', rows, () => 'id').changes.length, 0);
});
console.log(checks + ' notebook import core checks passed');
