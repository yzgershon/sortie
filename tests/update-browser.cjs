const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {browser,root}=require('./support.cjs');let b,next=false,broken=false,checks=0;
const release=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
const nextApp=fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace("'v23-preview'","'v23-preview-test'");
const nextRelease={...release,version:'sortie-v23-preview-test',files:{...release.files,'./js/app.js':crypto.createHash('sha256').update(nextApp).digest('hex')}};
const ok=(label,a,e)=>{assert.deepEqual(a,e);checks++;console.log('PASS '+label);};
async function update(){return b.ev(`(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();const w=r.installing;if(!w)return r.waiting?'installed':'unchanged';return await new Promise(resolve=>{const check=()=>{if(['installed','redundant'].includes(w.state))resolve(w.state);};w.addEventListener('statechange',check);check();});})()`);}
(async()=>{
 b=await browser({worker:true,respond:(req,res,p)=>{if(next&&p==='/release-manifest.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(nextRelease));return true;}if(broken&&p==='/css/features.css'){res.writeHead(503);res.end('interrupted update');return true;}},source:(file,data)=>{
  if(!next)return data;const rel=path.relative(root,file).replace(/\\/g,'/');if(rel==='js/app.js')return nextApp;if(rel==='sw.js')return data.toString().replace("'sortie-v23-preview'","'sortie-v23-preview-test'");return data;
 }});
 await b.until('!!navigator.serviceWorker.controller');
 await b.ev("Store.save({id:'existing',stage:'done',answers:{q_subject:'AW 3'}});Workspace.saveNote({title:'kept',body:'notebook kept'});window.initialDocument=true");
 await b.route('brief','[data-q=q_subject]');await b.type('[data-q=q_subject]','my draft');await b.type('[data-goalinput=q_goals]','unfinished text');
 next=true;broken=true;ok('incomplete real worker install is rejected',await update(),'redundant');
 ok('failed update does not reload active form',await b.ev('window.initialDocument'),true);
 await b.send('Network.enable');await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await b.send('Page.reload');
 await b.until("typeof initialDocument==='undefined' && !!document.querySelector('[data-goalinput=q_goals]')");
 ok('previous shell opens offline after failed update',await b.ev("document.querySelector('[data-goalinput=q_goals]').value"),'unfinished text');
 await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});broken=false;await b.ev('window.editingDocument=true');
 ok('complete new release waits while editing',await update(),'installed');
 ok('ready update does not replace the current document',await b.ev('window.editingDocument'),true);
 await b.until("!!document.querySelector('.toast__b')");await b.click('.toast__b');
 await b.until("typeof editingDocument==='undefined' && !!document.querySelector('[data-goalinput=q_goals]')");
 ok('explicit update preserves uncommitted add-field',await b.ev("document.querySelector('[data-goalinput=q_goals]').value"),'unfinished text');
 ok('existing flight and notebook survive activation',await b.ev("[!!Store.get('existing'),Workspace.all().notes[0].body]"),[true,'notebook kept']);
 await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await b.ev('window.lastDocument=true');await b.send('Page.reload');await b.until("typeof lastDocument==='undefined' && !!document.querySelector('[data-goalinput=q_goals]')");
 ok('updated shell reopens offline with draft',await b.ev("document.querySelector('[data-goalinput=q_goals]').value"),'unfinished text');
 ok('both verified releases retained',await b.ev("caches.keys().then(k=>k.includes('sortie-v23-preview-shell')&&k.includes('sortie-v23-preview-test-shell'))"),true);
 ok('no browser runtime errors',b.errors.length,0);console.log(checks+' browser update checks passed');b.close();
})().catch(e=>{console.error(e);if(b){console.error(b.errors);b.close();}process.exitCode=1;});
