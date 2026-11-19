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
const { writeFile } = await import('node:fs/promises');
await writeFile(out, body, 'utf8');
console.log(`${out}: ${(body.length / 1024).toFixed(0)} KiB`);
