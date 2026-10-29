// Audit local reproductible ; --online compare aussi chaque collection au site Bandai.
// --cached réutilise uniquement les pages du précédent audit en ligne.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { buildIndexes, defaultProductFor, resolveProductFor, productUrl, searchUrl } from '../src/lib/cardmarket';
import { merchantMappingFor, blueprintFor } from '../src/lib/merchant-mappings';
import { quoteForPrinting } from '../src/lib/cardtrader';
import { cardmarketFrenchQuote, CM_FR_METHOD } from '../src/lib/cardmarket-fr';
import { blueprintSignature } from './lib/merchant-evidence.mjs';
import { basePrintingsInSeries, printingFor } from '../src/lib/printings';
import type { Catalogue, Prices, PricesFr, CmFrenchPrices } from '../src/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const catalogue = read('public/data/cards.json') as Catalogue;
const prices = read('public/data/prices.json') as Prices;
const quotes = read('public/data/prices-fr.json') as PricesFr;
const french = read('public/data/prices-cardmarket-fr.json') as CmFrenchPrices;
const reviews = read('src/data/printing-reviews.json');
const overrides = read('src/data/card-printings.json');
const merchantMappings = read('src/data/cardmarket-mappings.json');
const directMappings = read('src/data/cardtrader-mappings.json');
const evidence = read('scripts/data/merchant-evidence.json');
const merchantCatalogue = read('public/data/cardtrader-catalogue.json');
const configuredSeries = read('scripts/series-fr.json') as Catalogue['series'];
const idx = buildIndexes(catalogue);
const cache = path.join(root, '.cache/catalogue-audit');
fs.mkdirSync(cache, { recursive: true });
const online = process.argv.includes('--online');
const cached = process.argv.includes('--cached');
const issues: string[] = [];
const check = (ok: unknown, message: string) => { if (!ok) issues.push(message); };

check(Object.keys(evidence).length === Object.keys(merchantMappings).length + Object.keys(directMappings).length, 'Registres marchands à régénérer');
for (const [id, entry] of Object.entries(evidence) as [string, { series: string; product?: number; blueprint: number; imageSha256: string; blueprintSignature: string }][]) {
  const published = merchantMappings[id] ?? directMappings[id];
  check(published && Object.entries(published).every(([key, value]) => entry[key as keyof typeof entry] === value), `Preuve différente du registre publié : ${id}`);
  const card = idx.byId.get(id);
  const bp = merchantCatalogue.blueprints.find((b: { id: number }) => b.id === entry.blueprint);
  check(card?.series.includes(entry.series), `Preuve marchande hors collection : ${id}`);
  check(bp && blueprintSignature(bp) === entry.blueprintSignature, `Identité marchande modifiée : ${id}/${entry.blueprint}`);
  if (entry.product) check(bp?.card_market_ids?.includes(entry.product), `Lien marchand retiré : ${id}/${entry.product}`);
  if (card) check(createHash('sha256').update(fs.readFileSync(path.join(root, 'public/images/cards', `${id}.webp`))).digest('hex') === entry.imageSha256, `Illustration officielle modifiée : ${id}`);
  check(!merchantMappings[id] || !directMappings[id], `Deux preuves concurrentes : ${id}`);
}

check(idx.byId.size === catalogue.cards.length, 'Identifiants de cartes dupliqués');
check(idx.seriesById.size === catalogue.series.length, 'Identifiants de collections dupliqués');
check(configuredSeries.length === catalogue.series.length, 'Nombre de collections différent de la configuration');
for (const s of configuredSeries) {
  const local = idx.seriesById.get(s.id);
  check(local?.code === s.code && JSON.stringify(local.cm) === JSON.stringify(s.cm), `Collection incohérente : ${s.code}`);
}
for (const card of catalogue.cards) {
  check(card.id.split('_')[0] === card.code, `Code incohérent : ${card.id}`);
  check(card.series.length > 0 && card.series.every((id) => idx.seriesById.has(id)), `Collection inconnue : ${card.id}`);
}
const reviewed = new Set<string>();
for (const review of reviews.reviews) {
  for (const group of review.groups) {
    for (const id of group.ids) {
      check(!reviewed.has(id), `Description dupliquée : ${id}`);
      reviewed.add(id);
      const card = idx.byId.get(id);
      check(card?.series.includes(review.series), `Description absente du catalogue/de sa collection : ${id}`);
      if (card) check(printingFor(card)?.base === group.base && printingFor(card)?.label === group.label, `Descriptions contradictoires : ${id}`);
    }
  }
}
for (const [id, raw] of Object.entries(overrides)) {
  const entry = raw as { series: string; cardmarket?: { id: number } };
  const card = idx.byId.get(id);
  check(card?.series.includes(entry.series), `Référence vérifiée absente : ${id}`);
  if (card && entry.cardmarket) check(defaultProductFor(card, idx, prices)?.product.id === entry.cardmarket.id, `Association vérifiée invalide : ${id}`);
}
for (const [code, ids] of Object.entries(prices.byCode)) {
  check(new Set(ids).size === ids.length, `Index prix dupliqué : ${code}`);
  for (const id of ids) check(prices.products[id]?.code === code, `Index prix incohérent : ${code}/${id}`);
}
for (const [id, product] of Object.entries(prices.products)) {
  check(String(product.id) === id && prices.byCode[product.code]?.includes(product.id), `Produit absent de l'index : ${id}`);
}

