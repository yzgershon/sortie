// An older release -> current build on one disposable origin. No real cloud calls.
const assert=require('node:assert/strict'),cp=require('child_process'),path=require('path');
const {browser,root}=require('./support.cjs');let b,mode='old',checks=0;
const baseline=process.env.SORTIE_UPGRADE_FROM||'81f3dfa';
const old={};for(const name of cp.execFileSync('git',['ls-tree','-r','--name-only',baseline],{cwd:root,encoding:'utf8'}).trim().split('\n')){
 if(/^(js\/|css\/|index.html$)/.test(name))old[name]=cp.execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:10*1024*1024});
}
function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
const fixture=`window.releaseCloud={notify:null,role:'cadet',active:true,rows:[],calls:0};window.FirebaseAdapter=function(){return{
 restore:async()=>({uid:"a",email:"a@example.test",verified:true}),onUser:fn=>{releaseCloud.notify=fn},access:async()=>({role:releaseCloud.role,active:releaseCloud.active}),
 signOut:async()=>releaseCloud.notify(null),signIn:async()=>{throw Error('No real OAuth in this test')},
 put:async(uid,item)=>{releaseCloud.calls++;releaseCloud.rows.push({uid,payload:item.payload});return{conflict:false}},complete:async()=>{}
}};`;
(async()=>{
 b=await browser({source:(file,data)=>mode==='old'?(old[path.relative(root,file).replace(/\\/g,'/')]||data):data,respond:(req,res,p)=>{
  if(mode!=='new')return;
  const configs={'/js/auth-config.js':'window.AUTH_CONFIG={clientId:"fixture",allow:["a@example.test","b@example.test"],courses:{}};',
   '/js/cloud-config.js':'window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}};',
   '/js/firebase-adapter.js':fixture};
  if(configs[p]){res.setHeader('Content-Type','text/javascript');res.end(configs[p]);return true;}
 }});
 await b.ev(`(async()=>{
 Store.updateQuestion('q_subject',{label:'נושא אישי'});Store.addQuestion({id:'custom',label:'שאלה אישית',type:'textarea',stage:'debrief'});
 await Store.save({id:'history',stage:'done',flownAt:'2026-09-20',course:'rishoni',answers:{q_subject:'AW 3',q_minutes:60,custom:'הערה שנשמרה',q_goals:[{id:'g',text:'דיוק',status:'missed'}]}});
 await Store.save({id:'pending',stage:'brief',flownAt:'2026-09-21',course:'rishoni',answers:{q_subject:'AW 4'}});
 Store.saveDraft({answers:{q_subject:'PRIVATE DRAFT'}});Store.addNextGoal('PRIVATE SHELF');
 Workspace.saveNote({title:'PRIVATE NOTE',body:'PRIVATE BODY',priority:2});Workspace.milestone({title:'PRIVATE MILESTONE',course:'rishoni'});
 Store.set('pilotProfile',{name:'PRIVATE NAME',callsign:'PRIVATE CALLSIGN',focus:'PRIVATE FOCUS'});Store.set('installDismissed',true);Store.set('releaseSeen','v23');
 localStorage.setItem('sortie:auth',JSON.stringify({email:'a@example.test',exp:Date.now()+1000000}));window.preUpgrade=true;
 })()`);
 const state="JSON.stringify({flights:Store.all(),questions:Store.questions(true),goals:Store.nextGoals(),draft:Store.readDraft(),workspace:Workspace.all(),settings:Store.settings()})";
 const before=await b.ev(state);mode='new';await b.send('Page.reload');await b.until("typeof preUpgrade==='undefined'&&typeof Cloud!=='undefined'&&Cloud.status().phase==='connecting'");
 check('upgrade from '+baseline+' preserves every saved record and private workspace',await b.ev(state)===before);
 check('sharing update shows no announcement, tour or connection modal',await b.ev("!document.querySelector('#sheet').open&&!document.querySelector('.tour')&&document.body.dataset.route==='home'"));
 check('existing verified Firebase session remains usable without a forced sign-out',await b.ev("!document.querySelector('#app').hidden&&Auth.session().email==='a@example.test'"));
 check('pre-cloud history remembers its original local account',await b.ev("JSON.parse(localStorage.getItem('sortie:cloud-local-owner'))==='a@example.test'"));
 check('no upload before a verified cloud identity',await b.ev('releaseCloud.calls===0'));
 await b.ev("localStorage.setItem('sortie:auth',JSON.stringify({email:'b@example.test',exp:Date.now()+1000000}));void releaseCloud.notify({uid:'b',email:'b@example.test',verified:true})");await b.until("Cloud.status().phase==='account-mismatch'");
 check('a different first cloud account cannot take ownership of old flights',await b.ev("releaseCloud.calls===0&&!localStorage.getItem('sortie:cloud-binding')"));
 await b.ev("localStorage.setItem('sortie:auth',JSON.stringify({email:'a@example.test',exp:Date.now()+1000000}));releaseCloud.active=false;void releaseCloud.notify({uid:'a',email:'a@example.test',verified:true})");await b.until("Cloud.status().phase==='not-enrolled'");
 check('revoked account cannot auto-connect',await b.ev('releaseCloud.calls===0'));
 await b.ev("releaseCloud.active=true;void releaseCloud.notify({uid:'a',email:'a@example.test',verified:false})");await b.until("Cloud.status().phase==='account-mismatch'");
 check('unverified identity cannot auto-connect',await b.ev('releaseCloud.calls===0'));
 await b.ev("void releaseCloud.notify({uid:'a',email:'a@example.test',verified:true})");await b.until("Cloud.status().phase==='synced'");
 // Denial intentionally gates the real app until reauthentication. The remaining
 // checks exercise sync independently with this already verified mock identity.
 await b.ev("document.querySelector('#authGate').hidden=true;document.querySelector('#app').hidden=false");
 check('verified enrolled sign-in connects and uploads all saved history automatically',await b.ev("releaseCloud.rows.length===2&&JSON.parse(localStorage.getItem('sortie:cloud-binding')).uid==='a'"));
 check('saved Hebrew answers and renamed questions retain their original text',await b.ev("releaseCloud.rows.some(x=>x.payload.includes('הערה שנשמרה')&&x.payload.includes('נושא אישי'))"));
 check('no notebook, unfinished draft, profile, shelf or milestone is uploaded',await b.ev("!JSON.stringify(releaseCloud.rows).includes('PRIVATE')"));
 check('automatic sync never rewrites local flights, settings or notebook',await b.ev(state)===before);
 await b.ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:false});dispatchEvent(new Event('offline'));Store.save({id:'offline',stage:'brief',flownAt:'2026-09-27',answers:{q_subject:'OFFLINE SAVED'}})");
 await b.until("Cloud.status().phase==='offline'&&Cloud.status().pending===1");
 check('offline save succeeds locally without uploading',await b.ev("!!Store.get('offline')&&releaseCloud.rows.length===2"));
 await b.ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:true});dispatchEvent(new Event('online'))");await b.until("Cloud.status().phase==='synced'&&releaseCloud.rows.length===3");
 check('reconnection sends the offline saved record automatically',await b.ev("releaseCloud.rows.some(x=>x.payload.includes('OFFLINE SAVED'))"));
 await b.route('cloud','.cloud-panel');check('no separate link or confirmation button is offered',await b.ev("!document.querySelector('[data-cloud-link]')&&!document.querySelector('#sheet').open"));
 await b.ev("void Cloud.retry()");await b.until("Cloud.status().phase==='synced'");check('rechecking identity does not duplicate uploads',await b.ev('releaseCloud.calls===3'));
 await b.ev("localStorage.setItem('sortie:auth',JSON.stringify({email:'b@example.test',exp:Date.now()+1000000}));void releaseCloud.notify({uid:'b',email:'b@example.test',verified:true})");await b.until("Cloud.status().phase==='account-mismatch'");
 check('later account switching never transfers records',await b.ev('releaseCloud.calls===3'));
 check('no uncaught browser errors',b.errors.length===0);
 console.log(checks+' cloud release upgrade checks passed');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>b?.close());
