// Durable local preview for the sidebar: no production auth, cloud, feedback or AI calls.
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const out = path.resolve(root, '../artifacts/sortie-notebook-preview');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
fs.mkdirSync(out, { recursive: true });
for (const name of Object.keys(manifest.files)) {
  const relative = name.replace(/^\.\//, '');
  const source = path.resolve(root, relative), dest = path.resolve(out, relative);
  if (!source.startsWith(root + path.sep) || !dest.startsWith(out + path.sep)) throw Error('Invalid preview path');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  let data = fs.readFileSync(source);
  if (relative === 'index.html') data = Buffer.from(data.toString().replace('<title>תחקיר</title>', '<title>Sortie · local notebook preview</title>'));
  if (relative === 'js/app.js') data = Buffer.from(data.toString()
    .replace(/var BUILD = '([^']+)'/, "var BUILD = '$1-notebook-preview'")
    .replace("if ('serviceWorker' in navigator && location.protocol !== 'file:')", 'if (false)'));
  if (relative === 'js/auth-config.js') data = Buffer.from('window.AUTH_CONFIG={clientId:"",allow:[],courses:{}};\n');
  if (relative === 'js/cloud-config.js') data = Buffer.from('window.CLOUD_CONFIG={enabled:false};\n');
  if (relative === 'js/feedback-config.js') data = Buffer.from('window.FEEDBACK_CONFIG={endpoint:""};\n');
  if (relative === 'js/notebook-import-config.js') data = Buffer.from('window.NOTEBOOK_IMPORT_CONFIG={endpoint:""};\n');
  fs.writeFileSync(dest, data);
}
console.log(out);