const series = catalogue.series.map((s) => {
  const cards = catalogue.cards.filter((c) => c.series.includes(s.id));
  const codes = [...new Set(cards.map((c) => c.code))];
  const bases = basePrintingsInSeries(cards);
  const resolved = cards.flatMap((card) => {
    const match = defaultProductFor(card, idx, prices);
    if (!match) return [];
    const p = match.product;
    check(p.code === card.code && !p.foreign && (s.cm.includes(p.exp) || (!s.cm.length && merchantMappingFor(card)?.expansion === p.exp)), `Association hors collection/code : ${card.id}/${p.id}`);
    return [{ card: card.id, product: p.id, evidence: (printingFor(card)?.cardmarket || merchantMappingFor(card)) ? 'verified' : 'unique-in-expansion' }];
  });
  check(new Set(resolved.map((r) => r.product)).size === resolved.length, `Prix partagé entre variantes de ${s.code}`);
  check(s.count === cards.length, `Compteur de collection périmé : ${s.code}`);
  check(new Set(bases.map((c) => c.code)).size === bases.length, `Plusieurs versions de base pour un code : ${s.code}`);
  if (s.kind === 'premium') check(cards.every((c) => printingFor(c)), `Variantes PRB non revues : ${s.code}`);
  if (s.kind === 'starter') check(bases.length === codes.length, `Versions de deck non identifiées : ${s.code}`);
  return {
    id: s.id, code: s.code, variants: cards.length, codes: codes.length, basePrintings: bases.length,
    describedPrintings: cards.filter((c) => printingFor(c)).length,
    codesWithoutBasePrinting: codes.filter((code) => !bases.some((c) => c.code === code)),
    resolved, unresolved: cards.filter((c) => !resolved.some((r) => r.card === c.id)).map((c) => c.id),
  };
});

