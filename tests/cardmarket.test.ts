import { expect, it } from 'vitest';
import { buildIndexes, defaultProductFor } from '../src/lib/cardmarket';
import type { Card, Catalogue, CmProduct, Prices, Series } from '../src/types';

const base = { id: 'OP09-001', code: 'OP09-001', variant: 0, series: ['OP09'] } as Card;
const alt = { ...base, id: 'OP09-001_p1', variant: 1, variantKind: 'p' };
const series = [{ id: 'OP09', cm: [5755] }, { id: 'PRB', cm: [999] }] as Series[];
const product = { id: 100, code: base.code, exp: 5755, version: 1, foreign: false } as CmProduct;
function resolve(card: Card, cards: Card[], products: CmProduct[]) {
  const idx = buildIndexes({ cards, series } as Catalogue);
  const prices = { products: Object.fromEntries(products.map((p) => [p.id, p])), byCode: { [base.code]: products.map((p) => p.id) } } as Prices;
  return defaultProductFor(card, idx, prices);
}

it('ne confond pas deux variantes même si leur nombre est identique dans les deux catalogues', () => {
  const products = [product, { ...product, id: 200, version: 2 }];
  for (const card of [base, alt]) expect(resolve(card, [base, alt], products)).toBeUndefined();
});

it('ne rabat pas une alternative sans correspondance sur la version standard', () => {
  expect(resolve(alt, [base, alt], [product])).toBeUndefined();
});

it('accepte une seule variante et un seul produit de la même édition', () => {
  expect(resolve(base, [base], [product])).toEqual({ product, sure: true });
});

it('refuse une autre édition, un produit étranger ou un code incohérent', () => {
  for (const p of [{ ...product, exp: 999 }, { ...product, foreign: true }, { ...product, code: 'OP09-002' }]) {
    expect(resolve(base, [base], [p])).toBeUndefined();
  }
  expect(resolve({ ...base, series: [] }, [base], [product])).toBeUndefined();
});

it('ne choisit pas arbitrairement la première édition quand plusieurs sont possibles', () => {
  const card = { ...base, series: ['OP09', 'PRB'] };
  expect(resolve(card, [card], [product, { ...product, id: 200, exp: 999 }])).toBeUndefined();
});
