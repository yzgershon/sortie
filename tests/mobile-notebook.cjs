// Disposable Chrome profile and synthetic notebook contents only.
const assert = require('assert/strict');
const { browser } = require('./support.cjs');
let b, checks = 0;
async function check(label, expression, expected = true) {
  assert.deepEqual(await b.ev(expression), expected, label);
  checks++; console.log('PASS ' + label);
}
async function tap(selector) {
  const point = await b.ev(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
(async () => {
  b = await browser();
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const folder = await b.ev(`(()=>{
    const folders=Array.from({length:8},(_,i)=>Workspace.folder('תיקייה '+i+' עם שם ארוך שצריך להתאים למסך הטלפון'));
    Workspace.saveNote({title:'עמוד לדוגמה בלבד',body:'מחשבה קצרה שנוח לפתוח בטלפון.\\nאפשר להמשיך לכתוב ולסדר את המחשבות בתיקיות.',priority:1});
    return folders[7].id;
  })()`);
  for (const width of [320, 360, 390, 412]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: true });
    await b.route('notebook', '#notebookFolder');
    await check(width + 'px folder controls remain fully reachable', `(()=>{
      const els=['#notebookFolder','[data-newfolder]','[data-newnote]'].map(s=>document.querySelector(s));
      return document.documentElement.scrollWidth<=innerWidth && els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=52&&r.bottom<document.querySelector('#tabbar').getBoundingClientRect().top&&r.height>=44;});
    })()`);
    if (width === 360) await b.shot('mobile-notebook-list');
  }
  await b.type('#notebookFolder', folder);
  await check('all eight folders remain selectable', 'document.querySelector("#notebookFolder").options.length', 10);
  await tap('[data-newnote]');
  await b.until("!!document.querySelector('#noteBody')");
  const note = await b.ev("location.hash.split('/').pop()");
  await check('touch creates a note in the selected folder', 'Workspace.note(' + JSON.stringify(note) + ').folder', folder);
  await check('editor leaves screen space free of the bottom navigation', 'document.querySelector("#tabbar").hidden');
  await b.type('#noteTitle', 'מחשבה לדוגמה בטלפון');
  await b.type('#noteBody', 'שורה בעברית\nAW 3: example only\nהתוכן נשמר גם אחרי שינוי גודל המסך.');
  await b.type('#notePriority', '2');
  await b.until("document.querySelector('#noteState').textContent===T.draftSaved");
  for (const size of [{width:320,font:16},{width:360,font:24},{width:390,font:16},{width:412,font:16}]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: 780, deviceScaleFactor: 1, mobile: true });
    await b.ev('document.documentElement.style.fontSize=' + JSON.stringify(size.font + 'px'));
    await check(size.width + 'px editor with ' + size.font + 'px text fits', `(()=>{
      const controls=[...document.querySelectorAll('.notebook input,.notebook select,.notebook textarea,.notebook button')].filter(e=>!e.hidden);
      return document.documentElement.scrollWidth<=innerWidth&&controls.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;})
        &&[...document.querySelectorAll('.notebook select')].every(e=>e.getBoundingClientRect().height>=44&&parseFloat(getComputedStyle(e).fontSize)>=16);
    })()`);
    if (size.width === 360) await b.shot('mobile-notebook-large-text');
    if (size.width === 390) await b.shot('mobile-notebook-editor');
  }
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 420, deviceScaleFactor: 1, mobile: true });
  await check('short viewport retains a visible save status', `(()=>{const r=document.querySelector('#noteState').getBoundingClientRect();return r.top>=52&&r.bottom<innerHeight;})()`);
  await b.type('#noteBody', 'טקסט שנכתב ממש לפני החזרה למחברת');
  await tap('[data-back]');
  await b.until("!!document.querySelector('#notebookFolder')");
  await check('Back saves the latest text and restores list navigation', '[Workspace.note(' + JSON.stringify(note) + ').body,document.querySelector("#tabbar").hidden]', ['טקסט שנכתב ממש לפני החזרה למחברת', false]);
  await check('selected folder is retained on returning', 'document.querySelector("#notebookFolder").value', folder);
  await b.type('#notebookFolder', '');
  await b.type('#noteSearch', 'טקסט שנכתב');
  await check('search still finds the saved note', 'document.querySelectorAll(".note-page").length', 1);
  await check('no uncaught browser errors', 'true', b.errors.length === 0);
  console.log(checks + ' mobile notebook checks passed'); b.close();
})().catch(e => { console.error(e); if (b) { console.error(b.errors); b.close(); } process.exitCode = 1; });
