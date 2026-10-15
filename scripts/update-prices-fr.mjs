// Prix des versions FR / EN / JP via CardTrader, annonces en euros uniquement.
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
import { summarizeOffers } from './lib/cardtrader-prices.mjs';
import { mappedProductIds } from './lib/cardtrader-mapping.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');
const OUT = path.join(DATA, 'prices-fr.json');
const API = 'https://api.cardtrader.com/api/v2';
const TOKEN = process.env.CARDTRADER_TOKEN;
const LANGUAGES = ['fr', 'en', 'ja'];
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const ONLY = opt('only', null); // ex. --only OP-17 : ne traiter que les extensions dont le nom/code contient ce texte
const CATALOGUE_ONLY = args.includes('--catalogue-only');

if (!TOKEN) {
  console.error('CARDTRADER_TOKEN manquant : créez un compte CardTrader (gratuit), copiez le jeton API depuis les réglages du compte,');
  console.error('puis lancez : CARDTRADER_TOKEN=... node scripts/update-prices-fr.mjs   (ou ajoutez-le comme secret GitHub).');
  process.exit(2);
}

const prices = JSON.parse(fs.readFileSync(path.join(DATA, 'prices.json'), 'utf8'));

let calls = 0;
let lastCall = 0;
async function get(pathname, params = {}) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 1100 - (Date.now() - lastCall))));
    lastCall = Date.now();
    calls++;
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (res.status >= 500 && attempt < 4) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (res.status === 429 && attempt < 5) { await new Promise((r) => setTimeout(r, 2000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${url.pathname} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Jeu One Piece et ses extensions
const games = await get('/games');
const game = (Array.isArray(games) ? games : games.array ?? []).find((g) => /one\s*piece/i.test(`${g.name} ${g.display_name}`));
if (!game) { console.error('Jeu One Piece introuvable sur CardTrader :', games); process.exit(1); }
const expansions = (await get('/expansions')).filter((e) => e.game_id === game.id && (!ONLY || `${e.code} ${e.name}`.toLowerCase().includes(ONLY.toLowerCase())));
console.log(`CardTrader : jeu "${game.display_name}" (#${game.id}), ${expansions.length} extensions`);

// 2. Pour chaque extension : fiches (blueprints) -> ids Cardmarket, puis annonces en français
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { products: {} };
if (ONLY && [prev.products, ...Object.values(prev.languages ?? {})].some((entries) =>
  Object.values(entries ?? {}).some((quote) => !quote.mapping))) {
  throw new Error('Un relevé complet est nécessaire avant --only : les anciens prix ne portent pas leur provenance produit.');
}
// Un relevé complet remplace les anciennes annonces qui ne sont plus disponibles.
const out = { updatedAt: new Date().toISOString(), source: 'cardtrader', currency: 'EUR', products: ONLY ? { ...prev.products } : {}, languages: Object.fromEntries(LANGUAGES.map((lang) => [lang, ONLY ? { ...(lang === 'fr' ? prev.products : prev.languages?.[lang]) } : {}])) };
const today = out.updatedAt.slice(0, 10);
// Données publiques des fiches, sans annonce, vendeur ou information de compte.
const merchantCatalogue = { updatedAt: out.updatedAt, expansions: expansions.map(({ id, code, name }) => ({ id, code, name })), blueprints: [] };
let matched = 0, unmatched = 0, listingsTotal = 0, failures = 0;

for (const exp of expansions) {
  let blueprints;
  try { blueprints = await get('/blueprints/export', { expansion_id: exp.id }); }
  catch (e) { failures++; console.warn(`  ✗ ${exp.code ?? exp.name} : ${e.message}`); continue; }
  merchantCatalogue.blueprints.push(...blueprints.map((bp) => ({
    id: bp.id, expansion_id: exp.id, name: bp.name, version: bp.version,
    image_url: bp.image_url, card_market_ids: bp.card_market_ids,
    fixed_properties: bp.fixed_properties,
  })));
  if (CATALOGUE_ONLY) { console.log(`${exp.name}: ${blueprints.length} fiches`); continue; }
  const bpById = new Map(blueprints.map((b) => [b.id, b]));
  for (const language of LANGUAGES) {
  // En mise à jour partielle, une fiche devenue ambiguë ou sans annonce ne doit
  // pas conserver son ancien prix. Le fichier n'est écrit qu'après succès global.
  for (const bp of blueprints) for (const id of bp.card_market_ids ?? []) delete out.languages[language][id];
  let offers;
  try {
    // CardTrader utilise le code « jp », normalisé en « ja » dans notre fichier.
    offers = await get('/marketplace/products', { expansion_id: exp.id, language: language === 'ja' ? 'jp' : language });
  } catch (e) { failures++; console.warn(`  ✗ ${exp.code ?? exp.name} : ${e.message}`); continue; }
  let n = 0;
  for (const [bpId, list] of Object.entries(offers)) {
    const bp = bpById.get(Number(bpId));
    if (!bp || !Array.isArray(list) || !list.length) continue;
    const entry = summarizeOffers(list, today, language);
    if (!entry) continue;
    const cmIds = mappedProductIds(bp, prices.products);
    if (!cmIds.length) { unmatched++; continue; }
    for (const id of cmIds) {
      const existing = out.languages[language][id];
      if (!existing || existing.at !== today || entry.from < existing.from) out.languages[language][id] = {
        ...entry, mapping: { kind: 'explicit-cardtrader-id', blueprintId: bp.id, productId: id },
      };
    }
    matched++; n++; listingsTotal += entry.n;
  }
  console.log(`${language.toUpperCase()} ${String(exp.code ?? '').padEnd(8)} ${exp.name.slice(0, 40).padEnd(40)} ${String(n).padStart(4)} fiches en EUR`);
  await sleep(150);
  }
}
if (failures) throw new Error(`${failures} extension(s) non récupérée(s) : le précédent relevé est conservé.`);
if (!ONLY) fs.writeFileSync(path.join(DATA, 'cardtrader-catalogue.json'), JSON.stringify(merchantCatalogue));
if (CATALOGUE_ONLY) process.exit(0);
out.products = out.languages.fr;
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`\nprices-fr.json : ${matched} fiches reliées (${listingsTotal} annonces VF), ${unmatched} fiches sans correspondance Cardmarket, ${Object.keys(out.products).length} produits au total, devise ${out.currency}, ${calls} appels API`);
