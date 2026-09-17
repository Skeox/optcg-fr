// Génère des miniatures locales (public/images/cards/<id>.webp) à partir des images officielles
// mises en cache par build-hashes.mjs. Nécessaire car le site officiel interdit l'affichage
// direct de ses images depuis un autre domaine (Cross-Origin-Resource-Policy: same-site).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'images');
const OUT = path.join(ROOT, 'public', 'images', 'cards');
const WIDTH = 320;
const QUALITY = 62;

const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data', 'cards.json'), 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

let done = 0, skipped = 0, missing = 0, bytes = 0;
const queue = [...catalogue.cards];
async function worker() {
  while (queue.length) {
    const card = queue.shift();
    const src = path.join(CACHE, `${card.id}.webp`);
    const dst = path.join(OUT, `${card.id}.webp`);
    if (!fs.existsSync(src)) { missing++; continue; }
    if (fs.existsSync(dst)) { skipped++; bytes += fs.statSync(dst).size; continue; }
    await sharp(src).resize({ width: WIDTH }).webp({ quality: QUALITY }).toFile(dst);
    bytes += fs.statSync(dst).size;
    done++;
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`miniatures : ${done} générées, ${skipped} déjà présentes, ${missing} sources manquantes (lancer data:hashes), ${(bytes / 1024 / 1024).toFixed(1)} Mo au total`);
