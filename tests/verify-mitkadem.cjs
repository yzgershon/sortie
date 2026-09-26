/* Proves the מתקדם chart in the app is reachable, and that every category a
 * מתקדם pilot can pick actually leads somewhere.
 *
 * This is the check the ראשוני chart did not have when two whole sections went
 * missing for a week, and the one that caught five missing sections while this
 * syllabus was being transcribed. Run it any time the chart data changes:
 *   node dev/verify-mitkadem.js [--full]
 */
'use strict';
var fs = require('fs'), path = require('path');
process.stdout.setDefaultEncoding && process.stdout.setDefaultEncoding('utf8');

var g = {};
function load(f) {
  new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'))(g);
}
load('courses.js');
load('syllabus.js');
load('syllabus-data.js');
load('syllabus-mitkadem.js');

var R = g.SyllabusRef;
R.setCourse('mitkadem');
var CATS = g.Courses.get('mitkadem').categories;
var ALIASES = g.Courses.get('mitkadem').aliases || {};

var pass = 0, fail = 0, warn = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '   << ' + extra : '')); }
}
function note(s) { warn++; console.log('  --   ' + s); }

var all = R.all('mitkadem'), secs = {};
all.forEach(function (e) { (secs[e.section] = secs[e.section] || []).push(e); });

console.log('\n=== what the app holds');
Object.keys(secs).forEach(function (s) {
  console.log('  ' + String(secs[s].length).padStart(3) + '  ' + s);
});
console.log('  ' + String(all.length).padStart(3) + '  TOTAL' +
  '   (' + all.reduce(function (n, e) { return n + e.items.length; }, 0) + ' תרגילים, ' +
  all.reduce(function (n, e) { return n + e.goals.length; }, 0) + ' יעדים מומלצים)');

console.log('\n=== the catalogue is sane');
ok('the course is selectable', !!g.Courses.get('mitkadem'));
ok('it is not the ראשוני chart', R.count('mitkadem') !== R.count('rishoni'));
ok('every entry has a name', all.every(function (e) { return !!e.name; }));
ok('no two entries share a name', (function () {
  var seen = {}, dupes = [];
  all.forEach(function (e) { if (seen[e.name]) dupes.push(e.name); seen[e.name] = 1; });
  if (dupes.length) console.log('       duplicated: ' + dupes.join(', '));
  return !dupes.length;
})());
ok('every entry belongs to a section', all.every(function (e) { return !!e.section; }));
all.filter(function (e) { return !e.items.length; }).forEach(function (e) {
  note('no חתך rows: ' + e.name + '  [' + e.section + ']');
});

console.log('\n=== a simulator גיחה is never mistaken for the air one');
var sims = all.filter(function (e) { return e.sim; });
ok('there are simulator sessions', sims.length > 0);
ok('every one of them says so in its name',
   sims.every(function (e) { return /^מאמן/.test(e.name); }),
   sims.filter(function (e) { return !/^מאמן/.test(e.name); }).map(function (e) { return e.name; }).join(', '));
sims.forEach(function (e) {
  if (!e.raw || e.raw === e.name) return;
  var air = all.filter(function (x) { return !x.sim && x.name === e.raw; })[0];
  if (air) ok('"' + e.raw + '" resolves to both ' + e.name + ' and the air sortie',
              R.candidates(e.raw).length >= 2);
});

console.log('\n=== every category a מתקדם pilot can pick reaches the chart');
console.log('  categories: ' + CATS.join(' · '));
CATS.forEach(function (cat) {
  var hits = all.filter(function (e) {
    return R.norm(e.name).indexOf(R.norm(cat)) !== -1 ||
           R.norm(e.section).indexOf(R.norm(cat)) !== -1;
  });
  ok('"' + cat + '" reaches ' + hits.length + ' גיחות', hits.length > 0);
});

console.log('\n=== the spellings the chart itself uses both resolve');
Object.keys(ALIASES).forEach(function (a) {
  var target = ALIASES[a];
  ok('"' + a + '" is a known spelling of "' + target + '"', CATS.indexOf(target) !== -1);
});

console.log('\n=== typing a גיחה finds it');
var probes = [
  'חתפים 3', 'בנ״ז 1', 'בנז 1', 'הסבה 2', 'מאמן 0', 'צ״א 2', 'מוגבל 1',
  'קא״ב 5', 'מאמן קא״ב 2', 'מאמן הכנות 1', 'הכנות 1', 'לילה הכרות 1'
];
probes.forEach(function (p) {
  var c = R.candidates(p);
  ok('"' + p + '" → ' + (c.length === 1 ? c[0].name : c.length + ' candidates'), c.length >= 1,
     c.length === 0 ? 'nothing' : undefined);
});

console.log('\n=== a name that means two things asks instead of guessing');
['SBT', 'סולו 1'].forEach(function (p) {
  var c = R.candidates(p);
  ok('"' + p + '" offers ' + c.length + ' choices rather than picking one', c.length > 1,
     c.map(function (e) { return e.name; }).join(', '));
  ok('and lookup() refuses to choose for "' + p + '"', R.lookup(p) === null);
});

console.log('\n=== the ראשוני chart is untouched by any of this');
R.setCourse('rishoni');
ok('ראשוני still has its 125 גיחות', R.count() === 125);
ok('and AW 7 still resolves there', !!R.lookup('AW 7'));
ok('a מתקדם name does NOT resolve in ראשוני', R.lookup('חתפים 3') === null);
R.setCourse('mitkadem');
ok('a ראשוני name does NOT resolve in מתקדם', R.lookup('AW 7') === null);

if (process.argv.indexOf('--full') !== -1) {
  console.log('\n=== full listing');
  all.forEach(function (e) {
    console.log('\n' + e.name + (e.sim ? '  [מאמן]' : '') + '   [' + e.section + ']' +
      (e.minutes ? '  ' + e.minutes + " דק'" : ''));
    e.items.forEach(function (t) { console.log('    חתך · ' + t); });
    e.goals.forEach(function (t) { console.log('    יעד · ' + t); });
  });
}

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + warn + ' to note\n');
process.exit(fail ? 1 : 0);
