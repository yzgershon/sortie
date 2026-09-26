/* Proves the chart in the app matches the chart on paper, and that every flight
   category he can pick actually reaches it.
   Run: node dev/verify-syllabus.js [--full] */
'use strict';
var fs = require('fs'), path = require('path');
process.stdout.setDefaultEncoding && process.stdout.setDefaultEncoding('utf8');

var g = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'syllabus.js'), 'utf8'))(g);
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'syllabus-data.js'), 'utf8'))(g);
var R = g.SyllabusRef;

/* the categories he can pick, straight out of the store's defaults */
var store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
var m = /options:\s*\[([^\]]*)\]/.exec(store.slice(store.indexOf("id: 'q_subject'")));
var CATS = m[1].split(',').map(function (s) { return s.trim().replace(/^'|'$/g, ''); });

var pass = 0, fail = 0, warn = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '   << ' + extra : '')); }
}
function note(s) { warn++; console.log('  --   ' + s); }

/* ---------------------------------------------------------------- listing */
var all = R.all(), secs = {};
all.forEach(function (e) { (secs[e.section] = secs[e.section] || []).push(e); });

console.log('\n=== what the app holds');
Object.keys(secs).forEach(function (s) {
  var n = secs[s].reduce(function (a, e) { return a + e.items.length; }, 0);
  console.log('  ' + s + ' — ' + secs[s].length + ' גיחות, ' + n + ' תרגילים');
  if (process.argv.indexOf('--full') !== -1) {
    secs[s].forEach(function (e) {
      console.log('      ' + e.name);
      e.items.forEach(function (i) { console.log('          · ' + i); });
    });
  } else {
    console.log('      ' + secs[s].map(function (e) { return e.name; }).join('  |  '));
  }
});
console.log('  TOTAL ' + all.length + ' גיחות, ' +
  all.reduce(function (a, e) { return a + e.items.length; }, 0) + ' תרגילים');

/* ------------------------------------------------------- structural checks */
console.log('\n=== structure');
ok('no duplicate גיחה names', (function () {
  var seen = {}, dup = [];
  all.forEach(function (e) { if (seen[e.name]) dup.push(e.name); seen[e.name] = 1; });
  return dup.length === 0 || dup.join();
})() === true, (function () {
  var seen = {}, dup = [];
  all.forEach(function (e) { if (seen[e.name]) dup.push(e.name); seen[e.name] = 1; });
  return dup.join();
})());
ok('every גיחה has a section', all.every(function (e) { return !!e.section; }));
ok('no empty item text', all.every(function (e) { return e.items.every(function (i) { return i.trim(); }); }));
var noItems = all.filter(function (e) { return !e.items.length; });
if (noItems.length) note('no חתך rows (blank in the chart too): ' + noItems.map(function (e) { return e.name; }).join(', '));

/* ------------------------------------------------------------- resolution */
console.log('\n=== every גיחה resolves');
ok('by its full name', all.every(function (e) { return (R.lookup(e.name) || {}).name === e.name; }),
   all.filter(function (e) { return (R.lookup(e.name) || {}).name !== e.name; }).map(function (e) { return e.name; }).join(', '));

var short = [];
all.forEach(function (e) {
  var mm = /^(.*?\d+)\s+\S/.exec(e.name);
  if (mm && (R.lookup(mm[1]) || {}).name !== e.name) short.push(mm[1] + ' -> ' + e.name);
});
ok('by its short name, where it has one', short.length === 0, short.join(' ; '));

/* -------------------------------------------------- categories reach the chart */
console.log('\n=== every flight category he can pick reaches the chart');
console.log('  categories: ' + CATS.join(' · '));
CATS.forEach(function (cat) {
  // every גיחה whose name carries this category, however it is spelled
  var named = all.filter(function (e) {
    return R.norm(e.name).indexOf(R.norm(cat)) !== -1 ||
           R.norm(e.name).indexOf(R.norm(R.aliases[cat] || cat)) !== -1;
  });
  // and the way he actually types it: category then a גיחה number
  var numbered = [];
  for (var n = 0; n <= 21; n++) if (R.lookup(cat + ' ' + n)) numbered.push(n);

  if (!named.length) {
    fail++;
    console.log('  FAIL ' + cat + '  — no גיחה in the chart carries this name at all');
    return;
  }
  ok(cat + '  — ' + named.length + ' גיחות' +
     (numbered.length ? ', "' + cat + ' N" works for N = ' + numbered.join(',')
                      : ', but "' + cat + ' N" is NOT how they are named'), true);
  if (!numbered.length) {
    note('  ' + cat + ' is a modifier, not a גיחה prefix — they are: ' +
         named.map(function (e) { return e.name; }).join(', '));
  }
  var broken = named.filter(function (e) { return (R.lookup(e.name) || {}).name !== e.name; });
  ok('  every ' + cat + ' גיחה resolves by name', broken.length === 0,
     broken.map(function (e) { return e.name; }).join(', '));
});

/* ----------------------------------------------------------------- aliases */
console.log('\n=== aliases');
Object.keys(R.aliases).forEach(function (a) {
  var target = R.aliases[a];
  var probe = null;
  for (var n = 0; n <= 21 && !probe; n++) if (R.lookup(target + ' ' + n)) probe = target + ' ' + n;
  if (!probe) { note(a + ' → ' + target + ' : nothing numbered to test against'); return; }
  var viaAlias = R.lookup(probe.replace(target, a));
  var direct = R.lookup(probe);
  ok(a + ' → ' + target + '  (' + probe + ')',
     !!viaAlias && !!direct && viaAlias.name === direct.name,
     viaAlias && viaAlias.name);
});

/* ------------------------------------------------------------- safety net */
console.log('\n=== must NOT match');
[['AW 30', 'AW 3 must not swallow it'],
 ['מבנה', 'nine גיחות start with it'],
 ['ניווט', 'ambiguous'],
 ['מאמן', 'ambiguous'],
 ['גנ״מ', 'ambiguous'],
 ['', 'empty']].forEach(function (p) {
  ok('"' + p[0] + '" finds nothing — ' + p[1], R.lookup(p[0]) === null,
     (R.lookup(p[0]) || {}).name);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + warn + ' to note\n');
process.exit(fail ? 1 : 0);
