// Real browser SDK persistence and offline restoration; loopback emulators only.
const fs=require('fs'),path=require('path'),assert=require('node:assert/strict'),esbuild=require('esbuild');
const {browser,root}=require('./support.cjs');
if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8188'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9198')throw Error('Run via npm run test:rules');
let b,admin,mode='legacy',checks=0;
const config={projectId:'demo-sortie',apiKey:'demo-key',appId:'demo-app',authDomain:'demo-sortie.firebaseapp.com'};
function pass(s,v=true){assert.ok(v,s);checks++;console.log('PASS '+s);}
function bundle(legacy){
 let source=fs.readFileSync(path.join(root,'tools/firebase-adapter.mjs'),'utf8');
 if(legacy)source=source.replace('initializeAuth, indexedDBLocalPersistence,','getAuth, initializeAuth, indexedDBLocalPersistence,').replace('initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] })','getAuth(app)');
 source="import {connectAuthEmulator} from 'firebase/auth';import {connectFirestoreEmulator} from 'firebase/firestore';\n"+source;
 source=source.replace('const db = getFirestore(app);',"const db = getFirestore(app);connectAuthEmulator(auth,'http://127.0.0.1:9198',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8188);");
 return esbuild.buildSync({stdin:{contents:source,resolveDir:root,loader:'js'},bundle:true,write:false,format:'iife',target:['safari16','chrome110']}).outputFiles[0].text;
}
(async()=>{
 const {initializeApp}=require('firebase-admin/app'),{getFirestore}=require('firebase-admin/firestore'),{getAuth}=require('firebase-admin/auth');
 admin=initializeApp({projectId:'demo-sortie'},'browser-operator');const db=getFirestore(admin),auth=getAuth(admin);
 await auth.createUser({uid:'sdk-browser',email:'sdk-browser@example.test',emailVerified:false});
 await db.doc('access/sdk-browser').set({role:'cadet',active:true});
 const bundles={legacy:bundle(true),current:bundle(false)};
 b=await browser({source:(file,data)=>file.endsWith('index.html')?data.toString().replace("connect-src 'self'","connect-src 'self' http://127.0.0.1:9198 http://127.0.0.1:8188"):data,
  respond:(req,res,p)=>{if(p==='/js/firebase-adapter.js'){res.setHeader('Content-Type','text/javascript');res.end(bundles[mode]);return true;}}});
 const user=await b.ev(`(async()=>{window.legacyAdapter=FirebaseAdapter(${JSON.stringify(config)});return legacyAdapter.signIn(JSON.stringify({sub:'google-browser',email:'sdk-browser@example.test',email_verified:true}));})()`);
 pass('browser legacy getAuth signs into the pre-provisioned Google account',user.uid==='sdk-browser'&&user.verified);
 await b.ev("window.previousSDK=true");mode='current';await b.send('Page.reload');
 await b.until("typeof previousSDK==='undefined'&&document.body.dataset.route==='home'");
 await b.ev(`window.CLOUD_CONFIG={enabled:true,firebase:${JSON.stringify(config)}}`);
 const restored=await b.ev("Cloud.verifySession('sdk-browser@example.test')");
 pass('new SDK initialization restores the existing IndexedDB identity',restored.uid==='sdk-browser'&&restored.verified);
 pass('server verification records a private offline receipt',await b.ev("JSON.parse(localStorage.getItem('sortie:verified-access')).uid==='sdk-browser'"));
 // Browser metadata emulation is not a real Android/iOS device acceptance test.
 await b.send('Network.setUserAgentOverride',{userAgent:'Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36'});
 await b.send('Network.setBlockedURLs',{urls:['http://127.0.0.1:9198/*','http://127.0.0.1:8188/*','https://*.googleapis.com/*','https://apis.google.com/*']});
 await b.ev('window.beforeOfflineRestore=true');await b.send('Page.reload');
 await b.until("typeof beforeOfflineRestore==='undefined'&&document.body.dataset.route==='home'");
 await b.ev(`window.CLOUD_CONFIG={enabled:true,firebase:${JSON.stringify(config)}};Object.defineProperty(navigator,'onLine',{value:false,configurable:true})`);
 const offline=await b.ev("Cloud.verifySession('sdk-browser@example.test')");
 pass('actual SDK restores verified offline access with network requests blocked',offline.offline&&offline.uid==='sdk-browser');
 pass('mobile initialization does not inject third-party scripts',await b.ev("!Array.from(document.scripts).some(s=>s.src.startsWith('https://'))"));
 await b.send('Network.setBlockedURLs',{urls:[]});await b.ev("Object.defineProperty(navigator,'onLine',{value:true,configurable:true})");
 await db.doc('access/sdk-browser').update({role:'instructor'});
 await db.doc('security/instructor').set({uid:'teacher'});
 pass('actual SDK rejects an instructor role not pinned to the owner',await b.ev("Cloud.verifySession('sdk-browser@example.test').then(()=>false,()=>true)"));
 pass('server denial invalidates offline access',await b.ev("!localStorage.getItem('sortie:verified-access')"));
 await b.ev('Cloud.signOut()');
 pass('no uncaught browser errors with the real SDK',b.errors.length===0);
 console.log(checks+' real browser SDK security checks passed');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{b?.close();if(admin)await require('firebase-admin/app').deleteApp(admin);});
