// Prix des annonces EN FRANÇAIS via l'API publique de CardTrader (place de marché européenne).
// Cardmarket ne fournit pas de prix par langue ; CardTrader expose ses annonces avec la langue,
// et chaque fiche (blueprint) porte les identifiants de produit Cardmarket correspondants,
// ce qui permet de relier directement ses prix à nos cartes.
//
// Pré-requis : un compte CardTrader (gratuit) et son jeton API (Réglages du compte › API),
// fourni via la variable d'environnement CARDTRADER_TOKEN.
// Sortie : public/data/prices-fr.json  { updatedAt, source, currency, products: { <idProduct Cardmarket>: { at, n, from, med, nm } } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const OUT = path.join(DATA, 'prices-fr.json');
const API = 'https://api.cardtrader.com/api/v2';
const TOKEN = process.env.CARDTRADER_TOKEN;
const LANG = 'fr';
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const ONLY = opt('only', null); // ex. --only OP-17 : ne traiter que les extensions dont le nom/code contient ce texte

if (!TOKEN) {
  console.error('CARDTRADER_TOKEN manquant : créez un compte CardTrader (gratuit), copiez le jeton API depuis les réglages du compte,');
  console.error('puis lancez : CARDTRADER_TOKEN=... node scripts/update-prices-fr.mjs   (ou ajoutez-le comme secret GitHub).');
  process.exit(2);
}

const prices = JSON.parse(fs.readFileSync(path.join(DATA, 'prices.json'), 'utf8'));
const wanted = new Set(Object.keys(prices.products).map(Number)); // produits Cardmarket connus de l'app
const codeRe = /\b([A-Z]{1,3}\d{2}-\d{3}|P-\d{3})\b/;

let calls = 0;
async function get(pathname, params = {}) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' } });
    if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${url.pathname} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (xs) => { if (!xs.length) return null; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100; };

// 1. Jeu One Piece et ses extensions
const games = await get('/games');
const game = (Array.isArray(games) ? games : games.array ?? []).find((g) => /one\s*piece/i.test(`${g.name} ${g.display_name}`));
if (!game) { console.error('Jeu One Piece introuvable sur CardTrader :', games); process.exit(1); }
const expansions = (await get('/expansions')).filter((e) => e.game_id === game.id && (!ONLY || `${e.code} ${e.name}`.toLowerCase().includes(ONLY.toLowerCase())));
console.log(`CardTrader : jeu "${game.display_name}" (#${game.id}), ${expansions.length} extensions`);

// 2. Pour chaque extension : fiches (blueprints) -> ids Cardmarket, puis annonces en français
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { products: {} };
const out = { updatedAt: new Date().toISOString(), source: 'cardtrader', currency: null, products: { ...prev.products } };
const today = out.updatedAt.slice(0, 10);
let matched = 0, unmatched = 0, listingsTotal = 0;
const byCodeCm = {};
for (const [id, p] of Object.entries(prices.products)) if (!p.foreign) (byCodeCm[p.code] ??= []).push(Number(id));

for (const exp of expansions) {
  let blueprints, offers;
  try {
    blueprints = await get('/blueprints/export', { expansion_id: exp.id });
    offers = await get('/marketplace/products', { expansion_id: exp.id, language: LANG });
  } catch (e) { console.warn(`  ✗ ${exp.code ?? exp.name} : ${e.message}`); continue; }
  const bpById = new Map(blueprints.map((b) => [b.id, b]));
  let n = 0;
  for (const [bpId, list] of Object.entries(offers)) {
    const bp = bpById.get(Number(bpId));
    if (!bp || !Array.isArray(list) || !list.length) continue;
    // Annonces réellement en français (le paramètre language filtre déjà, on revérifie la propriété)
    const fr = list.filter((l) => { const lang = Object.entries(l.properties_hash ?? {}).find(([k]) => /language/i.test(k))?.[1]; return !lang || String(lang).toLowerCase() === LANG; });
    if (!fr.length) continue;
    const cur = fr[0].price?.currency ?? null;
    out.currency ??= cur;
    if (cur && cur !== out.currency) continue; // devise inattendue : on ignore
    const pr = fr.map((l) => l.price.cents / 100);
    const nm = fr.filter((l) => /^(near mint|mint)$/i.test(String(l.properties_hash?.condition ?? ''))).map((l) => l.price.cents / 100);
    // Identifiants Cardmarket portés par la fiche ; à défaut, le code imprimé dans le nom
    let cmIds = (bp.card_market_ids ?? []).map(Number).filter((id) => wanted.has(id));
    if (!cmIds.length) { const m = `${bp.name} ${bp.version ?? ''}`.match(codeRe); if (m && byCodeCm[m[1]]?.length === 1) cmIds = byCodeCm[m[1]]; }
    if (!cmIds.length) { unmatched++; continue; }
    const entry = { at: today, n: fr.reduce((t, l) => t + (l.quantity ?? 1), 0), from: Math.min(...pr), med: median(pr), nm: nm.length ? Math.min(...nm) : null };
    for (const id of cmIds) out.products[id] = entry;
    matched++; n++; listingsTotal += fr.length;
  }
  console.log(`${String(exp.code ?? '').padEnd(8)} ${exp.name.slice(0, 40).padEnd(40)} ${String(n).padStart(4)} fiches avec annonces VF`);
  await sleep(150);
}
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\nprices-fr.json : ${matched} fiches reliées (${listingsTotal} annonces VF), ${unmatched} fiches sans correspondance Cardmarket, ${Object.keys(out.products).length} produits au total, devise ${out.currency}, ${calls} appels API`);
