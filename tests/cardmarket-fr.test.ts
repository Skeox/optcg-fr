import { describe, it, expect } from 'vitest';
import { emptyPrices, mergePages, summarizeCardmarketPage, euroCents } from '../scripts/lib/cardmarket-fr-prices.mjs';
import { cardmarketFrenchQuote } from '../src/lib/cardmarket-fr';
import type { CmFrenchPrices } from '../src/types';

const at = '2026-10-30T10:00:00.000Z';
const now = new Date(at);
const target = { productId: 802859, code: 'OP09-001' };
const offer = (seller: string, price = '44,00 €') => ({ seller: `/fr/OnePiece/Users/${seller}`, price, language: 'Français', condition: 'NM', quantity: 1, extras: [], comment: '' });
const page = () => ({ ...target, at, url: 'https://www.cardmarket.com/fr/OnePiece/Products/Singles/Emperors-in-the-New-World/Shanks-OP09-001-V2?language=2', title: 'Shanks (OP09-001) (V.2)', hasMore: false,
  offers: [offer('a'), offer('b', '44,99 €'), offer('c', '44,99 €'), offer('d', '45,00 €'), offer('e', '45,00 €')] });

describe('collecte Cardmarket FR', () => {
  it('calcule 44,80 € avec cinq vendeurs, sans pondérer par le stock', () => {
    const p = page(); p.offers[0].quantity = 100;
    expect(summarizeCardmarketPage(p, target, now)).toMatchObject({ status: 'quoted', average: 44.8, sellers: 5, sample: [4400, 4499, 4499, 4500, 4500] });
  });
  it('déduplique les vendeurs et exclut langues, états, extras, lots et stocks invalides', () => {
    const p = page(); p.offers.push(offer('a', '50,00 €'), { ...offer('en', '0,01 €'), language: 'English' },
      { ...offer('ex', '0,01 €'), condition: 'EX' }, { ...offer('empty', '0,01 €'), quantity: 0 },
      { ...offer('lot', '0,01 €'), comment: 'Playset 4 cards' }, { ...offer('graded', '0,01 €'), extras: ['Signé'] } as never);
    expect(summarizeCardmarketPage(p, target, now).average).toBe(44.8);
    expect(summarizeCardmarketPage({ ...p, offers: Array(20).fill(offer('same', '10000,64 €')) }, target, now)).toMatchObject({ average: null, sellers: 1, status: 'insufficient' });
  });
  it('ne publie jamais un prix provenant du mauvais produit ou d’une page bloquée', () => {
    for (const changes of [{ productId: 123 }, { title: 'Autre carte (OP10-001)' }, { url: 'https://www.cardmarket.com/fr/OnePiece/Products?language=2' }, { offers: [] }, { hasMore: true, offers: [offer('a')] }]) {
      expect(() => summarizeCardmarketPage({ ...page(), ...changes }, target, now)).toThrow();
    }
  });
  it('conserve la dernière collecte lorsqu’un lot échoue et les produits non visités', () => {
    const old = mergePages(emptyPrices(), [page()], [target], now);
    expect(() => mergePages(old, [{ ...page(), offers: [] }], [target], now)).toThrow();
    expect(old.products[802859].average).toBe(44.8);
    const other = { productId: 123, code: 'OP09-001' };
    const updated = mergePages(old, [{ ...page(), productId: 123 }], [other], now);
    expect(Object.keys(updated.products)).toHaveLength(2);
  });
  it('distingue un manque d’offres vérifié d’un échec technique', () => {
    expect(summarizeCardmarketPage({ ...page(), offers: [offer('a')] }, target, now).status).toBe('insufficient');
    expect(summarizeCardmarketPage({ ...page(), offers: [], emptyConfirmed: true }, target, now).average).toBeNull();
  });
  it('lit les euros sans confondre devise, séparateurs et prix nul', () => {
    expect(euroCents('1 234,56 €')).toBe(123456);
    for (const text of ['0,00 €', '1,25 $', '12abc €', '1,234.56 €', 'NaN €']) expect(euroCents(text)).toBeNull();
  });
});

it('la valorisation refuse les relevés anciens, autres sources et moyennes incohérentes', () => {
  const data = mergePages(emptyPrices(), [page()], [target], now) as CmFrenchPrices;
  expect(cardmarketFrenchQuote(data, 802859, now.getTime())?.average).toBe(44.8);
  expect(cardmarketFrenchQuote(data, 802858, now.getTime())).toBeUndefined();
  expect(cardmarketFrenchQuote(data, 802859, now.getTime() + 46 * 86_400_000)).toBeUndefined();
  expect(cardmarketFrenchQuote({ ...data, source: 'cardtrader' } as never, 802859, now.getTime())).toBeUndefined();
  data.products[802859].average = 10000;
  expect(cardmarketFrenchQuote(data, 802859, now.getTime())).toBeUndefined();
});
