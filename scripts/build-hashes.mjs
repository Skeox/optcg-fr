// Télécharge les images officielles de chaque variante (cache dans .cache/images) et calcule
// des empreintes perceptuelles (dHash 16x16 sur la carte entière + sur la zone d'illustration).
// Résultat : public/data/hashes.json, utilisé par le scanner pour reconnaître une carte.
// Le filigrane « SAMPLE » des images officielles est retiré avant le calcul (les vraies cartes
// n'en portent pas) grâce à scripts/sample-alpha.png, produit par build-sample-alpha.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { vision } from './lib/vision.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const CACHE = path.join(ROOT, '.cache', 'images');
const CONCURRENCY = 8;
const N = 16; // dHash N x N bits
const VERSION = 2; // 2 : filigrane retiré, réduction par moyenne de blocs (src/lib/vision.ts)
const W = 600, H = 838;

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

// Filigrane : calque blanc d'opacité a (carte sample-alpha.png = a x 255), I = a*255 + (1-a)*C.
const ALPHA = await sharp(path.join(ROOT, 'scripts', 'sample-alpha.png')).extractChannel(0).raw().toBuffer();
let alphaMax = 0;
for (const v of ALPHA) if (v > alphaMax) alphaMax = v;
const CORE = [];
for (let i = 0; i < W * H; i++) if (ALPHA[i] >= alphaMax - 2) CORE.push(i);

/** Retire le filigrane, sauf sur les rares cartes qui n'en portent pas (pixels plus sombres que le calque). */
function removeWatermark(px) {
  let darker = 0;
  for (const i of CORE) if (Math.min(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]) < ALPHA[i] - 25) darker++;
  if (darker > CORE.length * 0.02) return false;
  for (let i = 0; i < W * H; i++) {
    const v = ALPHA[i];
    if (!v) continue;
    const k = 1 - v / 255;
    for (let c = 0; c < 3; c++) px[i * 4 + c] = Math.max(0, Math.min(255, Math.round((px[i * 4 + c] - v) / k)));
  }
  return true;
}

// Zone d'illustration (proportions de la carte 600x838) : on ignore la bordure et la zone de texte.
export const ART_REGION = { left: 0.06, top: 0.08, width: 0.88, height: 0.50 };

let unmarked = 0;
async function hashesFor(file) {
  const px = await sharp(file).resize(W, H, { fit: 'fill' }).removeAlpha().ensureAlpha().raw().toBuffer();
  if (!removeWatermark(px)) unmarked++;
  const art = { x: Math.round(W * ART_REGION.left), y: Math.round(H * ART_REGION.top), w: Math.round(W * ART_REGION.width), h: Math.round(H * ART_REGION.height) };
  return { full: vision.dhashOf(px, W, H, 4, { x: 0, y: 0, w: W, h: H }, N), art: vision.dhashOf(px, W, H, 4, art, N) };
}

const prevFile = path.join(DATA, 'hashes.json');
const prev = fs.existsSync(prevFile) ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : { entries: {} };
const entries = {};
let done = 0, failed = 0;
const queue = [...catalogue.cards];
async function worker() {
  while (queue.length) {
    const card = queue.shift();
    if (prev.entries[card.id] && prev.size === N && prev.version === VERSION) { entries[card.id] = prev.entries[card.id]; done++; continue; }
    const file = await download(card);
    if (!file) { failed++; continue; }
    try { entries[card.id] = await hashesFor(file); } catch (e) { console.warn('hash', card.id, e.message); failed++; }
    done++;
    if (done % 200 === 0) console.log(`${done}/${catalogue.cards.length}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
fs.writeFileSync(prevFile, JSON.stringify({ generatedAt: new Date().toISOString(), version: VERSION, size: N, art: ART_REGION, entries }));
console.log(`hashes.json : ${Object.keys(entries).length} empreintes (${failed} échecs, ${unmarked} cartes sans filigrane)`);
