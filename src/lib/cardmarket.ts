import type { Card, Catalogue, CmProduct, Prices, Series } from '../types';

export const CM_LANG_FR = 2; // paramètre "language" de Cardmarket : 2 = français

/** Page produit Cardmarket, filtrée sur les annonces en français. */
export function productUrl(p: CmProduct): string {
  // Redirection officielle par identifiant : les slugs et numéros V ne sont
  // pas fournis par le catalogue et ne doivent pas être inventés.
  if (Number.isSafeInteger(p.id) && p.id > 0) {
    return `https://www.cardmarket.com/fr/OnePiece/Products?idProduct=${p.id}&language=${CM_LANG_FR}`;
  }
  return searchUrl(p.code);
}

export function searchUrl(code: string): string {
  return `https://www.cardmarket.com/fr/OnePiece/Products/Search?searchString=${encodeURIComponent(code)}&language=${CM_LANG_FR}`;
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
    .filter((p) => p && p.code === code)
    .sort((a, b) => Number(a.foreign) - Number(b.foreign) || a.id - b.id);
}

/**
 * Ne retenir une association automatique que si elle est univoque dans l'édition.
 * Les suffixes Bandai et l'ordre des identifiants Cardmarket ne prouvent jamais
 * une correspondance d'illustration, même avec le même nombre de variantes.
 */
export function defaultProductFor(card: Card, idx: Indexes, prices: Prices): { product: CmProduct; sure: boolean } | undefined {
  const all = candidatesFor(card.code, prices).filter((p) => !p.foreign);
  const siblingsAll = idx.byCode.get(card.code) ?? [card];
  const candidates = new Map<number, CmProduct>();
  for (const sid of card.series) {
    const s = idx.seriesById.get(sid);
    if (!s || !s.cm.length) continue;
    const siblings = siblingsAll.filter((c) => c.series.includes(sid));
    const inExp = all.filter((p) => s.cm.includes(p.exp));
    if (!inExp.length) continue;
    if (siblings.length !== 1 || siblings[0].id !== card.id || inExp.length !== 1) return undefined;
    candidates.set(inExp[0].id, inExp[0]);
  }
  if (candidates.size !== 1) return undefined;
  return { product: [...candidates.values()][0], sure: true };
}
