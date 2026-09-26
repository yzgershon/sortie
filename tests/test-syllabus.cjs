/* Checks for matching a typed נושא טיסה against the chart.
   Run: node dev/test-syllabus.js */
'use strict';
var fs = require('fs'), path = require('path');

var g = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'syllabus.js'), 'utf8'))(g);
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'syllabus-data.js'), 'utf8'))(g);
var R = g.SyllabusRef;

var pass = 0, fail = 0;
function is(typed, wantName) {
  var e = R.lookup(typed);
  var got = e ? e.name : null;
  if (got === wantName) { pass++; console.log('  ok   ' + typed + '  ->  ' + got); }
  else { fail++; console.log('  FAIL ' + typed + '  ->  ' + got + '   want ' + wantName); }
}

console.log('\nexact');
is('AW 7', 'AW 7');
is('מבנה 3', 'מבנה 3');
is('לילה 1', 'לילה 1');
is('א״א 8', 'א״א 8');
is('מאמן 5', 'מאמן 5');

console.log('\nhe typed more than the name');
is('AW 7 לילה', 'AW 7');
is('מבנה 3 סולו', 'מבנה 3');

console.log('\nhe typed less: the chart carries a description he would never type');
is('ניווט 4', 'ניווט 4 - עובדה הלוך');
is('ניווט 5', 'ניווט 5 - עובדה חזור');
is('ניווט 6', 'ניווט 6 - קרוסלה');
is('לילה 5', 'לילה 5 צ׳ק סולו לילה');
is('מאמן 0', 'מאמן 0 (גיחת הדגמה)');
is('מאמן 6', 'מאמן 6 - מבחן במאמן');
is('מכשירים 1', 'מכשירים 1 (לילה)');
is('SBT מבנה 1', 'SBT מבנה 1 (עצמאי)');
is('SBT מבנה 2', 'SBT מבנה 2 (SBT מדריך)');
is('ניווט SBT 2', 'ניווט SBT 2 זמן יומי – ניווט מערכת רוח ותיקונים');

console.log('\nspelling and punctuation still fold');
is('aw7', 'AW 7');
is('אווירובטיקה 7', 'AW 7');
is('א"א 8', 'א״א 8');
is('ניווט5', 'ניווט 5 - עובדה חזור');

console.log('\nambiguous or absent: fill nothing rather than guess');
is('מבנה', null);          // nine גיחות start with it
is('ניווט', null);
is('מאמן', null);
is('AW', null);
is('AW 30', null);         // must never collapse into AW 3
is('הקפות 12', null);      // no such section in the chart he sent
is('', null);
is('טיסת היכרות', null);

console.log('\nevery גיחה is reachable by its short name');
var unreachable = [];
R.all().forEach(function (e) {
  var m = /^(.*?\d+)\s+\S/.exec(e.name);
  if (m && !R.lookup(m[1])) unreachable.push(m[1] + ' -> ' + e.name);
});
if (unreachable.length) { fail++; console.log('  FAIL ' + unreachable.length + ' unreachable:'); unreachable.forEach(function (u) { console.log('        ' + u); }); }
else { pass++; console.log('  ok   all ' + R.count() + ' reachable'); }

console.log('\nevery גיחה still finds itself by its full name');
var self = 0;
R.all().forEach(function (e) { if ((R.lookup(e.name) || {}).name !== e.name) self++; });
if (self) { fail++; console.log('  FAIL ' + self + ' do not match their own name'); }
else { pass++; console.log('  ok   all ' + R.count() + ' match themselves'); }

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
