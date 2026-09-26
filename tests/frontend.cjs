// Visual/interaction regression in a disposable profile; no real pilot data.
const assert=require('assert/strict'), {browser,store}=require('./support.cjs');
let b, checks=0, gateEnabled=false;
function pass(label){checks++;console.log('PASS '+label);}
async function check(label,expr,expected=true){assert.deepEqual(await b.ev(expr),expected,label);pass(label);}
function contrast(a,b){
 const lum=s=>{const rgb=s.startsWith('#')?s.slice(1).match(/../g).map(x=>parseInt(x,16)):s.match(/[\d.]+/g).slice(0,3).map(Number);return rgb.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)};
 const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
(async()=>{
 const source=store();await source.S.init();source.S.updateQuestion('q_subject',{label:'נושא אישי'});source.S.saveDraft({answers:{q_subject:'טיוטה שחשוב לשמור'}});
 await source.S.save({id:'legacy',stage:'done',answers:{q_subject:'AW 3',q_minutes:120}});source.W.saveNote({body:'מחברת קיימת'});
 const settings=JSON.parse(source.mem['sortie:settings']);settings.mig=4;delete settings.pilotProfile;source.mem['sortie:settings']=JSON.stringify(settings);
 const before=source.S.toJSON(), upgraded=store(source.mem);await upgraded.S.init();
 assert.equal(upgraded.S.settings().mig,5);assert.equal(upgraded.S.settings().schema,4);assert.equal(upgraded.S.question('q_subject').label,'נושא אישי');assert.equal(upgraded.S.readDraft().answers.q_subject,'טיוטה שחשוב לשמור');assert.equal(upgraded.W.all().notes[0].body,'מחברת קיימת');assert.deepEqual(JSON.parse(upgraded.S.toJSON()).flights,JSON.parse(before).flights);pass('MIG 5 only adds optional profile and retains existing work');
 const identity={name:'שם בדיקה',callsign:'DEMO',focus:'דגש אישי לבדיקה'};upgraded.S.set('pilotProfile',identity);upgraded.S.set('theme','calm');
 const restored=store();await restored.S.init();await restored.S.importJSON(upgraded.S.toJSON());assert.deepEqual(JSON.parse(JSON.stringify(restored.S.settings().pilotProfile)),identity);assert.equal(restored.S.settings().theme,'calm');pass('full backup restores identity and calm theme');
 const merged=store();await merged.S.init();await merged.S.save({id:'own',answers:{q_subject:'own'}});merged.S.set('pilotProfile',{name:'keep my name'});await merged.S.importJSON(upgraded.S.toJSON());assert.equal(merged.S.settings().pilotProfile.name,'keep my name');pass('merge preserves existing profile unless preferences are restored');
 const invalid=JSON.parse(upgraded.S.toJSON());invalid.preferences.pilotProfile={name:[]};const original=restored.mem['sortie:settings'];assert.throws(()=>restored.S.importJSON(JSON.stringify(invalid)));assert.equal(restored.mem['sortie:settings'],original);pass('invalid profile import is rejected before mutation');
 b=await browser({respond:(req,res,p)=>{if(gateEnabled&&p==='/js/auth-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.AUTH_CONFIG={clientId:"synthetic",allow:[],courses:{}};');return true;}}});
 await b.ev(`(async()=>{Store.set('installDismissed',true);Store.set('startDismissed',true);for(let i=1;i<=5;i++)await Store.save({id:'ui-'+i,stage:i===5?'brief':'done',flownAt:Store.todayISO(),answers:{q_subject:'AW '+i,q_minutes:55,q_instructor:'מדריך לדוגמה',q_goals:[{text:'יעד אישי לדוגמה',status:i%2?'met':'missed'}],q_points:[{text:'נקודה לדוגמה'}],q_syllabus:[{text:'תרגיל לדוגמה',focus:'דגש לדוגמה',notes:'תיעוד לדוגמה'}]}});window.originalFlights=JSON.stringify(Store.all());const folder=Workspace.folder('מחשבות להמשך');window.sampleNote=Workspace.saveNote({title:'מחשבות מהשבוע',body:'עמוד לדוגמה לבדיקת העיצוב בלבד.',folder:folder.id,priority:1}).id;})()`);
 await b.route('settings','[data-theme-set=calm]');
 await check('question editor stays collapsed and feedback is outside it','!document.querySelector("#questionEditor").open&&!document.querySelector("[data-act=feedback]").closest("#questionEditor")');
 await b.click('[data-theme-set=calm]');await check('calm theme has matching browser chrome and dark native controls','[document.documentElement.dataset.theme,document.documentElement.style.colorScheme,document.querySelector("meta[name=theme-color]").content]',['calm','dark','#141715']);
 await b.click('[data-act=profile]');await b.until('!!document.querySelector("#pilotName")');await b.type('#pilotName','צוער לדוגמה');await b.type('#pilotCallsign','DEMO');await b.type('#pilotFocus','לסכם לעצמי נקודה אחת מכל תחקיר');await b.route('home','#view');
 await check('profile flushes on leaving and personalizes the dashboard','document.querySelector(".pilot-identity").textContent.includes("צוער לדוגמה")&&document.querySelector(".pilot-focus").textContent.includes("נקודה אחת")');
 await check('personalizing the app never changes existing flights','JSON.stringify(Store.all())===originalFlights');
 await check('pending debrief action precedes the statistics','!!(document.querySelector("[data-godebrief]").compareDocumentPosition(document.querySelector(".journal-overview"))&Node.DOCUMENT_POSITION_FOLLOWING)');
 await b.ev('window.beforeReload=1');await b.send('Page.reload');await b.until('typeof beforeReload==="undefined"&&!!document.querySelector(".pilot-identity")');
 await check('identity and theme survive reload','[Store.settings().pilotProfile.callsign,document.documentElement.dataset.theme]',['DEMO','calm']);
 await b.route('profile','#pilotFocus');await b.ev("window.normalWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('test','QuotaExceededError')}");await b.type('#pilotFocus','טקסט שממתין לשמירה');await b.until('document.querySelector("#profileState").textContent===T.saveFailed');await b.ev("location.hash='#/'");await b.until("location.hash==='#/profile'");await check('failed profile save keeps unsaved text visible','document.querySelector("#pilotFocus").value','טקסט שממתין לשמירה');await b.ev('Storage.prototype.setItem=normalWrite');await b.route('home','#view');
 await b.route('syllabus','#sq');await check('syllabus starts as a compact section index','document.querySelectorAll(".syllabus-section").length>1&&!document.querySelector(".syllabus-section[open]")');
 await b.type('#sq','AW 3');await check('search opens matching sections and exercises','!!document.querySelector(".syllabus-section[open] .sylrow.is-open")');await b.type('#sq','');await check('clearing search restores collapsed index','!document.querySelector(".syllabus-section[open]")');
 await b.click('.syllabus-section summary');await b.click('.syllabus-section[open] [data-syl]');await check('opening a flight keeps its section expanded','!!document.querySelector(".syllabus-section[open] .sylrow.is-open")');
 await b.route('log','#q');await b.type('#q','nothing matches');await check('active filters can be cleared with one action','!document.querySelector("[data-clearfilters]").hidden');await b.click('[data-clearfilters]');await check('clearing filters restores flights','document.querySelectorAll("#logResults .frow").length',5);
 await b.click('[data-topact=sel]');await check('selection toolbar does not overlap bottom tabs','document.querySelector("#tabbar").hidden');await b.click('[data-topact=done]');
 const routes=[['home','#view'],['brief','[data-save]'],['debrief/ui-5','[data-save]'],['log','#q'],['flight/ui-1','[data-copy]'],['trends','[data-tlf]'],['settings','[data-theme-set]'],['summary','[data-copydoc]'],['syllabus','#sq'],['notebook','#noteSearch'],['notebook/'+await b.ev('Workspace.all().notes[0].id'),'#noteBody'],['progress','[data-shareprogress]'],['feedback','#feedbackMessage'],['recovery','[data-fullbackup]'],['whatsnew','[data-understood]'],['profile','#pilotName']];
 await b.ev("sessionStorage.setItem('sortie:sel',JSON.stringify({'ui-1':true}));window.beforeReload=1");await b.send('Page.reload');await b.until('typeof beforeReload==="undefined"&&!!document.querySelector("#app:not([hidden])")');
 for(const theme of ['dark','light','calm']){
  await b.route('settings','[data-theme-set]');await b.click('[data-theme-set='+theme+']');
  const palette=await b.ev("(()=>{const c=getComputedStyle(document.documentElement);return Object.fromEntries(['--bg','--fg','--fg-mid','--fg-dim','--cyan'].map(k=>[k,c.getPropertyValue(k).trim()]));})()");
  for(const token of ['--fg','--fg-mid','--fg-dim','--cyan'])assert.ok(contrast(palette[token],palette['--bg'])>=4.5,theme+' text contrast '+token);pass(theme+' principal text tokens meet 4.5:1 against the page');
  for(const size of [{width:320,font:16},{width:390,font:16},{width:360,font:24}]){
   await b.send('Emulation.setDeviceMetricsOverride',{width:size.width,height:844,deviceScaleFactor:1,mobile:true});await b.ev('document.documentElement.style.fontSize="'+size.font+'px"');
   for(const [route,selector] of routes){
    await b.route(route,selector);
    const state=await b.ev(`(()=>{const els=[...document.querySelectorAll('#app button,#app a')].filter(e=>e.checkVisibility()&&e.getBoundingClientRect().width);return {overflow:document.documentElement.scrollWidth>innerWidth,unlabeled:els.filter(e=>!e.textContent.trim()&&!e.getAttribute('aria-label')).map(e=>e.outerHTML.slice(0,160))};})()`);
    if(state.overflow||state.unlabeled.length){await b.shot('frontend-failure');throw Error(theme+' '+size.width+'/'+size.font+' '+route+' '+JSON.stringify(state));}
    if(size.width===390)await b.shot('frontend-'+theme+'-'+(route.includes('/ui-')?route.split('/')[0]:route.startsWith('notebook/')?'note-editor':route));
   }
   pass(theme+' '+size.width+'px/'+size.font+'px text: all 16 screens fit and actions are labeled');
  }
 }
 await b.ev("document.documentElement.style.fontSize='16px'");await b.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await b.route('progress','[data-shareprogress]');await b.click('[data-shareprogress]');await b.until('!!document.querySelector(".share-preview")');
 await check('progress share image respects calm theme and excludes profile name','new Promise(resolve=>{const img=document.querySelector(".share-preview");const check=()=>{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext("2d");ctx.drawImage(img,0,0);resolve([Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3),!img.alt.includes(Store.settings().pilotProfile.name)]);};if(img.complete)check();else img.onload=check;})',[[20,23,21],true]);await b.shot('frontend-calm-share');await b.ev('document.querySelector("#sheet").close()');
 await b.route('settings','[data-theme-set=auto]');await b.click('[data-theme-set=auto]');
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'light'}]});await b.until('document.documentElement.dataset.theme==="light"');
 await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:'dark'}]});await b.until('document.documentElement.dataset.theme==="dark"');pass('automatic theme follows device appearance changes');
 await b.click('[data-theme-set=calm]');await b.click('#skipContent');await check('skip link focuses content without navigating','document.activeElement.id==="view"&&document.body.dataset.route==="settings"');
 await b.send('Emulation.setDeviceMetricsOverride',{width:320,height:640,deviceScaleFactor:1,mobile:true});await b.ev('document.documentElement.style.fontSize="24px"');
 await b.click('[data-act=pin-set]');await b.until('!document.querySelector("#lockScreen").hidden');
 await check('PIN screen fits narrow enlarged-text viewport','document.documentElement.scrollWidth<=innerWidth');await b.shot('frontend-calm-pin');await b.click('[data-key=cancel]');
 await b.ev('Store.set("course",null);window.beforeReload=1');await b.send('Page.reload');await b.until('typeof beforeReload==="undefined"&&!!document.querySelector("[data-coursego]")');await b.ev('document.documentElement.style.fontSize="24px"');
 await check('course picker fits narrow enlarged-text viewport','document.documentElement.scrollWidth<=innerWidth');await b.shot('frontend-calm-course-picker');await b.click('[data-coursego]');await b.until('!document.querySelector("#app").hidden');
 gateEnabled=true;await b.ev('window.beforeReload=1');await b.send('Page.reload');await b.until('typeof beforeReload==="undefined"&&!document.querySelector("#authGate").hidden');await b.ev('document.documentElement.style.fontSize="24px"');
 await check('sign-in gate fits narrow enlarged-text viewport and keeps app hidden','document.documentElement.scrollWidth<=innerWidth&&document.querySelector("#app").hidden');await b.shot('frontend-calm-auth');
 await check('no uncaught runtime errors','true',b.errors.length===0);console.log(checks+' frontend checks passed');b.close();
})().catch(e=>{console.error(e);if(b){console.error(b.errors);b.close();}process.exitCode=1});
