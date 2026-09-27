const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),http=require('http'),cp=require('child_process'),os=require('os');
const root=path.resolve(__dirname,'..');
function store(mem={},options={}) {
 const localStorage={getItem:k=>mem[k]??null,setItem:(k,v)=>{if(options.failWrites)throw Error('QuotaExceededError');mem[k]=String(v);},removeItem:k=>delete mem[k],key:i=>Object.keys(mem)[i],get length(){return Object.keys(mem).length;}};
 const g={localStorage,indexedDB:options.indexedDB,navigator:{},crypto:crypto.webcrypto,isSecureContext:true,TextEncoder,Uint8Array,setTimeout,clearTimeout,console};g.window=g;
 vm.createContext(g);for(const name of ['courses','syllabus','syllabus-data','syllabus-mitkadem','store','workspace'])vm.runInContext(fs.readFileSync(path.join(root,'js',name+'.js'),'utf8'),g,{filename:name});
 return {g,S:g.Store,W:g.Workspace,mem};
}
async function browser(options={}) {
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const server=http.createServer((req,res)=>{
  const p=new URL(req.url,'http://127.0.0.1').pathname;
  if(options.respond && options.respond(req,res,p))return;
  if(p==='/js/cloud-config.js'&&!options.worker){res.setHeader('Content-Type','text/javascript');res.end('window.CLOUD_CONFIG={enabled:false};');return;}
  if(p==='/sw.js'&&!options.worker){res.writeHead(404);res.end();return;}
  if(p==='/js/auth-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.AUTH_CONFIG={clientId:"",allow:[],courses:{}};');return;}
  // Worker tests need exact manifest-hashed bytes; their outbound Formspree
  // requests are blocked below. Other suites opt into loopback mocks explicitly.
  if(p==='/js/feedback-config.js'&&!options.worker){res.setHeader('Content-Type','text/javascript');res.end('window.FEEDBACK_CONFIG={endpoint:""};');return;}
  const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}if(options.source)data=options.source(file,data);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'})[path.extname(file)]||'text/plain');res.end(data);});
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port+'/';
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'sortie-v23-test-'));
 const chrome=cp.spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 let tabs;for(let i=0;i<100;i++){try{const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];tabs=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();if(tabs.some(t=>t.type==='page'))break;}catch{}await pause(100);}
 if(!tabs){chrome.kill();server.close();throw Error('Chrome did not start');}
 const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const until=async(expression,timeout=10000)=>{const end=Date.now()+timeout;while(Date.now()<end){try{if(await ev(expression))return;}catch{}await pause(60);}throw Error('Timeout: '+expression);};
 const click=selector=>ev('document.querySelector('+JSON.stringify(selector)+').click()');
 const type=(selector,value)=>ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const route=async(name,selector)=>{if(name==='home')selector='[href="#/progress"]';await ev('location.hash='+JSON.stringify('#/'+name));await until('document.body.dataset.route==='+JSON.stringify(name.split('/')[0]||'home')+'&&!!document.querySelector('+JSON.stringify(selector)+')');};
 const shot=async name=>{await ev('Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})))');const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});const dir=path.resolve(root,'../artifacts/sortie-v23');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,name+'.png'),Buffer.from(r.data,'base64'));};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Network.enable');await send('Network.setBlockedURLs',{urls:['https://formspree.io/f/*','https://identitytoolkit.googleapis.com/*','https://securetoken.googleapis.com/*','https://firestore.googleapis.com/*']});
 await send('Page.navigate',{url:base});await until("typeof Store!=='undefined' && !!document.querySelector('[data-coursego]')");await click('[data-coursego]');await until("!document.querySelector('#app').hidden && document.body.dataset.route==='home'");
 return {base,ev,send,until,click,type,route,shot,errors,close:()=>{ws.close();chrome.kill();server.close();}};
}
module.exports={store,browser,root};
