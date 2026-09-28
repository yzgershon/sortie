// Pin dashboard access to the private roster owner. Read-only unless --apply.
// No credentials, emails or training records are written to the public repo.
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2),value=k=>args[args.indexOf(k)+1];
if(!args.includes('--project')||!args.includes('--roster'))throw Error('Use --project ID --roster dev/cloud-roster.json [--apply]');
const project=value('--project'),root=path.resolve(__dirname,'..'),file=path.resolve(value('--roster'));
if(!/^[a-z][a-z0-9-]{5,61}$/.test(project)||!file.startsWith(path.join(root,'dev')+path.sep))throw Error('Invalid project or non-private roster');
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Do not mix production and emulator credentials');
const email=JSON.parse(fs.readFileSync(file,'utf8')).instructor.email.trim().toLowerCase();
const {initializeApp,applicationDefault}=require('firebase-admin/app');
initializeApp({credential:applicationDefault(),projectId:project});
const db=require('firebase-admin/firestore').getFirestore(),auth=require('firebase-admin/auth').getAuth();
(async()=>{
 const owner=await auth.getUserByEmail(email);
 if(owner.disabled||!owner.emailVerified)throw Error('Owner must already have verified Google sign-in');
 const ref=db.doc('security/instructor');
 await db.runTransaction(async tx=>{
  const members=await tx.get(db.collection('access'));
  const instructors=members.docs.filter(d=>d.data().role==='instructor'&&d.data().active===true);
  if(instructors.length!==1||instructors[0].id!==owner.uid)throw Error('Exactly one active instructor must match the private roster owner');
  const prior=await tx.get(ref);
  if(prior.exists&&prior.data().uid!==owner.uid)throw Error('Existing owner pin differs; refusing reassignment');
  if(args.includes('--apply')&&!prior.exists)tx.create(ref,{uid:owner.uid});
 });
 console.log(JSON.stringify({project,soleInstructorMatchesOwner:true,ownerPin:args.includes('--apply')?'installed':'dry-run',trainingRecordsChanged:false}));
})().catch(e=>{console.error(e.message);process.exitCode=1});
