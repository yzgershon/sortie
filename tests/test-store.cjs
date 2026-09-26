/* Regression checks retained from v22, with intentional v23 behavior changes.
   Run: node tests/test-store.cjs from the repo root. */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '   ' + extra : '')); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), '\n       got ' + JSON.stringify(a) + '\n       want ' + JSON.stringify(b)); }

/* --- a window just real enough for store.js ------------------------------- */
function freshStore() {
  var mem = {};
  // length and key() are part of the real Storage API and pruneDrafts walks
  // with them; a stub without them silently prunes nothing
  var ls = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem: function (k, v) { mem[k] = String(v); },
    removeItem: function (k) { delete mem[k]; },
    key: function (i) { return Object.keys(mem)[i]; },
    get length() { return Object.keys(mem).length; }
  };
  var sandbox = {
    localStorage: ls, navigator: {}, indexedDB: null,
    console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise,
    JSON: JSON, Date: Date, Math: Math, Object: Object, Array: Array, String: String,
    isSecureContext: false
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  // courses.js first: the category vocabulary and the spelling aliases both
  // come from the active course now, and a store with no Courses has neither
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'courses.js'), 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8'), sandbox);
  return { S: sandbox.Store, ls: ls, mem: mem };
}

function subj(text) { return { q_subject: text }; }

/* ========================================================================== */
console.log('\nגוררים יעדים לפי קטגוריה');
(function () {
  var f = freshStore();
  return f.S.init().then(function (Store) {
    // an AW flight that missed one goal and set one for next time
    return Store.save({
      flownAt: '2026-08-01', stage: 'done',
      answers: {
        q_subject: 'AW 7',
        q_goals: [{ text: 'להחזיק גובה בלופ', status: 'missed' },
                  { text: 'סריקה', status: 'met' }],
        q_goals_next: [{ text: 'כניסה מדויקת לצ׳אנדל' }]
      }
    }).then(function () {
      var pend = Store.nextGoals();
      eq('two goals waiting', pend.map(function (g) { return g.text; }).sort(),
         ['כניסה מדויקת לצ׳אנדל', 'להחזיק גובה בלופ'].sort());
      eq('both tagged AW', pend.every(function (g) { return g.cats.join() === 'AW'; }), true);

      eq('an AW brief gets them', Store.pendingGoalsFor(['AW']).length, 2);
      eq('a מבנה brief gets none', Store.pendingGoalsFor(['מבנה']).length, 0);
      eq('an unnamed subject gets none', Store.pendingGoalsFor([]).length, 0);
      eq('newBrief carries nothing until he names it',
         (Store.newBrief().answers.q_goals || []).length, 0);

      // now a מבנה flight — the AW goals must survive it untouched
      return Store.save({
        flownAt: '2026-08-02', stage: 'done',
        answers: {
          q_subject: 'מבנה 3',
          q_goals: [{ text: 'מרווחים', status: 'missed' }]
        }
      });
    }).then(function () {
      var byCat = {};
      Store.nextGoals().forEach(function (g) { byCat[g.cats.join()] = (byCat[g.cats.join()] || 0) + 1; });
      eq('AW goals untouched by a מבנה flight', byCat.AW, 2);
      eq('מבנה picked up its own', byCat['מבנה'], 1);
      eq('a מבנה brief sees only מבנה',
         Store.pendingGoalsFor(['מבנה']).map(function (g) { return g.text; }), ['מרווחים']);

      // flying AW again and meeting them clears AW only
      return Store.save({
        flownAt: '2026-08-03', stage: 'done',
        answers: {
          q_subject: 'AW 8',
          q_goals: [{ text: 'להחזיק גובה בלופ', status: 'met' },
                    { text: 'כניסה מדויקת לצ׳אנדל', status: 'met' }]
        }
      });
    }).then(function () {
      eq('AW cleared', Store.pendingGoalsFor(['AW']).length, 0);
      eq('מבנה still waiting', Store.pendingGoalsFor(['מבנה']).length, 1);
    });
  });
})()

