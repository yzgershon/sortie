// Explicitly synthetic, read-only instructor preview. Only binds loopback.
// No Firebase connection, credentials, real cadets or production writes.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),port=+(process.argv[2]||8984);
const mock=`
window.FirebaseAdapter=function(){
 const name='תצוגת הדגמה', uid='example-cadet';
 const records=[
 {id:'example-1',flownAt:'2026-09-20',stage:'done',course:'rishoni',answers:{q_subject:'AW 3',q_minutes:60,q_instructor:'מדריך לדוגמה',q_goals:[{id:'g1',text:'ניסוח יעד ברור לפני הטיסה',status:'met'}],q_points:[{id:'p1',text:'רשומה לדוגמה להמחשת תצוגת המדריך בלבד.'}]}},
 {id:'example-2',flownAt:'2026-09-21',stage:'done',course:'rishoni',answers:{q_subject:'AW 4',q_minutes:45,q_goals:[{id:'g2',text:'תיעוד מסודר של הנקודות לתחקיר',status:'missed'}]}},
 {id:'example-3',flownAt:'2026-09-27',stage:'brief',course:'rishoni',answers:{q_subject:'AW 5',q_goals:[{id:'g3',text:'תיעוד מסודר של הנקודות לתחקיר',status:'open'}]}}
 ];
 function rows(){return records.map((r,i)=>({id:'example-'+i,payload:JSON.stringify(CloudCore.project({...r,createdAt:i+1,updatedAt:i+1},Store.questions(true))),receivedAt:new Date('2026-09-27T12:00:00Z')}));}
 return {onUser:fn=>{Auth.rawSession=()=>({email:'instructor@example.test'});fn({uid:'example-instructor',email:'instructor@example.test',verified:true});},
 access:async()=>({active:true,role:'instructor'}),roster:async()=>[{id:uid,name:name,course:'rishoni',lastSyncAt:new Date('2026-09-27T12:00:00Z')}],
 flights:async()=>rows(),revisions:async()=>rows().slice(0,1),put:async()=>{throw Error('READ_ONLY_PREVIEW');},complete:async()=>{},signOut:async()=>{},signIn:async()=>{throw Error('NO_REAL_SIGNIN');}};
};`;
http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 res.setHeader('Cache-Control','no-store');
 if(p==='/sw.js'||/^\/(?:dev|tests|tools|\.|node_modules)/.test(p)){res.writeHead(404);res.end();return;}
 const configs={
  '/js/auth-config.js':'window.AUTH_CONFIG={clientId:"",allow:[],courses:{}};',
  '/js/feedback-config.js':'window.FEEDBACK_CONFIG={endpoint:""};',
  '/js/cloud-config.js':'window.CLOUD_CONFIG={enabled:true,firebase:{projectId:"demo-sortie",apiKey:"fake"}};',
  '/js/firebase-adapter.js':mock
 };
 if(configs[p]){res.setHeader('Content-Type','text/javascript;charset=utf-8');res.end(configs[p]);return;}
 const file=path.resolve(root,'.'+(p==='/'?'/index.html':p));
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{
  if(err){res.writeHead(404);res.end();return;}
  if(p==='/'||p==='/index.html') data=Buffer.from(data.toString().replace('<script src="js/app.js"></script>',
   '<script>Store.coursePicked=function(){return true;};</script><script src="js/app.js"></script><div style="position:fixed;bottom:0;inset-inline:0;padding:8px;text-align:center;background:#122038;color:#fff;z-index:300;font-size:13px" dir="rtl">נתוני הדגמה בלבד. לא מחובר למערכת הצוערים.</div>'));
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webmanifest':'application/manifest+json'})[path.extname(file)]+';charset=utf-8');res.end(data);
 });
}).listen(port,'127.0.0.1',()=>console.log('Synthetic instructor preview: http://127.0.0.1:'+port+'/#/instructor'));
