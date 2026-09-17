// Met à jour public/data/prices.json (et l'historique hebdomadaire public/data/history.json)
// à partir des fichiers publics de Cardmarket (jeu n°18 = One Piece Card Game) :
//   - catalogue produits : products_singles_18.json
//   - guide des prix (quotidien) : price_guide_18.json
// Seuls les produits dont le code apparaît dans le catalogue FR sont conservés.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const GAME = 18;
const PRODUCTS_URL = `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_${GAME}.json`;
const PRICES_URL = `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${GAME}.json`;
const HISTORY_DAYS = 7; // un point d'historique par semaine (côté serveur)
const HISTORY_KEEP = 104; // ~2 ans

const expansions = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'cm-expansions.json'), 'utf8'));
const catalogue = JSON.parse(fs.readFileSync(path.join(DATA, 'cards.json'), 'utf8'));
const codes = new Set(catalogue.cards.map((c) => c.code));

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'optcg-fr collection tracker' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

const [productsFile, pricesFile] = await Promise.all([getJson(PRODUCTS_URL), getJson(PRICES_URL)]);
const priceById = new Map(pricesFile.priceGuides.map((p) => [p.idProduct, p]));

const codeRe = /\(([A-Z]+-?\d*-\d{3})\)\s*$/;
const products = {};
const byCode = {};
let unknownExp = new Set();
for (const p of productsFile.products) {
  const m = p.name.match(codeRe);
  if (!m) continue;
  const code = m[1];
  if (!codes.has(code)) continue;
  const exp = expansions[p.idExpansion];
  if (!exp) unknownExp.add(p.idExpansion);
  const pr = priceById.get(p.idProduct) ?? {};
  const r = (x) => (x == null ? null : Math.round(x * 100) / 100);
  products[p.idProduct] = {
    id: p.idProduct,
    name: p.name.replace(codeRe, '').trim(),
    code,
    exp: p.idExpansion,
    expName: exp?.name ?? `Extension ${p.idExpansion}`,
    expSlug: exp?.slug ?? null,
    foreign: exp?.foreign ?? false,
    added: p.dateAdded?.slice(0, 10) ?? null,
    avg: r(pr.avg), low: r(pr.low), trend: r(pr.trend),
    avg1: r(pr.avg1), avg7: r(pr.avg7), avg30: r(pr.avg30),
  };
  (byCode[code] ??= []).push(p.idProduct);
}
// Numéro de version Cardmarket (V1, V2…) = ordre des idProduct au sein d'une même extension.
const perExp = {};
for (const id of Object.keys(products).map(Number).sort((a, b) => a - b)) {
  const p = products[id];
  const k = `${p.exp}|${p.code}`;
  perExp[k] = (perExp[k] ?? 0) + 1;
  p.version = perExp[k];
}
for (const code of Object.keys(byCode)) byCode[code].sort((a, b) => a - b);
if (unknownExp.size) console.warn('Extensions Cardmarket inconnues (ajouter dans scripts/cm-expansions.json) :', [...unknownExp]);

const updatedAt = pricesFile.createdAt ?? new Date().toISOString();
const out = { updatedAt, game: GAME, count: Object.keys(products).length, products, byCode };
fs.writeFileSync(path.join(DATA, 'prices.json'), JSON.stringify(out));
console.log(`prices.json : ${out.count} produits Cardmarket pour ${Object.keys(byCode).length} codes (guide du ${updatedAt})`);

// ---- Historique hebdomadaire (tendance + prix mini, en centimes) ----
const histFile = path.join(DATA, 'history.json');
let hist = fs.existsSync(histFile) ? JSON.parse(fs.readFileSync(histFile, 'utf8')) : { dates: [], trend: {}, low: {} };
const today = updatedAt.slice(0, 10);
const last = hist.dates[hist.dates.length - 1];
const daysSince = last ? (Date.parse(today) - Date.parse(last)) / 86400000 : Infinity;
if (daysSince >= HISTORY_DAYS) {
  hist.dates.push(today);
  const c = (x) => (x == null ? null : Math.round(x * 100));
  for (const p of Object.values(products)) {
    (hist.trend[p.id] ??= []).push(c(p.trend));
    (hist.low[p.id] ??= []).push(c(p.low));
  }
  // aligne les séries plus courtes (nouveaux produits) en préfixant des null
  const n = hist.dates.length;
  for (const k of ['trend', 'low']) for (const id of Object.keys(hist[k])) {
    const arr = hist[k][id];
    if (arr.length < n) hist[k][id] = Array(n - arr.length).fill(null).concat(arr);
  }
  if (n > HISTORY_KEEP) {
    hist.dates = hist.dates.slice(-HISTORY_KEEP);
    for (const k of ['trend', 'low']) for (const id of Object.keys(hist[k])) hist[k][id] = hist[k][id].slice(-HISTORY_KEEP);
  }
  fs.writeFileSync(histFile, JSON.stringify(hist));
  console.log(`history.json : point ajouté pour ${today} (${hist.dates.length} points)`);
} else {
  console.log(`history.json : dernier point ${last}, prochain dans ${Math.ceil(HISTORY_DAYS - daysSince)} j`);
}