// Chaque carte × chaque produit du même code, y compris les produits d'autres éditions.
// Ce sont des scénarios d'anciennes associations, pas un inventaire des données personnelles.
const cardChecks = catalogue.cards.map((card) => {
  const expected = defaultProductFor(card, idx, prices);
  const candidates = (prices.byCode[card.code] ?? []).map((id) => prices.products[id]).filter(Boolean);
  const tests = candidates.map((candidate) => {
    const result = resolveProductFor(card, idx, prices, candidate.id);
    check(result.match?.product.id === expected?.product.id, `Surcharge non validée acceptée : ${card.id}/${candidate.id}`);
    const inEdition = card.series.some((sid) => idx.seriesById.get(sid)?.cm.includes(candidate.exp));
    return { product: candidate.id, edition: candidate.exp, status: result.storedStatus,
      reason: candidate.foreign ? 'foreign-product' : !inEdition ? 'other-edition'
        : expected?.product.id === candidate.id ? 'confirmed'
          : printingFor(card)?.cardmarket ? 'other-printing' : 'unconfirmed-printing',
      previouslyAccepted: !candidate.foreign && !printingFor(card)?.cardmarket };
  });
  const ignored = tests.filter((t) => t.status === 'ignored');
  return {
    card: card.id, code: card.code, series: card.series,
    status: expected ? printingFor(card)?.cardmarket ? 'verified' : 'unique-in-expansion' : 'unresolved',
    product: expected?.product.id ?? null,
    cardmarketFR: cardmarketFrenchQuote(french, expected?.product.id)?.average ?? null,
    link: expected ? productUrl(expected.product) : searchUrl(card.code),
    pricesByLanguage: Object.fromEntries((['fr', 'en', 'ja'] as const).map((language) => [language,
      quoteForPrinting(quotes, card, expected?.product.id, language)?.from ?? null])),
    blueprint: blueprintFor(card) ?? null,
    potentiallyUnsafeStoredProducts: ignored.filter((t) => t.previouslyAccepted).map((t) => t.product),
    testedStoredProducts: tests,
  };
});
const legacySafety = {
  testedCards: cardChecks.length,
  testedProducts: cardChecks.reduce((n, c) => n + c.testedStoredProducts.length, 0),
  potentiallyAffectedCards: cardChecks.filter((c) => c.potentiallyUnsafeStoredProducts.length).length,
  rejectedPreviouslyAcceptedPairs: cardChecks.reduce((n, c) => n + c.potentiallyUnsafeStoredProducts.length, 0),
  bySeries: catalogue.series.map((s) => {
    const cards = cardChecks.filter((c) => c.series.includes(s.id));
    return { series: s.code, cards: cards.length, potentiallyAffectedCards: cards.filter((c) => c.potentiallyUnsafeStoredProducts.length).length,
      rejectedPreviouslyAcceptedPairs: cards.reduce((n, c) => n + c.potentiallyUnsafeStoredProducts.length, 0) };
  }),
};
const priceEvidence = (['fr', 'en', 'ja'] as const).map((language) => {
  const entries = Object.entries(language === 'fr' ? quotes.products : quotes.languages?.[language] ?? {});
  const explicit = entries.filter(([, quote]) => quote.mapping);
  for (const [id, quote] of explicit) {
    check(quote.mapping!.kind === 'explicit-cardtrader-id' && quote.mapping!.productId === Number(id), `Provenance prix incohérente : ${language}/${id}`);
  }
  for (const [id, quote] of Object.entries(quotes.blueprints?.[language] ?? {})) {
    check(quote.mapping?.kind === 'cardtrader-blueprint' && quote.mapping.blueprintId === Number(id), `Provenance fiche incohérente : ${language}/${id}`);
  }
  return { language, quotes: entries.length, explicitProvenance: explicit.length, legacyWithoutProvenance: entries.length - explicit.length };
});

