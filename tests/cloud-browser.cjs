const assert=require('node:assert/strict'),fs=require('fs');
const {browser}=require('./support.cjs'); let b,checks=0,gateTest=false;
function check(name,value){assert.ok(value,name);console.log('PASS '+name);checks++;}
const fixture=`
window.cloudMock={who:null,role:'instructor',rows:[],calls:[],notify:null};
window.FirebaseAdapter=function(){return {
 onUser:function(fn){cloudMock.notify=fn;},
 signIn:async function(){throw Error('no real sign in in fixture');},signOut:async function(){cloudMock.notify(null);},
 access:async function(){if(cloudMock.holdAccess)await new Promise(resolve=>cloudMock.resolveAccess=resolve);return {active:true,role:cloudMock.role};},
 roster:async function(){return [{id:'cadet-a',name:'צוער לדוגמה',course:'rishoni',instructorId:'teacher',lastSyncAt:{seconds:1790500000}},{id:'cadet-b',name:'צוער מתקדם',course:'mitkadem',instructorId:'teacher'}];},
 flights:async function(uid){cloudMock.calls.push(['read',uid]);return cloudMock.rows;},
 revisions:async function(){return cloudMock.rows.slice(0,1);},
 put:async function(uid,item){cloudMock.calls.push(['write',uid,item.payload]);return {conflict:false};},complete:async function(){}
};};`;
(async()=>{
 b=await browser({respond:(req,res,p)=>{
  if(gateTest && p==='/js/auth-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.AUTH_CONFIG={clientId:"fixture",allow:[],courses:{}}');return true;}
  if(p==='/js/cloud-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}}');return true;}
  if(p==='/js/firebase-adapter.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return true;}
 }});
 check('unverified session has no visible sharing shortcut',await b.ev("!Array.from(document.querySelectorAll('a[href=\"#/cloud\"]')).some(el=>el.checkVisibility())"));
 await b.route('settings','#questionEditor');
 check('settings hides sharing until instructor membership is verified',await b.ev("!Array.from(document.querySelectorAll('a[href=\"#/cloud\"],[data-act=\"cloud\"],[data-act=\"instructor\"]')).some(el=>el.checkVisibility())"));
 await b.route('instructor','[data-cloud-pending]');
 check('session restoration shows loading rather than false denial',await b.ev("!document.querySelector('#view').textContent.includes(T.instructorEnglish.instructorDenied)"));
 await b.ev(`cloudMock.holdAccess=true;localStorage.setItem('sortie:auth',JSON.stringify({email:'teacher@example.test',exp:Date.now()+1000000}));void cloudMock.notify({uid:'teacher',email:'teacher@example.test',verified:true});`);
 await b.until("!!cloudMock.resolveAccess");
 check('pending enrollment check keeps loading message',await b.ev("!!document.querySelector('[data-cloud-pending]')&&!document.querySelector('#view').textContent.includes(T.instructorEnglish.instructorDenied)"));
 await b.ev("cloudMock.holdAccess=false;cloudMock.resolveAccess()");
 await b.until("Cloud.status().role==='instructor'");
 await b.route('settings','#questionEditor');
 check('verified instructor sees sharing and dashboard entries',await b.ev("document.querySelector('#view [data-act=\"cloud\"]').checkVisibility()&&document.querySelector('#view [data-act=\"instructor\"]').checkVisibility()"));
 await b.ev("window.settingsElement=document.querySelector('#questionEditor');void cloudMock.notify(null)");
 await b.until("!Cloud.status().role");
 check('loss of verified identity hides entries without rebuilding settings',await b.ev("settingsElement===document.querySelector('#questionEditor')&&!document.querySelector('#view [data-act=\"cloud\"]').checkVisibility()&&!document.querySelector('#view [data-act=\"instructor\"]').checkVisibility()"));
 await b.ev("void cloudMock.notify({uid:'teacher',email:'teacher@example.test',verified:true})");
 await b.until("Cloud.status().role==='instructor'");
 check('restoring instructor membership reveals entries without navigation',await b.ev("settingsElement===document.querySelector('#questionEditor')&&document.querySelector('#view [data-act=\"cloud\"]').checkVisibility()&&document.querySelector('#view [data-act=\"instructor\"]').checkVisibility()"));
 await b.ev(`(()=>{
 const qs=Store.questions(true).concat([{id:'custom_old',label:'שאלה היסטורית',type:'textarea',archived:true}]);
 const records=[
 {id:'f1',stage:'done',flownAt:'2026-09-20',course:'rishoni',createdAt:1,updatedAt:2,answers:{q_subject:'AW 1',q_minutes:60,q_goals:[{text:'דיוק',status:'missed'}],custom_old:'<img src=x onerror=alert(1)>',q_points:[{text:'תחקיר שנשמר'},{text:'Hold altitude at 3,000 ft'}],q_area:'צפון',q_solo:'כן'}},
 {id:'f2',stage:'done',flownAt:'2026-09-21',course:'rishoni',createdAt:2,updatedAt:3,answers:{q_subject:'AW 2',q_minutes:30,q_goals:[{text:'דיוק',status:'missed'}]}},
 {id:'f3',stage:'brief',flownAt:'2026-09-22',course:'rishoni',createdAt:3,updatedAt:4,answers:{q_subject:'AW 3'}},
 {id:'gone',stage:'done',flownAt:'2026-09-19',course:'rishoni',createdAt:0,updatedAt:1,answers:{q_subject:'AW 4',q_minutes:120}}
 ];cloudMock.rows=records.map((r,i)=>({id:'doc'+i,digest:String(i),payload:JSON.stringify(CloudCore.project(r,qs,r.id==='gone'?10:null)),receivedAt:{seconds:1790500000}}));
 Store.saveDraft({answers:{q_subject:'PRIVATE DRAFT'}});Workspace.saveNote({body:'PRIVATE NOTE'});
 })()`);
 const before=await b.ev("JSON.stringify({flights:Store.all(),settings:Store.settings(),workspace:Workspace.all(),draft:Store.readDraft()})");
 await b.route('instructor','[data-roster]');
 check('instructor shell and accessible navigation are English LTR',await b.ev("document.documentElement.lang==='en'&&document.documentElement.dir==='ltr'&&document.querySelector('#skipContent').textContent==='Skip to content'&&document.querySelector('[data-back]').getAttribute('aria-label')==='Back'&&document.querySelector('#tabbar').hidden"));
 check('course labels and controls are English; cadet names stay native',await b.ev("document.querySelector('[data-course-filter]').textContent==='All coursesPrimaryAdvanced'&&document.querySelector('[data-cadet-search]').parentElement.textContent==='Search cadets'&&document.querySelector('[data-roster]').textContent.includes('צוער לדוגמה')"));
 check('instructor sees assigned roster',await b.ev("document.querySelectorAll('.cloud-cadet').length===2"));
 await b.type('[data-cadet-search]','מתקדם');check('cadet search filters roster',await b.ev("document.querySelectorAll('.cloud-cadet').length===1"));
 await b.type('[data-cadet-search]','');
 await b.route('instructor/cadet-a','[data-cloud-flights]');
 check('deleted records hidden by default',await b.ev("document.querySelectorAll('[data-cloud-flights]>.cloud-flight').length===3"));
 check('hours use saved debriefs only',await b.ev("document.querySelector('[data-cadet-stats]').textContent.includes('1.5')"));
 check('course progress excludes unmatched names, drafts and deleted records',await b.ev("document.querySelector('progress').value===1"));
 check('system question labels are English and custom labels stay native',await b.ev("(()=>{const labels=Array.from(document.querySelectorAll('.cloud-flight__body h3'),x=>x.textContent);return labels.includes('Flight subject')&&labels.includes('Flight minutes')&&labels.includes('Safety')===false&&labels.includes('שאלה היסטורית')&&!labels.includes('נושא טיסה')})()"));
 check('renamed default questions are preserved',await b.ev("Instructor.labelFor({id:'q_subject',label:'הנושא האישי שלי'})==='הנושא האישי שלי'"));
 check('Hebrew and English answers remain verbatim with automatic direction',await b.ev("(()=>{const values=Array.from(document.querySelectorAll('.cloud-flight__body p[dir=auto]'),x=>x.textContent);return values.includes('צפון')&&values.includes('כן')&&values.some(x=>x.includes('תחקיר שנשמר')&&x.includes('Hold altitude at 3,000 ft'))})()"));
 check('historical custom answers retained and HTML escaped',await b.ev("document.querySelector('[data-cloud-flights]').textContent.includes('<img src=x onerror=alert(1)>')&&!document.querySelector('[data-cloud-flights] img')"));
 await b.click('.cloud-filter-panel > summary');
 await b.type('[data-flight-search]','AW 1');check('flight content search works',await b.ev("document.querySelectorAll('[data-cloud-flights]>.cloud-flight').length===1"));
 await b.click('[data-clear-filters]');
 await b.click('[data-report]');
 check('report includes cadet identity and custom appendix',await b.ev("document.querySelector('.cloud-report').srcdoc.includes('צוער לדוגמה')&&document.querySelector('.cloud-report').srcdoc.includes('שאלה היסטורית')"));
 check('report headings, course and statuses are English LTR',await b.ev("(()=>{const doc=new DOMParser().parseFromString(document.querySelector('.cloud-report').srcdoc,'text/html');return doc.documentElement.lang==='en'&&doc.documentElement.dir==='ltr'&&doc.querySelector('h1').textContent==='Training report'&&doc.body.textContent.includes('Primary')&&doc.body.textContent.includes('Solo approval')&&doc.body.textContent.includes('Missed')&&!doc.body.textContent.includes('ראשוני')&&!doc.body.textContent.includes('undefined')})()"));
 check('report preserves both input languages and isolates identity direction',await b.ev("(()=>{const doc=new DOMParser().parseFromString(document.querySelector('.cloud-report').srcdoc,'text/html');return doc.querySelector('.identity bdi').getAttribute('dir')==='auto'&&doc.body.textContent.includes('תחקיר שנשמר')&&doc.body.textContent.includes('Hold altitude at 3,000 ft')&&doc.body.textContent.includes('כן')})()"));
 check('download contains the exact English preview',await b.ev("(async()=>await(await fetch(document.querySelector('[data-report-download]').href)).text()===document.querySelector('.cloud-report').srcdoc)()"));
 check('cadet reports still default to Hebrew RTL',await b.ev("Summary.documentHTML(Summary.build([])).includes('<html lang=\"he\" dir=\"rtl\">')&&Summary.documentHTML(Summary.build([])).includes(T.reportTitle)"));
 check('report shows recurring missed goals',await b.ev("Instructor.report(cloudMock.rows.map(Instructor.decode)).recurring.length===1"));
 check('report preview is sandboxed',await b.ev("document.querySelector('.cloud-report').getAttribute('sandbox')===''"));
 await b.click('[data-deleted]');check('deleted records remain reviewable',await b.ev("document.querySelectorAll('[data-cloud-flights]>.cloud-flight').length===4"));
 await b.click('.cloud-flight summary');await b.click('[data-history]');await b.until("!!document.querySelector('[data-versions] .cloud-flight')");check('retained versions can be reviewed',true);
 for(const theme of ['dark','calm','light'])for(const width of [320,390]){
  await b.ev(`document.documentElement.setAttribute('data-theme',${JSON.stringify(theme)});document.documentElement.style.fontSize='20px'`);
  await b.send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
  check('mobile layout '+theme+' '+width,await b.ev("document.documentElement.scrollWidth<=innerWidth+1"));
 }
 await b.ev("document.documentElement.style.fontSize='';document.documentElement.setAttribute('data-theme','dark')");
 await b.click('.cloud-filter-panel > summary');
 await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await b.shot('instructor-cloud-mobile');
 await b.route('cloud/instructor','[data-cloud-signout]');
 check('instructor connection panel stays English with sign-out',await b.ev("document.documentElement.lang==='en'&&document.querySelector('.cloud-panel h1').textContent==='Account and connection'&&document.querySelector('[data-cloud-signout]').textContent==='Sign out'&&document.querySelector('#tabbar').hidden"));
 await b.route('home','[href="#/progress"]');
 check('returning to cadet screens restores Hebrew RTL',await b.ev("document.documentElement.lang==='he'&&document.documentElement.dir==='rtl'&&document.querySelector('#skipContent').textContent===T.skipContent&&!document.querySelector('#tabbar').hidden"));
 check('instructor retains the top-bar sharing shortcut',await b.ev("document.querySelector('#topbar a[href=\"#/cloud\"]').checkVisibility()"));
 check('instructor viewing does not change local data',await b.ev("JSON.stringify({flights:Store.all(),settings:Store.settings(),workspace:Workspace.all(),draft:Store.readDraft()})")===before);
 check('instructor never uploads local records',await b.ev("!cloudMock.calls.some(c=>c[0]==='write')"));
 await b.ev("cloudMock.role='cadet';localStorage.setItem('sortie:auth',JSON.stringify({email:'a@example.test',exp:Date.now()+1000000}));cloudMock.notify({uid:'cadet-a',email:'a@example.test',verified:true})");
 await b.until("Cloud.status().phase==='synced'");
 check('cadet identity hides the top-bar shortcut without navigation',await b.ev("!document.querySelector('#topbar a[href=\"#/cloud\"]').checkVisibility()"));
 for(const course of ['rishoni','mitkadem']){
  await b.ev(`Store.setCourse(${JSON.stringify(course)})`);
  await b.route('home','[href="#/progress"]');await b.route('settings','#questionEditor');
  check(course+' cadet sees neither sharing nor dashboard settings',await b.ev("!Array.from(document.querySelectorAll('a[href=\"#/cloud\"],[data-act=\"cloud\"],[data-act=\"instructor\"]')).some(el=>el.checkVisibility())"));
 }
 await b.route('cloud','.cloud-panel');
 check('verified cadet connects automatically without a link button',await b.ev("!!localStorage.getItem('sortie:cloud-binding')&&!document.querySelector('[data-cloud-link]')"));
 check('cadet sharing remains Hebrew',await b.ev("document.documentElement.lang==='he'&&document.querySelector('.cloud-panel h1').textContent===T.cloudTitle"));
 await b.ev("Store.save({flownAt:'2026-09-27',stage:'brief',answers:{q_subject:'SAVED TRAINING'}})");await b.until("Cloud.status().phase==='synced'&&cloudMock.calls.some(c=>c[0]==='write')");
 check('only saved record reaches upload adapter',await b.ev("cloudMock.calls.filter(c=>c[0]==='write').length===1&&cloudMock.calls.find(c=>c[0]==='write')[2].includes('SAVED TRAINING')"));
 check('notebook and unfinished draft never reach upload adapter',await b.ev("!JSON.stringify(cloudMock.calls).includes('PRIVATE')"));
 await b.route('instructor','.empty');check('cadet cannot open instructor view',await b.ev("document.querySelector('.empty').textContent.includes(T.instructorEnglish.instructorDenied)"));
 await b.ev("cloudMock.role='instructor';localStorage.setItem('sortie:auth',JSON.stringify({email:'teacher@example.test',exp:Date.now()+1000000}));void cloudMock.notify({uid:'teacher',email:'teacher@example.test',verified:true})");
 await b.until("Cloud.status().role==='instructor'");await b.route('cloud/instructor','[data-cloud-signout]');
 gateTest=true;await b.click('[data-cloud-signout]');await b.until("!document.querySelector('#authGate').hidden");
 check('instructor sign-out returns to English Google sign-in',await b.ev("document.documentElement.lang==='en'&&document.documentElement.dir==='ltr'&&document.querySelector('#gateActs').textContent.includes('Sign in with Google')&&document.querySelector('#authGate h1').textContent==='Instructor dashboard'&&!localStorage.getItem('sortie:auth')"));
 check('sign-out preserves saved flights, notebook and drafts',await b.ev("Store.count()===1&&JSON.stringify(Workspace.all()).includes('PRIVATE NOTE')&&JSON.stringify(Store.readDraft()).includes('PRIVATE DRAFT')"));
 gateTest=false;await b.ev("Store.setPin('1234')");await b.send('Page.reload');await b.until("!document.querySelector('#lockScreen').hidden");
 check('instructor PIN screen and delete control are English',await b.ev("document.querySelector('#lockHint').textContent==='Enter your PIN'&&document.querySelector('#lockScreen h1').textContent==='Instructor dashboard'&&document.querySelector('[data-key=del]').getAttribute('aria-label')==='Delete'"));
 for(const key of '9999')await b.click('[data-key="'+key+'"]');await b.until("document.querySelector('#lockHint').textContent==='Incorrect PIN'");
 check('incorrect PIN message stays English',true);
 for(const key of '1234')await b.click('[data-key="'+key+'"]');await b.until("document.querySelector('#lockScreen').hidden");
 check('instructor PIN unlock preserves saved records',await b.ev("Store.count()===1&&JSON.stringify(Workspace.all()).includes('PRIVATE NOTE')"));
 check('no browser exceptions' ,b.errors.length===0);
 console.log(checks+' cloud browser checks passed (synthetic accounts, no external submissions)');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>b?.close());
