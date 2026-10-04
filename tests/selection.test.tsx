// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { addCards, db, setQty } from '../src/db';
import Cards from '../src/pages/Cards';

vi.mock('../src/lib/hooks', () => ({ useKeep: () => 1 }));
vi.mock('../src/data/catalogue', () => ({
  imageUrl: () => '/test.webp',
  useData: () => ({
    catalogue: {
      cards: [1, 2, 3].map((n) => ({ id: `OP09-00${n}`, code: `OP09-00${n}`, name: `Carte ${n}`, series: [n === 3 ? 'OP10' : 'OP09'], colors: ['Rouge'], rarity: 'R', variant: 0, traits: [], effect: '' })),
      series: [{ id: 'OP09', code: 'OP09', name: 'Série neuf' }, { id: 'OP10', code: 'OP10', name: 'Série dix' }],
    },
    owned: new Map(), priceFor: () => 1, priceKind: () => 'vf',
  }),
}));
beforeEach(async () => { await db.open(); });
afterEach(async () => { cleanup(); await db.delete(); });

it('ajoute une fois chaque carte et préserve quantités, notes et opérations de sauvegarde', async () => {
  await setQty('OP09-001', 2, 'À conserver');
  await db.pendingChanges.clear();
  await addCards(['OP09-001', 'OP09-002', 'OP09-001']);
  expect(await db.collection.get('OP09-001')).toMatchObject({ qty: 3, note: 'À conserver' });
  expect(await db.collection.get('OP09-002')).toMatchObject({ qty: 1 });
  expect((await db.pendingChanges.toArray()).map((row) => row.change)).toEqual([
    expect.objectContaining({ cardId: 'OP09-001', delta: 1 }),
    expect.objectContaining({ cardId: 'OP09-002', delta: 1 }),
  ]);
});

it('annule tout le lot si une carte ne peut pas être ajoutée', async () => {
  await expect(addCards(['OP09-001', 'invalide'])).rejects.toThrow();
  expect(await db.collection.count()).toBe(0);
  expect(await db.pendingChanges.count()).toBe(0);
});

it('sélectionne les résultats filtrés, conserve la sélection en changeant de série et ajoute le lot', async () => {
  render(<MemoryRouter><Cards /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sélection', exact: true }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Série', exact: true }), { target: { value: 'OP09' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner (2 résultats)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Carte 2 (OP09-002)' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Série', exact: true }), { target: { value: 'OP10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Carte 3 (OP09-003)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter la sélection (2)' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 carte(s) ajoutée(s)'));
  expect((await db.collection.toArray()).map((row) => row.cardId)).toEqual(['OP09-001', 'OP09-003']);
  expect(screen.getByRole('button', { name: 'Sélection', exact: true })).toBeTruthy();
});

it('permet de désélectionner et d’annuler sans ajouter de cartes', async () => {
  render(<MemoryRouter><Cards /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sélection', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner (3 résultats)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Tout désélectionner' }));
  expect((screen.getByRole('button', { name: 'Ajouter la sélection (0)' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Annuler la sélection' }));
  expect(screen.getAllByRole('link')).toHaveLength(3);
  expect(await db.collection.count()).toBe(0);
});
