import type { Card, Catalogue, CmProduct, Prices, Series } from '../types';

export const CM_LANG_FR = 2; // paramètre "language" de Cardmarket : 2 = français

export function cmSlug(name: string): string {
  return name.replace(/[^A-Za-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');
}

/** Page produit Cardmarket, filtrée sur les annonces en français. */
export function productUrl(p: CmProduct): string {
  if (p.expSlug) {
    return `https://www.cardmarket.com/fr/OnePiece/Products/Singles/${p.expSlug}/${cmSlug(p.name)}-${p.code}-V${p.version}?language=${CM_LANG_FR}`;
  }
  return searchUrl(p.code);
}

export function searchUrl(code: string): string {
  return `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(code)}&language=${CM_LANG_FR}`;
}

/** Minimum relevé sur les annonces Cardmarket françaises, hors frais de port.
 * Le guide public et CardTrader ne peuvent pas remplacer un relevé VF absent.
 */
export function minimumFrPrice(quote: { price: number } | undefined): number | null {
  const price = quote?.price;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

export interface Indexes {
  byId: Map<string, Card>;
  byCode: Map<string, Card[]>;
  seriesById: Map<string, Series>;
}

export function buildIndexes(cat: Catalogue): Indexes {
  const byId = new Map<string, Card>();
  const byCode = new Map<string, Card[]>();
  for (const c of cat.cards) {
    byId.set(c.id, c);
    const l = byCode.get(c.code) ?? [];
    l.push(c);
    byCode.set(c.code, l);
  }
  for (const l of byCode.values()) l.sort((a, b) => a.variant - b.variant);
  return { byId, byCode, seriesById: new Map(cat.series.map((s) => [s.id, s])) };
}

/** Tous les produits Cardmarket portant le même code, les éditions occidentales d'abord. */
export function candidatesFor(code: string, prices: Prices): CmProduct[] {
  const ids = prices.byCode[code] ?? [];
  return ids
    .map((id) => prices.products[id])
    .filter(Boolean)
    .sort((a, b) => Number(a.foreign) - Number(b.foreign) || a.id - b.id);
}

/**
 * Produit Cardmarket proposé par défaut pour une variante FR :
 * on aligne l'ordre des variantes FR d'un même code au sein de la série (base, _p1, _p2…)
 * avec les versions Cardmarket (V1, V2…) de l'extension correspondante.
 */
export function defaultProductFor(card: Card, idx: Indexes, prices: Prices): { product: CmProduct; sure: boolean } | undefined {
  const all = candidatesFor(card.code, prices);
  if (!all.length) return undefined;
  const siblingsAll = idx.byCode.get(card.code) ?? [card];
  for (const sid of card.series) {
    const s = idx.seriesById.get(sid);
    if (!s || !s.cm.length) continue;
    const siblings = siblingsAll.filter((c) => c.series.includes(sid));
    const i = siblings.findIndex((c) => c.id === card.id);
    const inExp = all.filter((p) => s.cm.includes(p.exp)).sort((a, b) => a.version - b.version);
    if (!inExp.length) continue;
    // Association sûre quand le nombre de variantes FR égale le nombre de versions Cardmarket.
    const sure = inExp.length === siblings.length;
    return { product: inExp[Math.min(i, inExp.length - 1)], sure };
  }
  // Promos / autres produits : éditions occidentales dans l'ordre des variantes.
  const western = all.filter((p) => !p.foreign);
  const i = siblingsAll.findIndex((c) => c.id === card.id);
  const product = western[i] ?? western[0] ?? all[0];
  return { product, sure: western.length === siblingsAll.length && western.length === 1 };
}