/* ========================================================================== */
.then(function () {
  console.log('\nטיסה עם שתי קטגוריות');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    return Store.save({
      flownAt: '2026-08-01', stage: 'done',
      answers: {
        q_subject: 'מבנה 3 לילה',
        q_goals: [{ text: 'קו ייחוס', status: 'missed' }]
      }
    }).then(function () {
      eq('tagged with both', Store.nextGoals()[0].cats.slice().sort(), ['לילה', 'מבנה'].sort());
      eq('the next מבנה gets it', Store.pendingGoalsFor(['מבנה']).length, 1);
      eq('the next לילה gets it too', Store.pendingGoalsFor(['לילה']).length, 1);
      eq('a ניווט does not', Store.pendingGoalsFor(['ניווט']).length, 0);
    });
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nיעד שנכתב ביד בבית');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    Store.addNextGoal('לקרוא צ׳קליסט בקול');
    eq('untagged', Store.nextGoals()[0].cats, []);
    eq('rides any flight', Store.pendingGoalsFor(['AW']).length, 1);
    eq('and a fresh brief', (Store.newBrief().answers.q_goals || []).length, 1);
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nקטגוריות מתוך נושא טיסה');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    eq('AW 7', Store.categoriesInText('AW 7'), ['AW']);
    eq('אווירובטיקה counts as AW', Store.categoriesInText('אווירובטיקה 7'), ['AW']);
    eq('and is not doubled', Store.categoriesInText('AW אווירובטיקה'), ['AW']);
    // the chart writes these out in full; both spellings must file the same way
    eq('מבנה מתקדם counts as מ״מ too',
       Store.categoriesInText('מבנה מתקדם 3').sort(), ['מבנה', 'מ״מ'].sort());
    eq('מ״מ on its own', Store.categoriesInText('מ״מ 3'), ['מ״מ']);
    eq('גנ״מ', Store.categoriesInText('גנ״מ 2'), ['גנ״מ']);
    eq('מאמן חירומים is a מאמן flight', Store.categoriesInText('מאמן חירומים 8'), ['מאמן']);
    eq('gershayim folds', Store.categoriesInText('א"א 8'), ['א״א']);
    eq('two at once', Store.categoriesInText('מבנה 3 לילה').sort(), ['לילה', 'מבנה'].sort());
    eq('empty', Store.categoriesInText(''), []);
    eq('nothing known', Store.categoriesInText('טיסת היכרות'), []);
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nנקודות עיקריות כרשימה');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    var q = Store.question('q_points');
    eq('is a list now', q.type, 'list');
    return Store.save({
      flownAt: '2026-08-01', stage: 'done',
      answers: { q_subject: 'AW 7', q_points: [{ text: 'גבוה בבייס' }, { text: 'תזמון' }] }
    }).then(function (rec) {
      eq('two bullets', rec.answers.q_points.length, 2);
      ok('each has an id', rec.answers.q_points.every(function (x) { return !!x.id; }));
      eq('linesOf', Store.linesOf(rec.answers.q_points), ['גבוה בבייס', 'תזמון']);
      ok('asText bullets them', Store.asText(rec).indexOf('  • גבוה בבייס') !== -1);
      ok('csv joins them', Store.toCSV().indexOf('גבוה בבייס | תזמון') !== -1);
    });
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nהגירה ממתקין ישן');
  var f = freshStore();
  // an install from before this change: q_points is a textarea, q_solo has no
  // role, one flight answered q_points as a plain string, one goal has no cats
  var old = {
    schema: 4, theme: 'dark',
    questions: [
      { id: 'q_subject', label: 'נושא טיסה', type: 'text', role: 'subject', stage: 'brief',
        inDebrief: 'edit', options: ['AW', 'ניווט'], order: 0 },
      { id: 'q_goals', label: 'היעדים שלי', type: 'goals', role: 'goals', stage: 'brief',
        inDebrief: 'edit', order: 1 },
      { id: 'q_points', label: 'נקודות עיקריות', type: 'textarea', stage: 'debrief', order: 2 },
      { id: 'q_solo', label: 'אישור לסולו', type: 'choice', options: ['כן', 'לא'], stage: 'debrief', order: 3 },
      { id: 'q_goals_next', label: 'יעדים לטיסה הבאה', type: 'goals', role: 'goalsNext',
        stage: 'debrief', order: 4 }
    ],
    nextGoals: [{ id: 'g_old', text: 'יעד ישן', status: 'open' }]
  };
  f.ls.setItem('sortie:settings', JSON.stringify(old));
  f.ls.setItem('sortie:mirror', JSON.stringify([{
    id: 'f_old', flownAt: '2026-07-01', stage: 'done', createdAt: 1, updatedAt: 1,
    answers: { q_subject: 'AW 3', q_points: 'שורה אחת\nשורה שנייה' }
  }]));
  return f.S.init().then(function (Store) {
    eq('q_points became a list', Store.question('q_points').type, 'list');
    eq('q_solo got its role', Store.question('q_solo').role, 'solo');
    eq('roleQuestion finds it', Store.roleQuestion('solo').id, 'q_solo');
    eq('his renamed label survived', Store.question('q_goals').label, 'היעדים שלי');
    eq('old answer split into bullets',
       Store.linesOf(Store.get('f_old').answers.q_points), ['שורה אחת', 'שורה שנייה']);
    eq('old goal is untagged, so it still rides the next flight',
       Store.pendingGoalsFor(['AW']).length, 1);
    eq('the מאמן category was merged in',
       Store.categoryVocab().indexOf('מאמן') !== -1, true);
    eq('additive migration recorded', Store.settings().mig, 5);
    eq('נקודות עיקריות got its role too', Store.roleQuestion('points').id, 'q_points');
    // this pilot had deleted מדריך, so the instructor breakdown has to cope
    eq('a missing מדריך question is simply absent', Store.roleQuestion('instructor'), null);
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nמיזוג אחסון עדיין תקין');
  var f = freshStore();
  f.ls.setItem('sortie:mirror', JSON.stringify([
    { id: 'a', flownAt: '2026-08-01', stage: 'done', createdAt: 1, updatedAt: 5, answers: { q_subject: 'AW 1' } },
    { id: 'b', flownAt: '2026-08-02', stage: 'done', createdAt: 1, updatedAt: 5, answers: { q_subject: 'AW 2' } }
  ]));
  return f.S.init().then(function (Store) {
    eq('both records survive a load with no indexeddb', Store.count(), 2);
  });
})

/* ========================================================================== */
/* Editing a flight that is already debriefed must not rewrite the goal shelf.
   Both of these were real: fixing a typo on an old AW flight resurrected goals
   a later flight had achieved, and it dropped goals a later flight of the same
   category was still waiting on. */
.then(function () {
  console.log('\nעריכת טיסה שכבר תוחקרה לא משכתבת את מאגר היעדים');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    var aw7;
    function texts() { return Store.nextGoals().map(function (g) { return g.text; }).sort(); }

    return Store.save({
      flownAt: '2026-08-01', stage: 'done',
      answers: { q_subject: 'AW 7', q_goals: [{ text: 'גובה בלופ', status: 'missed' }] }
    }).then(function (r) {
      aw7 = r;
      eq('AW 7 leaves one goal waiting', texts(), ['גובה בלופ']);
      // the next AW flight pulls it in and achieves it
      return Store.save({
        flownAt: '2026-08-05', stage: 'done',
        answers: { q_subject: 'AW 8', q_goals: [{ text: 'גובה בלופ', status: 'met' }] }
      });
    }).then(function () {
      eq('achieving it clears the shelf', texts(), []);
      var edit = JSON.parse(JSON.stringify(Store.get(aw7.id)));
      edit.answers.q_instructor = 'רועי';
      return Store.save(edit);
    }).then(function () {
      eq('editing AW 7 does not resurrect it', texts(), []);

      // and an edit that DOES change a verdict is applied
      var edit = JSON.parse(JSON.stringify(Store.get(aw7.id)));
      edit.answers.q_goals = [{ text: 'גובה בלופ', status: 'met' }];
      return Store.save(edit).then(function () {
        eq('marking it met on the old flight keeps the shelf empty', texts(), []);
        var back = JSON.parse(JSON.stringify(Store.get(aw7.id)));
        back.answers.q_goals = [{ text: 'גובה בלופ', status: 'missed' },
                                { text: 'סריקה', status: 'missed' }];
        return Store.save(back);
      });
    }).then(function () {
      eq('a newly missed goal on an old flight does come back', texts(), ['סריקה']);
    });
  });
})

