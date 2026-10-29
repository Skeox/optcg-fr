// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MemoryRouter } from 'react-router';
import { addCards, db, removeCards, setQty } from '../src/db';
import Cards from '../src/pages/Cards';
import { CardGrid } from '../src/components/ui';
import { useData } from '../src/data/catalogue';

vi.mock('../src/lib/hooks', () => ({ useKeep: () => 1 }));
vi.mock('../src/data/catalogue', () => ({
  imageUrl: () => '/test.webp',
  useData: () => ({
    catalogue: {
      cards: [1, 2, 3].map((n) => ({ id: `OP09-00${n}`, code: `OP09-00${n}`, name: `Carte ${n}`, series: [n === 3 ? 'OP10' : 'OP09'], colors: ['Rouge'], rarity: 'R', variant: 0, traits: [], effect: '' })),
      series: [{ id: 'OP09', code: 'OP09', name: 'Série neuf' }, { id: 'OP10', code: 'OP10', name: 'Série dix' }],
    },
    owned: new Map((useLiveQuery(() => db.collection.toArray(), [], [])).map((entry) => [entry.cardId, entry])), priceFor: () => 1, priceKind: () => 'vf', manualFr: new Map(), quoteFor: () => undefined,
  }),
}));
beforeEach(async () => { await db.open(); });
afterEach(async () => { cleanup(); vi.restoreAllMocks(); await db.delete(); });

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

it('retire une fois chaque carte possédée, sans quantité négative, en conservant les notes et la sauvegarde', async () => {
  await setQty('OP09-001', 2, 'À conserver');
  await setQty('OP09-002', 1);
  await db.pendingChanges.clear();
  expect(await removeCards(['OP09-001', 'OP09-002', 'OP09-001', 'OP09-003'])).toBe(2);
  expect(await db.collection.get('OP09-001')).toMatchObject({ qty: 1, note: 'À conserver' });
  expect(await db.collection.get('OP09-002')).toBeUndefined();
  expect(await db.collection.get('OP09-003')).toBeUndefined();
  expect((await db.pendingChanges.toArray()).map((row) => row.change)).toEqual([
    expect.objectContaining({ cardId: 'OP09-001', delta: -1 }),
    expect.objectContaining({ cardId: 'OP09-002', delta: -1 }),
  ]);
});

it('annule aussi les retraits et leur sauvegarde si une carte du lot est invalide', async () => {
  await setQty('OP09-001', 1);
  await db.pendingChanges.clear();
  await expect(removeCards(['OP09-001', 'invalide'])).rejects.toThrow();
  expect(await db.collection.get('OP09-001')).toMatchObject({ qty: 1 });
  expect(await db.pendingChanges.count()).toBe(0);
});

it('retire la sélection même si elle contient des cartes non possédées', async () => {
  await setQty('OP09-001', 2);
  await setQty('OP09-002', 1);
  render(<MemoryRouter><Cards /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sélection', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Tout sélectionner (3 résultats)' }));
  const remove = screen.getByRole('button', { name: 'Retirer la sélection (3)' });
  await waitFor(() => expect((remove as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(remove);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('2 exemplaire(s) retiré(s)'));
  expect(await db.collection.get('OP09-001')).toMatchObject({ qty: 1 });
  expect(await db.collection.get('OP09-002')).toBeUndefined();
  expect(await db.collection.get('OP09-003')).toBeUndefined();
});

it('met à jour le compteur sous la carte sans navigation ni changement de sélection', async () => {
  render(<MemoryRouter><Cards /></MemoryRouter>);
  const control = within(screen.getByRole('group', { name: 'Quantité dans la collection de Carte 1 (OP09-001)' }));
  const minus = control.getByRole('button', { name: /Retirer/ }) as HTMLButtonElement;
  const plus = control.getByRole('button', { name: /Ajouter/ }) as HTMLButtonElement;
  expect(minus.disabled).toBe(true);
  expect(plus.closest('a')).toBeNull();
  fireEvent.click(plus);
  await waitFor(() => expect(control.getByText('1')).toBeTruthy());
  fireEvent.click(screen.getByRole('button', { name: 'Sélection', exact: true }));
  const tile = screen.getByRole('button', { name: 'Sélectionner Carte 1 (OP09-001)' });
  fireEvent.click(tile);
  await waitFor(() => expect(minus.disabled).toBe(false));
  fireEvent.click(minus);
  await waitFor(() => expect(control.getByText('0')).toBeTruthy());
  expect(minus.disabled).toBe(true);
  expect(tile.getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('button', { name: 'Retirer la sélection (1)' }) as HTMLButtonElement).disabled).toBe(true);
  expect(await db.collection.get('OP09-001')).toBeUndefined();
});

it('conserve la sélection et les quantités si le retrait échoue', async () => {
  await setQty('OP09-001', 2);
  render(<MemoryRouter><Cards /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Sélection', exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Sélectionner Carte 1 (OP09-001)' }));
  const remove = screen.getByRole('button', { name: 'Retirer la sélection (1)' }) as HTMLButtonElement;
  await waitFor(() => expect(remove.disabled).toBe(false));
  vi.spyOn(db.pendingChanges, 'add').mockRejectedValueOnce(new Error('Stockage indisponible'));
  fireEvent.click(remove);
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Retrait impossible. Votre sélection est conservée'));
  expect(screen.getByRole('button', { name: 'Sélectionner Carte 1 (OP09-001)' }).getAttribute('aria-pressed')).toBe('true');
  expect(await db.collection.get('OP09-001')).toMatchObject({ qty: 2 });
  expect(remove.disabled).toBe(false);
});

it('signale un échec du compteur et permet de réessayer sans afficher une fausse quantité', async () => {
  render(<MemoryRouter><Cards /></MemoryRouter>);
  const control = within(screen.getByRole('group', { name: 'Quantité dans la collection de Carte 1 (OP09-001)' }));
  const plus = control.getByRole('button', { name: /Ajouter/ }) as HTMLButtonElement;
  vi.spyOn(db.pendingChanges, 'add').mockRejectedValueOnce(new Error('Stockage indisponible'));
  fireEvent.click(plus);
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Modification impossible'));
  expect(control.getByText('0')).toBeTruthy();
  expect(plus.disabled).toBe(false);
  fireEvent.click(plus);
  await waitFor(() => expect(control.getByText('1')).toBeTruthy());
  expect(screen.queryByRole('alert')).toBeNull();
});

it('garde les cartes supplémentaires affichées après une modification de quantité', async () => {
  function PaginatedCards() {
    const { catalogue } = useData();
    return <CardGrid cards={catalogue!.cards} pageSize={2} quantityControls />;
  }
  render(<MemoryRouter><PaginatedCards /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Afficher plus (1 restantes)' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajouter un exemplaire de Carte 3 (OP09-003)' }));
  await waitFor(() => expect(within(screen.getByRole('group', { name: 'Quantité dans la collection de Carte 3 (OP09-003)' })).getByText('1')).toBeTruthy());
  expect(screen.getAllByRole('link')).toHaveLength(3);
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
