// Actual v27 -> current announcement, restored sign-in and preserved private work.
// Disposable Chrome, synthetic history and no external services.
const assert = require('node:assert/strict'), cp = require('node:child_process'), path = require('node:path');
const { browser, root } = require('./support.cjs');
let b, checks = 0, mode = 'old', gated = false;
const old = Object.fromEntries(['js/app.js', 'js/features.js'].map(file => [file,
  cp.execFileSync('git', ['show', '5f86b85:' + file], { cwd: root, maxBuffer: 1024 * 1024 })]));
const state = "JSON.stringify({flights:Store.all(),settings:{...Store.settings(),releaseSeen:null},drafts:Store.drafts(),workspace:Workspace.all()})";
function check(name, value) { assert.ok(value, name); checks++; console.log('PASS ' + name); }
async function reload(ready) {
  await b.ev('window.beforeTourReload=true'); await b.send('Page.reload');
  await b.until("typeof beforeTourReload==='undefined'&&(" + ready + ')');
}
const home = "!document.querySelector('#app').hidden&&document.body.dataset.route==='home'";
(async () => {
  b = await browser({
    source(file, data) {
      const name = path.relative(root, file).replace(/\\/g, '/');
      if (mode === 'old' && old[name]) return old[name];
      if (mode === 'preview' && name === 'js/app.js') return data.toString().replace(/var BUILD = '[^']+'/, "var BUILD = 'v28-preview'");
      if (mode === 'patch' && name === 'js/app.js') return data.toString().replace(/var BUILD = '[^']+'/, "var BUILD = 'v29'");
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
    Store.set('installDismissed',true); Store.set('releaseSeen','v23'); Store.set('motion','off');
    localStorage.setItem('sortie:auth',JSON.stringify({email:'cadet@example.test',exp:Date.now()+31*86400000}));
  })()`);
  gated = true;
  await reload(home);
  check('v27 existing user has already dismissed the old redesign notice', await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v23'&&Auth.session().email==='cadet@example.test'"));
  const before = await b.ev(state);
  mode = 'current'; await reload("document.querySelector('#sheet').open");
  check('current build announces notebook import despite the old acknowledgment', await b.ev("document.querySelector('.sheet__title').textContent===T.releaseTitle&&document.querySelector('#sheet [data-act=\"0\"]').textContent.trim()===T.releaseOpenBrief"));
  check('restored verified Google sign-in needs no new login to see the notice', await b.ev("Auth.session().email==='cadet@example.test'&&document.querySelector('#authGate').hidden"));
  check('notice explains photo, review and draft saving without a sharing announcement', await b.ev("document.querySelectorAll('.release-points li').length===3&&document.querySelector('#sheet').textContent.includes(T.releaseSafe)&&!document.querySelector('#sheet').textContent.includes(T.cloudTitle)&&!document.querySelector('#sheet [data-cloud-signin]')"));
  check('upgrade and notice preserve saved flights, private drafts, notebook and preferences', await b.ev(state) === before);
  for (const width of [320,390]) {
    await b.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
    check('announcement fits '+width+'px without horizontal scrolling',await b.ev("document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#sheet').scrollWidth<=document.querySelector('#sheet').clientWidth"));
    await b.shot('notebook-announcement-'+width);
    check('all announcement text can scroll clear of the action buttons at '+width+'px',await b.ev("(()=>{const sh=document.querySelector('.sheet__panel--release');sh.scrollTop=sh.scrollHeight;return document.querySelector('.release-safe').getBoundingClientRect().bottom<=document.querySelector('#sheet [data-act=\"0\"]').getBoundingClientRect().top})()"));
    await b.ev("document.querySelector('.sheet__panel--release').scrollTop=0");
  }
  await b.ev("window.originalSet=Store.set;Store.set=function(k,v){return k==='releaseSeen'?false:originalSet(k,v)}");
  await b.click('#sheet [data-act="1"]');
  check('failed acknowledgment write leaves notice open and existing marker intact',await b.ev("document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v23'")&&await b.ev(state)===before);
  await b.ev("Store.set=originalSet");
  await b.click('#sheet [data-act="1"]');
  check('dismissal changes only the announcement acknowledgment',await b.ev("Store.settings().releaseSeen==='v28'&&!document.querySelector('#sheet').open")&&await b.ev(state)===before);
  await reload(home);
  check('acknowledged announcement stays dismissed on reopen',await b.ev("!document.querySelector('#sheet').open"));
  mode='patch';await reload(home);
  check('a later maintenance build does not repeat the same announcement',await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v28'"));
  mode='current';
  for (const seen of ['v23','v24','v25','v26','v27']) {
    await b.ev(`Store.set('releaseSeen',${JSON.stringify(seen)})`);
    await reload("document.querySelector('#sheet').open");
    check('older acknowledgment '+seen+' still receives the notebook notice',await b.ev(`Store.settings().releaseSeen===${JSON.stringify(seen)}&&document.querySelector('.sheet__title').textContent===T.releaseTitle`));
    await b.click('#sheet [data-act="1"]');
  }
  await b.ev("Store.set('releaseSeen','v27');location.hash='#/settings'");
  await reload("document.body.dataset.route==='settings'");
  check('notice does not interrupt another screen',await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v27'"));
  await b.route('home');await b.until("document.querySelector('#sheet').open");
  check('returning Home offers the pending notice',true);
  await b.click('#sheet [data-act="1"]');
  await b.ev("Store.set('releaseSeen','v27')");mode='preview';await reload(home);
  check('preview neither announces nor consumes the real acknowledgment',await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v27'"));
  await b.route('whatsnew','[data-understood]');await b.click('[data-understood]');await b.until("document.body.dataset.route==='home'");
  check('manual preview acknowledgment does not consume the real notice',await b.ev("Store.settings().releaseSeen==='v27'"));
  mode='current';await b.ev("Store.setPin('1234')");
  await reload("!document.querySelector('#lockScreen').hidden");
  check('notice waits behind the PIN lock',await b.ev("!document.querySelector('#sheet').open&&Store.settings().releaseSeen==='v27'"));
  for (const key of '1234') await b.click('[data-key="'+key+'"]');
  await b.until("document.querySelector('#sheet').open");
  check('unlocking shows the notice without signing out',await b.ev("Auth.session().email==='cadet@example.test'"));
  await b.click('#sheet [data-act="0"]');
  await b.until("document.body.dataset.route==='brief'&&!!document.querySelector('[data-notebook-import]')");
  check('primary action opens the existing brief with its unfinished text intact',await b.ev("document.querySelector('[data-q=q_subject]').value==='PRIVATE UNSAVED BRIEF'&&Store.settings().releaseSeen==='v28'&&!document.querySelector('#sheet').open"));
  await b.route('whatsnew','[data-starttour]');await b.click('[data-starttour]');
  await b.until("Tour.active()&&!document.querySelector('.tour').classList.contains('is-moving')");
  check('the existing home-screen tour remains available manually',true);
  await b.click('.tour [data-t=skip]');await b.until("!document.querySelector('.tour')");
  check('no browser exceptions',b.errors.length===0);
  console.log(checks+' current-build announcement upgrade checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>b?.close());
