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
  it('exige le numéro et l’édition affichés pour le titre erroné de Koala ST35', () => {
    const koala = { productId: 900561, code: 'OP13-081' };
    const observation = { ...page(), productId: koala.productId,
      url: 'https://www.cardmarket.com/fr/OnePiece/Products/Singles/Starter-Deck-RedBlack-Sabo/Koala-OP13-019?language=2',
      title: 'Koala (OP13-019)\nStarter Deck: Red/Black Sabo - Cartes',
      cardNumber: 'OP13-081', expansionName: 'Starter Deck: Red/Black Sabo' };
    expect(summarizeCardmarketPage(observation, koala, now).status).toBe('quoted');
    for (const changes of [{ cardNumber: undefined }, { cardNumber: 'OP13-019' },
      { expansionName: 'Carrying on his Will' }, { title: 'Sabo (OP13-019)' }, { productId: 900560 },
      { url: observation.url.replace('language=2', 'language=1') },
      { url: observation.url.replace('Koala-OP13-019', 'Sabo-OP13-019') }]) {
      expect(() => summarizeCardmarketPage({ ...observation, ...changes }, koala, now)).toThrow();
    }
    expect(() => summarizeCardmarketPage(observation, { ...koala, productId: 900560 }, now)).toThrow();
    expect(() => summarizeCardmarketPage(observation, { ...koala, code: 'OP13-082' }, now)).toThrow();
  });
  it('accepte les espaces autour du code exact sans accepter les codes voisins', () => {
    const uta = { productId: 794639, code: 'ST11-001' };
    const observation = { ...page(), productId: uta.productId,
      url: 'https://www.cardmarket.com/fr/OnePiece/Products/Singles/Starter-Deck-Green-Uta/Uta-ST11-001?language=2',
      title: 'Uta ( ST11-001)\nStarter Deck: Green Uta - Cartes' };
    expect(summarizeCardmarketPage(observation, uta, now).status).toBe('quoted');
    for (const title of ['Uta ( ST11-0010)', 'Uta ( ST11-002)', 'Uta ( ST11-001 / ST11-002)', 'Uta ST11-001']) {
      expect(() => summarizeCardmarketPage({ ...observation, title }, uta, now)).toThrow();
    }
  });
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
  it('exclut les annonces PCA et CCC même déclarées NM ou MT sans attribut spécial', () => {
    const p = page();
    p.offers = [offer('raw'), ...['PCA 10', 'CCC 9.5', 'CCC 9,5', 'Unique 9 CCC de France.'].map((comment, i) =>
      ({ ...offer(`graded${i}`, '0,01 €'), condition: i % 2 ? 'MT' : 'NM', comment }))];
    expect(summarizeCardmarketPage(p, target, now)).toMatchObject({ status: 'insufficient', average: null, sellers: 1, sample: [4400] });
  });
  it('ne complète pas cinq vendeurs avec une annonce gradée, même sans espace avant la note', () => {
    for (const comment of ['Bgs10', 'PSA10', 'PCA9.5', 'PG10 : 9-10-9.5-10', 'CollectAura 9, open on trades', 'Collect Aura 9.5', 'CollectAura10', 'BECKETTE 9.5']) {
      const p = page();
      p.offers[4].comment = comment;
      expect(summarizeCardmarketPage(p, target, now)).toMatchObject({ status: 'insufficient', average: null, sellers: 4 });
    }
  });
  it('exclut une mention explicite d’encre sans exclure un mot contenant ink', () => {
    const p = page();
    p.offers[4].comment = 'UGRed-Foreign - ink';
    expect(summarizeCardmarketPage(p, target, now)).toMatchObject({ status: 'insufficient', average: null, sellers: 4 });
    p.offers[4].comment = 'Pink sleeve';
    expect(summarizeCardmarketPage(p, target, now).sellers).toBe(5);
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
    expect(euroCents('1.500,00 €')).toBe(150000);
    expect(euroCents('12.345.678,90 €')).toBe(1234567890);
    expect(euroCents('12.50 €')).toBe(1250);
    for (const text of ['0,00 €', '1,25 $', '12abc €', '1,234.56 €', '12.34,56 €', '1.23.456,78 €', 'NaN €']) expect(euroCents(text)).toBeNull();
  });
  it('conserve les offres françaises au-dessus de mille euros dans les cinq vendeurs', () => {
    const p = page();
    p.offers = ['900,00 €', '1.000,00 €', '1.250,00 €', '1.500,00 €', '3.000,00 €', '4.000,00 €']
      .map((price, i) => offer(`seller${i}`, price));
    expect(summarizeCardmarketPage(p, target, now)).toMatchObject({ status: 'quoted', average: 1530,
      sellers: 5, sample: [90000, 100000, 125000, 150000, 300000] });
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
