/* Real Chrome, real IndexedDB, one disposable origin: v22 -> candidate -> v22. */
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),cp=require('child_process');
const {browser,root}=require('./support.cjs');let b,mode='old',checks=0;
const files={};for(const name of cp.execFileSync('git',['ls-tree','-r','--name-only','005e762'],{cwd:root,encoding:'utf8'}).trim().split('\n')){
 if(/^(js\/|css\/|index.html|sw.js|manifest.webmanifest)/.test(name))files[name]=cp.execFileSync('git',['show','005e762:'+name],{cwd:root,maxBuffer:10*1024*1024});
}
function ok(label,actual,expected){assert.deepEqual(actual,expected);checks++;console.log('PASS '+label);}
function existingFields(actual,template){if(Array.isArray(template)){assert.equal(actual.length,template.length);return template.map((x,i)=>existingFields(actual[i],x));}if(template&&typeof template==='object')return Object.fromEntries(Object.keys(template).map(k=>[k,existingFields(actual[k],template[k])]));return actual;}
(async()=>{
 b=await browser({source:(file,data)=>mode==='old'?(files[path.relative(root,file).replace(/\\/g,'/')]||data):data});
 await b.ev(`(async()=>{
 Store.setCourse('mitkadem');Store.updateQuestion('q_subject',{label:'נושא אישי'});Store.removeQuestion('q_area');Store.moveQuestion('q_safety_b',-1);
 Store.addQuestion({id:'custom',label:'משהו אישי',type:'textarea',stage:'debrief'});
 await Store.save({id:'first',flownAt:'2026-08-10',stage:'done',answers:{q_subject:'הסבה 1',q_minutes:123,q_goals:[{id:'goal',text:'יעד א',status:'missed'}],q_syllabus:[{id:'ex',text:'תרגיל',focus:'דגש',notes:'תחקיר'}],q_points:[{id:'point',text:'נקודה'}],custom:'תוכן אישי'}});
 await Store.save({id:'pending',stage:'brief',answers:{q_subject:'מבנה 1'}});
 Store.saveDraft({id:'first',answers:{q_subject:'טיוטת תחקיר',custom:'לא סיימתי'}},'debrief');
 Store.saveDraft({answers:{q_subject:'טיוטה חדשה',q_goals:[{text:'יעד בטיוטה'}]}});
 Store.addNextGoal('יעד מהבית');Store.set('startDismissed',true);window.oldDocument=true;
 })()`);
 const before=await b.ev('JSON.parse(JSON.stringify({flights:Store.all(),questions:Store.questions(true),goals:Store.nextGoals(),draft:Store.readDraft(),debrief:Store.readDraft("first","debrief"),course:Store.courseId()}))');
 mode='new';await b.send('Page.reload');await b.until("typeof oldDocument==='undefined' && typeof Features!=='undefined' && document.body.dataset.route==='home'");
 const after=await b.ev('JSON.parse(JSON.stringify({flights:Store.all(),questions:Store.questions(true),goals:Store.nextGoals(),draft:Store.readDraft(),debrief:Store.readDraft("first","debrief"),course:Store.courseId()}))');
 for(const key of ['flights','questions','draft','debrief','course'])ok('v22 upgrade preserves '+key,existingFields(after[key],before[key]),before[key]);
 ok('v22 goal content and identity preserved',after.goals.map(({id,text,cats,from,status})=>({id,text,cats,from,status})),before.goals.map(({id,text,cats,from,status})=>({id,text,cats,from,status})));
 ok('v22 first-run dismissal preserved',await b.ev('Store.settings().startDismissed'),true);
 ok('v22 logged minutes appear as flight hours on the new home',await b.ev("document.querySelector('.flightcard__v .odo').textContent"),'2.1');
 await b.ev("window.noteId=Workspace.saveNote({title:'חדש',body:'נשמר אחרי שדרוג',priority:2}).id;Workspace.milestone({title:'אבן דרך',course:'mitkadem'});window.newDocument=true");
 const workspace=await b.ev('localStorage.getItem("sortie:workspace")');
 mode='old';await b.send('Page.reload');await b.until("typeof newDocument==='undefined' && typeof Features==='undefined' && document.body.dataset.route==='home'");
 ok('rollback preserves all flight answers',await b.ev('Store.all().map(r=>({id:r.id,answers:r.answers}))'),before.flights.map(r=>({id:r.id,answers:r.answers})));
 ok('rollback leaves new notebook raw data intact',await b.ev('localStorage.getItem("sortie:workspace")'),workspace);
 mode='new';await b.ev('window.rollbackDocument=true');await b.send('Page.reload');await b.until("typeof rollbackDocument==='undefined' && typeof Workspace!=='undefined' && document.body.dataset.route==='home'");
 ok('re-upgrade restores accessible notebook',await b.ev('Workspace.all().notes[0].body'),'נשמר אחרי שדרוג');
 ok('no uncaught runtime errors',b.errors.length,0);console.log(checks+' upgrade checks passed');b.close();
})().catch(e=>{console.error(e);if(b)b.close();process.exitCode=1;});
