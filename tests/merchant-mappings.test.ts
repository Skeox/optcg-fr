import { expect, it } from 'vitest';
import catalogueData from '../public/data/cards.json';
import pricesData from '../public/data/prices.json';
import merchantData from '../public/data/cardtrader-catalogue.json';
import type { Catalogue, Prices, PricesFr } from '../src/types';
import { buildIndexes, defaultProductFor } from '../src/lib/cardmarket';
import { quoteForPrinting } from '../src/lib/cardtrader';
import { blueprintFor } from '../src/lib/merchant-mappings';
import { mappedProductIds } from '../scripts/lib/cardtrader-mapping.mjs';

const catalogue = catalogueData as Catalogue;
const prices = pricesData as Prices;
const idx = buildIndexes(catalogue);
const card = (id: string) => idx.byId.get(id)!;
const product = (id: string) => defaultProductFor(card(id), idx, prices)?.product.id;

it('sépare Jolly Roger, illustration étendue, Pirate Foil et impression ordinaire', () => {
  expect(product('OP03-079_p3')).toBe(799249);
  expect(product('OP03-079_p4')).toBe(799250);
  expect(product('OP06-065_p2')).toBe(799369);
  expect(product('OP06-065_p3')).toBe(799370);
  expect(product('EB01-009_r1')).toBe(852302);
  expect(product('EB01-009_p1')).toBe(852303);
});

it('ne confond ni une métadonnée de finition absente, ni le manga rouge, ni le tampon Winner', () => {
  expect(product('OP01-024_p1')).toBeUndefined();
  expect(product('OP01-024_p2')).toBe(799192);
  expect(product('OP13-119_p2')).toBe(857346);
  expect(product('OP13-119_p3')).toBe(857347);
  expect(product('OP02-022_p1')).toBe(794682);
  expect(product('OP02-022_p2')).toBe(794683);
  // Illustration identique, mais la promo d'origine ne prouve pas le deck non foil.
  expect(product('P-105')).toBeUndefined();
});

it('permet le prix exact de Vergo standard sans lui inventer un produit Cardmarket', () => {
  expect(product('OP03-079_r1')).toBeUndefined();
  expect(blueprintFor(card('OP03-079_r1'))).toBe(310673);
});

it('prend uniquement les annonces de la fiche vérifiée et de la langue demandée', () => {
  const c = card('OP03-079_p4');
  const quote = { at: '2026-10-16', n: 2, from: 7.89, med: 8, nm: 8,
    mapping: { kind: 'cardtrader-blueprint' as const, blueprintId: 308964 } };
  const data: PricesFr = { source: 'cardtrader', currency: 'EUR', updatedAt: quote.at,
    products: { 799250: { ...quote, from: 99 } }, blueprints: { fr: { 308964: quote } } };
  expect(quoteForPrinting(data, c, 799250)?.from).toBe(7.89);
  expect(quoteForPrinting(data, c, 799250, 'en')).toBeUndefined();
  expect(quoteForPrinting({ ...data, blueprints: { fr: {} } }, c, 799250)).toBeUndefined();
  expect(quoteForPrinting({ ...data, blueprints: { fr: { 308964: { ...quote,
    mapping: { kind: 'cardtrader-blueprint', blueprintId: 308972 } } } } }, c, 799250)).toBeUndefined();
});

it('refuse les mauvais codes marchands et limite les corrections aux produits relus', () => {
  // Charlotte Brûlée PRB02 pointe aussi vers ST07-007 au lieu de ST20-003.
  expect(mappedProductIds(merchantData.blueprints.find((b) => b.id === 351519)!, prices.products)).toEqual([]);
  const shanks = merchantData.blueprints.find((b) => b.id === 313145)!;
  expect(shanks.fixed_properties.collector_number).toBe('OP09-088a');
  expect(mappedProductIds(shanks, prices.products)).toContain(802864);
  expect(mappedProductIds({ ...shanks, card_market_ids: [802863] }, prices.products)).toEqual([]);
});
