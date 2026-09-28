// Security/upgrade checks use disposable Chrome and synthetic accounts only.
const assert=require('node:assert/strict');
const {browser}=require('./support.cjs');let b,enabled=false,checks=0;
function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
const fixture=`
window.securityMock={user:JSON.parse(localStorage.getItem('test:user')||'null'),active:true,notify:null};
if(localStorage.getItem('test:offline'))Object.defineProperty(navigator,'onLine',{configurable:true,value:false});
window.FirebaseAdapter=()=>({restore:async()=>securityMock.user,
 onUser:fn=>{securityMock.notify=fn;fn(securityMock.user)},
 access:async()=>{if(!navigator.onLine)throw {code:'unavailable'};return {active:securityMock.active,role:'cadet'}},
 put:async()=>({conflict:false}),complete:async()=>{},signOut:async()=>{securityMock.user=null;securityMock.notify?.(null)},
 signIn:async()=>{throw Error('No real sign-in in test')}
});`;
const state="JSON.stringify({flights:Store.all(),settings:Store.settings(),drafts:Store.drafts(),workspace:Workspace.all()})";
async function reload(ready){await b.ev('window.securityBeforeReload=true');await b.send('Page.reload');await b.until("typeof securityBeforeReload==='undefined'&&("+ready+")");}
(async()=>{
 b=await browser({respond:(req,res,p)=>{
  if(!enabled)return;
  const files={'/js/auth-config.js':'window.AUTH_CONFIG={clientId:"fixture",allow:["cadet@example.test","other@example.test"],courses:{}};',
   '/js/cloud-config.js':'window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}};',
   '/js/firebase-adapter.js':fixture};
  if(files[p]){res.setHeader('Content-Type','text/javascript');res.end(files[p]);return true;}
 }});
 await b.ev(`(async()=>{
  await Store.save({id:'preserve',stage:'done',flownAt:'2026-09-28',answers:{q_subject:'AW 3',q_minutes:45}});
  Store.saveDraft({answers:{q_subject:'UNFINISHED BEFORE SECURITY UPDATE'}});
  Workspace.saveNote({title:'PRIVATE NOTE',body:'Keep original notebook'});
  Store.updateQuestion('q_subject',{label:'Customized subject'});Store.set('releaseSeen','v23');Store.set('motion','off');
  localStorage.setItem('sortie:auth',JSON.stringify({email:'cadet@example.test',exp:Date.now()+86400000}));
 })()`);
 const before=await b.ev(state);enabled=true;
 await reload("typeof Store!=='undefined'&&!document.querySelector('#authGate').hidden");
 check('legacy local-only session requires verified sign-in',await b.ev("document.querySelector('#app').hidden&&!document.querySelector('#emergencyExport')"));
 check('security upgrade gate preserves all existing work',await b.ev(state)===before);
 await b.ev("localStorage.setItem('test:user',JSON.stringify({uid:'cadet',email:'cadet@example.test',verified:true}))");
 await reload("!document.querySelector('#app').hidden&&Cloud.status().phase==='synced'");
 check('restored verified enrolled account opens and syncs',await b.ev("!!localStorage.getItem('sortie:verified-access')"));
 check('verification does not rewrite flights, drafts, notebook or preferences',await b.ev(state)===before);
 check('backup and raw recovery exclude verification credentials',await b.ev("!Store.toJSON().includes('sortie:verified-access')&&!Store.emergencyJSON().includes('sortie:verified-access')"));
 await b.ev("localStorage.setItem('test:user',JSON.stringify({uid:'other',email:'other@example.test',verified:true}));localStorage.setItem('sortie:auth',JSON.stringify({email:'other@example.test',exp:Date.now()+10000}))");
 await reload("!document.querySelector('#authGate').hidden");
 check('another enrolled account cannot open existing local records',await b.ev("document.querySelector('#app').hidden&&document.querySelector('#gateNote').textContent===T.cloudStates['account-mismatch']"));
 check('account mismatch preserves the original account data',await b.ev(state)===before);
 await b.ev("localStorage.setItem('test:user',JSON.stringify({uid:'cadet',email:'cadet@example.test',verified:true}));localStorage.setItem('sortie:auth',JSON.stringify({email:'cadet@example.test',exp:Date.now()+10000}))");
 await reload("!document.querySelector('#app').hidden&&Cloud.status().phase==='synced'");
 await b.ev("localStorage.setItem('test:offline','yes')");
 await reload("!document.querySelector('#app').hidden&&document.body.dataset.route==='home'");
 check('previously verified device retains offline access',await b.ev("navigator.onLine===false&&Store.count()===1"));
 check('offline opening preserves all work',await b.ev(state)===before);
 await b.ev("localStorage.removeItem('test:offline')");
 await reload("Cloud.status().phase==='synced'");
 await b.ev("securityMock.notify(null)");
 await b.until("!document.querySelector('#authGate').hidden");
 check('Firebase session loss gates an already open app',await b.ev("document.querySelector('#app').hidden&&!localStorage.getItem('sortie:verified-access')"));
 check('session loss preserves saved and unfinished work',await b.ev(state)===before);
 await reload("!document.querySelector('#app').hidden&&Cloud.status().phase==='synced'");
 await b.ev(`window.violations=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
 const script=document.createElement('script');script.textContent='window.injected=true';document.body.append(script);
 const image=document.createElement('img');image.setAttribute('onerror','window.injectedHandler=true');image.src='data:image/png,broken';document.body.append(image);
 fetch('https://unexpected.example.invalid/leak').catch(()=>{});`);
 await b.until("violations.includes('script-src-elem')&&violations.includes('script-src-attr')&&violations.includes('connect-src')");
 check('CSP blocks injected inline script and event handlers',await b.ev("!window.injected&&!window.injectedHandler"));
 check('CSP blocks connections outside approved services',await b.ev("violations.includes('connect-src')"));
 check('referrer policy hides app URL from external destinations',await b.ev("document.querySelector('meta[name=referrer]').content==='no-referrer'"));
 await b.route('brief','[data-q=q_subject]');
 const subject='input[data-q="q_subject"]';
 // The subject may be rendered by a shared question wrapper.
 await b.ev(`(()=>{const input=document.querySelector('[data-q="q_subject"] input')||document.querySelector('input[data-q="q_subject"]');if(!input)throw Error('Subject missing');input.value='UNSAVED AT REVOCATION';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 await b.ev('securityMock.active=false;void Cloud.retry()');
 await b.until("!document.querySelector('#authGate').hidden");
 check('server revocation closes the app while it is open',await b.ev("document.querySelector('#app').hidden&&Cloud.status().phase==='not-enrolled'"));
 check('revocation flushes unfinished typing without deleting saved history',await b.ev("Store.count()===1&&JSON.stringify(Store.readDraft()).includes('UNSAVED AT REVOCATION')&&JSON.stringify(Workspace.all()).includes('PRIVATE NOTE')"));
 check('revocation removes the offline receipt',await b.ev("!localStorage.getItem('sortie:verified-access')"));
 await b.ev("localStorage.setItem('test:offline','yes')");
 await reload("!document.querySelector('#authGate').hidden");
 check('revoked device cannot reopen using an offline receipt',await b.ev("document.querySelector('#app').hidden&&Store.count()===1"));
 check('no uncaught browser exceptions',b.errors.length===0);
 console.log(checks+' browser security and preservation checks passed');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>b?.close());
