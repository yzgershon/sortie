const assert=require('assert/strict'),{browser}=require('./support.cjs');let b,checks=0;
async function ok(label,expr,expected){assert.deepEqual(await b.ev(expr),expected,label);checks++;console.log('PASS '+label);}
(async()=>{
 b=await browser();await b.route('brief','[data-flightpicker]');await b.click('[data-flightpicker]');await b.type('#flightPickerSearch','AW 3');await b.click('[data-catalogue="0"]');
 await b.until('Store.readDraft() && !!Store.readDraft().syllabusEntry');await ok('searchable picker sets subject and stable catalogue identity',"[document.querySelector('[data-q=q_subject]').value,Store.readDraft().syllabusEntry.name]",['AW 3','AW 3']);
 await b.type('[data-exinput=q_syllabus]','uncommitted exercise');await b.route('notebook','[data-newnote]');await b.route('brief','[data-save]');await ok('exercise add-buffer survives leaving form',"document.querySelector('[data-exinput=q_syllabus]').value",'uncommitted exercise');
 await b.click('[data-save]');await b.until("document.body.dataset.route==='home'");const id=await b.ev('Store.all()[0].id');
 await b.route('debrief/'+id,'[data-iteminput=q_points]');await b.type('[data-iteminput=q_points]','uncommitted point');await b.route('notebook','[data-newnote]');await b.route('debrief/'+id,'[data-iteminput=q_points]');await ok('main-point add-buffer survives leaving form',"document.querySelector('[data-iteminput=q_points]').value",'uncommitted point');
 await b.ev("window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('test quota','QuotaExceededError')}");await b.click('[data-save]');await b.until("!document.querySelector('[data-save]').disabled");
 await ok('failed durable save leaves the form open',"document.body.dataset.route",'debrief');await ok('failed save retains visible pending text',"Array.from(document.querySelectorAll('[data-itemtext]')).some(el=>el.value==='uncommitted point')",true);
 await ok('failed save did not complete the stored brief','Store.get('+JSON.stringify(id)+').stage','brief');
 await b.ev('Storage.prototype.setItem=originalSetItem');await b.click('[data-save]');await b.until("document.body.dataset.route==='flight'");
 await b.route('notebook','[data-newnote]');await b.click('[data-newnote]');await b.until("!!document.querySelector('#noteBody')");await b.ev("const n=Workspace.all().notes[0];Workspace.saveNote({...n,body:'other tab writing'})");await b.type('#noteBody','my writing');await b.until("document.querySelector('#noteState').textContent===T.draftConflict");await b.click('[data-notecopy]');await b.until("Workspace.all().notes.length===2");
 await ok('concurrent notebook edits can both be retained',"Workspace.all().notes.map(n=>n.body).sort()",['my writing','other tab writing']);
 await b.route('home','#view');await b.ev("Store.save({id:'missed',stage:'done',answers:{q_subject:'AW 4',q_goals:[{text:'history goal',status:'missed'}]}})");await b.route('trends','[data-goalhistory]');await b.click('[data-goalhistory]');await ok('goal history links to the relevant flight',"!!document.querySelector('[data-historyflight=missed]')",true);await b.ev("document.querySelector('#sheet').close()");
 await b.type('[data-trendscope=course]','mitkadem');await ok('trends course filter excludes other-course flights',"!document.querySelector('.readouts')",true);await b.type('[data-trendscope=course]','');
 for(const theme of ['dark','light']){
  await b.ev('Store.set("theme",'+JSON.stringify(theme)+')');await b.route('settings','[data-theme-set]');await b.click('[data-theme-set='+theme+']');
  await b.send('Emulation.setDeviceMetricsOverride',{width:360,height:800,deviceScaleFactor:1,mobile:true});await b.ev("document.documentElement.style.fontSize='24px'");
  for(const route of ['home','notebook','progress','settings','trends','log']){await b.route(route,'#view');await ok(theme+' '+route+' at 360px and enlarged text',"document.documentElement.scrollWidth<=document.documentElement.clientWidth",true);}
 }
 await ok('no uncaught runtime errors','true',b.errors.length===0);console.log(checks+' usability checks passed');b.close();
})().catch(e=>{console.error(e);if(b){console.error(b.errors);b.close();}process.exitCode=1;});