.then(function () {
  console.log('\nעריכת טיסה ישנה לא מוחקת יעד של טיסה חדשה יותר');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    var first;
    function texts() { return Store.nextGoals().map(function (g) { return g.text; }).sort(); }
    return Store.save({
      flownAt: '2026-08-01', stage: 'done',
      answers: { q_subject: 'ניווט 3', q_goals: [{ text: 'ניהול דלק', status: 'missed' }] }
    }).then(function (r) {
      first = r;
      return Store.save({
        flownAt: '2026-08-06', stage: 'done',
        answers: { q_subject: 'ניווט 4', q_goals: [Object.assign({}, Store.nextGoals()[0], { status: 'met' }), { text: 'תזמון נקודות', status: 'missed' }] }
      });
    }).then(function () {
      // ניווט 4 pulled ניהול דלק in and settled it, so only its own goal waits
      eq('the newer ניווט flight owns the shelf', texts(), ['תזמון נקודות']);
      var edit = JSON.parse(JSON.stringify(Store.get(first.id)));
      edit.answers.q_area = 'צפון';
      return Store.save(edit);
    }).then(function () {
      eq('editing the older one leaves it alone', texts(), ['תזמון נקודות']);
    });
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nטיוטה לכל טופס בנפרד');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    Store.saveDraft({ id: '', flownAt: '2026-08-10', answers: { a: 1 } });
    Store.saveDraft({ id: 'f1', answers: { a: 'brief' } }, 'brief');
    Store.saveDraft({ id: 'f1', answers: { a: 'debrief' } }, 'debrief');

    eq('the new-brief slot is its own', Store.readDraft().answers.a, 1);
    eq('a flight brief draft', Store.readDraft('f1', 'brief').answers.a, 'brief');
    eq('a flight debrief draft, separate', Store.readDraft('f1', 'debrief').answers.a, 'debrief');

    Store.clearDraft('f1', 'brief');
    eq('clearing one leaves the other', Store.readDraft('f1', 'brief'), null);
    eq('the debrief draft survives', Store.readDraft('f1', 'debrief').answers.a, 'debrief');

    // a single-slot draft written by v20 still loads
    f.ls.setItem('sortie:draft', JSON.stringify({ id: '', answers: { a: 'legacy' } }));
    Store.clearDraft();
    f.ls.setItem('sortie:draft', JSON.stringify({ id: '', answers: { a: 'legacy' } }));
    eq('the old single slot is still read', Store.readDraft().answers.a, 'legacy');

    // and a draft for a flight that no longer exists is swept up
    Store.saveDraft({ id: 'gone', answers: {} }, 'debrief');
    Store.pruneDrafts();
    eq('an orphaned draft remains recoverable', Store.readDraft('gone', 'debrief'), { id: 'gone', answers: {} });
  });
})

/* ========================================================================== */
.then(function () {
  console.log('\nמחיקה הפיכה');
  var f = freshStore();
  return f.S.init().then(function (Store) {
    return Store.save({
      flownAt: '2026-08-02', stage: 'done',
      answers: { q_subject: 'AW 4', q_points: [{ text: 'נקודה' }] }
    }).then(function (r) {
      return Store.remove(r.id).then(function (gone) {
        eq('remove hands back the record', !!(gone && gone.id === r.id), true);
        eq('and it is off the list', Store.count(), 0);
        return Store.restore(gone).then(function () {
          eq('restore puts it back', Store.count(), 1);
          eq('with its answers intact',
             Store.get(r.id).answers.q_points[0].text, 'נקודה');
        });
      });
    });
  });
})

.then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
}, function (e) { console.error(e); process.exit(1); });
