// Télécharge les images officielles de chaque variante (cache dans .cache/images) et calcule
// des empreintes perceptuelles (dHash 16x16 sur la carte entière + sur la zone d'illustration).
// Résultat : public/data/hashes.json, utilisé par le scanner pour reconnaître une carte.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const CACHE = path.join(ROOT, '.cache', 'images');
const CONCURRENCY = 8;
const N = 16; // dHash N x N bits

const catalogue = JSON.parse(fs.readFileSync(path.join(DATA, 'cards.json'), 'utf8'));
fs.mkdirSync(CACHE, { recursive: true });

async function download(card) {
  const file = path.join(CACHE, `${card.id}.webp`);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const url = catalogue.imageBase + card.image;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (optcg-fr collection tracker)' } });
      if (!res.ok) throw new Error(`${res.status}`);
      fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return file;
    } catch (e) {
      if (attempt === 2) { console.warn('échec', card.id, e.message); return null; }
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

// dHash : niveaux de gris, redimensionné en (N+1) x N, bit = pixel[x] > pixel[x+1]
async function dhash(input) {
  const { data } = await input.greyscale().resize(N + 1, N, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const bits = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) bits.push(data[y * (N + 1) + x] > data[y * (N + 1) + x + 1] ? 1 : 0);
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += (bits[i] * 8 + bits[i + 1] * 4 + bits[i + 2] * 2 + bits[i + 3]).toString(16);
  return hex;
}

// Zone d'illustration (proportions de la carte 600x838) : on ignore la bordure et la zone de texte.
export const ART_REGION = { left: 0.06, top: 0.08, width: 0.88, height: 0.50 };

async function hashesFor(file) {
  const img = sharp(file);
  const meta = await img.metadata();
  const w = meta.width, h = meta.height;
  const full = await dhash(sharp(file));
  const art = await dhash(sharp(file).extract({
    left: Math.round(w * ART_REGION.left), top: Math.round(h * ART_REGION.top),
    width: Math.round(w * ART_REGION.width), height: Math.round(h * ART_REGION.height),
  }));
  return { full, art };
}

const prevFile = path.join(DATA, 'hashes.json');
const prev = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : { entries: {} };
const entries = {};
let done = 0, failed = 0;
const queue = [...catalogue.cards];
async function worker() {
  while (queue.length) {
    const card = queue.shift();
    if (prev.entries[card.id] && prev.size === N) { entries[card.id] = prev.entries[card.id]; done++; continue; }
    const file = await download(card);
    if (!file) { failed++; continue; }
    try { entries[card.id] = await hashesFor(file); } catch (e) { console.warn('hash', card.id, e.message); failed++; }
    done++;
    if (done % 200 === 0) console.log(`${done}/${catalogue.cards.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(prevFile, JSON.stringify({ generatedAt: new Date().toISOString(), size: N, art: ART_REGION, entries }));
console.log(`hashes.json : ${Object.keys(entries).length} empreintes (${failed} échecs)`);
