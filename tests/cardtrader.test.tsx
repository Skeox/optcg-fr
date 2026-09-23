// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { DataProvider, useData } from '../src/data/catalogue';
import { db } from '../src/db';
import { cardTraderQuote } from '../src/lib/cardtrader';
import { summarizeFrenchOffers } from '../scripts/lib/cardtrader-prices.mjs';
import type { Card, Catalogue, Prices, PricesFr } from '../src/types';

const card = { id: 'OP09-001', code: 'OP09-001', variant: 0, series: ['OP09'] } as Card;
const quote = { at: '2026-09-23', n: 3, from: 0.15, med: 1, nm: 2 };
const prices: PricesFr = { source: 'cardtrader', currency: 'EUR', updatedAt: '2026-09-23', products: { '123': quote } };
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.delete(); });

it('retient le minimum CardTrader plutôt que la médiane ou le prix NM', () => {
  expect(cardTraderQuote(prices, 123)?.from).toBe(0.15);
  expect(cardTraderQuote({ ...prices, currency: 'USD' }, 123)).toBeUndefined();
  expect(cardTraderQuote({ ...prices, source: 'cardmarket' } as unknown as PricesFr, 123)).toBeUndefined();
  expect(cardTraderQuote(prices, 999)).toBeUndefined();
  for (const from of [null, 0, -1, NaN, Infinity]) {
    expect(cardTraderQuote({ ...prices, products: { '123': { ...quote, from } } }, 123)).toBeUndefined();
  }
  expect(cardTraderQuote({ ...prices, products: { '123': { ...quote, n: 0 } } }, 123)).toBeUndefined();
});

it('exclut les autres langues, devises, lots et annonces indisponibles du minimum', () => {
  const offer = { properties_hash: { onepiece_language: 'fr', condition: 'Lightly Played' }, quantity: 2, price: { cents: 15, currency: 'EUR' }, bundle_size: 1 };
  const cheap = { ...offer, price: { cents: 1, currency: 'EUR' } };
  const result = summarizeFrenchOffers([
    offer, { ...offer, price: { cents: 100, currency: 'EUR' }, properties_hash: { onepiece_language: 'fr', condition: 'Near Mint' } },
    { ...cheap, properties_hash: { onepiece_language: 'en' } }, { ...cheap, properties_hash: {} },
    { ...cheap, price: { cents: 1, currency: 'USD' } }, { ...cheap, quantity: 0 },
    { ...cheap, on_vacation: true }, { ...cheap, graded: true }, { ...cheap, bundle_size: 4 },
  ], '2026-09-23');
  expect(result).toMatchObject({ from: 0.15, n: 4, nm: 1, at: '2026-09-23' });
  expect(summarizeFrenchOffers([{ ...cheap, properties_hash: {} }], '2026-09-23')).toBeUndefined();
});

it('alimente les prix et instantanés avec CardTrader sans réutiliser les saisies Cardmarket', async () => {
  await db.open();
  await db.vfPrices.put({ cardId: card.id, price: 999, date: '2026-09-22' });
  await db.collection.put({ cardId: card.id, qty: 2, updatedAt: Date.now() });
  const cat = { cards: [card], series: [{ id: 'OP09', cm: [1] }] } as Catalogue;
  const cm = { products: { '123': { id: 123, code: card.code, exp: 1, version: 1, low: 0.01, trend: 999 } }, byCode: { [card.code]: [123] } } as unknown as Prices;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('cards.json') ? cat : url.endsWith('prices-fr.json') ? prices : url.endsWith('prices.json') ? cm : { dates: [] } })));
  function Probe() { const { priceFor } = useData(); return <output>{priceFor(card) ?? 'absent'}</output>; }
  render(<DataProvider><Probe /></DataProvider>);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('0.15'));
  await waitFor(async () => expect((await db.snapshots.get('cardtrader|123|2026-09-23'))?.ctFr).toBe(0.15));
  expect((await db.vfPrices.get(card.id))?.price).toBe(999);
});
