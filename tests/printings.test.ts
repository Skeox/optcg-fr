import { expect, it } from 'vitest';
import catalogueData from '../public/data/cards.json';
import pricesData from '../public/data/prices.json';
import type { Card, Catalogue, Prices } from '../src/types';
import { buildIndexes, defaultProductFor } from '../src/lib/cardmarket';
import { basePrintingsInSeries, cardVariantLabel, printingFor, requiresPrintingChoice } from '../src/lib/printings';
import { applyFilters, DEFAULT_FILTERS } from '../src/lib/filters';

const catalogue = catalogueData as Catalogue;
const prices = pricesData as Prices;
const idx = buildIndexes(catalogue);
const card = (id: string) => idx.byId.get(id)!;
const ctx = { qty: () => 0, price: () => null, keep: 1 };

it.each([
  ['OP03-079_p4', 799250],
  ['OP06-065_p3', 799370],
])('associe %s à la V.3 vérifiée sans utiliser le rang du produit', (id, productId) => {
  // Le catalogue Cardmarket donne actuellement un rang interne 2 pour ces V.3.
  const product = { ...prices.products[productId], version: 999 };
  const changed = { ...prices, products: { ...prices.products, [productId]: product } };
  expect(defaultProductFor(card(id), idx, changed)).toEqual({ product, sure: true });
  expect(printingFor(card(id))?.cardmarket?.version).toBe(3);
  expect(cardVariantLabel(card(id))).toBe('Illustration étendue');
});

it('refuse une correspondance vérifiée devenue incohérente ou absente', () => {
  const original = prices.products[799250];
  for (const bad of [undefined, { ...original, code: 'OP06-065' }, { ...original, foreign: true }, { ...original, exp: 5364 }]) {
    const changed = { ...prices, products: { ...prices.products, 799250: bad } } as Prices;
    expect(defaultProductFor(card('OP03-079_p4'), idx, changed)).toBeUndefined();
  }
  expect(printingFor({ ...card('OP03-079_p4'), series: ['622019'] })).toBeUndefined();
});

it('ne transfère pas le prix V.3 à une autre finition du même code', () => {
  for (const id of ['OP03-079_r1', 'OP03-079_p3', 'OP06-065_p1', 'OP06-065_p2', 'OP06-065_p4']) {
    expect([799250, 799370]).not.toContain(defaultProductFor(card(id), idx, prices)?.product.id);
  }
});

it('conserve les illustrations d’origine PRB quand les alternatives sont masquées', () => {
  const cards = catalogue.cards.filter((c) => ['OP03-079', 'OP06-065'].includes(c.code) && c.series.includes('622301'));
  const expected = ['OP03-079_r1', 'OP06-065_p1'];
  expect(applyFilters(cards, { ...DEFAULT_FILTERS, baseOnly: true }, ctx).map((c) => c.id)).toEqual(expected);
  expect(basePrintingsInSeries(cards).map((c) => c.id)).toEqual(expected);
  expect(applyFilters(cards, { ...DEFAULT_FILTERS, q: 'Vergo V.3' }, ctx).map((c) => c.id)).toEqual(['OP03-079_p4']);
  expect(applyFilters(cards, { ...DEFAULT_FILTERS, q: 'Niji Jolly Roger' }, ctx).map((c) => c.id)).toEqual(['OP06-065_p2']);
});

it('garde le comportement existant pour les séries non décrites', () => {
  const a = { id: 'OP99-001', code: 'OP99-001', variant: 0, variantKind: '', series: [] } as Card;
  const b = { ...a, id: 'OP99-001_p1', variant: 1, variantKind: 'p' };
  expect(basePrintingsInSeries([a, b])).toEqual([a]);
  expect(cardVariantLabel(b)).toBe('Alternative 1');
});

it('demande de choisir la finition premium même si la reconnaissance du code est bonne', () => {
  expect(requiresPrintingChoice(card('OP03-079_r1'), catalogue)).toBe(true);
  expect(requiresPrintingChoice(card('OP06-065_p3'), catalogue)).toBe(true);
  expect(requiresPrintingChoice(card('OP03-079_p1'), catalogue)).toBe(true); // ST19 peut précéder PRB dans le scan
  expect(requiresPrintingChoice(card('OP17-001'), catalogue)).toBe(false);
});

it('distingue toutes les impressions PRB, y compris les suffixes p/r de même rang', () => {
  for (const [series, total, bases] of [['622301', 319, 104], ['622302', 315, 173]] as const) {
    const cards = catalogue.cards.filter((c) => c.series.includes(series));
    expect(cards).toHaveLength(total);
    expect(cards.every((c) => printingFor(c))).toBe(true);
    const standard = basePrintingsInSeries(cards);
    expect(standard).toHaveLength(bases);
    expect(new Set(standard.map((c) => c.code)).size).toBe(bases);
    expect(applyFilters(cards, { ...DEFAULT_FILTERS, baseOnly: true }, ctx)).toEqual(standard);
    // Même résultat si l'ordre des cartes / suffixes est inversé.
    expect(basePrintingsInSeries([...cards].reverse()).map((c) => c.id).sort()).toEqual(standard.map((c) => c.id).sort());
  }
  expect(basePrintingsInSeries([card('EB01-009_p1'), card('EB01-009_r1')]).map((c) => c.id)).toEqual(['EB01-009_r1']);
  expect(basePrintingsInSeries([card('OP06-056_p4'), card('OP06-056_r2')]).map((c) => c.id)).toEqual(['OP06-056_r2']);
  expect(basePrintingsInSeries([card('OP01-016_p1')])).toEqual([]); // PRB01 : manga seulement
});

it('conserve les réimpressions des 22 decks dans le filtre de base', () => {
  for (const series of catalogue.series.filter((s) => s.kind === 'starter')) {
    const cards = catalogue.cards.filter((c) => c.series.includes(series.id));
    const bases = basePrintingsInSeries(cards);
    expect(bases.length, series.code).toBe(new Set(cards.map((c) => c.code)).size);
    expect(applyFilters(cards, { ...DEFAULT_FILTERS, baseOnly: true }, ctx)).toEqual(bases);
  }
});
