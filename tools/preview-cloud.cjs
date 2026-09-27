// Explicit owner-only local preview connected to the real configured Firebase backend.
// No bypassed identity, seeded flights or service worker. Normal releases stay disabled.
const http=require('http'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
if(!process.argv.includes('--connect'))throw Error('Use --connect to acknowledge this preview connects to the real Firebase backend.');
const root=path.resolve(__dirname,'..'),port=8985,origin='http://localhost:'+port;
const roster=JSON.parse(fs.readFileSync(path.join(root,'dev/cloud-roster.json'),'utf8'));
const owner=crypto.createHash('sha256').update(roster.instructor.email.trim().toLowerCase()).digest('hex');
const context={window:{}};vm.createContext(context);
for(const name of ['auth-config','cloud-config'])vm.runInContext(fs.readFileSync(path.join(root,'js/'+name+'.js'),'utf8'),context);
const cloud={...context.window.CLOUD_CONFIG,enabled:true,googleClientId:'959375176248-j0qnr5gvd21uv0il5tc9un0u16tqvl4r.apps.googleusercontent.com'};
if(cloud.firebase.projectId!=='sortie-7900c')throw Error('Review the preview OAuth client before changing projects.');
const auth={...(context.AUTH_CONFIG||context.window.AUTH_CONFIG),allow:[owner],courses:{[owner]:'rishoni'},redirectUri:origin+'/index.html'};
const allowed=new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8')).files).map(p=>p.replace(/^\./,'')));
allowed.add('/js/auth-config.js');
const configs={'/js/auth-config.js':'window.AUTH_CONFIG='+JSON.stringify(auth)+';','/js/cloud-config.js':'window.CLOUD_CONFIG='+JSON.stringify(cloud)+';','/js/feedback-config.js':'window.FEEDBACK_CONFIG={endpoint:""};'};
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
http.createServer((req,res)=>{
 if(req.method!=='GET'||!['localhost:'+port,'127.0.0.1:'+port].includes(req.headers.host)){res.writeHead(403);res.end();return;}
 let p;try{p=decodeURIComponent(new URL(req.url,origin).pathname);}catch{res.writeHead(400);res.end();return;}
 if(p==='/')p='/index.html';
 if(!allowed.has(p)){res.writeHead(404);res.end();return;}
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',(mime[path.extname(p)]||'application/octet-stream')+';charset=utf-8');
 if(configs[p]){res.end(configs[p]);return;}
 const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404);res.end();return;}
  if(p==='/index.html')data=Buffer.from(data.toString().replace('<body>', '<body><aside dir="rtl" style="position:fixed;bottom:0;inset-inline:0;padding:6px;background:#122038;color:white;text-align:center;z-index:300;font-size:12px">Local instructor preview | Connected to Sortie Firebase | Cadet app unchanged</aside>'));
  res.end(data);
 });
}).listen(port,'127.0.0.1',()=>console.log('Real Firebase instructor preview (owner only): '+origin+'/index.html#/instructor'));
