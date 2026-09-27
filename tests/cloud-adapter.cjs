// Actual Firebase adapter and SDK against local Auth + Firestore emulators.
const assert=require('node:assert/strict'),crypto=require('crypto');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8188'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('Local Auth and Firestore emulators required');
let app,adminApp,adapter,checks=0;function pass(s){checks++;console.log('PASS '+s);}
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
(async()=>{
 global.window={};await import('../tools/firebase-adapter.mjs');
 adapter=window.FirebaseAdapter({projectId:'demo-sortie',apiKey:'demo-key',appId:'demo-app'});
 const {getApp,deleteApp}=await import('firebase/app');app=getApp('sortie-training');
 const {getAuth,connectAuthEmulator}=await import('firebase/auth');
 const {getFirestore,connectFirestoreEmulator,terminate}=await import('firebase/firestore');
 connectAuthEmulator(getAuth(app),'http://127.0.0.1:9198',{disableWarnings:true});
 connectFirestoreEmulator(getFirestore(app),'127.0.0.1',8188);
 const {initializeApp}=require('firebase-admin/app'),{getFirestore:adminDB}=require('firebase-admin/firestore'),{getAuth:adminAuth}=require('firebase-admin/auth');
 adminApp=initializeApp({projectId:'demo-sortie'},'sortie-test-operator');const db=adminDB(adminApp),auth=adminAuth(adminApp);
 // Match production provisioning: trusted roster pre-creates an unverified account.
 await auth.createUser({uid:'provisioned-cadet',email:'cadet-adapter@example.test',emailVerified:false});
 const user=await adapter.signIn(JSON.stringify({sub:'google-cadet',email:'cadet-adapter@example.test',email_verified:true}));
 assert.equal(user.uid,'provisioned-cadet');assert.equal(user.verified,true);pass('Google credential links to the pre-provisioned cadet UID');
 await db.doc('access/'+user.uid).set({active:true,role:'cadet'});
 await db.doc('cadets/'+user.uid).set({instructorId:'teacher-adapter',name:'Synthetic cadet',course:'rishoni'});
 assert.equal((await adapter.access(user.uid)).role,'cadet');pass('adapter loads server enrollment');
 const payload=JSON.stringify({schema:1,record:{id:'legacy/id עברית',stage:'brief',answers:{subject:'AW 3'}}});
 const one={id:'legacy/id עברית',payload,digest:digest(payload)};
 assert.equal((await adapter.put(user.uid,one,null)).conflict,false);pass('first upload commits current record and retained revision');
 assert.equal((await adapter.put(user.uid,one,null)).conflict,false);pass('interrupted acknowledgment retries idempotently');
 const payload2=payload.replace('brief','done'),two={...one,payload:payload2,digest:digest(payload2)};
 assert.equal((await adapter.put(user.uid,two,one.digest)).conflict,false);pass('saved edit advances current version');
 const payload3=payload.replace('AW 3','AW 4'),three={...one,payload:payload3,digest:digest(payload3)};
 assert.equal((await adapter.put(user.uid,three,one.digest)).conflict,true);pass('stale device cannot overwrite the newer cloud version');
 const items=await adapter.flights(user.uid);assert.equal(items.length,1);assert.equal(items[0].digest,two.digest);
 assert.equal((await adapter.revisions(user.uid,items[0].id)).length,3);pass('both sides of conflict remain available in version history');
 await adapter.complete(user.uid);assert.ok((await db.doc('cadets/'+user.uid).get()).data().lastSyncAt);pass('completion timestamp comes from Firestore');
 await assert.rejects(()=>adapter.put('someone-else',one,null),/ACCOUNT_MISMATCH/);pass('adapter refuses an in-flight account mismatch');
 await db.doc('access/'+user.uid).update({active:false});await assert.rejects(()=>adapter.flights(user.uid));pass('server revocation applies to existing authenticated sessions');
 await adapter.signOut();assert.equal(getAuth(app).currentUser,null);pass('sign-out clears Firebase session');
 await terminate(getFirestore(app));await deleteApp(app);app=null;
 console.log(checks+' real SDK adapter checks passed (local emulators only)');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(app){const {terminate,getFirestore}=await import('firebase/firestore');await terminate(getFirestore(app));const {deleteApp}=await import('firebase/app');await deleteApp(app);}
 if(adminApp)await require('firebase-admin/app').deleteApp(adminApp);
});
