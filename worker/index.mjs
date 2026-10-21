import core from './notebook.mjs';
import { verify, document } from './auth.mjs';
const origins=new Set(['https://yzgershon.github.io','https://sortie-7900c.web.app','https://sortie-7900c.firebaseapp.com']);
const fail=(code,status)=>Object.assign(Error(code),{code,status});
function reply(request,status,value,availability){
  const origin=request.headers.get('Origin'),headers={'Cache-Control':'no-store','Vary':'Origin','Content-Type':'application/json'};
  // Fixed operational labels only; never return exception messages or input.
  if(availability)headers['X-Sortie-Availability']=availability;
  if(origins.has(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Authorization, Content-Type'});
  return new Response(status===204?null:JSON.stringify(value),{status,headers});
}
function preflight(request){
  if(new URL(request.url).pathname!=='/readNotebook')return reply(request,404,{error:'NOT_FOUND'});
  if(!origins.has(request.headers.get('Origin')))return reply(request,403,{error:'FORBIDDEN'});
  if(request.method==='OPTIONS')return reply(request,204);
  if(request.method!=='POST')return reply(request,405,{error:'METHOD'});
  if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type')||''))return reply(request,400,{error:'INVALID_IMAGE'});
  if(!/^Bearer [A-Za-z0-9_.-]{20,10000}$/.test(request.headers.get('Authorization')||''))return reply(request,401,{error:'SIGN_IN'});
}
async function body(request){
  if(Number(request.headers.get('Content-Length'))>4500100)throw fail('INVALID_IMAGE',400);
  if(!request.body)throw fail('INVALID_IMAGE',400);
  const reader=request.body.getReader(),decoder=new TextDecoder();let text='',size=0,expired=false;
  const timeout=setTimeout(()=>{expired=true;reader.cancel().catch(()=>{});},15000);
  try{
    for(;;){const p=await reader.read();if(p.done)break;if((size+=p.value.byteLength)>4500100){await reader.cancel();throw fail('INVALID_IMAGE',400);}text+=decoder.decode(p.value,{stream:true});}
    if(expired)throw fail('INVALID_IMAGE',400);
    try{return JSON.parse(text+decoder.decode());}catch{throw fail('INVALID_IMAGE',400);}
  }finally{clearTimeout(timeout);}
}
export default {
  async fetch(request,env){
    const early=preflight(request);if(early)return early;
    if(env.NOTEBOOK_ENABLED!=='true'||!env.SORTIE_OPENAI_API_KEY)return reply(request,503,{error:'UNAVAILABLE'},env.NOTEBOOK_ENABLED!=='true'?'front-disabled':'front-key-missing');
    try{
      // The outer Free Worker does not parse/duplicate large image bodies. The
      // SQLite-backed object has adequate CPU and is itself on the Free plan.
      return await env.READER.get(env.READER.idFromName('notebook-limits-v1')).fetch(request);
    }catch{return reply(request,503,{error:'UNAVAILABLE'},'reader-unreachable');}
  }
};
export class NotebookReader {
  constructor(ctx,env){this.ctx=ctx;this.env=env;this.active=0;}
  async reserve(uid){
    return this.ctx.storage.transaction(async tx=>{
      const next=core.quota(await tx.get('u:'+uid),await tx.get('global'));
      await tx.put({['u:'+uid]:next.user,global:next.global});
      return {day:next.global.day,month:next.global.month};
    });
  }
  async settle(reservation,cost){
    await this.ctx.storage.transaction(async tx=>{
      const current=await tx.get('global');
      await tx.put('global',core.settle(current,reservation,cost));
    });
  }
  async fetch(request){
    const early=preflight(request);if(early)return early;
    if(this.env.NOTEBOOK_ENABLED!=='true'||!this.env.SORTIE_OPENAI_API_KEY)return reply(request,503,{error:'UNAVAILABLE'},this.env.NOTEBOOK_ENABLED!=='true'?'object-disabled':'object-key-missing');
    if(this.active>=2)return reply(request,429,{error:'TOO_MANY'});
    this.active++;
    try{
      const bearer=request.headers.get('Authorization').slice(7);
      const token=await verify(bearer,this.env.FIREBASE_API_KEY);
      const member=await document(bearer,'access/'+token.uid);
      const pin=member.role==='instructor'?(await document(bearer,'security/instructor')).uid:null;
      if(!core.authorized(token,member,pin))throw fail('FORBIDDEN',403);
      const image=core.validateImage(await body(request));
      const reservation=await this.reserve(token.uid);
      const result=await core.transcribe(image,{key:this.env.SORTIE_OPENAI_API_KEY,model:core.MODEL,onUsage:cost=>this.settle(reservation,cost)});
      return reply(request,200,result);
    }catch(error){
      if(error.name==='TimeoutError')error=fail('TIMEOUT',504);
      const safe=['SIGN_IN','FORBIDDEN','INVALID_IMAGE','INVALID_RESULT','TOO_MANY','BUDGET','TIMEOUT','UNAVAILABLE','FAILED'];
      return reply(request,safe.includes(error.code)?error.status||502:502,{error:safe.includes(error.code)?error.code:'FAILED'});
    }finally{this.active--;}
  }
}
