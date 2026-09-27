/* Trusted operator tool. Preview by default; --apply writes enrollment only.
 * Input must be private/untracked. Uses Application Default Credentials; no key
 * or roster is generated in the public app. Does not delete or rewrite flights. */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const args=process.argv.slice(2),arg=k=>args[args.indexOf(k)+1];
if(!args.includes('--project')||!args.includes('--roster'))throw Error('Usage: node tools/provision-cloud.cjs --project ID --roster dev/cloud-roster.json [--apply]');
const project=arg('--project'),file=path.resolve(arg('--roster'));
if(!/^[a-z][a-z0-9-]{5,61}$/.test(project))throw Error('Invalid project ID');
const root=path.resolve(__dirname,'..'),privateRoot=path.join(root,'dev')+path.sep;
if(!file.startsWith(privateRoot))throw Error('Roster must be inside ignored dev/');
const roster=JSON.parse(fs.readFileSync(file,'utf8'));
function email(v){const s=String(v||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw Error('Invalid roster email');return s;}
const instructor=email(roster.instructor.email),seen=new Set([instructor]);
if(!roster.instructor.name||!Array.isArray(roster.cadets))throw Error('Missing instructor name/cadets array');
const rows=roster.cadets.map(r=>{
 const e=email(r.email);if(seen.has(e))throw Error('Duplicate roster account');seen.add(e);
 if(!r.name||!['rishoni','mitkadem'].includes(r.course))throw Error('Each cadet needs a name and a valid course');
 return {...r,email:e};
});
console.log(JSON.stringify({project,instructors:1,cadets:rows.length,apply:args.includes('--apply'),flightsChanged:false},null,2));
if(!args.includes('--apply')){console.log('Preview only. No cloud calls made.');process.exit(0);}
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('This operator tool is for explicit real-project provisioning, not mixed emulator state');
const {initializeApp,applicationDefault}=require('firebase-admin/app'),{getAuth}=require('firebase-admin/auth'),{getFirestore}=require('firebase-admin/firestore');
initializeApp({credential:applicationDefault(),projectId:project});
const auth=getAuth(),db=getFirestore();
async function account(address,name){
 try{return await auth.getUserByEmail(address);}catch(e){if(e.code!=='auth/user-not-found')throw e;}
 return auth.createUser({uid:'sortie-'+crypto.createHash('sha256').update(address).digest('hex').slice(0,40),email:address,displayName:name,emailVerified:false});
}
(async()=>{
 const teacher=await account(instructor,roster.instructor.name);
 await db.doc('access/'+teacher.uid).set({role:'instructor',active:true});
 for(const row of rows){
  const cadet=await account(row.email,row.name);
  // Refuse to silently reassign an existing enrollment.
  const ref=db.doc('cadets/'+cadet.uid),prior=await ref.get();
  if(prior.exists&&prior.data().instructorId!==teacher.uid)throw Error('Existing instructor assignment differs; review before changing it');
  await ref.set({name:row.name,email:row.email,course:row.course,instructorId:teacher.uid}, {merge:true});
  await db.doc('access/'+cadet.uid).set({role:'cadet',active:true});
 }
 console.log('Enrollment ready. No training records were uploaded, changed or deleted.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
