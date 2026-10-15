import { expect, it } from 'vitest';
import catalogueData from '../public/data/cards.json';
import pricesData from '../public/data/prices.json';
import type { Catalogue, Prices } from '../src/types';
import { buildIndexes, candidatesFor, productUrl, resolveProductFor } from '../src/lib/cardmarket';
import { merchantMappingFor } from '../src/lib/merchant-mappings';
import { printingFor } from '../src/lib/printings';
import { mappedProductIds } from '../scripts/lib/cardtrader-mapping.mjs';
import { cardTraderQuote } from '../src/lib/cardtrader';

const catalogue = catalogueData as Catalogue;
const prices = pricesData as Prices;
const idx = buildIndexes(catalogue);

it.each(catalogue.series)('$code : chaque ancienne association doit prouver la même impression', (series) => {
  for (const card of catalogue.cards.filter((c) => c.series.includes(series.id))) {
    const candidates = candidatesFor(card.code, prices);
    // Produit absent et produit d'un autre code également testés.
    const otherCode = Object.values(prices.products).find((p) => p.code !== card.code)!;
    for (const storedId of [undefined, -1, otherCode.id, ...candidates.map((p) => p.id)]) {
      const { match, storedStatus } = resolveProductFor(card, idx, prices, storedId);
      if (!match) {
        expect(storedStatus).toBe(storedId == null ? 'none' : 'ignored');
        continue;
      }
      const p = match.product;
      expect(p.code).toBe(card.code);
      expect(p.foreign).toBe(false);
      const evidence = merchantMappingFor(card);
      if (series.cm.length) expect(series.cm).toContain(p.exp);
      else expect(evidence?.expansion).toBe(p.exp);
      const verified = printingFor(card)?.cardmarket;
      if (verified) {
        expect(p.id).toBe(verified.id);
        expect(p.exp).toBe(verified.expansion);
      } else if (evidence) {
        expect(p.id).toBe(evidence.product);
        expect(p.exp).toBe(evidence.expansion);
      } else {
        // Preuve indépendante de la fonction de résolution : une seule impression
        // et un seul produit dans cette édition, pas juste le même code.
        expect(idx.byCode.get(card.code)!.filter((c) => c.series.includes(series.id))).toHaveLength(1);
        expect(candidates.filter((c) => !c.foreign && series.cm.includes(c.exp))).toHaveLength(1);
      }
      expect(productUrl(p)).toContain(`idProduct=${p.id}&language=2`);
      expect(storedStatus).toBe(storedId == null ? 'none' : storedId === p.id ? 'confirmed' : 'ignored');
    }
  }
});

it('ne transforme pas les rangs de suffixes/produits en correspondances sur tout le catalogue', () => {
  const changed = { ...prices, products: Object.fromEntries(Object.entries(prices.products).reverse().map(([id, p]) => [id, { ...p, version: 999 }])) };
  const reversed = buildIndexes({ ...catalogue, cards: [...catalogue.cards].reverse() });
  for (const card of catalogue.cards) {
    expect(resolveProductFor(card, reversed, changed).match?.product.id).toBe(resolveProductFor(card, idx, prices).match?.product.id);
  }
});

it('ne diffuse pas un prix CardTrader à plusieurs finitions ou à un autre code', () => {
  const a = { id: 1, code: 'OP03-079', exp: 5805 };
  const products = { 1: a, 2: { ...a, id: 2 }, 3: { ...a, id: 3, exp: 999 }, 4: { ...a, id: 4, code: 'OP06-065' } };
  const bp = { id: 99, name: 'Vergo (OP03-079)', card_market_ids: [1] };
  expect(mappedProductIds(bp, products)).toEqual([1]);
  expect(mappedProductIds({ ...bp, card_market_ids: [1, 1] }, products)).toEqual([1]);
  expect(mappedProductIds({ ...bp, card_market_ids: [1, 3] }, products)).toEqual([1, 3]);
  for (const ids of [[], [1, 2], [1, 4], [1, 999], [-1]]) {
    expect(mappedProductIds({ ...bp, card_market_ids: ids }, products)).toEqual([]);
  }
  expect(mappedProductIds({ ...bp, name: 'Niji (OP06-065)' }, products)).toEqual([]);
  // Un code seul ne remplace pas un identifiant produit explicite.
  expect(mappedProductIds({ name: bp.name }, { 1: a })).toEqual([]);
});

it('refuse un relevé dont la provenance désigne un autre produit', () => {
  const quote = { at: '2026-10-16', n: 1, from: 2, med: 2, nm: 2,
    mapping: { kind: 'explicit-cardtrader-id' as const, blueprintId: 99, productId: 799250 } };
  const data = { source: 'cardtrader' as const, currency: 'EUR', updatedAt: quote.at, products: { 799370: quote }, languages: { en: { 799370: quote } } };
  expect(cardTraderQuote(data, 799370)).toBeUndefined();
  expect(cardTraderQuote(data, 799370, 'en')).toBeUndefined();
  expect(cardTraderQuote({ ...data, products: { 799250: quote } }, 799250)?.from).toBe(2);
});
