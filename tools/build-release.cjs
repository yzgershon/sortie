// Deterministic manifest of deployable files; no local/private inputs.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name));
const build=read('js/app.js').toString().match(/var BUILD = '([^']+)'/)[1];
const version=read('sw.js').toString().match(/var VERSION = '([^']+)'/)[1];
if(version!=='sortie-'+build)throw Error('BUILD and VERSION must match');
const html=read('index.html').toString();
const globals={};for(const file of ['js/strings.js','js/courses.js','js/auth-config.js'])vm.runInNewContext(read(file).toString(),{window:globals});
const config=globals.AUTH_CONFIG;
if(new Set(config.allow).size!==config.allow.length||config.allow.some(h=>!/^[a-f0-9]{64}$/.test(h)||!globals.Courses.get(config.courses[h])))throw Error('Invalid allowlist or course assignment.');
for(const file of ['js/app.js','js/features.js','js/summary.js'])for(const match of read(file).toString().matchAll(/\bT\.([A-Za-z]\w*)/g))if(!(match[1] in globals.T))throw Error('Missing Hebrew string: '+match[1]);
const names=['index.html','manifest.webmanifest','assets/cockpit.jpg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
names.push('assets/sortie-horizon.jpg','assets/sortie-journal.jpg','assets/sortie-terrain.jpg');
for(const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+)(?:\?[^\"]*)?"/g))names.push(match[1]);
const files={};for(const name of [...new Set(names)].sort()){if(name.endsWith('.js'))new vm.Script(read(name).toString(),{filename:name});files['./'+name]=crypto.createHash('sha256').update(read(name)).digest('hex');}
const expected=JSON.stringify({version,files},null,2)+'\n';
if(process.argv.includes('--check')){if(read('release-manifest.json').toString()!==expected)throw Error('Release manifest is stale. Run node tools/build-release.cjs.');}
else fs.writeFileSync(path.join(root,'release-manifest.json'),expected);
process.stdout.write('Verified release manifest: '+version+', '+Object.keys(files).length+' files\n');
