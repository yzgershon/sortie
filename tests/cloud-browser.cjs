const assert=require('node:assert/strict'),fs=require('fs');
const {browser}=require('./support.cjs'); let b,checks=0;
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
  if(p==='/js/cloud-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}}');return true;}
  if(p==='/js/firebase-adapter.js'){res.setHeader('Content-Type','text/javascript');res.end(fixture);return true;}
 }});
 await b.route('instructor','[data-cloud-pending]');
 check('session restoration shows loading rather than false denial',await b.ev("!document.querySelector('#view').textContent.includes(T.instructorDenied)"));
 await b.ev(`cloudMock.holdAccess=true;localStorage.setItem('sortie:auth',JSON.stringify({email:'teacher@example.test',exp:Date.now()+1000000}));void cloudMock.notify({uid:'teacher',email:'teacher@example.test',verified:true});`);
 await b.until("!!cloudMock.resolveAccess");
 check('pending enrollment check keeps loading message',await b.ev("!!document.querySelector('[data-cloud-pending]')&&!document.querySelector('#view').textContent.includes(T.instructorDenied)"));
 await b.ev("cloudMock.holdAccess=false;cloudMock.resolveAccess()");
 await b.until("Cloud.status().role==='instructor'");
 await b.ev(`(()=>{
 const qs=Store.questions(true).concat([{id:'custom_old',label:'שאלה היסטורית',type:'textarea',archived:true}]);
 const records=[
 {id:'f1',stage:'done',flownAt:'2026-09-20',course:'rishoni',createdAt:1,updatedAt:2,answers:{q_subject:'AW 1',q_minutes:60,q_goals:[{text:'דיוק',status:'missed'}],custom_old:'<img src=x onerror=alert(1)>',q_points:[{text:'תחקיר שנשמר'}]}},
 {id:'f2',stage:'done',flownAt:'2026-09-21',course:'rishoni',createdAt:2,updatedAt:3,answers:{q_subject:'AW 2',q_minutes:30,q_goals:[{text:'דיוק',status:'missed'}]}},
 {id:'f3',stage:'brief',flownAt:'2026-09-22',course:'rishoni',createdAt:3,updatedAt:4,answers:{q_subject:'AW 3'}},
 {id:'gone',stage:'done',flownAt:'2026-09-19',course:'rishoni',createdAt:0,updatedAt:1,answers:{q_subject:'AW 4',q_minutes:120}}
 ];cloudMock.rows=records.map((r,i)=>({id:'doc'+i,digest:String(i),payload:JSON.stringify(CloudCore.project(r,qs,r.id==='gone'?10:null)),receivedAt:{seconds:1790500000}}));
 Store.saveDraft({answers:{q_subject:'PRIVATE DRAFT'}});Workspace.saveNote({body:'PRIVATE NOTE'});
 })()`);
 const before=await b.ev("JSON.stringify({flights:Store.all(),settings:Store.settings(),workspace:Workspace.all(),draft:Store.readDraft()})");
 await b.route('instructor','[data-roster]');
 check('instructor sees assigned roster',await b.ev("document.querySelectorAll('.cloud-cadet').length===2"));
 await b.type('[data-cadet-search]','מתקדם');check('cadet search filters roster',await b.ev("document.querySelectorAll('.cloud-cadet').length===1"));
 await b.type('[data-cadet-search]','');
 await b.route('instructor/cadet-a','[data-cloud-flights]');
 check('deleted records hidden by default',await b.ev("document.querySelectorAll('[data-cloud-flights]>.cloud-flight').length===3"));
 check('hours use saved debriefs only',await b.ev("document.querySelector('[data-cadet-stats]').textContent.includes('1.5')"));
 check('course progress excludes unmatched names, drafts and deleted records',await b.ev("document.querySelector('progress').value===1"));
 check('historical custom answers retained and HTML escaped',await b.ev("document.querySelector('[data-cloud-flights]').textContent.includes('<img src=x onerror=alert(1)>')&&!document.querySelector('[data-cloud-flights] img')"));
 await b.click('.cloud-filter-panel > summary');
 await b.type('[data-flight-search]','AW 1');check('flight content search works',await b.ev("document.querySelectorAll('[data-cloud-flights]>.cloud-flight').length===1"));
 await b.click('[data-clear-filters]');
 await b.click('[data-report]');
 check('report includes cadet identity and custom appendix',await b.ev("document.querySelector('.cloud-report').srcdoc.includes('צוער לדוגמה')&&document.querySelector('.cloud-report').srcdoc.includes('שאלה היסטורית')"));
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
 check('instructor viewing does not change local data',await b.ev("JSON.stringify({flights:Store.all(),settings:Store.settings(),workspace:Workspace.all(),draft:Store.readDraft()})")===before);
 check('instructor never uploads local records',await b.ev("!cloudMock.calls.some(c=>c[0]==='write')"));
 await b.ev("cloudMock.role='cadet';localStorage.setItem('sortie:auth',JSON.stringify({email:'a@example.test',exp:Date.now()+1000000}));cloudMock.notify({uid:'cadet-a',email:'a@example.test',verified:true})");
 await b.until("Cloud.status().phase==='unlinked'");await b.route('cloud','[data-cloud-link]');
 await b.ev("Store.save({flownAt:'2026-09-27',stage:'brief',answers:{q_subject:'SAVED TRAINING'}})");await b.click('[data-cloud-link]');await b.until("Cloud.status().phase==='synced'");
 check('only saved record reaches upload adapter',await b.ev("cloudMock.calls.filter(c=>c[0]==='write').length===1&&cloudMock.calls.find(c=>c[0]==='write')[2].includes('SAVED TRAINING')"));
 check('notebook and unfinished draft never reach upload adapter',await b.ev("!JSON.stringify(cloudMock.calls).includes('PRIVATE')"));
 await b.route('instructor','.empty');check('cadet cannot open instructor view',await b.ev("document.querySelector('.empty').textContent.includes(T.instructorDenied)"));
 check('no browser exceptions',b.errors.length===0);
 console.log(checks+' cloud browser checks passed (synthetic accounts, no external submissions)');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>b?.close());
