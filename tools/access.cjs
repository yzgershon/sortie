// Private, local roster maintenance. Default is a preview; never commits/pushes.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..');
function parse(source){const g={};vm.runInNewContext(source,{window:g});return g.AUTH_CONFIG;}
function plan(source,roster,{action,email,name,course}){
 email=String(email||'').trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Provide a valid Google-account email.');
 const hash=crypto.createHash('sha256').update(email).digest('hex'),config=parse(source);
 if(!['add','remove'].includes(action))throw Error('Use --add or --remove.');
 const courses={};vm.runInNewContext(fs.readFileSync(path.join(root,'js/courses.js'),'utf8'),{window:courses});
 if(action==='add'&&(!courses.Courses.get(course)||!String(name||'').trim()))throw Error('Adding needs --course and --name (first name only).');
 const allow=new Set(config.allow),mapping={...config.courses};
 if(action==='add'){allow.add(hash);mapping[hash]=course;}else{allow.delete(hash);delete mapping[hash];}
 const nextRoster=roster.filter(r=>r.hash!==hash);
 if(action==='add')nextRoster.push({email,hash,label:String(name).trim().split(/\s+/)[0],course});
 const safeNames=new Map(nextRoster.map(r=>[r.hash,String(r.label||'').trim().split(/\s+/)[0].replace(/[^\p{L}\p{N}]/gu,'')]));
 const list=Array.from(allow),note=h=>safeNames.get(h)?' // '+safeNames.get(h):'';
 const next=source.replace(/(allow:\s*\[)[\s\S]*?(\n\s*\],)/,(_,a,z)=>a+'\n'+list.map(h=>"      '"+h+"',"+note(h)).join('\n')+z)
 .replace(/(courses:\s*\{)[\s\S]*?(\n\s*\},)/,(_,a,z)=>a+'\n'+list.map(h=>"      '"+h+"': '"+mapping[h]+"',"+note(h)).join('\n')+z);
 const verified=parse(next);
 if(verified.allow.length!==list.length||new Set(verified.allow).size!==list.length||list.some(h=>verified.courses[h]!==mapping[h]))throw Error('Config validation failed. No files written.');
 if(next.includes(email))throw Error('Refusing to write a plain email into public config.');
 return{source:next,roster:nextRoster,hash,count:list.length,action};
}
if(require.main===module){
 try{
  const args=process.argv.slice(2),at=k=>args[args.indexOf(k)+1],action=args.includes('--add')?'add':args.includes('--remove')?'remove':null;
  if(!action){console.log('Preview: node tools/access.cjs --add EMAIL --name FIRST_NAME --course rishoni|mitkadem\nRemoval: node tools/access.cjs --remove EMAIL\nAdd --apply only after reviewing. This never commits or deploys.');process.exit(0);}
  const configFile=path.join(root,'js/auth-config.js'),rosterFile=path.join(root,'dev/roster.json');
  if(!fs.existsSync(rosterFile))throw Error('The private dev/roster.json is required.');
  const original=fs.readFileSync(configFile,'utf8'),roster=JSON.parse(fs.readFileSync(rosterFile,'utf8'));
  const result=plan(original,roster,{action,email:at('--'+action),name:args.includes('--name')?at('--name'):'',course:args.includes('--course')?at('--course'):''});
  console.log(JSON.stringify({action,hash:result.hash,allowedAccounts:result.count,applied:args.includes('--apply')},null,2));
  if(args.includes('--apply')){
   const backups=path.join(root,'dev/access-backups');fs.mkdirSync(backups,{recursive:true});fs.writeFileSync(path.join(backups,Date.now()+'.json'),JSON.stringify({source:original,roster},null,2));
   fs.writeFileSync(rosterFile,JSON.stringify(result.roster,null,2)+'\n');fs.writeFileSync(configFile,result.source.replace(/\r\n/g,'\n'));
   console.log('Local files updated. Review git diff. No version bump or push was performed.');
  }
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={plan};
