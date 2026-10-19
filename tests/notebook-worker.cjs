const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
const now=2000000000;
const payload={sub:'cadet-1',aud:'sortie-7900c',iss:'https://securetoken.google.com/sortie-7900c',exp:now+100,iat:now-100,auth_time:now-200,email_verified:true,firebase:{sign_in_provider:'google.com'}};
const token=(overrides={},header={})=>[JSON.stringify({alg:'RS256',kid:'test',...header}),JSON.stringify({...payload,...overrides}),'signature'].map(v=>Buffer.from(v).toString('base64url')).join('.');
const user={localId:'cadet-1',emailVerified:true,validSince:String(now-201),providerUserInfo:[{providerId:'google.com'}]};
const response=value=>new Response(JSON.stringify(value),{status:200});
(async()=>{
 const A=await import(pathToFileURL(path.resolve(__dirname,'../worker/auth.mjs')));
 await test('untrusted JWT claims are checked before remote authentication',()=>{
  assert.equal(A.claims(token(),now).uid,'cadet-1');
  for(const p of [{aud:'other'},{iss:'https://evil.example'},{sub:'../owner'},{exp:now},{iat:now+61},{auth_time:now+61},{email_verified:false},{firebase:{sign_in_provider:'password'}},{firebase:{sign_in_provider:'google.com',tenant:'other'}}])assert.throws(()=>A.claims(token(p),now));
  for(const h of [{alg:'none'},{kid:''},{jwk:{}}])assert.throws(()=>A.claims(token({},h),now));
 });
 await test('fresh Google tokens tolerate bounded clock skew but still require verification',async()=>{
  for(const offset of [1,60]){
   const fresh=token({iat:now+offset,auth_time:now+offset});
   let calls=0;
   assert.equal((await A.verify(fresh,'key',async()=>{calls++;return response({users:[user]});},now)).uid,'cadet-1');
   assert.equal(calls,1);
   await assert.rejects(A.verify(fresh,'key',async()=>new Response('{}',{status:400}),now),/SIGN_IN/);
  }
  assert.throws(()=>A.claims(token({iat:now+61}),now));
  assert.throws(()=>A.claims(token({auth_time:now+61}),now));
  assert.throws(()=>A.claims(token({exp:now}),now));
  await assert.rejects(A.verify(token({iat:now+1,auth_time:now+1}),'key',async()=>response({users:[{...user,validSince:String(now+2)}]}),now));
 });
 await test('Google must validate the original complete token',async()=>{
  let seen;
  const result=await A.verify(token(),'web-key',async(url,init)=>{seen={url,init};return response({users:[user]});},now);
  assert.equal(result.uid,'cadet-1');assert.equal(JSON.parse(seen.init.body).idToken,token());
  assert.equal(seen.url,'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=web-key');assert.equal(seen.init.redirect,'manual');
 });
 await test('invalid signatures denied by Google never become trusted',async()=>{
  await assert.rejects(A.verify(token(),'key',async()=>new Response('{}',{status:400}),now),/SIGN_IN/);
 });
 await test('revoked, disabled, deleted and mismatched users are rejected',async()=>{
  for(const u of [{...user,validSince:String(now-199)},{...user,disabled:true},{...user,localId:'other'},{...user,emailVerified:false},{...user,validSince:undefined},{...user,validSince:'invalid'},{...user,providerUserInfo:[]}])await assert.rejects(A.verify(token(),'key',async()=>response({users:[u]}),now));
  await assert.rejects(A.verify(token(),'key',async()=>response({users:[]}),now));
 });
 await test('only membership and instructor pin paths can be read',async()=>{
  for(const p of ['cadets/cadet-1/flights','security/notebook','access/cadet-1/extra'])await assert.rejects(A.document('token',p,async()=>{throw Error('must not fetch');}),/FORBIDDEN/);
 });
 await test('Firestore gets the cadet token, with no admin bypass',async()=>{
  let seen;const name='projects/sortie-7900c/databases/(default)/documents/access/cadet-1';
  const result=await A.document('actual-token','access/cadet-1',async(url,init)=>{seen={url,init};return response({name,fields:{active:{booleanValue:true},role:{stringValue:'cadet'},authNotBefore:{integerValue:'123'}}});});
  assert.deepEqual(result,{active:true,role:'cadet',authNotBefore:123});assert.equal(seen.init.headers.Authorization,'Bearer actual-token');assert.equal(seen.url,'https://firestore.googleapis.com/v1/'+name);
 });
 await test('missing or mismatched enrollment fails closed',async()=>{
  await assert.rejects(A.document('token','access/cadet-1',async()=>new Response('{}',{status:404})),/FORBIDDEN/);
  await assert.rejects(A.document('token','access/cadet-1',async()=>response({name:'wrong',fields:{}})),/FORBIDDEN/);
 });
 const W=await import(pathToFileURL(path.resolve(__dirname,'../worker/index.mjs')));
 const req=(changes={})=>new Request('https://reader.test/readNotebook',{method:'POST',headers:{Origin:'https://yzgershon.github.io','Content-Type':'application/json',Authorization:'Bearer '+token()},body:'{}',...changes});
 await test('disabled reader and absent secret cannot reach a Durable Object',async()=>{
  const env={NOTEBOOK_ENABLED:'false',READER:{idFromName(){throw Error('must not forward');}}};
  const disabled=await W.default.fetch(req(),env);assert.equal(disabled.status,503);assert.equal(disabled.headers.get('X-Sortie-Availability'),'front-disabled');
  const absent=await W.default.fetch(req(),{...env,NOTEBOOK_ENABLED:'true'});assert.equal(absent.status,503);assert.equal(absent.headers.get('X-Sortie-Availability'),'front-key-missing');
 });
 await test('origin, route, method and bearer checks precede all work',async()=>{
  for(const request of [req({headers:{Origin:'https://evil.example'}}),new Request('https://reader.test/not-an-endpoint'),req({method:'GET',body:undefined}),req({headers:{Origin:'https://yzgershon.github.io','Content-Type':'application/json'}})])assert([400,401,403,404,405].includes((await W.default.fetch(request,{})).status));
  assert.equal((await W.default.fetch(req({method:'OPTIONS',body:undefined}),{})).status,204);
 });
 await test('host failure becomes unavailable without leaking details',async()=>{
  const env={NOTEBOOK_ENABLED:'true',SORTIE_OPENAI_API_KEY:'test',READER:{idFromName:()=>1,get:()=>({fetch:async()=>{throw Error('private details');}})}};
  const r=await W.default.fetch(req(),env);assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'UNAVAILABLE'});assert.equal(r.headers.get('X-Sortie-Availability'),'reader-unreachable');
 });
 await test('concurrent admission refuses excess requests before authentication',async()=>{
  const reader=new W.NotebookReader({storage:{}},{NOTEBOOK_ENABLED:'true',SORTIE_OPENAI_API_KEY:'test'});reader.active=2;
  assert.equal((await reader.fetch(req())).status,429);
 });
 console.log(checks+' notebook Worker checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
