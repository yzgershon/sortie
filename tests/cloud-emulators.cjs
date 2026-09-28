const cp=require('child_process');
for(const file of ['cloud-rules','cloud-adapter','cloud-adapter-browser']){
 const r=cp.spawnSync(process.execPath,['tests/'+file+'.cjs'],{stdio:'inherit',windowsHide:true,timeout:80000});
 if(r.status!==0){if(r.error)console.error(r.error.message);process.exit(1);}
}
