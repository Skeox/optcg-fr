// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import CardDetail from '../src/pages/CardDetail';
import { DataProvider } from '../src/data/catalogue';
import { db } from '../src/db';
import type { Card, CmProduct } from '../src/types';
import { productUrl, searchUrl } from '../src/lib/cardmarket';
import { applyFilters, DEFAULT_FILTERS } from '../src/lib/filters';

afterEach(async () => { cleanup(); vi.unstubAllGlobals(); await db.delete(); });

it('utilise les identifiants officiels sans inventer de slug ou de numéro de version', () => {
  const product = { id: 802858, name: 'Nom avec ponctuation !', expSlug: 'incorrect', version: 99, code: 'OP09-001' } as CmProduct;
  expect(productUrl(product)).toBe('https://www.cardmarket.com/fr/OnePiece/Products?idProduct=802858&language=2');
  expect(productUrl({ ...product, expSlug: null })).toBe(productUrl(product));
  expect(productUrl({ ...product, id: 0 })).toBe(searchUrl(product.code));
});

it('ouvre toute la fiche de la variante puis revient à la précédente sans modifier les associations', async () => {
  const scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
  await db.open();
  const card = { id: 'OP09-001', code: 'OP09-001', name: 'Shanks', variant: 0, variantKind: '', series: ['OP09'], colors: ['red'], type: 'LEADER', rarity: 'L', traits: [], effect: 'Effet de base' } as unknown as Card;
  const alt = { ...card, id: 'OP09-001_p1', variant: 1, variantKind: 'p', effect: 'Effet alternatif' };
  const cat = { cards: [card, alt], series: [{ id: 'OP09', code: 'OP09', name: 'Empereurs', cm: [5755] }] };
  const cm = { products: { '802858': { id: 802858, code: card.code, exp: 5755, expName: 'Empereurs', version: 1 }, '802859': { id: 802859, code: card.code, exp: 5755, expName: 'Empereurs', version: 2 } }, byCode: { [card.code]: [802858, 802859] } };
  const quote = { at: '2026-10-08', n: 1, from: 10, med: 10, nm: 10 };
  const prices = { source: 'cardtrader', currency: 'EUR', products: { '802858': quote, '802859': { ...quote, from: 50 } } };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('cards.json') ? cat : url.endsWith('prices-fr.json') ? prices : url.endsWith('prices.json') ? cm : { dates: [] } })));
  await db.collection.put({ cardId: card.id, qty: 2, updatedAt: Date.now() });
  const router = createMemoryRouter([{ path: '/carte/:id', element: <DataProvider><CardDetail /></DataProvider> }], { initialEntries: ['/carte/OP09-001'] });
  render(<RouterProvider router={router} />);
  await screen.findByText('Effet de base');
  await waitFor(() => expect(screen.getByRole('link', { name: /Prix sur Cardmarket/ }).getAttribute('href')).toContain('802858'));
  expect(screen.getAllByRole('img')[0].getAttribute('src')).toContain('OP09-001.webp');
  // A failed image in one version must not hide the next version's image.
  fireEvent.error(screen.getAllByRole('img')[0]);
  fireEvent.click(screen.getByRole('link', { name: 'Ouvrir Shanks — OP09-001_p1' }));
  await screen.findByText('Effet alternatif');
  expect(router.state.location.pathname).toBe('/carte/OP09-001_p1');
  expect(screen.getAllByRole('img')[0].getAttribute('src')).toContain('OP09-001_p1.webp');
  expect(screen.getByRole('link', { name: /Prix sur Cardmarket/ }).getAttribute('href')).toContain('802859');
  expect(screen.getAllByLabelText(/Version française/)[0].textContent).toContain('50');
  expect((screen.getByRole('button', { name: 'Retirer un exemplaire' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemplaire' }));
  await waitFor(async () => expect((await db.collection.get(alt.id))?.qty).toBe(1));
  expect((await db.collection.get(card.id))?.qty).toBe(2);
  expect(await db.overrides.count()).toBe(0);
  expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' });
  fireEvent.click(screen.getByRole('button', { name: '‹ Retour' }));
  await screen.findByText('Effet de base');
  expect(router.state.location.pathname).toBe('/carte/OP09-001');
  expect(screen.getAllByRole('img')[0].getAttribute('src')).toContain('OP09-001.webp');
  expect(screen.getAllByLabelText(/Version française/)[0].textContent).toContain('10');
  expect(screen.queryByText(/choisir celui qui correspond/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le prix manuellement' }));
  fireEvent.change(screen.getByLabelText('Prix manuel en €'), { target: { value: '12,50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  await screen.findByLabelText(/Prix manuel : 12,50/);
  expect((await db.vfPrices.get(card.id))?.price).toBe(12.5);
  expect((await db.pendingChanges.toArray()).some((c) => c.change.kind === 'price')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Modifier le prix manuellement' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revenir au prix automatique' }));
  await waitFor(() => expect(screen.queryByLabelText(/Prix manuel/)).toBeNull());
  expect(await db.vfPrices.get(card.id)).toBeUndefined();
});

it('filtre selon le prix retenu et conserve les cartes possédées sans prix', () => {
  const cards = ['OP09-001', 'OP09-002', 'OP09-003'].map((id) => ({ id, variant: 0 } as Card));
  const ctx = { qty: () => 1, keep: 1, price: (c: Card) => c.id === 'OP09-003' ? null : 12.5 };
  expect(applyFilters(cards, { ...DEFAULT_FILTERS, owning: 'possedees', unpriced: true }, ctx)).toEqual([cards[2]]);
});
