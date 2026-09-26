// Local-only preview. Production authentication/configuration is never edited.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),port=+(process.argv[2]||8980);
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
 if(req.method!=='GET'){res.writeHead(405);res.end();return;}
 const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);
 if(pathname==='/sw.js'||/^\/(?:dev|tests|tools|\.)/.test(pathname)){res.writeHead(404);res.end();return;}
 res.setHeader('Cache-Control','no-store');
 if(pathname==='/js/auth-config.js'){res.setHeader('Content-Type','text/javascript');res.end('window.AUTH_CONFIG={clientId:"",allow:[],courses:{}};');return;}
 const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!target.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',(mime[path.extname(target)]||'application/octet-stream')+';charset=utf-8');res.end(data);});
}).listen(port,'127.0.0.1',()=>console.log('Sortie local preview: http://127.0.0.1:'+port+'/'));
