const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const {root}=require('./support.cjs');
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8'),release=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
let checks=0;
function harness() {
 const handlers={},bins=new Map([['another-app-cache',new Map()],['sortie-v21-shell',new Map()],['sortie-v22-shell',new Map([['./index.html',new Response('previous healthy shell')]])]]);
 const state={mode:'good',fail:null,skip:0,claimed:0};
 const caches={keys:async()=>Array.from(bins.keys()),delete:async k=>bins.delete(k),open:async name=>{
  if(!bins.has(name))bins.set(name,new Map());const data=bins.get(name);
  return {put:async(k,v)=>data.set(k,v.clone()),match:async k=>data.get(k)?.clone()};
 }};
 const context={URL,Response,AbortController,crypto:crypto.webcrypto,Uint8Array,setTimeout,clearTimeout,caches,
 fetch:async request=>{const key=typeof request==='string'?request:'./'+new URL(request.url).pathname.replace('/sortie/','');
  if(state.mode==='offline')throw Error('offline');if(state.fail===key||state.mode==='503')return new Response('error',{status:503});
  if(state.mode==='mixed'&&key.endsWith('.js'))return new Response('different release');
  if(key==='./release-manifest.json')return Response.json(release);
  return new Response(fs.readFileSync(path.join(root,key)));
 },self:{location:{origin:'https://example.test'},registration:{scope:'https://example.test/sortie/'},addEventListener:(k,fn)=>handlers[k]=fn,
  skipWaiting:async()=>{state.skip++;},clients:{matchAll:async()=>[{url:'https://example.test/sortie/index.html'}],claim:async()=>{state.claimed++;}}}};
 vm.runInNewContext(source,context);
 const lifecycle=async name=>{let p;handlers[name]({waitUntil:x=>p=x});return p;};
 const request=async(key,navigate=false)=>{let p;handlers.fetch({request:{url:'https://example.test/sortie/'+key.replace('./',''),method:'GET',mode:navigate?'navigate':'cors'},respondWith:x=>p=x});return p;};
 return{state,bins,lifecycle,request};
}
(async()=>{
 for(const file of Object.keys(release.files)){
  const h=harness();h.state.fail=file;await assert.rejects(h.lifecycle('install'));assert.equal(h.state.skip,0);assert.ok(h.bins.has('sortie-v22-shell'));assert.ok(!h.bins.has(release.version+'-shell'));checks++;console.log('PASS interrupted install keeps previous release: '+file);
 }
 const h=harness();await h.lifecycle('install');assert.equal(h.state.skip,0);await h.lifecycle('activate');assert.equal(h.state.claimed,1);assert.ok(h.bins.has('another-app-cache'));assert.ok(h.bins.has('sortie-v22-shell'));assert.ok(!h.bins.has('sortie-v21-shell'));checks++;console.log('PASS activation preserves unrelated and previous caches');
 for(const mode of ['503','offline','mixed']){
  h.state.mode=mode;
  for(const file of ['./index.html','./js/app.js','./css/app.css']){
   const r=await h.request(file,file.endsWith('.html'));assert.equal(r.status,200);assert.equal(crypto.createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex'),release.files[file]);checks++;console.log('PASS '+mode+' returns verified '+file);
  }
 }
 console.log(checks+' worker checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
