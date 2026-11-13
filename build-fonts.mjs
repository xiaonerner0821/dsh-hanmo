// Embeds the Latin subsets of Inter and Geist Mono (variable, OFL) into client.js
// as data-URL @font-face rules, so the skin works offline and needs no font install.
// Chinese glyphs fall through to locally installed fonts (HarmonyOS Sans SC etc.).
// Usage: node build-fonts.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const CDN = 'https://unpkg.com';
const FAMILIES = [
  { family: 'Inter', pkg: '@fontsource-variable/inter@5.3.0', file: 'inter', local: ['Inter Variable', 'Inter'] },
  { family: 'Geist Mono', pkg: '@fontsource-variable/geist-mono@5.3.0', file: 'geist-mono', local: ['Geist Mono'] },
];
const SUBSETS = ['latin', 'latin-ext'];

async function get(url, kind) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return kind === 'text' ? res.text() : Buffer.from(await res.arrayBuffer());
}

const rules = [];
await mkdir(join(here, 'fonts'), { recursive: true });
for (const f of FAMILIES) {
  const css = await get(`${CDN}/${f.pkg}/wght.css`, 'text');
  for (const subset of SUBSETS) {
    const block = css.split('@font-face').find((b) => b.includes(`-${subset}-wght-normal.woff2`));
    const range = block?.match(/unicode-range:\s*([^;]+);/)?.[1];
    if (!range) throw new Error(`no unicode-range for ${f.family} ${subset}`);
    const name = `${f.file}-${subset}-wght-normal.woff2`;
    const bytes = await get(`${CDN}/${f.pkg}/files/${name}`);
    await writeFile(join(here, 'fonts', name), bytes);
    // A locally installed copy wins; the embedded subset is the fallback.
    const src = [...f.local.map((n) => `local("${n}")`), `url(data:font/woff2;base64,${bytes.toString('base64')}) format("woff2")`].join(',');
    rules.push(`@font-face{font-family:"${f.family}";font-style:normal;font-weight:100 900;font-display:swap;src:${src};unicode-range:${range};}`);
    console.log(`${f.family} ${subset}: ${(bytes.length / 1024).toFixed(1)} KB`);
  }
}

const target = join(here, 'client.js');
const source = await readFile(target, 'utf8');
const marker = /(\/\* @embedded-fonts:start \*\/)[\s\S]*?(\/\* @embedded-fonts:end \*\/)/;
if (!marker.test(source)) throw new Error('embedded-fonts markers not found in client.js');
const out = source.replace(marker, (_, a, b) => `${a}\n    const FONT_FACES = ${JSON.stringify(rules.join('\n'))};\n    ${b}`);
await writeFile(target, out, 'utf8');
console.log(`client.js updated (${(out.length / 1024).toFixed(0)} KB)`);
