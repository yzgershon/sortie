// Requires the loopback emulator. Never points at a real Firebase project.
const fs=require('fs'), assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,getDocs,collection,query,where,updateDoc,deleteDoc,writeBatch,serverTimestamp}=require('firebase/firestore');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8188')throw Error('Use npm run test:rules; local emulator only');
let env,n=0;
async function test(name,p){await p; console.log('PASS '+name);n++;}
(async()=>{
 env=await initializeTestEnvironment({projectId:'demo-sortie',firestore:{host:'127.0.0.1',port:8188,rules:fs.readFileSync('firestore.rules','utf8')}});
 await env.withSecurityRulesDisabled(async c=>{
  const db=c.firestore();
  await setDoc(doc(db,'security','instructor'),{uid:'teacher'});
  for(const [uid,role,active] of [['a','cadet',true],['b','cadet',true],['teacher','instructor',true],['other','instructor',true],['removed','cadet',false]]) {
   await setDoc(doc(db,'access',uid),{role,active});
   if(role==='cadet')await setDoc(doc(db,'cadets',uid),{instructorId:uid==='b'?'other':'teacher',name:uid,course:'rishoni',lastSyncAt:null});
  }
 });
 const db=(uid,extra={})=>env.authenticatedContext(uid,{email:uid+'@example.test',email_verified:true,auth_time:1000,firebase:{sign_in_provider:'google.com'},...extra}).firestore();
 const a=db('a'),b=db('b'),teacher=db('teacher'),other=db('other'),stranger=db('stranger'),removed=db('removed');
 const anon=env.unauthenticatedContext().firestore(), digest='a'.repeat(64), payload=JSON.stringify({schema:1,record:{id:'f1'}});
 const value=()=>({payload,digest,receivedAt:serverTimestamp()});
 const path=['cadets','a','flights','f1'];
 function write(db){const batch=writeBatch(db);batch.set(doc(db,...path,'revisions',digest),value());batch.set(doc(db,...path),value());return batch.commit();}
 await test('owner atomically writes saved record and immutable revision',assertSucceeds(write(a)));
 await test('owner reads own record',assertSucceeds(getDoc(doc(a,...path))));
 await test('assigned instructor reads record',assertSucceeds(getDoc(doc(teacher,...path))));
 await test('cadet cannot read another cadet',assertFails(getDoc(doc(b,...path))));
 await test('unassigned instructor cannot read record',assertFails(getDoc(doc(other,...path))));
 await test('second instructor denied even for a cadet assigned to that account',assertFails(getDoc(doc(other,'cadets','b','flights','any'))));
 await test('second instructor cannot list its assigned roster',assertFails(getDocs(query(collection(other,'cadets'),where('instructorId','==','other')))));
 await test('cadet cannot replace the instructor pin',assertFails(setDoc(doc(a,'security','instructor'),{uid:'a'})));
 await test('instructor cannot replace the pin through client SDK',assertFails(setDoc(doc(teacher,'security','instructor'),{uid:'other'})));
 await test('pin readable only to pinned instructor',assertSucceeds(getDoc(doc(teacher,'security','instructor'))));
 await test('pin hidden from another instructor',assertFails(getDoc(doc(other,'security','instructor'))));
 await test('anonymous cannot read',assertFails(getDoc(doc(anon,...path))));
 await test('authenticated but unenrolled cannot read',assertFails(getDoc(doc(stranger,...path))));
 await test('revoked enrollment cannot read own records',assertFails(getDoc(doc(removed,'cadets','removed','flights','f1'))));
 await test('unverified email rejected',assertFails(getDoc(doc(db('a',{email_verified:false}),...path))));
 await test('non Google provider rejected',assertFails(getDoc(doc(db('a',{firebase:{sign_in_provider:'password'}}),...path))));
 await test('cadet cannot self promote',assertFails(updateDoc(doc(a,'access','a'),{role:'instructor'})));
 await test('instructor cannot edit membership from app',assertFails(setDoc(doc(teacher,'access','x'),{role:'instructor',active:true})));
 await test('cadet cannot reassign instructor',assertFails(updateDoc(doc(a,'cadets','a'),{instructorId:'other'})));
 await test('instructor cannot change cadet flight',assertFails(updateDoc(doc(teacher,...path),{payload:'changed'})));
 await test('record cannot be permanently deleted by cadet',assertFails(deleteDoc(doc(a,...path))));
 await test('revision cannot be changed',assertFails(setDoc(doc(a,...path,'revisions',digest),value())));
 await test('revision cannot be deleted',assertFails(deleteDoc(doc(a,...path,'revisions',digest))));
 await test('record must have matching retained revision',assertFails(setDoc(doc(a,...path),{...value(),digest:'b'.repeat(64)})));
 await test('extra fields rejected',assertFails(setDoc(doc(a,...path),{...value(),instructorId:'other'})));
 await test('client timestamp rejected',assertFails(setDoc(doc(a,...path),{...value(),receivedAt:new Date(0)})));
 await test('own successful sync timestamp allowed',assertSucceeds(updateDoc(doc(a,'cadets','a'),{lastSyncAt:serverTimestamp()})));
 await test('cannot mark another cadet synced',assertFails(updateDoc(doc(b,'cadets','a'),{lastSyncAt:serverTimestamp()})));
 await test('instructor query scoped to assigned roster',assertSucceeds(getDocs(query(collection(teacher,'cadets'),where('instructorId','==','teacher')))));
 await test('unscoped roster query rejected',assertFails(getDocs(collection(teacher,'cadets'))));
 await test('cadet roster enumeration rejected',assertFails(getDocs(collection(a,'cadets'))));
 await test('notebook path not permitted',assertFails(setDoc(doc(a,'cadets','a','notes','private'),{text:'private'})));
 await test('draft path not permitted',assertFails(setDoc(doc(a,'cadets','a','drafts','private'),{text:'private'})));
 await test('access roster enumeration rejected',assertFails(getDocs(collection(teacher,'access'))));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'access','a'),{authNotBefore:1000}));
 await test('revoked sign-in cannot read old records',assertFails(getDoc(doc(a,...path))));
 await test('revoked sign-in cannot read enrollment to refresh offline receipt',assertFails(getDoc(doc(a,'access','a'))));
 await test('new sign-in after cutoff can read saved records',assertSucceeds(getDoc(doc(db('a',{auth_time:1001}),...path))));
 await env.withSecurityRulesDisabled(c=>updateDoc(doc(c.firestore(),'access','a'),{authNotBefore:999}));
 assert.equal((await getDoc(doc(a,...path))).data().payload,payload);
 console.log(n+' Firestore authorization checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(env)await env.cleanup();});
