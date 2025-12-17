#!/usr/bin/env node
// Genera 0-assets/manifest.js a partire dai file immagine nella cartella 0-assets
// Uso:
//   node scripts/generate-manifest.mjs           # genera una volta
//   node scripts/generate-manifest.mjs --watch   # rigenera su modifiche

import { promises as fs } from 'fs';
import { watch } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'wp-content');
const outFile = path.join(assetsDir, 'manifest.js');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function toNameFromFile(fileBaseNoExt) {
  // Supporta entrambe le convenzioni dei nomi file:
  // 1) "Titolo|tag1-tag2" (già corretto)
  // 2) "|Titolo|resto" -> converti in "Titolo|resto"
  const m = fileBaseNoExt.match(/^\|([^|]+)\|(.+)$/);
  if (m) {
    const [, title, rest] = m;
    return `${title}|${rest}`;
  }
  return fileBaseNoExt;
}

async function walk(dir, base) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(base, abs);
    if (ent.isDirectory()) {
      const nested = await walk(abs, base);
      out.push(...nested);
    } else if (ent.isFile()) {
      if (IMAGE_EXTS.has(path.extname(ent.name).toLowerCase())) {
        out.push(rel.replace(/\\/g, '/'));
      }
    }
  }
  return out;
}

async function generateOnce() {
  const files = await walk(assetsDir, assetsDir);
  const manifest = files.map((file) => {
    const baseNoExt = path.basename(file).replace(/\.[^.]+$/, '');
    return { file, name: toNameFromFile(baseNoExt) };
  });

  const js = `// File generato automaticamente. NON modificare a mano.\n` +
    `window.ASSETS_MANIFEST = ${JSON.stringify(manifest, null, 2)};\n`;
  await fs.writeFile(outFile, js, 'utf8');
  console.log(`Manifest aggiornato: ${path.relative(projectRoot, outFile)} (${manifest.length} elementi)`);
}

async function main() {
  const watchMode = process.argv.includes('--watch');
  await generateOnce();
  if (!watchMode) return;
  console.log('Watch attivo su wp-content (rename/change)...');
  const debounced = debounce(async () => {
    try { await generateOnce(); } catch (e) { console.error(e); }
  }, 200);
  // Su macOS il watch ricorsivo è supportato; intercetta rename/change
  try {
    watch(assetsDir, { persistent: true, recursive: true }, () => debounced());
  } catch (e) {
    console.warn('Recursive watch non disponibile, fallback non-ricorsivo.');
    watch(assetsDir, { persistent: true }, () => debounced());
  }
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

main().catch((e) => { console.error(e); process.exit(1); });



