// No real accounts, live origins, feedback deliveries or private roster required.
const cp=require('child_process'),path=require('path');const root=path.resolve(__dirname,'..');
const suites=['test-store','test-syllabus','verify-syllabus','verify-mitkadem','preservation','storage-faults','worker','access','cloud','cloud-auth'];
if(!process.argv.includes('--unit'))suites.push('upgrade','browser','update-browser','feedback-release','settings-release','usability','mobile-notebook','frontend','summary','cloud-browser');
let failed=0;
for(const [file,args] of [['tools/build-release.cjs',['--check']],...suites.map(s=>['tests/'+s+'.cjs',[]])]){
 const result=cp.spawnSync(process.execPath,[file,...args],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000});
 const output=(result.stdout||'')+(result.stderr||'');
 console.log('\n'+file+': '+(result.status===0?'PASS':'FAIL'));
 console.log(output.trim().split('\n').slice(result.status===0?-2:0).join('\n'));
 if(result.status!==0){failed++;if(result.error)console.error(result.error.message);}
}
if(failed)process.exitCode=1;else console.log('\nAll selected suites passed. Production was not touched.');
