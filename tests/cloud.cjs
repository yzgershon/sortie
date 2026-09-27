const assert = require('node:assert/strict'), vm = require('vm'), fs = require('fs'), crypto = require('crypto');
const {store} = require('./support.cjs');
const g = {window: {}}; vm.runInNewContext(fs.readFileSync('js/cloud-core.js','utf8'), g);
const Core = g.window.CloudCore;
let count = 0; const check = (name, fn) => { fn(); console.log('PASS '+name); count++; };
const hash = async s => crypto.createHash('sha256').update(s).digest('hex');
function fixture(shared) {
  const mem = shared || {}, remote = new Map(), revisions = new Map();
  let rows=[], calls=0, online=true, fail=false, quota=false, complete=0;
  const adapter = {
    async put(uid,item,base) {
      calls++; if(fail) throw Error('unavailable');
      const key=uid+'/'+item.id, old=remote.get(key); revisions.set(key+'/'+item.digest,item.payload);
      if(old && old.digest!==item.digest && old.digest!==base) return {conflict:true};
      remote.set(key,item); return {conflict:false};
    }, async complete(){ complete++; }
  };
  const opts={storage:{getItem:k=>mem[k]||null,setItem:(k,v)=>{if(quota)throw Error('QUOTA');mem[k]=v;}},snapshot:()=>structuredClone(rows),hash,adapter,online:()=>online};
  const engine=Core.create(opts);
  const who={uid:'cadet-a',email:'a@example.test'};
  return {engine,who,mem,remote,revisions,opts,setRows:r=>rows=r,setOnline:v=>online=v,setFail:v=>fail=v,setQuota:v=>quota=v,get calls(){return calls;},get complete(){return complete;}};
}
const questions=[{id:'subject',role:'subject',type:'text',label:'נושא'},{id:'goals',role:'goals',type:'goals',label:'יעדים'},{id:'custom',type:'textarea',label:'שאלה אישית',archived:true}];
const row=(id='f1',at=1)=>({record:{id,flownAt:'2026-09-27',stage:'brief',course:null,createdAt:1,updatedAt:at,answers:{subject:'AW 3',custom:'נשמר',goals:[{id:'g1',text:'דיוק',cats:['AW'],status:'open'}]},draftBuffers:{secret:'do not send'},baseUpdatedAt:1},questions,deletedAt:null});
(async()=>{
 const f=fixture(); f.setRows([row()]);
 await f.engine.sync(); check('no identity sends nothing',()=>assert.equal(f.calls,0));
 f.engine.identity(f.who);await f.engine.sync();check('history requires ownership link',()=>assert.equal(f.engine.status().phase,'unlinked'));
 f.setOnline(false);await f.engine.link();check('link offline retains pending history',()=>{assert.equal(f.calls,0);assert.equal(f.engine.status().pending,1);});
 f.setOnline(true);await f.engine.sync();check('first upload preserves null course, answer shapes and archived questions',()=>{
  const p=JSON.parse(f.remote.get('cadet-a/f1').payload);assert.equal(p.record.course,null);assert.equal(p.record.answers.custom,'נשמר');assert.equal(p.questions.find(q=>q.id==='custom').archived,true);assert.equal(p.record.answers.goals[0].cats[0],'AW');
 });
 check('projection excludes form buffers and arbitrary metadata',()=>{const p=JSON.parse(f.remote.get('cadet-a/f1').payload);assert.equal(p.record.draftBuffers,undefined);assert.equal(p.record.baseUpdatedAt,undefined);});
 const firstCalls=f.calls;await f.engine.sync();check('acknowledged content not resent',()=>assert.equal(f.calls,firstCalls));
 const e=Core.create(f.opts);e.identity(f.who);await e.sync();check('restart resumes acknowledgments',()=>assert.equal(f.calls,firstCalls));
 f.setRows([row('f1',2)]);f.setFail(true);await f.engine.sync();check('network failure remains pending',()=>{assert.equal(f.engine.status().phase,'error');assert.equal(f.engine.status().pending,1);});
 f.setFail(false);await f.engine.sync();check('retry uploads saved edit',()=>assert.equal(JSON.parse(f.remote.get('cadet-a/f1').payload).record.updatedAt,2));
 f.setRows([row('f1',3)]);f.setQuota(true);await f.engine.sync();check('ack write failure never reports success',()=>assert.equal(f.engine.status().phase,'error'));
 f.setQuota(false);await f.engine.sync();check('retry after cloud success/local ack failure is idempotent',()=>assert.equal(f.engine.status().phase,'synced'));
 f.engine.identity({uid:'cadet-b',email:'b@example.test'});let calls=f.calls;await f.engine.sync();check('account switching cannot upload old history',()=>{assert.equal(f.engine.status().phase,'account-mismatch');assert.equal(f.calls,calls);assert.throws(()=>f.engine.link(),/ACCOUNT_MISMATCH/);});
 f.engine.identity(f.who);f.setRows([row('f1',4)]);f.remote.set('cadet-a/f1',{digest:'another-device'});await f.engine.sync();check('concurrent cloud version is not overwritten',()=>{assert.equal(f.engine.status().phase,'conflict');assert.equal(f.remote.get('cadet-a/f1').digest,'another-device');});
 check('conflicting revision is retained separately',()=>assert.equal(f.revisions.size,4));
 calls=f.calls;await f.engine.sync();check('conflict does not cause endless retry traffic',()=>assert.equal(f.calls,calls));
 const d=fixture();d.engine.identity(d.who);d.setRows([row()]);await d.engine.link();d.setRows([{...row(),deletedAt:10}]);await d.engine.sync();check('deletion is a recoverable revision, not document deletion',()=>{assert.equal(JSON.parse(d.remote.get('cadet-a/f1').payload).deletedAt,10);assert.equal(d.revisions.size,2);});
 d.setRows([row('f1',11)]);await d.engine.sync();check('undo deletion updates the same flight',()=>assert.equal(JSON.parse(d.remote.get('cadet-a/f1').payload).deletedAt,null));
 const trash=fixture();trash.setRows([{...row(),deletedAt:10}]);trash.engine.identity(trash.who);await trash.engine.link();check('old trash is excluded from first migration',()=>assert.equal(trash.calls,0));
 const damaged=fixture({'sortie:cloud-binding':'broken'});damaged.engine.identity(damaged.who);await damaged.engine.sync();check('damaged journal fails closed without resetting it',()=>{assert.equal(damaged.engine.status().phase,'error');assert.equal(damaged.mem['sortie:cloud-binding'],'broken');});
 check('canonical payload is stable across object key order',()=>assert.equal(Core.canonical({z:1,a:2}),Core.canonical({a:2,z:1})));
 const {S,W,mem}=store();await S.init(); const oldKeys=Object.keys(mem); const rec=await S.save({flownAt:'2026-09-27',stage:'brief',answers:{q_subject:'AW 3'}});
 S.saveDraft({...rec,answers:{q_subject:'PRIVATE DRAFT'}},'brief');W.addNote?.({text:'PRIVATE NOTE'});
 const source=S.trainingSnapshot();check('Store source reads saved version instead of draft',()=>assert.equal(source[0].record.answers.q_subject,'AW 3'));
 const before=JSON.stringify(mem);Core.project(source[0].record,source[0].questions);check('projection does not mutate local data',()=>assert.equal(JSON.stringify(mem),before));
 await S.remove(rec.id);check('deletion snapshot excludes its preserved drafts',()=>{const p=Core.project(S.trainingSnapshot()[0].record,S.trainingSnapshot()[0].questions,S.trainingSnapshot()[0].deletedAt);assert.ok(p.deletedAt);assert.ok(!JSON.stringify(p).includes('PRIVATE DRAFT'));});
 await S.restore(rec);check('local undo wins over tombstone',()=>assert.equal(S.trainingSnapshot()[0].deletedAt,null));
 console.log(count+' cloud preservation checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
