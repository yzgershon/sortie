// Disposable Chrome profile and synthetic notebook contents only.
const assert = require('assert/strict');
const { browser } = require('./support.cjs');
let b, checks = 0;
async function check(label, expression, expected = true) {
  assert.deepEqual(await b.ev(expression), expected, label);
  checks++; console.log('PASS ' + label);
}
async function tap(selector) {
  const point = await b.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function selectFolder(id) {
  await tap('[data-folders]');
  await tap('[data-folder="' + id + '"]');
  await b.until('!document.querySelector("#notebookFolders").open');
}
(async () => {
  b = await browser();
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: true });
  const folder = await b.ev(`(()=>{
    const folders=Array.from({length:8},(_,i)=>Workspace.folder('תיקייה '+i+' עם שם ארוך שצריך להתאים למסך הטלפון'));
    Workspace.saveNote({title:'עמוד לדוגמה בלבד',body:'מחשבה קצרה שנוח לפתוח בטלפון.\\nאפשר להמשיך לכתוב ולסדר את המחשבות בתיקיות.',priority:1});
    return folders[7].id;
  })()`);
  for (const theme of ['dark', 'light']) {
    await b.ev('document.documentElement.dataset.theme=' + JSON.stringify(theme));
    for (const width of [320, 360, 390, 412]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height: 780, deviceScaleFactor: 1, mobile: true });
      await b.route('notebook', '[data-folders]');
      await check(theme + ' ' + width + 'px list has two reachable main actions', `(()=>{
        const els=[...document.querySelectorAll('.notebook button')].filter(e=>e.getClientRects().length);
        return els.length===2 && document.documentElement.scrollWidth<=innerWidth && els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=52&&r.bottom<document.querySelector('#tabbar').getBoundingClientRect().top&&r.height>=44;});
      })()`);
      if (width === 360) await b.shot('mobile-notebook-list-' + theme);
      await tap('[data-folders]');
      await check(theme + ' ' + width + 'px drawer fits and receives focus', `(()=>{
        const d=document.querySelector('#notebookFolders'),r=d.getBoundingClientRect();
        return d.open&&d.contains(document.activeElement)&&r.left>=0&&Math.abs(r.right-innerWidth)<1&&r.width<=innerWidth-39&&d.scrollWidth<=d.clientWidth&&document.querySelector('[data-folders]').getAttribute('aria-expanded')==='true';
      })()`);
      await tap('[data-closefolders]');
    }
  }
  await b.ev("document.documentElement.dataset.theme='dark'");
  await tap('[data-folders]');
  await check('all eight folders remain available with totals and current selection', '[document.querySelectorAll("[data-folder]").length,document.querySelector("[data-folder][aria-current]").dataset.folder,document.querySelector("[data-folder] small").textContent]', [10, '', '1']);
  for (let i = 0; i < 14; i++) {
    await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await b.ev('document.querySelector("#notebookFolders").contains(document.activeElement)||document.activeElement===document.body'), true, 'Tab must not reach background actions');
  }
  checks++; console.log('PASS keyboard traversal keeps background actions inert');
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await b.until('!document.querySelector("#notebookFolders").open&&document.querySelector("[data-folders]").getAttribute("aria-expanded")==="false"');
  await check('Escape closes sidebar and restores toggle focus', 'document.activeElement===document.querySelector("[data-folders]")&&document.activeElement.getAttribute("aria-expanded")==="false"');
  await tap('[data-folders]');
  await b.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{x:8,y:300}] });
  await b.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await check('touch outside sidebar closes it', '!document.querySelector("#notebookFolders").open');
  await selectFolder(folder);
  await tap('[data-folders]');
  await b.ev("document.querySelector('.notebook-drawer__tools').scrollIntoView({block:'end'})");
  await b.shot('mobile-notebook-sidebar');
  await tap('[data-closefolders]');
  await tap('[data-newnote]');
  await b.until("!!document.querySelector('#noteBody')");
  const note = await b.ev("location.hash.split('/').pop()");
  const saved = 'Workspace.note(' + JSON.stringify(note) + ')';
  await check('touch creates a note in the selected folder', saved + '.folder', folder);
  await check('editor hides secondary controls and bottom navigation', 'document.querySelector("#tabbar").hidden&&!document.querySelector("#noteOptions").open&&!document.querySelector("[data-deletenote]").checkVisibility()');
  await b.type('#noteTitle', 'מחשבה לדוגמה בטלפון');
  await b.type('#noteBody', 'שורה בעברית\nAW 3: example only\nהתוכן נשמר גם אחרי שינוי גודל המסך.');
  await tap('#noteOptions summary');
  await b.type('#notePriority', '2');
  await b.until("document.querySelector('#noteState').textContent===T.draftSaved");
  await tap('#noteOptions summary');
  for (const size of [{width:320,font:16},{width:360,font:24},{width:390,font:16},{width:412,font:16}]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: 780, deviceScaleFactor: 1, mobile: true });
    await b.ev('document.documentElement.style.fontSize=' + JSON.stringify(size.font + 'px'));
    await check(size.width + 'px editor with ' + size.font + 'px text fits', `(()=>{
      const controls=[...document.querySelectorAll('.notebook input,.notebook textarea,.notebook summary')];
      return document.documentElement.scrollWidth<=innerWidth&&controls.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;});
    })()`);
    if (size.width === 360) await b.shot('mobile-notebook-large-text');
    if (size.width === 390) await b.shot('mobile-notebook-editor');
    await tap('#noteOptions summary');
    await check(size.width + 'px expanded settings fit with touch-size inputs', `(()=>{
      const els=[...document.querySelectorAll('#noteOptions select,#noteOptions button')];
      return document.documentElement.scrollWidth<=innerWidth&&els.every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=44;})&&[...document.querySelectorAll('#noteOptions select')].every(e=>parseFloat(getComputedStyle(e).fontSize)>=16);
    })()`);
    await tap('#noteOptions summary');
  }
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 420, deviceScaleFactor: 1, mobile: true });
  await check('short viewport retains a visible save status', `(()=>{const r=document.querySelector('#noteState').getBoundingClientRect();return r.top>=52&&r.bottom<innerHeight;})()`);
  await b.type('#noteBody', 'טקסט שנכתב ממש לפני החזרה למחברת');
  await tap('[data-back]');
  await b.until("!!document.querySelector('[data-folders]')");
  await check('Back saves the latest text and restores list navigation', '[' + saved + '.body,document.querySelector("#tabbar").hidden]', ['טקסט שנכתב ממש לפני החזרה למחברת', false]);
  await check('selected folder is retained on returning', 'document.querySelector("[data-folder][aria-current]").dataset.folder', folder);
  await b.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 780, deviceScaleFactor: 1, mobile: true });
  await tap('[data-folders]');
  await tap('.notebook-drawer .notebook__options summary');
  await tap('[data-renamefolder]');
  await b.type('#folderTitle', 'תיקייה ששמה עודכן');
  await b.click('#sheet [data-act="0"]');
  await check('renaming folder preserves its note and updates the heading', '[document.querySelector(".notebook__heading h1").textContent,' + saved + '.folder]', ['תיקייה ששמה עודכן', folder]);
  await tap('[data-folders]');
  await tap('.notebook-drawer .notebook__options summary');
  await tap('[data-deletefolder]');
  await b.click('#sheet [data-act="0"]');
  await check('removing folder keeps the page and its latest text', '[' + saved + '.folder,' + saved + '.body]', ['', 'טקסט שנכתב ממש לפני החזרה למחברת']);
  await selectFolder('inbox');
  await b.type('#noteSearch', 'טקסט שנכתב');
  await check('search finds saved text after moving the page', 'document.querySelectorAll(".note-page").length', 1);
  await b.type('#noteSearch', 'no-match-example');
  await check('empty search gives an accurate explanation', 'document.querySelector(".notebook__empty h2").textContent', await b.ev('T.noteSearchEmpty'));
  await b.type('#noteSearch', '');
  await b.route('notebook/' + note, '#noteBody');
  await tap('#noteOptions summary');
  await b.type('#noteBody', 'נשמר גם בזמן נעיצה');
  await tap('[data-pinnote]');
  await check('pinning preserves pending text and restores options focus', '[' + saved + '.body,' + saved + '.pinned,document.activeElement===document.querySelector("#noteOptions summary")]', ['נשמר גם בזמן נעיצה', true, true]);
  await tap('#noteOptions summary');
  await tap('[data-deletenote]');
  await b.click('#sheet [data-act="0"]');
  await b.until("!!document.querySelector('[data-folders]')");
  await check('delete stays recoverable with page text retained', '!!' + saved + '.deletedAt&&' + saved + '.body==="נשמר גם בזמן נעיצה"');
  await check('no uncaught browser errors', 'true', b.errors.length === 0);
  console.log(checks + ' mobile notebook checks passed'); b.close();
})().catch(e => { console.error(e); if (b) { console.error(b.errors); b.close(); } process.exitCode = 1; });
