// Real installed-user upgrade path, using the current build rather than v23.
// Disposable Chrome profile, synthetic history and no external services.
const assert = require('node:assert/strict'), cp = require('node:child_process'), path = require('node:path');
const { browser, root } = require('./support.cjs');
let b, checks = 0, mode = 'old', gated = false;
const old = Object.fromEntries(['js/app.js', 'js/features.js'].map(file => [file,
  cp.execFileSync('git', ['show', 'ccaf4e0:' + file], { cwd: root, maxBuffer: 1024 * 1024 })]));
const state = "JSON.stringify({flights:Store.all(),settings:{...Store.settings(),releaseSeen:null},drafts:Store.drafts(),workspace:Workspace.all()})";
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
async function reload(ready) {
  await b.ev('window.beforeTourReload=true'); await b.send('Page.reload');
  await b.until("typeof beforeTourReload==='undefined'&&(" + ready + ')');
}
(async () => {
  b = await browser({
    source(file, data) {
      const name = path.relative(root, file).replace(/\\/g, '/');
      if (mode === 'old' && old[name]) return old[name];
      if (mode === 'preview' && name === 'js/app.js') return data.toString().replace(/var BUILD = '[^']+'/, "var BUILD = 'v26-preview'");
      if (mode === 'patch' && name === 'js/app.js') return data.toString().replace(/var BUILD = '[^']+'/, "var BUILD = 'v27'");
      return data;
    },
    respond(req, res, p) {
      if (!gated) return;
      const files = {
        '/js/auth-config.js': 'window.AUTH_CONFIG={clientId:"fixture",allow:["cadet@example.test"],courses:{}};',
        '/js/cloud-config.js': 'window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}};',
        '/js/firebase-adapter.js': 'window.FirebaseAdapter=function(){return{restore:async()=>({uid:"cadet",email:"cadet@example.test",verified:true}),access:async()=>({active:true,role:"cadet"}),onUser:fn=>{},signIn:async()=>{throw Error("No real sign-in")}}};'
      };
      if (files[p]) { res.setHeader('Content-Type', 'text/javascript'); res.end(files[p]); return true; }
    }
  });
  await b.ev(`(async()=>{
    await Store.save({id:'existing',stage:'done',flownAt:'2026-09-27',answers:{q_subject:'AW 3',q_minutes:60}});
    Store.updateQuestion('q_subject',{label:'Personal subject'});
    Store.saveDraft({answers:{q_subject:'PRIVATE UNSAVED BRIEF'}});
    Store.addNextGoal('PRIVATE GOAL'); Workspace.saveNote({title:'PRIVATE NOTE',body:'Preserve me'});
    Store.set('installDismissed',true); Store.set('releaseSeen',null); Store.set('motion','off');
    localStorage.setItem('sortie:auth',JSON.stringify({email:'cadet@example.test',exp:Date.now()+31*86400000}));
  })()`);
  gated = true;
  await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
  check('v25 reproduces the missed demo for an already signed-in existing user', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen===null&&Auth.session().email==='cadet@example.test'"));
  const before = await b.ev(state);
  mode = 'current';
  await reload("document.querySelector('#sheet').open");
  check('the actual current build offers the missed redesign demo', await b.ev("document.querySelector('.sheet__title').textContent===T.whatsNew&&document.querySelector('#sheet [data-act=\"0\"]').textContent.trim()===T.releaseTour"));
  check('a restored verified Firebase session needs no new sign-in for the demo', await b.ev("Auth.session().email==='cadet@example.test'&&document.querySelector('#authGate').hidden&&Cloud.status().phase==='connecting'"));
  check('the demo offer contains no instructor-sharing announcement', await b.ev("!document.querySelector('#sheet').textContent.includes(T.cloudTitle)&&!document.querySelector('#sheet [data-cloud-signin]')"));
  check('upgrade and demo offer preserve all saved and unfinished work', await b.ev(state) === before);
  await b.click('#sheet [data-act="0"]');
  await b.until("Tour.active()&&!document.querySelector('.tour').classList.contains('is-moving')");
  check('the existing user can start the tour', await b.ev("document.querySelector('#app').inert&&Store.settings().releaseSeen==='v23'"));
  await b.click('.tour [data-t=skip]'); await b.until("!document.querySelector('.tour')");
  check('starting and closing the tour do not change saved work', await b.ev(state) === before);
  await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
  check('the acknowledged demo stays dismissed on reopen', await b.ev("!document.querySelector('#sheet').open"));
  mode = 'patch';
  await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
  check('a later maintenance build does not repeat the same demo', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v23'"));
  mode = 'current';
  for (const seen of ['v23', 'v24', 'v25']) {
    await b.ev(`Store.set('releaseSeen',${JSON.stringify(seen)})`);
    await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
    check('legacy acknowledgment ' + seen + ' is honored without rewriting it', await b.ev(`!document.querySelector('#sheet').open&&Store.settings().releaseSeen===${JSON.stringify(seen)}`));
  }
  await b.ev("Store.set('releaseSeen',null);location.hash='#/settings'");
  await reload("document.body.dataset.route==='settings'");
  check('an unseen demo does not interrupt another screen', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen===null"));
  await b.route('home'); await b.until("document.querySelector('#sheet').open");
  check('returning Home offers the pending demo', true);
  await b.click('#sheet [data-act="1"]');
  await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
  check('choosing later acknowledges the demo without forcing a tour', await b.ev("!document.querySelector('#sheet').open&&!Tour.active()&&Store.settings().releaseSeen==='v23'"));
  await b.ev("Store.set('releaseSeen',null)"); mode = 'preview';
  await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
  check('preview does not announce or consume the real acknowledgment', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen===null"));
  await b.route('whatsnew', '[data-understood]'); await b.click('[data-understood]');
  await b.until("document.body.dataset.route==='home'");
  check('manual preview acknowledgment does not consume the real demo', await b.ev("Store.settings().releaseSeen===null"));
  mode = 'current'; await b.ev("Store.setPin('1234')");
  await reload("!document.querySelector('#lockScreen').hidden");
  check('the demo waits behind the PIN lock', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen===null"));
  for (const key of '1234') await b.click('[data-key="' + key + '"]');
  await b.until("document.querySelector('#sheet').open");
  check('unlocking offers the missed demo without signing out', await b.ev("Auth.session().email==='cadet@example.test'"));
  await b.click('#sheet [data-act="1"]');
  await b.route('whatsnew', '[data-starttour]'); await b.click('[data-starttour]');
  await b.until("Tour.active()&&!document.querySelector('.tour').classList.contains('is-moving')");
  check('Settings > What is new can replay the tour after acknowledgment', true);
  await b.click('.tour [data-t=skip]'); await b.until("!document.querySelector('.tour')");
  check('no browser exceptions', b.errors.length === 0);
  console.log(checks + ' current-build tour upgrade checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => b?.close());
