// Instructor report: synthetic data, read-only aggregation and real browser exports.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const {store,browser,root}=require('./support.cjs');let b,checks=0;
function pass(label){checks++;console.log('PASS '+label);}
function equal(label,actual,expected){assert.deepEqual(actual,expected,label);pass(label);}
(async()=>{
 const env=store();await env.S.init();
 for(const file of ['strings','summary'])vm.runInContext(fs.readFileSync(path.join(root,'js',file+'.js'),'utf8'),env.g);
 const fixtures=[
  {id:'one',flownAt:'2026-09-20',course:'rishoni',stage:'done',answers:{q_subject:'AW 1',q_minutes:55,q_goals:[{text:'שמירת גובה',status:'missed'},{text:'שמירת גובה',status:'missed'}],q_goals_next:[{text:'שמירת גובה'}],q_safety_d:'תיעוד בטיחות לבדיקה',q_points:[{text:'<script>example</script>'}],q_syllabus:[{text:'תרגיל מתועד',focus:'דגש חוזר',notes:'הערת תחקיר'}],q_instructor:'מדריך לדוגמה'}},
  {id:'two',flownAt:'2026-09-21',course:'rishoni',stage:'done',answers:{q_subject:'AW 2',q_minutes:120,q_goals:[{text:'שמירת גובה',status:'missed'}],q_goals_next:[{text:'יעד להמשך'}],q_syllabus:[{text:'תרגיל מתוכנן',focus:'דגש חוזר',notes:''}]}},
  {id:'three',flownAt:'2026-09-22',course:'rishoni',stage:'done',answers:{q_subject:'AW 3',q_minutes:'',q_goals:[{text:'שמירת גובה',status:'met'},{text:'טרם הוערך',status:'open'}]}},
  {id:'four',flownAt:'2026-09-23',course:'mitkadem',stage:'done',answers:{q_subject:'מבנה 1',q_minutes:50,q_goals:[{text:'שמירת גובה',status:'missed'}]}},
  {id:'five',flownAt:'2026-09-24',course:null,stage:'done',answers:{q_subject:'ניווט 1',q_minutes:-5,q_goals:[{text:'שמירת גובה',status:'missed'}]}},
  {id:'pending',flownAt:'2026-09-25',course:'rishoni',stage:'brief',answers:{q_subject:'DO NOT INCLUDE',q_minutes:200}}
 ];
 const before=JSON.stringify(fixtures),settings=JSON.stringify(env.mem),s=env.g.Summary.build(fixtures);
 equal('only completed flights and valid entered minutes count',[s.flights,s.minutes,s.durationMissing],[5,225,2]);
 equal('recurrence counts distinct flights within course/category context',[s.recurring.length,s.recurring[0].n],[1,2]);
 equal('later achievement is retained beside historical misses',s.recurring[0].latest,'met');
 equal('same wording remains separate across courses and categories',s.missed.length,3);
 equal('next-flight goals include later-resolution context',[s.next.length,s.next.find(x=>x.t==='שמירת גובה').resolved,s.next.find(x=>x.t==='יעד להמשך').resolved],[2,true,false]);
 equal('ungraded goals do not enter the achievement denominator',[s.openCount,s.graded,s.metCount],[1,6,1]);
 equal('only annotated exercises count as documented',Array.from(s.exercises,x=>x.t),['תרגיל מתועד']);
 equal('unknown historical course is labeled without guessing',s.courses.includes(env.g.T.reportUnassigned),true);
 equal('report model never mutates records or persistent settings',[JSON.stringify(fixtures),JSON.stringify(env.mem)],[before,settings]);
 const full=env.g.Summary.documentHTML(s,{compact:false}),short=env.g.Summary.documentHTML(s,{compact:true});
 equal('export uses fixed dates and retains safety, future goals and exercise notes',[full.includes('20.09.2026'),full.includes('תיעוד בטיחות לבדיקה'),full.includes('יעד להמשך'),full.includes('הערת תחקיר')],[true,true,true,true]);
 equal('user HTML is escaped in exported document',[full.includes('<script>example'),full.includes('&lt;script&gt;example')],[false,true]);
 equal('short report omits flight appendix without dropping safety or next goals',[short.includes('class="flight"'),short.includes('תיעוד בטיחות לבדיקה'),short.includes('יעד להמשך')],[false,true,true]);
 equal('planned exercises keep their focus under a separate label',[full.includes(env.g.T.plannedExercises.trim()+'</h4><ul><li dir="auto">תרגיל מתוכנן'),full.includes('תרגיל מתוכנן<br>'+env.g.T.reportBriefFocus+': דגש חוזר')],[true,true]);
 await env.S.save(fixtures[0]);const archived=env.S.updateQuestion('q_instructor',{type:'textarea'});fixtures[1].answers[archived.id]='מדריך חדש';
 const custom=env.S.addQuestion({label:'שאלה אישית לבדיקה',type:'textarea',stage:'debrief'});fixtures[1].answers[custom.id]='תשובה אישית שנשמרה';
 const changed=env.g.Summary.documentHTML(env.g.Summary.build(fixtures));
 equal('archived instructor answers and custom answers survive the report',[changed.includes('מדריך לדוגמה'),changed.includes('מדריך חדש'),changed.includes('תשובה אישית שנשמרה')],[true,true,true]);
 const extraGoals=env.S.addQuestion({label:'יעדים נוספים',type:'goals',stage:'debrief'}),extraExercises=env.S.addQuestion({label:'תרגילים נוספים',type:'syllabus',stage:'brief'});
 fixtures[1].answers[extraGoals.id]=[{text:'יעד נוסף',status:'met'}];fixtures[1].answers[extraExercises.id]=[{text:'תרגיל נוסף',focus:'דגש אישי נוסף',notes:'תיעוד נוסף'}];
 const extra=env.g.Summary.documentHTML(env.g.Summary.build(fixtures));
 equal('additional custom goal/exercise questions retain text, status, focus and notes',['יעד נוסף · '+env.g.T.goalMet,'תרגיל נוסף','דגש אישי נוסף','תיעוד נוסף'].every(x=>extra.includes(x)),true);
 b=await browser();
 await b.ev(`(async()=>{Store.set('installDismissed',true);Store.set('startDismissed',true);Store.set('theme','calm');Store.set('pilotProfile',{name:'צוער לדוגמה',callsign:'נץ לדוגמה',focus:'דגש פרטי'});for(const r of ${JSON.stringify(fixtures)})await Store.save(r);sessionStorage.setItem('sortie:sel',JSON.stringify({one:true,two:true,three:true,four:true,five:true}));window.testBefore=1;})()`);
 await b.send('Page.reload');await b.until('typeof testBefore==="undefined"&&!!document.querySelector("#app:not([hidden])")');
 await b.route('summary','[data-previewdoc]');
 const preserved='JSON.stringify({flights:Store.all(),workspace:Workspace.all(),settings:{...Store.settings(),lastExport:0}})';const snapshot=await b.ev(preserved);
 await b.shot('report-overview-calm');
 await b.click('[data-previewdoc]');await b.until('!!document.querySelector(".report-preview")');
 const preview=await b.ev('document.querySelector(".report-preview").srcdoc');
 equal('preview is sandboxed and shows the exact full report',[await b.ev('document.querySelector(".report-preview").getAttribute("sandbox")'),preview.includes('class="flight"'),preview.includes('תיעוד בטיחות לבדיקה')],['',true,true]);
 equal('profile identity is excluded unless selected',[preview.includes('צוער לדוגמה'),preview.includes('דגש פרטי')],[false,false]);
 await b.shot('report-preview-calm');await b.ev('document.querySelector("#sheet").close()');
 await b.click('#reportIdentity');await b.click('[data-previewdoc]');const identified=await b.ev('document.querySelector(".report-preview").srcdoc');
 equal('optional identity includes only the chosen name and callsign',[identified.includes('צוער לדוגמה · נץ לדוגמה'),identified.includes('דגש פרטי')],[true,false]);
 await b.ev('document.querySelector("#sheet").close()');await b.click('#reportIdentity');
 await b.ev("window.ClipboardItem=undefined;Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedReport=value}}})");await b.click('[data-copydoc]');await b.until('typeof copiedReport==="string"');
 equal('plain copy has readable table separators and no CSS',[await b.ev('copiedReport.includes(" | ")'),await b.ev('copiedReport.includes("font-family")')],[true,false]);
 await b.ev("Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>false});window.reportDownload=null;URL.createObjectURL=blob=>{window.reportDownload=blob;return 'blob:synthetic'};HTMLAnchorElement.prototype.click=function(){}");await b.click('[data-exportdoc]');
 equal('download contains exactly the previewed report',await b.ev('reportDownload.text()'),preview);
 await b.ev("window.printHTML='';window.open=()=>({opener:{},document:{write:html=>{window.printHTML=html},close:()=>{}},addEventListener:(name,fn)=>fn(),focus:()=>{},print:()=>{window.printCalled=true}})");await b.click('[data-printdoc]');
 equal('print/PDF receives the same report with print styles',[await b.ev('printHTML.includes("@page{size:A4")'),await b.ev('printCalled'),await b.ev('printHTML')],[true,true,preview]);
 await b.ev("window.open=()=>null");await b.click('[data-printdoc]');equal('blocked print window gets a useful fallback message',await b.ev('document.querySelector("#toaster").textContent.includes(T.reportPrintBlocked)'),true);
 await b.click('[data-summarymode=short]');await b.click('[data-exportdoc]');equal('short-mode export matches its chosen scope',await b.ev('(async()=>!(await reportDownload.text()).includes(\'class="flight"\'))()'),true);
 await b.click('.report-scope > summary');await b.type('#reportFrom','2026-09-20');await b.type('#reportTo','2026-09-24');await b.type('#reportCourse','mitkadem');await b.click('[data-applyreport]');
 equal('course/date filtering selects only matching completed flights',await b.ev('JSON.parse(sessionStorage.getItem("sortie:sel"))'),{four:true});
 await b.click('.report-scope > summary');await b.type('#reportFrom','2026-09-26');await b.type('#reportTo','2026-09-20');await b.click('[data-applyreport]');equal('invalid date range leaves selection intact',[await b.ev('!document.querySelector("#reportRangeError").hidden'),await b.ev('JSON.parse(sessionStorage.getItem("sortie:sel"))')],[true,{four:true}]);
 await b.type('#reportFrom','2020-01-01');await b.type('#reportTo','2020-01-02');await b.click('[data-applyreport]');equal('empty periods keep date controls available',await b.ev('document.body.textContent.includes(T.reportEmpty)&&!!document.querySelector("[data-lastweek]")'),true);
 await b.type('#reportCourse','');await b.click('[data-lastweek]');equal('previous week uses Sunday through Saturday',await b.ev('(()=>{const from=new Date(document.querySelector("#reportFrom").value+"T12:00:00"),to=new Date(document.querySelector("#reportTo").value+"T12:00:00");return [from.getDay(),to.getDay(),Math.round((to-from)/86400000)];})()'),[0,6,6]);
 equal('review/export preserves flights, notes, questions, goals and backup reminder',await b.ev(preserved),snapshot);
 await b.type('#reportFrom','2026-09-20');await b.type('#reportTo','2026-09-24');await b.click('[data-applyreport]');await b.click('[data-summarymode=full]');
 for(const theme of ['dark','calm','light']){
  await b.route('settings','[data-theme-set='+theme+']');await b.click('[data-theme-set='+theme+']');await b.route('summary','[data-copydoc]');
  await b.ev('document.querySelectorAll(".report-section,.report-flight,.report-scope,.report-sources").forEach(x=>x.open=true)');
  for(const size of [{w:320,f:16},{w:390,f:16},{w:360,f:24}]){await b.send('Emulation.setDeviceMetricsOverride',{width:size.w,height:844,deviceScaleFactor:1,mobile:true});await b.ev('document.documentElement.style.fontSize="'+size.f+'px"');equal(theme+' expanded report fits '+size.w+'/'+size.f,await b.ev('document.documentElement.scrollWidth<=innerWidth'),true);}
 }
 equal('new artwork is served locally and fits the mobile payload budget',fs.readdirSync(path.join(root,'assets')).filter(x=>/^sortie-.*\.jpg$/.test(x)).reduce((n,x)=>n+fs.statSync(path.join(root,'assets',x)).size,0)<350000,true);
 // Render the exported document independently and make a PDF for visual inspection.
 await b.send('Page.setDocumentContent',{frameId:(await b.send('Page.getFrameTree')).frameTree.frame.id,html:preview});await b.send('Emulation.setDeviceMetricsOverride',{width:794,height:1123,deviceScaleFactor:1,mobile:false});await b.shot('report-document-a4');
 const pdf=await b.send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});fs.writeFileSync(path.resolve(root,'../artifacts/sortie-v23/instructor-report-example.pdf'),Buffer.from(pdf.data,'base64'));
 equal('no uncaught runtime errors',b.errors.length,0);console.log(checks+' summary checks passed');b.close();
})().catch(e=>{console.error(e);if(b){console.error(b.errors);b.close();}process.exitCode=1});
