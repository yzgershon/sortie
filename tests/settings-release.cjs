// Flight hours, display preferences, the update message and its tour.
// Disposable profiles and synthetic records only; no live origin is touched.
const assert=require('assert/strict'),path=require('path'),{store,browser,root}=require('./support.cjs');
let b,checks=0;
// values from the vm-hosted store are normalized, so arrays compare across contexts
function ok(label,actual,expected){assert.deepEqual(JSON.parse(JSON.stringify(actual===undefined?null:actual)),JSON.parse(JSON.stringify(expected===undefined?null:expected)),label);checks++;console.log('PASS '+label);}
const released=(file,data)=>path.relative(root,file).replace(/\\/g,'/')==='js/app.js'?data.toString().replace("'v23-preview'","'v23'"):data;
(async()=>{
 /* --- storage: additive preferences, validated, carried by a full backup --- */
 const a=store();await a.S.init();
 ok('display preferences reject values the app could not use',[a.S.set('hoursAdjust',1.5),a.S.set('motion','warp'),a.S.set('haptics','yes'),a.S.set('homeHide',['nav'])],[false,false,false,false]);
 ok('display preferences accept valid values',[a.S.set('hoursAdjust',540),a.S.set('motion','reduced'),a.S.set('haptics',false),a.S.set('homeHide',['quick'])],[true,true,true,true]);
 await a.S.save({id:'kept',stage:'done',answers:{q_subject:'AW 1',q_minutes:90}});
 const backup=JSON.parse(a.S.toJSON());
 ok('full backup carries the display preferences',[backup.preferences.hoursAdjust,backup.preferences.motion,backup.preferences.haptics,backup.preferences.homeHide],[540,'reduced',false,['quick']]);
 const c=store();await c.S.init();backup.preferences.motion='from-a-later-version';
 await c.S.importJSON(JSON.stringify(backup),{restore:true});
 ok('restore applies valid preferences and skips an unknown one',[c.S.settings().hoursAdjust,c.S.settings().motion,c.S.settings().haptics,c.S.settings().homeHide],[540,undefined,false,['quick']]);
 ok('restore leaves schema, migration and flights as they were',[c.S.settings().schema,c.S.settings().mig,c.S.get('kept').answers.q_minutes],[4,5,90]);

 /* --- the app: hours from every minutes question, corrected in settings --- */
 b=await browser({source:released});
 await b.ev(`(async()=>{
  Store.addQuestion({id:'q_min2',label:'זמן אוויר',type:'minutes',stage:'debrief'});
  await Store.save({id:'h1',stage:'done',flownAt:Store.todayISO(),answers:{q_subject:'AW 1',q_minutes:60}});
  await Store.save({id:'h2',stage:'done',flownAt:Store.todayISO(),answers:{q_subject:'AW 2',q_min2:30}});
  await Store.save({id:'h3',stage:'brief',flownAt:Store.todayISO(),answers:{q_subject:'AW 3'}});
  Store.set('installDismissed',true);Store.set('releaseSeen','v23');return 1;})()`);
 const flightsBefore=await b.ev('JSON.stringify(Store.all())');
 await b.route('log','#q');await b.route('home','#view');
 ok('home hours total every debriefed minute, under any minutes question',await b.ev("document.querySelector('.flightcard__v .odo').textContent"),'1.5');
 await b.route('settings','#hoursTotal');
 ok('settings show the logged total',await b.ev("document.querySelector('#hoursTotal').value"),'1.5');
 await b.type('#hoursTotal','abc');await b.click('[data-hourssave]');
 ok('an unreadable total is refused beside the field',await b.ev("[!document.querySelector('#hoursErr').hidden,document.querySelector('#hoursTotal').getAttribute('aria-invalid'),Store.settings().hoursAdjust]"),[true,'true',undefined]);
 await b.type('#hoursTotal','10:30');await b.click('[data-hourssave]');
 ok('a total in hours and minutes is stored as a correction on top of the log',await b.ev('Store.settings().hoursAdjust'),540);
 ok('correcting hours never changes a flight',await b.ev('JSON.stringify(Store.all())'),flightsBefore);
 await b.route('home','#view');
 ok('home shows the corrected total and says so',await b.ev("[document.querySelector('.flightcard__v .odo').textContent,document.querySelector('.flightcard__mins').textContent]"),['10.5',await b.ev('T.hoursWithManual("9.0")')]);
 await b.route('settings','[data-hoursreset]');await b.click('[data-hoursreset]');
 ok('the correction can be removed',await b.ev('Store.settings().hoursAdjust'),0);

 await b.click('[data-motion-set=off]');
 ok('animation level applies at once and is kept',await b.ev("[document.documentElement.dataset.motion,Store.settings().motion,Motion.reduced()]"),['off','off',true]);
 await b.click('[data-motion-set=auto]');
 await b.click('[data-switch=haptics]');
 ok('vibration can be turned off',await b.ev("[Store.settings().haptics,document.querySelector('[data-switch=haptics]').getAttribute('aria-checked')]"),[false,'false']);
 await b.click('[data-switch=home-quick]');
 await b.route('home','#view');
 ok('a home section can be hidden',await b.ev("!document.querySelector('.qa')&&!!document.querySelector('.flightcard')"),true);
 await b.route('settings','[data-switch=home-quick]');await b.click('[data-switch=home-quick]');
 ok('and shown again',await b.ev('Store.settings().homeHide'),[]);

 /* --- the course's end date, where it is known --- */
 const expectDays=await b.ev("(()=>{const t=Store.todayISO();return Math.round((Date.UTC(2026,11,10)-Date.UTC(+t.slice(0,4),+t.slice(5,7)-1,+t.slice(8,10)))/864e5);})()");
 await b.ev("Store.setCourse('rishoni')");
 await b.route('progress','[data-shareprogress]');
 ok('ראשוני shows its end date with a countdown on the progress screen',await b.ev("(()=>{const c=document.querySelector('.course-clock');return c?[+c.dataset.courseclock,c.textContent.includes('10 בדצמבר')]:null;})()"),[expectDays,true]);
 await b.route('home','#view');
 ok('and on the home flight card',await b.ev("+document.querySelector('.flightcard__course [data-courseclock]').dataset.courseclock"),expectDays);
 await b.ev("Store.setCourse('mitkadem')");
 await b.route('progress','[data-shareprogress]');
 ok('a course without an announced end date shows no date at all',await b.ev("!document.querySelector('.course-clock')"),true);
 await b.route('home','#view');
 ok('including on home',await b.ev("!document.querySelector('[data-courseclock]')"),true);
 await b.ev("Store.setCourse('rishoni')");

 /* --- the update message and the tour --- */
 await b.ev("Store.set('releaseSeen',null);window.beforeReload=1;location.hash='#/';location.reload()");
 await b.until("typeof beforeReload==='undefined'&&document.querySelector('#sheet').open");
 ok('the update message offers the tour first',await b.ev("[document.querySelector('.sheet__title').textContent,document.querySelector('#sheet [data-act=\"0\"]').textContent.trim()]"),[await b.ev('T.whatsNew'),await b.ev('T.releaseTour')]);
 ok('it tells people their work came with them',await b.ev("document.querySelector('.release-safe').textContent"),await b.ev('T.releaseSafe'));
 await b.click('#sheet [data-act="0"]');
 await b.until("!!document.querySelector('.tour')&&!document.querySelector('.tour').classList.contains('is-moving')",8000);
 ok('the tour starts on the flight card with the app inert beneath it',await b.ev("[document.querySelector('.tour__title').textContent,document.querySelector('#app').inert,document.querySelector('#sheet').open,Store.settings().releaseSeen]"),[await b.ev('T.tourSteps[0][1]'),true,false,'v23']);
 await b.ev("Promise.all(document.querySelector('.tour__spot').getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished))");
 ok('the spotlight sits on its element',await b.ev("(()=>{const s=document.querySelector('.tour__spot').getBoundingClientRect(),t=document.querySelector('.flightcard').getBoundingClientRect();return Math.abs(s.top-(t.top-8))<3&&Math.abs(s.height-(t.height+16))<3;})()"),true);
 ok('focus is on the next step',await b.ev("document.activeElement===document.querySelector('.tour [data-t=next]')"),true);
 await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 await b.until("!document.querySelector('.tour')");
 ok('Escape ends the tour and hands the app back',await b.ev("document.querySelector('#app').inert"),false);
 await b.ev("Store.set('homeHide',['quick'])");
 await b.route('whatsnew','[data-starttour]');await b.click('[data-starttour]');
 await b.until("document.body.dataset.route==='home'&&!!document.querySelector('.tour')&&!document.querySelector('.tour').classList.contains('is-moving')",8000);
 ok('the tour can be replayed from מה חדש and skips hidden sections',await b.ev("document.querySelector('.tour__count').textContent"),await b.ev('T.tourStep(1,4)'));
 for(let i=0;i<4;i++){await b.until("!document.querySelector('.tour').classList.contains('is-moving')",8000);await b.click('.tour [data-t=next]');}
 await b.until("!document.querySelector('.tour')");
 ok('finishing the tour leaves every flight as it was',await b.ev('JSON.stringify(Store.all())'),flightsBefore);
 ok('no uncaught runtime errors',b.errors.length,0);
 console.log(checks+' settings and release checks passed');b.close();
})().catch(e=>{console.error(e);if(b){console.error(b.errors);b.close();}process.exitCode=1;});
