const vm=require('vm'),fs=require('fs'),assert=require('assert/strict'),crypto=require('crypto');
let checks=0;
const check=(s,fn)=>{fn();console.log('PASS '+s);checks++;};
function fixture(){
 const mem={},calls=[];
 const g={location:{origin:'https://example.test',pathname:'/sortie/index.html',search:'',hash:''},
  history:{replaceState:()=>{g.location.hash='#/cloud';}},navigator:{onLine:true},crypto:crypto.webcrypto,TextEncoder,Uint8Array,
  atob:s=>Buffer.from(s,'base64').toString('binary'),console,
  AUTH_CONFIG:{clientId:'old-client',redirectUri:'https://example.test/sortie/index.html',allow:['cadet@example.test']},
  CLOUD_CONFIG:{enabled:true,googleClientId:'new-client'},
  Cloud:{enabled:()=>true,acceptGoogle:async token=>calls.push(token),signOut:async()=>calls.push('signout')},
  localStorage:{getItem:k=>mem[k]||null,setItem:(k,v)=>mem[k]=v,removeItem:k=>delete mem[k]}
 };g.window=g;vm.createContext(g);vm.runInContext(fs.readFileSync('js/auth.js','utf8'),g);
 function token(extra={}){return ['header',Buffer.from(JSON.stringify({aud:'new-client',iss:'https://accounts.google.com',exp:Date.now()/1000+3600,email:'Cadet@Example.test',email_verified:true,nonce:'nonce',...extra})).toString('base64url'),'signature'].join('.');}
 function back(extra={},pending=true){g.location.hash='#id_token='+token(extra);if(pending)mem['sortie:auth-pending']=JSON.stringify({nonce:'nonce',route:'#/cloud'});}
 return {g,mem,calls,back};
}
(async()=>{
 const f=fixture();const url=f.g.Auth.authUrl();
 check('cloud deployment uses its configured OAuth client',()=>assert.ok(url.includes('client_id=new-client')));
 check('existing production redirect remains pinned',()=>assert.ok(url.includes(encodeURIComponent('https://example.test/sortie/index.html'))));
 f.back();const state=await f.g.Auth.resolve();
 check('Google return restores local session and verifies cloud credential',()=>{assert.equal(state.state,'ok');assert.equal(state.email,'cadet@example.test');assert.equal(f.calls.length,1);});
 check('Google token is not stored in localStorage',()=>assert.ok(!JSON.stringify(f.mem).includes('signature')));
 check('Google token is removed from the fragment',()=>assert.equal(f.g.location.hash,'#/cloud'));
 await f.g.Auth.signOut();check('sign-out includes Firebase session',()=>assert.equal(f.calls.at(-1),'signout'));
 const noNonce=fixture();noNonce.back({},false);assert.equal((await noNonce.g.Auth.resolve()).state,'error');check('unrequested redirect cannot link cloud history',()=>assert.equal(noNonce.calls.length,0));
 const wrong=fixture();wrong.back({aud:'old-client'});assert.equal((await wrong.g.Auth.resolve()).state,'error');check('wrong OAuth audience never reaches cloud bridge',()=>assert.equal(wrong.calls.length,0));
 const denied=fixture();denied.back({email:'stranger@example.test'});assert.equal((await denied.g.Auth.resolve()).state,'denied');check('unlisted account never reaches cloud bridge',()=>assert.equal(denied.calls.length,0));
 console.log(checks+' cloud authentication checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
