// Mesure le filigrane « SAMPLE » des images officielles FR et écrit scripts/sample-alpha.png
// (valeur du pixel = opacité x 255). Le filigrane est un calque blanc semi-transparent, identique
// sur (presque) toutes les cartes :  I = a*255 + (1-a)*C.
//  1. forme des lettres : minimum par pixel sur l'ensemble des cartes (C → 0 donne a*255) ;
//  2. opacité : de part et d'autre du bord d'une lettre le dessin est presque le même, donc
//     a ≈ (I_dedans - C_dehors) / (255 - C_dehors) ; on prend la médiane sur beaucoup de cartes.
// build-hashes.mjs s'en sert pour retirer le filigrane avant de calculer les empreintes :
// les vraies cartes photographiées n'en portent pas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'images');
const OUT = path.join(ROOT, 'scripts', 'sample-alpha.png');
const W = 600, H = 838;
const K = 12; // on retient la K-ième plus petite valeur : minimum robuste aux quelques cartes atypiques

const files = fs.readdirSync(CACHE).filter((f) => f.endsWith('.webp'));
if (files.length < 500) { console.error(`Trop peu d'images dans ${CACHE} (${files.length}) : lancez d'abord npm run data:hashes.`); process.exit(1); }

const low = new Uint8Array(W * H * K).fill(255);
for (const f of files) {
  const { data } = await sharp(path.join(CACHE, f)).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < W * H; i++) {
    const v = Math.min(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]), o = i * K;
    if (v >= low[o + K - 1]) continue;
    let j = K - 1;
    while (j > 0 && low[o + j - 1] > v) { low[o + j] = low[o + j - 1]; j--; }
    low[o + j] = v;
  }
}

// Le cœur des lettres a une opacité uniforme : on prend la valeur la plus fréquente, et on
// plafonne chaque pixel à cette valeur (le minimum par pixel ne peut que surestimer).
const hist = new Uint32Array(256);
for (let i = 0; i < W * H; i++) { const v = low[i * K + K - 1]; if (v > 100) hist[v]++; }
let mode = 0;
for (let v = 0; v < 256; v++) if (hist[v] > hist[mode]) mode = v;

const shape = new Float32Array(W * H);
let count = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, v = low[i * K + K - 1];
  // Hors de la bande centrale, un minimum élevé vient du gabarit de la carte, pas du filigrane.
  if (v < 60 || y < H * 0.35 || y > H * 0.65) continue;
  shape[i] = Math.min(1, v / mode); count++;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}

// Paires (pixel hors lettre, pixel dans la lettre) à cheval sur les bords verticaux des lettres.
function edgePairs(shapeOf) {
  const pairs = [];
  for (let y = 355; y < 482; y += 2) for (let x = 60; x < 540; x++) {
    const i = y * W + x;
    if (shapeOf(i) === 0 && shapeOf(i - 3) === 0 && shapeOf(i + 10) >= 0.98 && shapeOf(i + 13) >= 0.98) pairs.push([i - 2, i + 12]);
    if (shapeOf(i) >= 0.98 && shapeOf(i - 3) >= 0.98 && shapeOf(i + 10) === 0 && shapeOf(i + 13) === 0) pairs.push([i + 12, i - 2]);
  }
  return pairs;
}
/** Opacité du filigrane sur une carte (gris 600x838) ; proche de 0 si la carte n'en porte pas. */
function alphaOfCard(gray, pairs) {
  const est = [];
  for (const [o, n] of pairs) { const C = gray[o]; if (C < 200) est.push((gray[n] - C) / (255 - C)); }
  est.sort((a, b) => a - b);
  return est.length ? est[est.length >> 1] : 0;
}

const pairs = edgePairs((i) => shape[i]);
const alphas = [];
for (const f of files.filter((_, i) => i % 5 === 0)) {
  const gray = await sharp(path.join(CACHE, f)).resize(W, H, { fit: 'fill' }).greyscale().raw().toBuffer();
  alphas.push(alphaOfCard(gray, pairs));
}
alphas.sort((a, b) => a - b);
const alpha = alphas[alphas.length >> 1];

const map = Buffer.alloc(W * H);
for (let i = 0; i < W * H; i++) map[i] = Math.round(shape[i] * alpha * 255);
await sharp(map, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 9 }).toFile(OUT);
console.log(`sample-alpha.png : ${files.length} cartes, opacité ${alpha.toFixed(3)}, ${count} pixels (${(100 * count / (W * H)).toFixed(1)} %), x ${x0}-${x1}, y ${y0}-${y1}`);
