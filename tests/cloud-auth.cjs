const vm=require('vm'),fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
let checks=0;
const check=(s,fn)=>{fn();console.log('PASS '+s);checks++;};
function fixture(){
 const mem={'sortie:mirror':'SAVED FLIGHTS','sortie:workspace':'PRIVATE NOTES','sortie:draft:new':'UNFINISHED DRAFT'},calls=[];
 const f={identity:{uid:'cadet',email:'cadet@example.test',verified:true},membership:{active:true,role:'cadet'},failure:null};
 const adapter={restore:async()=>f.identity,access:async()=>{calls.push('access');if(f.failure)throw f.failure;return f.membership;},
  signIn:async token=>{calls.push(token);if(f.signInFailure)throw f.signInFailure;return f.identity;},signOut:async()=>{calls.push('signout');f.identity=null;}};
 const g={location:{origin:'https://example.test',pathname:'/sortie/index.html',search:'',hash:''},
  history:{replaceState:(_,__,url)=>{g.location.hash=url.slice(url.indexOf('#'));}},navigator:{onLine:true},crypto:crypto.webcrypto,TextEncoder,Uint8Array,
  atob:s=>Buffer.from(s,'base64').toString('binary'),console,setTimeout,clearTimeout,
  dispatchEvent:()=>{},CustomEvent:class{constructor(type){this.type=type;}},
  AUTH_CONFIG:{clientId:'old-client',redirectUri:'https://example.test/sortie/index.html',allow:['cadet@example.test']},
  CLOUD_CONFIG:{enabled:true,googleClientId:'new-client',firebase:{projectId:'demo-sortie',apiKey:'fake'}},FirebaseAdapter:()=>adapter,
  localStorage:{getItem:k=>mem[k]||null,setItem:(k,v)=>{if(f.storageFailure)throw Error('QuotaExceededError');mem[k]=v;},removeItem:k=>delete mem[k]}
 };g.window=g;vm.createContext(g);
 for(const file of ['cloud','auth'])vm.runInContext(fs.readFileSync('js/'+file+'.js','utf8'),g);
 function token(extra={}){return ['header',Buffer.from(JSON.stringify({aud:'new-client',iss:'https://accounts.google.com',exp:Date.now()/1000+3600,email:'Cadet@Example.test',email_verified:true,nonce:'nonce',...extra})).toString('base64url'),'signature'].join('.');}
 function back(extra={},pending=true){g.location.hash='#id_token='+token(extra);if(pending)mem['sortie:auth-pending']=JSON.stringify({nonce:'nonce',issuedAt:Date.now(),route:'#/cloud'});}
 function session(){mem['sortie:auth']=JSON.stringify({email:'cadet@example.test',exp:Date.now()+10000});}
 function preserved(){assert.equal(mem['sortie:mirror'],'SAVED FLIGHTS');assert.equal(mem['sortie:workspace'],'PRIVATE NOTES');assert.equal(mem['sortie:draft:new'],'UNFINISHED DRAFT');}
 return Object.assign(f,{g,mem,calls,back,session,preserved});
}
(async()=>{
 const f=fixture(),url=f.g.Auth.authUrl(),pending=JSON.parse(f.mem['sortie:auth-pending']);
 check('configured OAuth client and pinned redirect retained',()=>{assert.ok(url.includes('client_id=new-client'));assert.ok(url.includes(encodeURIComponent('https://example.test/sortie/index.html')));});
 check('request uses 256-bit random nonce with issue time',()=>{assert.match(pending.nonce,/^[a-f0-9]{64}$/);assert.ok(pending.issuedAt>Date.now()-1000);});
 f.back();const state=await f.g.Auth.resolve();
 check('verified enrolled callback opens app only after Firebase accepts it',()=>{assert.equal(state.state,'ok');assert.deepEqual(f.calls.slice(-1),['access']);assert.ok(f.mem['sortie:verified-access']);});
 check('raw Google token never persisted and fragment is cleared',()=>{assert.ok(!JSON.stringify(f.mem).includes('signature'));assert.equal(f.g.location.hash,'#/cloud');});
 f.back({},false);check('consumed nonce cannot be replayed',()=>{});assert.equal((await f.g.Auth.resolve()).state,'error');
 await f.g.Auth.signOut();check('sign-out clears both sessions and offline receipt without deleting work',()=>{assert.equal(f.calls.at(-1),'signout');assert.equal(f.mem['sortie:auth'],undefined);assert.equal(f.mem['sortie:verified-access'],undefined);f.preserved();});
 for(const [name,claims] of Object.entries({audience:{aud:'wrong'},subdomain:{iss:'https://evil.accounts.google.com'},http:{iss:'http://accounts.google.com'},expiry:{exp:0},unverified:{email_verified:false},missingVerification:{email_verified:undefined},nonce:{nonce:'wrong'}})){
  const t=fixture();t.back(claims);assert.equal((await t.g.Auth.resolve()).state,'error');check(name+' rejected before SDK sign-in',()=>{assert.equal(t.calls.length,0);assert.equal(t.mem['sortie:auth'],undefined);t.preserved();});
 }
 for(const [name,edit] of Object.entries({missingNonce:p=>delete p.nonce,stale:p=>p.issuedAt=Date.now()-600001,future:p=>p.issuedAt=Date.now()+60001,missingTime:p=>delete p.issuedAt})){
  const t=fixture();t.back();const p=JSON.parse(t.mem['sortie:auth-pending']);edit(p);t.mem['sortie:auth-pending']=JSON.stringify(p);
  assert.equal((await t.g.Auth.resolve()).state,'error');check(name+' cannot start a session',()=>assert.equal(t.calls.length,0));
 }
 const denied=fixture();denied.back({email:'stranger@example.test'});assert.equal((await denied.g.Auth.resolve()).state,'denied');check('unlisted account never reaches SDK',()=>assert.equal(denied.calls.length,0));
 for(const mode of ['bad-signature','wrong-identity','unenrolled','revoked','invalid-role','storage-full']){
  const t=fixture();t.back();
  if(mode==='bad-signature')t.signInFailure=Error('auth/invalid-credential');
  if(mode==='wrong-identity')t.identity.email='someone@example.test';
  if(mode==='unenrolled')t.membership=null;
  if(mode==='revoked')t.membership.active=false;
  if(mode==='invalid-role')t.membership.role='administrator';
  if(mode==='storage-full')t.storageFailure=true;
  assert.equal((await t.g.Auth.resolve()).state,'error');check(mode+' never writes admitted local session',()=>{assert.equal(t.mem['sortie:auth'],undefined);t.preserved();});
 }
 const old=fixture();old.session();old.identity=null;assert.equal((await old.g.Auth.resolve()).state,'needed');check('forged or legacy local JSON is insufficient without Firebase identity',()=>old.preserved());
 const restored=fixture();restored.session();assert.equal((await restored.g.Auth.resolve()).state,'ok');check('restored verified SDK session checks live enrollment',()=>assert.deepEqual(restored.calls,['access']));
 restored.g.navigator.onLine=false;restored.calls.length=0;restored.mem['sortie:auth']=JSON.stringify({email:'cadet@example.test',exp:1});
 const offline=await restored.g.Auth.resolve();check('previously verified account opens offline even after old local expiry',()=>{assert.equal(offline.state,'ok');assert.equal(offline.offline,true);assert.equal(restored.calls.length,0);restored.preserved();});
 const firstOffline=fixture();firstOffline.session();firstOffline.g.navigator.onLine=false;assert.equal((await firstOffline.g.Auth.resolve()).state,'needed');check('offline device requires prior enrollment verification',()=>firstOffline.preserved());
 restored.g.navigator.onLine=true;restored.failure={code:'unavailable'};assert.equal((await restored.g.Auth.resolve()).state,'ok');check('transient outage preserves previously verified local access',()=>restored.preserved());
 restored.failure={code:'permission-denied'};assert.equal((await restored.g.Auth.resolve()).state,'denied');check('explicit server denial never falls back to offline receipt',()=>{assert.equal(restored.mem['sortie:verified-access'],undefined);restored.preserved();});
 restored.g.navigator.onLine=false;assert.equal((await restored.g.Auth.resolve()).state,'needed');check('revoked receipt cannot reopen offline',()=>restored.preserved());
 const wrong=fixture();wrong.session();wrong.mem['sortie:verified-access']=JSON.stringify({uid:'other',email:'cadet@example.test',at:Date.now()});wrong.g.navigator.onLine=false;assert.equal((await wrong.g.Auth.resolve()).state,'needed');check('offline receipt bound to exact UID',()=>wrong.preserved());
 const storage=fixture();storage.storageFailure=true;check('unwritable nonce stops navigation',()=>assert.throws(()=>storage.g.Auth.authUrl()));
 const random=fixture();random.g.crypto={};check('secure randomness cannot fall back to Math.random',()=>assert.throws(()=>random.g.Auth.authUrl()));
 console.log(checks+' cloud authentication checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
