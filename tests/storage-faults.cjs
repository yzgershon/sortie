const assert=require('assert/strict'),{store}=require('./support.cjs');
function indexedDB(mode){return{open(){const request={};setTimeout(()=>request.onsuccess({target:request}),0);request.result={transaction(name,type){
 const tx={objectStore(){return{getAll(){const r={result:[]};setTimeout(()=>r.onsuccess(),0);return r;},put(){if(mode==='abort')setTimeout(()=>tx.onabort(),0);}};},abort(){tx.onabort&&tx.onabort();}};
 return tx;
 }};return request;}};}
(async()=>{
 const aborted=store({}, {indexedDB:indexedDB('abort')});await aborted.S.init();await aborted.S.save({id:'mirror-only',answers:{q_subject:'saved despite abort'}});assert.equal(JSON.parse(aborted.mem['sortie:mirror'])[0].id,'mirror-only');console.log('PASS aborted IndexedDB write succeeds only with durable mirror');
 const options={indexedDB:indexedDB('stall'),failWrites:false},stalled=store({},options);await stalled.S.init();options.failWrites=true;const started=Date.now();await assert.rejects(stalled.S.save({id:'not-saved',answers:{q_subject:'keep visible'}}));assert.ok(Date.now()-started<7000);assert.equal(stalled.S.count(),0);console.log('PASS stalled IndexedDB plus failed mirror rejects within the write deadline');
 const raw=store({'sortie:mirror':'damaged'}, {failWrites:true});await assert.rejects(raw.S.init());assert.equal(raw.mem['sortie:mirror'],'damaged');console.log('PASS failed quarantine does not overwrite damaged source');
 console.log('3 storage-fault checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
