// Bundles the CodeMirror 6 editor chunk for dsh-hanmo / magpie-sidebar.
// Usage: node build.mjs <id> <output-file>
// The chunk is a classic script in the host's __ModuleLoader__ chunk format,
// so the plugin loads it lazily with require.async('./client.editor.js').
import { build } from 'esbuild';

const [, , id, out] = process.argv;
if (!id || !out) throw new Error('usage: node build.mjs <module-id> <out-file>');

const result = await build({
  entryPoints: ['editor.mjs'],
  bundle: true,
  format: 'iife',
  globalName: '__dshEditorChunk',
  minify: true,
  target: ['chrome110', 'firefox115', 'safari16'],
  legalComments: 'none',
  write: false,
  loader: { '.css': 'text' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, chunk: "client.editor.js", factory: (require) => {`,
  },
  footer: {
    js: `return __dshEditorChunk;
  }
});`,
  },
});

const body = result.outputFiles[0].text;
const { writeFile, readFile } = await import('node:fs/promises');
const { createHash } = await import('node:crypto');
const { dirname, join } = await import('node:path');
await writeFile(out, body, 'utf8');
console.log(`${out}: ${(body.length / 1024).toFixed(0)} KiB`);

// DSH serves a package-local chunk under the *client.js* revision, and both the
// server and the browser cache it as immutable. A chunk-only rebuild would keep
// the old revision and the page would keep running the stale chunk, so stamp
// the chunk hash into the sibling client.js to force a new revision.
const hash = createHash('sha256').update(body).digest('hex').slice(0, 12);
const clientJs = join(dirname(out), 'client.js');
try {
  const src = await readFile(clientJs, 'utf8');
  const re = /const EDITOR_BUILD = '[^']*';/;
  if (re.test(src)) {
    const next = src.replace(re, `const EDITOR_BUILD = '${hash}';`);
    if (next !== src) await writeFile(clientJs, next, 'utf8');
    console.log(`${clientJs}: EDITOR_BUILD = ${hash}`);
  } else {
    console.warn(`${clientJs}: no EDITOR_BUILD marker; chunk cache will not be busted`);
  }
} catch (e) {
  console.warn(`skip EDITOR_BUILD stamp: ${e.message}`);
}
