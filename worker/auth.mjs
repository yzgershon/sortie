import { Buffer } from 'node:buffer';
export const PROJECT = 'sortie-7900c';
// Fresh Google tokens can be a few seconds ahead of the verifier's clock.
// Bound that tolerance; expiry, revocation and remote verification stay strict.
const CLOCK_SKEW_SECONDS = 60;
const fail = (code='SIGN_IN', status=401) => Object.assign(Error(code), {code,status});
// Google validates the complete token through accounts:lookup before any claim
// is trusted. Firestore independently verifies it and applies existing rules.
export function claims(token, now=Math.floor(Date.now()/1000)) {
  if(typeof token!=='string'||token.length>10000)throw fail();
  const parts=token.split('.');
  if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw fail();
  let h,c;
  try { h=JSON.parse(Buffer.from(parts[0],'base64url').toString()); c=JSON.parse(Buffer.from(parts[1],'base64url').toString()); } catch {throw fail();}
  if(h.alg!=='RS256'||typeof h.kid!=='string'||!h.kid||h.kid.length>200||h.crit||h.jku||h.jwk||h.x5u)throw fail();
  if(c.aud!==PROJECT||c.iss!=='https://securetoken.google.com/'+PROJECT||typeof c.sub!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(c.sub))throw fail();
  if(!Number.isSafeInteger(c.exp)||c.exp<=now||!Number.isSafeInteger(c.iat)||c.iat>now+CLOCK_SKEW_SECONDS||!Number.isSafeInteger(c.auth_time)||c.auth_time>now+CLOCK_SKEW_SECONDS||c.auth_time<0||c.iat>c.exp)throw fail();
  if(c.email_verified!==true||c.firebase?.sign_in_provider!=='google.com'||c.firebase?.tenant)throw fail();
  return {...c,uid:c.sub};
}
async function json(response,limit=100000) {
  if(!response.ok)throw fail(response.status===403?'FORBIDDEN':'SIGN_IN',response.status===403?403:401);
  const reader=response.body.getReader(); let body='',size=0;const decoder=new TextDecoder();
  for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.byteLength)>limit){await reader.cancel();throw fail();}body+=decoder.decode(p.value,{stream:true});}
  try{return JSON.parse(body+decoder.decode());}catch{throw fail();}
}
export async function verify(token,apiKey,fetchImpl=fetch,now=Math.floor(Date.now()/1000)) {
  const c=claims(token,now);
  if(typeof apiKey!=='string'||!apiKey)throw fail('UNAVAILABLE',503);
  const data=await json(await fetchImpl('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(apiKey),{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(10000),redirect:'manual'
  }));
  if(!Array.isArray(data.users)||data.users.length!==1)throw fail();
  const u=data.users[0],since=Number(u.validSince);
  if(u.localId!==c.uid||u.emailVerified!==true||u.disabled===true||(u.disabled!=null&&typeof u.disabled!=='boolean')||typeof u.validSince!=='string'||!/^\d+$/.test(u.validSince)||!Number.isSafeInteger(since)||c.auth_time<since)throw fail();
  if(!Array.isArray(u.providerUserInfo)||!u.providerUserInfo.some(p=>p.providerId==='google.com'))throw fail();
  return c;
}
export async function document(token,path,fetchImpl=fetch) {
  if(!/^access\/[A-Za-z0-9_-]{1,128}$/.test(path)&&path!=='security/instructor')throw fail('FORBIDDEN',403);
  const name='projects/'+PROJECT+'/databases/(default)/documents/'+path;
  const response=await fetchImpl('https://firestore.googleapis.com/v1/'+name,{
    headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000),redirect:'manual'
  });
  if(response.status===404)throw fail('FORBIDDEN',403);
  const d=await json(response);
  if(d.name!==name||!d.fields)throw fail('FORBIDDEN',403);
  const value={};
  for(const [k,v] of Object.entries(d.fields)){
    if(Object.hasOwn(v,'booleanValue'))value[k]=v.booleanValue;
    else if(Object.hasOwn(v,'stringValue'))value[k]=v.stringValue;
    else if(Object.hasOwn(v,'integerValue'))value[k]=Number(v.integerValue);
    else if(Object.hasOwn(v,'doubleValue'))value[k]=v.doubleValue;
    else value[k]=null;
  }
  return value;
}
