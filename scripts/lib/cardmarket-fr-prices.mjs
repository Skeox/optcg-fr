import { KOALA_ST35 } from './cardmarket-product-corrections.mjs';

export const METHOD = 'five-lowest-distinct-sellers-nm-v1';

export function emptyPrices() {
  return { source: 'cardmarket', currency: 'EUR', language: 'fr', method: METHOD, updatedAt: null, products: {} };
}

export function euroCents(text) {
  const raw = String(text ?? '').replace(/[\s\u00a0\u202f]/g, '');
  // Cardmarket's French UI uses dots for thousands and a comma for cents.
  const s = /^\d{1,3}(?:\.\d{3})+,\d{2}€$/.test(raw) ? raw.replaceAll('.', '') : raw;
  if (!/^\d+(?:[.,]\d{2})?€$/.test(s)) return null;
  const n = Math.round(Number(s.slice(0, -1).replace(',', '.')) * 100);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Input is a DOM observation, never the page's mixed-language price guide. */
export function summarizeCardmarketPage(page, target, now = new Date()) {
  const url = new URL(page.url);
  const hasExactCode = [...String(page.title).matchAll(/\(([^()]*)\)/g)]
    .some(match => match[1].trim() === target.code);
  // Exception limitée à cette fiche : le vrai code doit être relu dans le DOM.
  const verifiedTitleError = target.productId === KOALA_ST35.id && target.code === KOALA_ST35.code
    && page.title === `${KOALA_ST35.catalogueName}\n${KOALA_ST35.expansionName} - Cartes`
    && url.pathname === KOALA_ST35.path && page.cardNumber === KOALA_ST35.code
    && page.expansionName === KOALA_ST35.expansionName;
  if (url.origin !== 'https://www.cardmarket.com' || !url.pathname.startsWith('/fr/OnePiece/Products/Singles/')
    || url.searchParams.get('language') !== '2' || page.productId !== target.productId
    || (!hasExactCode && !verifiedTitleError) || !Array.isArray(page.offers) || typeof page.hasMore !== 'boolean') {
    throw new Error('Page produit, identité ou langue non vérifiable');
  }
  const at = Date.parse(page.at);
  if (!Number.isFinite(at) || at > now.getTime() + 300_000 || now.getTime() - at > 86_400_000) throw new Error('Observation périmée ou sans date');
  const sellers = new Map();
  for (const row of page.offers) {
    const cents = euroCents(row.price);
    // Reject extras and descriptions mentioning grading, lots, signatures or alterations.
    const comment = row.comment ?? '';
    const grading = /\b(?:PSA|BGS|CGC|PCA|CCC|beckett)(?:\b|(?=\d))|\bPG\s*\d{1,2}(?:[.,]\d)?\b/i.test(comment);
    const exceptional = grading || /\b(graded|gradée?|slab|lot|playset|signed|signée?|altered|altérée?|proxy)\b/i.test(comment);
    if (row.language !== 'Français' || !['NM', 'MT'].includes(row.condition) || !cents
      || !Number.isSafeInteger(row.quantity) || row.quantity < 1 || !Array.isArray(row.extras) || row.extras.length
      || exceptional || !/^\/fr\/OnePiece\/Users\/[A-Za-z0-9_-]+$/.test(row.seller ?? '')) continue;
    const seller = row.seller.toLowerCase();
    sellers.set(seller, Math.min(cents, sellers.get(seller) ?? Infinity));
  }
  const sample = [...sellers.values()].sort((a, b) => a - b).slice(0, 5);
  // If more rows exist, this page does not establish that supply is insufficient.
  if (sample.length < 5 && page.hasMore) throw new Error('Résultats incomplets : charger davantage d’offres');
  // An empty/challenge page must never erase a previous observation.
  if (!page.offers.length && page.emptyConfirmed !== true) throw new Error('Aucune annonce : absence de stock non confirmée');
  return { productId: target.productId, at: page.at, status: sample.length === 5 ? 'quoted' : 'insufficient',
    average: sample.length === 5 ? Math.round(sample.reduce((a, b) => a + b, 0) / 5) / 100 : null,
    sellers: sample.length, sample, url: url.href };
}

/** An entire submitted batch is checked before mutating the checkpoint. */
export function mergePages(previous, pages, targets, now = new Date()) {
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new Error('Lot invalide');
  const quotes = pages.map(page => {
    const target = targets.find(t => t.productId === page.productId);
    if (!target) throw new Error('Produit absent du registre de correspondances');
    return summarizeCardmarketPage(page, target, now);
  });
  const products = { ...previous.products };
  for (const quote of quotes) if (!products[quote.productId] || products[quote.productId].at <= quote.at) products[quote.productId] = quote;
  const updatedAt = Object.values(products).map(q => q.at).sort().at(-1) ?? null;
  return { ...emptyPrices(), updatedAt, products };
}
