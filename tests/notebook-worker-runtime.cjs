// Actual workerd/SQLite execution; all network services are synthetic mocks.
const assert=require('node:assert/strict'),path=require('node:path');
const {Miniflare}=require('../worker/node_modules/miniflare');
const esbuild=require('../worker/node_modules/esbuild');
const core=require('../worker/notebook.mjs');
let mf,checks=0,mode='',modelCalls=0,authCalls=0,releaseModel;
const now=Math.floor(Date.now()/1000),uid='cadet-runtime';
const token=[{alg:'RS256',kid:'test'},{sub:uid,aud:'sortie-7900c',iss:'https://securetoken.google.com/sortie-7900c',exp:now+3600,iat:now-100,auth_time:now-200,email_verified:true,firebase:{sign_in_provider:'google.com'}},'signature'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
const jpeg=Buffer.from([255,216,255,192,0,11,8,0,16,0,16,1,1,17,0,255,217]);
const image='data:image/jpeg;base64,'+jpeg.toString('base64');
const result={sections:[{kind:'highlights',heading:'דגשים',items:[{text:'בדיקת ריצה מקומית',mark:'none',uncertain:false}]}]};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const req=(extra={})=>mf.dispatchFetch('https://reader.test/readNotebook',{method:'POST',headers:{Origin:'https://yzgershon.github.io','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({image}),...extra});
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
(async()=>{
 const testEntry=`import front,{NotebookReader} from './index.mjs';export default front;
 export class TestReader extends NotebookReader {async fetch(req){
   if(new URL(req.url).pathname==='/__test_storage'){
     const {op,key,value}=await req.json();let result;
     if(op==='get')result=await this.ctx.storage.get(key);
     else if(op==='put')result=await this.ctx.storage.put(value);
     else if(op==='deleteAll')result=await this.ctx.storage.deleteAll();
     else if(op==='list')result=[...await this.ctx.storage.list()];
     else throw Error('Unknown test operation');
     return Response.json({value:result});
   }
   return super.fetch(req);
 }};`;
 const built=await esbuild.build({stdin:{contents:testEntry,resolveDir:path.resolve(__dirname,'../worker')},bundle:true,write:false,format:'esm',platform:'browser',external:['node:buffer']});
 mf=new Miniflare({modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-07-30',compatibilityFlags:['nodejs_compat'],
  bindings:{NOTEBOOK_ENABLED:'true',FIREBASE_API_KEY:'test-web-key',SORTIE_OPENAI_API_KEY:'test-provider-key'},
  durableObjects:{READER:{className:'TestReader',useSQLite:true}},
  outboundService:async request=>{
   const url=new URL(request.url);
   if(url.hostname==='identitytoolkit.googleapis.com'){
    authCalls++;assert.equal(JSON.parse(await request.text()).idToken,token);
    if(mode==='invalid-token')return json({error:{}},400);
    return json({users:[{localId:uid,emailVerified:true,validSince:String(mode==='revoked'?now-1:now-201),disabled:mode==='disabled',providerUserInfo:[{providerId:'google.com'}]}]});
   }
   if(url.hostname==='firestore.googleapis.com'){
    assert.equal(request.headers.get('Authorization'),'Bearer '+token);
    assert.equal(request.method,'GET');
    if(mode==='missing')return json({},404);
    if(url.pathname.endsWith('/security/instructor'))return json({name:url.pathname.slice(4),fields:{uid:{stringValue:mode==='wrong-owner'?'different-owner':uid}}});
    assert(url.pathname.endsWith('/access/'+uid),'No training-record request');
    return json({name:url.pathname.slice(4),fields:{active:{booleanValue:mode!=='inactive'},role:{stringValue:['owner','wrong-owner'].includes(mode)?'instructor':'cadet'},...(mode==='old-enrollment'?{authNotBefore:{integerValue:String(now-200)}}:{})}});
   }
   if(url.hostname==='api.openai.com'){
    if(url.pathname.endsWith('/input_tokens'))return json({input_tokens:100});
    modelCalls++;assert.equal(request.headers.get('Authorization'),'Bearer test-provider-key');
    const input=await request.json();assert.equal(input.model,'gpt-6.1-sol');assert.equal(input.reasoning.effort,'medium');assert.equal(input.service_tier,'default');assert.equal(input.store,false);assert.equal(input.input[0].content[0].image_url,image);
    if(mode==='wait')await new Promise(r=>releaseModel=r);
    if(mode==='provider-error')return json({error:{message:'private error details'}},500);
    return json({model:core.MODEL,service_tier:'default',usage:{input_tokens:100,output_tokens:100,input_tokens_details:{cached_tokens:0,cache_write_tokens:100}},status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(result)}]}]});
   }
   throw Error('Unexpected network request: '+url.hostname);
  }
 });
 await mf.ready;
 const ns=await mf.getDurableObjectNamespace('READER'),id=ns.idFromName('notebook-limits-v1');
 const stub=ns.get(id);
 const storageCall=async(op,key,value)=>(await(await stub.fetch('https://internal.test/__test_storage',{method:'POST',body:JSON.stringify({op,key,value})})).json()).value;
 const storage={get:key=>storageCall('get',key),put:value=>storageCall('put',null,value),deleteAll:()=>storageCall('deleteAll'),list:async()=>new Map(await storageCall('list'))};
 const reset=async()=>{mode='';await storage.deleteAll();};
 await test('Worker and SQLite object run full authorized route',async()=>{
  const r=await req();assert.equal(r.status,200);assert.deepEqual(await r.json(),result);assert.equal(r.headers.get('Cache-Control'),'no-store');
  assert.equal((await storage.get('u:'+uid)).daily,1);assert.equal((await storage.get('global')).monthly,1);
 });
 await test('durable storage contains only usage counts, never content or tokens',async()=>{
  const values=JSON.stringify([...await storage.list()]);assert(!values.includes('image'));assert(!values.includes('בדיקת'));assert(!values.includes(token));assert(!values.includes('test-provider-key'));
 });
 await test('authentication, revocation and owner failures never call OpenAI',async()=>{
  const calls=modelCalls;
  for(const m of ['invalid-token','revoked','disabled','missing','inactive','old-enrollment','wrong-owner']){mode=m;const r=await req();assert([401,403].includes(r.status),m);}
  assert.equal(modelCalls,calls);
 });
 await test('instructor pin permits only the actual pinned owner',async()=>{
  await reset();mode='owner';assert.equal((await req()).status,200);
 });
 await test('repeated scans hit the persistent per-minute limit',async()=>{
  await reset();const calls=modelCalls;
  for(let i=0;i<3;i++)assert.equal((await req()).status,200);
  const r=await req();assert.equal(r.status,429);assert.equal(modelCalls,calls+3);assert.equal((await storage.get('global')).daily,3);
 });
 await test('daily user and global budgets block before provider spend',async()=>{
  const state=core.quota({},{}),calls=modelCalls;
  for(const [u,g] of [[{...state.user,daily:20},state.global],[state.user,{...state.global,daily:200}],[state.user,{...state.global,monthly:2000}]]){
   await reset();await storage.put({['u:'+uid]:u,global:g});assert.equal((await req()).status,429);
  }
  assert.equal(modelCalls,calls);
 });
 await test('provider failure is sanitized and still counts toward budget',async()=>{
  await reset();mode='provider-error';const r=await req();assert.equal(r.status,502);assert.deepEqual(await r.json(),{error:'FAILED'});assert.equal((await storage.get('global')).daily,1);
  assert.equal((await storage.get('global')).monthSpent,core.RESERVE_USD_MICRO);
 });
 await test('actual SQLite reserves and settles estimated spend with concurrent calls',async()=>{
  await reset();await Promise.all([req(),req()]);assert.equal((await storage.get('global')).monthSpent,2750);
  const before=core.quota({},{}).global;before.monthSpent=core.MONTH_USD_MICRO;
  await storage.put({global:before});const calls=modelCalls;const r=await req();assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:'BUDGET'});assert.equal(modelCalls,calls);
 });
 await test('bad images and unknown JSON properties never consume a scan',async()=>{
  await reset();const calls=modelCalls;
  for(const body of [{image:'invalid'},{image,history:'not permitted'},null])assert.equal((await req({body:JSON.stringify(body)})).status,400);
  assert.equal(modelCalls,calls);assert.equal(await storage.get('global'),undefined);
 });
 await test('cross-origin and preflight requests do not authenticate',async()=>{
  const count=authCalls;
  assert.equal((await req({headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await req({method:'OPTIONS',body:undefined})).status,204);assert.equal(authCalls,count);
 });
 await test('two simultaneous scans atomically reserve separate counts',async()=>{
  await reset();const responses=await Promise.all([req(),req()]);assert(responses.every(r=>r.status===200));assert.equal((await storage.get('global')).daily,2);assert.equal((await storage.get('u:'+uid)).daily,2);
 });
 console.log(checks+' actual Worker runtime checks passed (mocked Google/OpenAI)');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(mf)await mf.dispose();});
