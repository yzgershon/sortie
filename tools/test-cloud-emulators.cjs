// Keep CLI state and downloaded emulators inside the workspace on Windows.
const cp=require('child_process'),path=require('path');
const root=path.resolve(__dirname,'..');
const env={...process.env,CI:'true',XDG_CONFIG_HOME:path.join(root,'dev','firebase-cli'),FIREBASE_EMULATORS_PATH:path.resolve(root,'../.firebase-emulators')};
const cli=require.resolve('firebase-tools/lib/bin/firebase.js');
// A single emulator session covers permissions and the actual SDK adapter.
const child=cp.spawn(process.execPath,[cli,'emulators:exec','--project','demo-sortie','--only','auth,firestore','--config','firebase.test.json','node tests/cloud-emulators.cjs'],{cwd:root,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let passed=false,stopped=false,cleanup,tail='';
function stop(){
 if(stopped)return;stopped=true;
 // Windows Java can ignore the CLI's graceful SIGINT. Kill only this runner's
 // own child tree, never a process discovered by name or a reused port.
 if(process.platform==='win32')cp.spawnSync('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
 else child.kill('SIGKILL');
}
const deadline=setTimeout(()=>{console.error('Emulator test deadline exceeded');stop();},180000);
function output(buf){
 process.stdout.write(buf);tail=(tail+buf.toString()).slice(-3000);
 if(tail.includes('Script exited successfully (code 0)'))passed=true;
 if(passed&&tail.includes('Stopping Logging Emulator')&&!cleanup)cleanup=setTimeout(stop,1500);
}
child.stdout.on('data',output);child.stderr.on('data',output);
child.on('error',err=>{console.error(err.message);clearTimeout(deadline);process.exitCode=1;});
child.on('close',code=>{clearTimeout(deadline);clearTimeout(cleanup);process.exitCode=passed&&(code===0||stopped)?0:1;});
