/**
 * Build the phone-friendly, single-file demo page:
 *
 *   npm run mvp:build-web   → mvp/dist/aiec-work-manager.html
 *
 * One self-contained HTML file (engine + SQLite/WASM + UI inlined). It can
 * be opened from any static host or published as a private claude.ai
 * artifact. See web/main.ts for what runs inside it.
 */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'aiec-work-manager.html');

const result = await build({
  entryPoints: [path.join(root, 'web', 'main.ts')],
  bundle: true, write: false, format: 'esm', target: 'es2020', platform: 'browser',
  jsx: 'automatic', minify: true, legalComments: 'none', logLevel: 'error',
  loader: { '.wasm': 'binary' },
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{
    // sql.js probes for Node's fs/path/crypto; in the browser they are unused.
    name: 'node-builtins-empty',
    setup(b) {
      b.onResolve({ filter: /^(fs|path|crypto)$/ }, a => ({ path: a.path, namespace: 'empty' }));
      b.onLoad({ filter: /.*/, namespace: 'empty' }, () => ({ contents: 'export default {}' }));
    },
  }],
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

const html = fs.readFileSync(path.join(root, 'client', 'index.html'), 'utf8');
const style = /<style>[\s\S]*?<\/style>/.exec(html)![0];
const page = `<title>AIEC Work Manager</title>
${style}
<div id="root"><p style="padding:16px;color:var(--muted)">Starting AIEC Work Manager…</p></div>
<script type="module">${js}</script>
`;
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Wrote ${path.relative(process.cwd(), out)} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
