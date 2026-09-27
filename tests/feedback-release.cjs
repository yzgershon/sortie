// Feedback goes only to a loopback mock. No real email/service submission.
const assert=require('assert/strict'),path=require('path'),{browser,root}=require('./support.cjs');let b,checks=0,fail=true,requests=[];
async function ok(label,expression,expected){assert.deepEqual(await b.ev(expression),expected);checks++;console.log('PASS '+label);}
(async()=>{
 b=await browser({respond:(req,res,p)=>{if(p!='/feedback')return false;let body='';req.on('data',x=>body+=x);req.on('end',()=>{requests.push(JSON.parse(body));res.writeHead(fail?422:200,{'Content-Type':'application/json'});res.end(JSON.stringify(fail?{errors:[{message:'mock rejection'}]}:{ok:true}));});return true;}});
 await ok('browser test profile cannot inherit the live feedback endpoint','FEEDBACK_CONFIG.endpoint','');
 await b.ev("FEEDBACK_CONFIG.endpoint=location.origin+'/feedback'");await b.route('feedback','#feedbackMessage');await b.type('#feedbackMessage','feedback saved locally');
 await b.ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:false})");await b.click('#feedbackSend');await ok('offline feedback stays as a draft',"[document.querySelector('#feedbackState').textContent,Workspace.feedbackDraft().message]",[await b.ev('T.feedbackOffline'),'feedback saved locally']);assert.equal(requests.length,0);
 await b.ev("Object.defineProperty(navigator,'onLine',{configurable:true,value:true})");await b.click('#feedbackSend');await b.until("document.querySelector('#feedbackState').textContent===T.feedbackFailed");await ok('rejected feedback retains text',"Workspace.feedbackDraft().message",'feedback saved locally');
 assert.deepEqual(Object.keys(requests[0]).sort(),['category','message','submission_id']);checks++;console.log('PASS no flight, notebook, account or diagnostics attached by default');
 fail=false;await b.ev("document.querySelector('#feedbackSend').click();document.querySelector('#feedbackSend').click()");await b.until("document.querySelector('#feedbackState').textContent===T.feedbackSent");await ok('accepted feedback clears its draft',"Workspace.feedbackDraft()",null);assert.equal(requests.length,2);checks++;console.log('PASS repeated click sends only one request');
 await b.route('whatsnew','[data-understood]');await b.click('[data-understood]');await b.until("document.body.dataset.route==='home'");await ok('preview acknowledgment does not consume released-version notice',"Store.settings().releaseSeen==='v23-preview'",false);
 b.close();b=await browser({source:(file,data)=>path.relative(root,file).replace(/\\/g,'/')==='js/app.js'?data.toString().replace(/var BUILD = '[^']+'/,"var BUILD = 'v23'"):data});
 await ok('a first-time user is not told what changed',"[document.querySelector('#sheet').open,Store.settings().releaseSeen]",[false,'v23']);
 await b.ev("(async()=>{await Store.save({id:'had',stage:'done',answers:{q_subject:'AW 1'}});Store.set('releaseSeen','v22');return 1;})()");
 await b.ev('window.beforeReload=true');await b.send('Page.reload');await b.until("typeof beforeReload==='undefined'&&document.querySelector('#sheet').open");
 await ok('released version announces after gate to someone with saved work',"document.querySelector('.sheet__title').textContent",await b.ev('T.whatsNew'));
 await b.click('#sheet [data-act="0"]');await b.ev('window.beforeReload=true');await b.send('Page.reload');await b.until("typeof beforeReload==='undefined'&&document.body.dataset.route==='home'");await ok('acknowledged release does not announce again',"document.querySelector('#sheet').open",false);
 await b.route('whatsnew','[data-understood]');await ok('full release notes remain accessible',"document.querySelectorAll('.release__list article').length",9);
 await ok('no runtime errors','true',b.errors.length===0);console.log(checks+' feedback/release checks passed');b.close();
})().catch(e=>{console.error(e);if(b)b.close();process.exitCode=1;});
