export const METHOD = 'five-lowest-distinct-sellers-nm-v1';

export function emptyPrices() {
  return { source: 'cardmarket', currency: 'EUR', language: 'fr', method: METHOD, updatedAt: null, products: {} };
}

export function euroCents(text) {
  const s = String(text ?? '').replace(/[\s\u00a0\u202f]/g, '');
  if (!/^\d+(?:[.,]\d{2})?€$/.test(s)) return null;
  const n = Math.round(Number(s.slice(0, -1).replace(',', '.')) * 100);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Input is a DOM observation, never the page's mixed-language price guide. */
export function summarizeCardmarketPage(page, target, now = new Date()) {
  const url = new URL(page.url);
  if (url.origin !== 'https://www.cardmarket.com' || !url.pathname.startsWith('/fr/OnePiece/Products/Singles/')
    || url.searchParams.get('language') !== '2' || page.productId !== target.productId
    || !String(page.title).includes(`(${target.code})`) || !Array.isArray(page.offers) || typeof page.hasMore !== 'boolean') {
    throw new Error('Page produit, identité ou langue non vérifiable');
  }
  const at = Date.parse(page.at);
  if (!Number.isFinite(at) || at > now.getTime() + 300_000 || now.getTime() - at > 86_400_000) throw new Error('Observation périmée ou sans date');
  const sellers = new Map();
  for (const row of page.offers) {
    const cents = euroCents(row.price);
    // Reject extras and descriptions mentioning grading, lots, signatures or alterations.
    const exceptional = /\b(graded|gradée?|PSA|BGS|CGC|beckett|slab|lot|playset|signed|signée?|altered|altérée?|proxy)\b/i.test(row.comment ?? '');
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
