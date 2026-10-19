// Actual v27 service-worker update, disposable IndexedDB and synthetic records.
// No production origin, real account, image upload or API charge.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {browser,root}=require('./support.cjs');
const baseline='5f86b85', current=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8')).version;
const old={};
for(const name of cp.execFileSync('git',['ls-tree','-r','--name-only',baseline],{cwd:root,encoding:'utf8'}).trim().split('\n')){
 if(/^(js\/|css\/|index\.html$|sw\.js$|manifest\.webmanifest$|release-manifest\.json$)/.test(name))old[name]=cp.execFileSync('git',['show',baseline+':'+name],{cwd:root,maxBuffer:10*1024*1024});
}
let b,mode='old',broken=false,checks=0;
const check=(name,value)=>{assert.ok(value,name);console.log('PASS '+name);checks++;};
const snapshot="JSON.stringify({flights:Store.all(),questions:Store.questions(true),shelf:Store.nextGoals(),workspace:Workspace.all(),profile:Store.settings().pilotProfile,course:Store.courseId()})";
async function update(){return b.ev(`(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();const w=r.installing;if(!w)return r.waiting?'installed':'unchanged';return new Promise(resolve=>{const check=()=>{if(['installed','redundant'].includes(w.state))resolve(w.state)};w.addEventListener('statechange',check);check()})})()`);}
(async()=>{
 assert.notEqual(current,'sortie-v27','Candidate needs its own cache version');
 b=await browser({worker:true,respond:(req,res,p)=>{if(mode==='new'&&broken&&p==='/js/notebook-import.js'){res.writeHead(503);res.end('synthetic interrupted release');return true;}},source:(file,data)=>mode==='old'?(old[path.relative(root,file).replace(/\\/g,'/')]||data):data});
 await b.until('!!navigator.serviceWorker.controller');
 await b.ev(`(async()=>{
  Store.setCourse('mitkadem');Store.set('releaseSeen','v23');Store.set('startDismissed',true);
  Store.updateQuestion('q_subject',{label:'נושא אישי'});Store.addQuestion({id:'custom',label:'שאלה אישית',type:'textarea',stage:'debrief'});
  await Store.save({id:'saved',flownAt:'2026-10-01',stage:'done',answers:{q_subject:'בדיקת שדרוג',custom:'תשובה קיימת',q_goals:[{id:'g',text:'יעד קודם',status:'missed'}]}});
  await Store.save({id:'waiting',flownAt:'2026-10-02',stage:'brief',answers:{q_subject:'תדריך שמור'}});
  Store.saveDraft({id:'saved',answers:{q_subject:'טיוטת תחקיר פרטית'}},'debrief');Store.addNextGoal('יעד ממתין');
  const folder=Workspace.folder('תיקייה קיימת');Workspace.saveNote({title:'מחברת פרטית',body:'תוכן שנשמר',folder:folder.id,priority:2});
  Workspace.milestone({title:'אבן דרך',course:'mitkadem'});Store.set('pilotProfile',{name:'שם לבדיקה',callsign:'TEST',focus:'מיקוד'});
 })()`);
 const before=await b.ev(snapshot),savedDraft=await b.ev('JSON.stringify(Store.readDraft("saved","debrief"))');
 await b.route('brief','[data-q=q_subject]');await b.type('[data-q=q_subject]','טיוטה בזמן עדכון');await b.type('[data-goalinput=q_goals]','עוד לא לחצתי הוספה');
 await b.ev('window.oldEditingDocument=true');mode='new';broken=true;
 check('partial v28 download is rejected before replacing v27',await update()==='redundant');
 check('interrupted download preserves active unsaved form',await b.ev('window.oldEditingDocument===true'));
 await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await b.send('Page.reload');
 await b.until("typeof oldEditingDocument==='undefined'&&!!document.querySelector('[data-goalinput=q_goals]')");
 check('v27 still opens offline with unfinished Add text',await b.ev("document.querySelector('[data-goalinput=q_goals]').value==='עוד לא לחצתי הוספה'"));
 await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});broken=false;await b.ev('window.waitingForUpdate=true');
 check('complete candidate waits while the cadet is editing',await update()==='installed');
 check('completed download does not replace the active form',await b.ev('window.waitingForUpdate===true'));
 await b.until("!!document.querySelector('.toast__b')");await b.click('.toast__b');
 await b.until("typeof waitingForUpdate==='undefined'&&!!document.querySelector('[data-notebook-import]')");
 check('flight history, custom questions, shelf, notebook, folders, milestones and profile are identical',await b.ev(snapshot)===before);
 check('separate saved-flight draft is identical',await b.ev('JSON.stringify(Store.readDraft("saved","debrief"))')===savedDraft);
 check('active brief and unfinished Add text survive activation',await b.ev("document.querySelector('[data-q=q_subject]').value==='טיוטה בזמן עדכון'&&document.querySelector('[data-goalinput=q_goals]').value==='עוד לא לחצתי הוספה'"));
 check('production endpoint is present in the verified candidate shell',await b.ev('NotebookImport.configured()'));
 await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await b.ev('window.newDocument=true');await b.send('Page.reload');
 await b.until("typeof newDocument==='undefined'&&!!document.querySelector('[data-notebook-import]')");
 await b.click('[data-notebook-import]');await b.type('#scanText','בטיחות:\nתוספת לבדיקה');await b.click('[data-scan-parse]');
 await b.ev("document.querySelector('[data-scan-checked]').click()");await b.click('[data-scan-apply]');
 check('offline pasted text adds only to the draft',await b.ev("Store.readDraft().answers.q_safety_b==='תוספת לבדיקה'")&&await b.ev(snapshot)===before);
 check('current and previous verified caches remain available',await b.ev(`caches.keys().then(k=>k.includes('sortie-v27-shell')&&k.includes(${JSON.stringify(current+'-shell')}))`));
 check('no runtime exceptions',b.errors.length===0);
 console.log(checks+' v27 notebook release preservation checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>b?.close());
