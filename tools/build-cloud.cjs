// The app stays static: commit this pinned, self-hosted SDK bundle with releases.
const path = require('path');
require('esbuild').buildSync({
  entryPoints: [path.join(__dirname, 'firebase-adapter.mjs')],
  outfile: path.join(__dirname, '../js/firebase-adapter.js'),
  bundle: true, minify: true, format: 'iife', target: ['safari16', 'chrome110'],
  legalComments: 'eof', charset: 'utf8'
});