const official: { series: string; source: string; checkedAt: string; entries: number; unique: number; duplicates: string[]; missing: string[]; extra: string[] }[] = [];
let merchant: { source: string; checkedAt: string; createdAt: string; checkedProducts: number; mismatches: number[]; missingProducts: number[] } | undefined;
if (online || cached) {
  const queue = [...catalogue.series];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (queue.length) {
      const s = queue.shift()!;
      const source = `https://fr.onepiece-cardgame.com/cardlist/?series=${s.id}`;
      const file = path.join(cache, `${s.id}.html`);
      try {
        if (online) {
          const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          if (!cheerio.load(html)('dl.modalCol').length) throw new Error('Liste de cartes vide');
          fs.writeFileSync(file, html);
        }
        const $ = cheerio.load(fs.readFileSync(file, 'utf8'));
        const ids = $('dl.modalCol').map((_, el) => $(el).attr('id')).get();
        const unique = [...new Set(ids)];
        const local = catalogue.cards.filter((c) => c.series.includes(s.id)).map((c) => c.id);
        const missing = unique.filter((id) => !local.includes(id));
        const extra = local.filter((id) => !unique.includes(id));
        check(ids.length > 0 && missing.length === 0 && extra.length === 0, `Liste officielle différente : ${s.code} (+${missing.length}/-${extra.length})`);
        official.push({ series: s.code, source, checkedAt: fs.statSync(file).mtime.toISOString(), entries: ids.length, unique: unique.length,
          duplicates: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))], missing, extra });
      } catch (error) { issues.push(`Vérification officielle impossible : ${s.code} (${String(error)})`); }
    }
  }));
  const source = 'https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_18.json';
  const file = path.join(cache, 'cardmarket-products.json');
  try {
    if (online) {
      const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fs.writeFileSync(file, JSON.stringify(await response.json()));
    }
    const live = JSON.parse(fs.readFileSync(file, 'utf8')) as { createdAt: string; products: { idProduct: number; idExpansion: number; name: string }[] };
    const byId = new Map(live.products.map((p) => [p.idProduct, p]));
    const codeOf = (name: string) => name.match(/\(([A-Z]+-?\d*-\d{3})\)\s*$/)?.[1];
    const mismatches = Object.values(prices.products).filter((p) => {
      const actual = byId.get(p.id);
      return !actual || actual.idExpansion !== p.exp || codeOf(actual.name) !== p.code;
    }).map((p) => p.id);
    const expansions = new Set(catalogue.series.flatMap((s) => s.cm));
    const codes = new Set(catalogue.cards.map((c) => c.code));
    // Un nouveau produit peut rendre ambiguë une ancienne association univoque.
    const missingProducts = live.products.filter((p) => !prices.products[p.idProduct] && expansions.has(p.idExpansion) && codes.has(codeOf(p.name) ?? '')).map((p) => p.idProduct);
    check(mismatches.length === 0, `${mismatches.length} produits Cardmarket incohérents avec le catalogue courant`);
    check(missingProducts.length === 0, `${missingProducts.length} nouveaux produits Cardmarket : actualiser puis relancer l'audit`);
    merchant = { source, checkedAt: fs.statSync(file).mtime.toISOString(), createdAt: live.createdAt,
      checkedProducts: Object.keys(prices.products).length, mismatches, missingProducts };
  } catch (error) { issues.push(`Vérification Cardmarket impossible (${String(error)})`); }
}
check(french.source === 'cardmarket' && french.currency === 'EUR' && french.language === 'fr' && french.method === CM_FR_METHOD, 'Source des prix FR invalide');
for (const [key, quote] of Object.entries(french.products)) {
  check(String(quote.productId) === key && cardChecks.some(c => c.product === quote.productId), `Prix FR sans produit confirmé : ${key}`);
  check(Number.isFinite(Date.parse(quote.at)) && Date.parse(quote.at) <= Date.now() + 300_000, `Date de prix FR invalide : ${key}`);
  const url = new URL(quote.url);
  check(url.origin === 'https://www.cardmarket.com' && url.pathname.startsWith('/fr/OnePiece/Products/Singles/') && url.searchParams.get('language') === '2', `Source de relevé FR invalide : ${key}`);
  check(quote.status === 'quoted'
    ? !!cardmarketFrenchQuote(french, quote.productId, Date.parse(quote.at))
    : quote.status === 'insufficient' && quote.average === null && quote.sellers < 5 && quote.sellers >= 0 && quote.sample.length === quote.sellers,
  `Échantillon de prix FR invalide : ${key}`);
}
const report = {
  generatedAt: new Date().toISOString(), catalogueAt: catalogue.generatedAt, pricesAt: prices.updatedAt,
  reviewAt: reviews.reviewedAt, officialMode: online ? 'online' : cached ? 'cached' : 'not-requested',
  totals: { collections: series.length, variants: catalogue.cards.length, described: reviewed.size,
    resolved: series.reduce((n, s) => n + s.resolved.length, 0), unresolved: series.reduce((n, s) => n + s.unresolved.length, 0),
    directBlueprints: Object.keys(directMappings).length,
    merchantResolved: cardChecks.filter((c) => c.product || c.blueprint).length,
    pricesFR: cardChecks.filter((c) => c.cardmarketFR != null).length,
    archivedCardtraderFR: cardChecks.filter((c) => c.pricesByLanguage.fr != null).length },
  issues, series, official: official.sort((a, b) => a.series.localeCompare(b.series)), merchant,
  legacySafety, cardChecks, priceEvidence,
};
const output = path.join(cache, 'report.json');
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.table(series.map((s) => ({ collection: s.code, variantes: s.variants, bases: s.basePrintings,
  liensCardmarket: s.resolved.length, liensNonConfirmes: s.unresolved.length,
  prixFR: cardChecks.filter((c) => c.series.includes(s.id) && c.cardmarketFR != null).length })));
console.log(JSON.stringify(report.totals));
console.log(JSON.stringify({ legacySafety: { ...legacySafety, bySeries: undefined } }));
console.log(`Rapport : ${output}`);
console.log(`${issues.length} anomalie(s), ${official.length} listes officielles comparées. Les associations univoques ne constituent pas une vérification visuelle des produits marchands.`);
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1; }
