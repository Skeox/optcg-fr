// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BackupProvider, useBackup } from '../src/data/backup';
import { addQty, db } from '../src/db';
import { applyChange, emptyCloudData, type CloudSnapshot, type PendingChange } from '../src/lib/backup-model';

let remote: CloudSnapshot;
let seen: Set<string>;
const code = 'OP17-001';
const receive = async (ops: PendingChange[]) => {
  for (const op of ops) if (!seen.has(op.id)) { applyChange(remote.data, op.change); seen.add(op.id); remote.revision++; }
  return structuredClone(remote);
};

vi.mock('../src/lib/backup-sync', async (original) => ({
  ...await original<typeof import('../src/lib/backup-sync')>(),
  transportFor: () => ({ owner: 'test-vault', exchange: receive }),
  requestBackup: async () => ({ ...structuredClone(remote), owner: 'test-vault' }),
}));

function Controls() {
  const backup = useBackup();
  return <><button onClick={() => backup.connect('https://backup.example', 'private-test-key-with-32-characters')}>Connecter</button><span>{backup.phase}:{backup.pending}</span></>;
}

beforeEach(async () => {
  remote = { revision: 0, updatedAt: null, data: emptyCloudData() };
  seen = new Set();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  await db.delete(); await db.open();
});
afterEach(async () => { cleanup(); await db.delete(); });

it('envoie automatiquement chaque ajout, reprend au retour du réseau puis restaure après nettoyage', async () => {
  const first = render(<BackupProvider><Controls /></BackupProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Connecter' }));
  await waitFor(() => expect(screen.getByText('saved:0')).toBeTruthy());
  await act(async () => { await addQty(code, 3); });
  await waitFor(() => expect(remote.data.collection[code]?.qty).toBe(3));
  await waitFor(() => expect(screen.getByText('saved:0')).toBeTruthy());

  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  await act(async () => { await addQty(code, 2); });
  await waitFor(() => expect(screen.getByText('waiting:1')).toBeTruthy());
  expect(remote.data.collection[code].qty).toBe(3);
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  fireEvent(window, new Event('online'));
  await waitFor(() => expect(remote.data.collection[code]?.qty).toBe(5));
  await waitFor(() => expect(screen.getByText('saved:0')).toBeTruthy());
  first.unmount();

  await db.delete(); await db.open();
  render(<BackupProvider><Controls /></BackupProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Connecter' }));
  await waitFor(() => expect(screen.getByText('saved:0')).toBeTruthy());
  expect((await db.collection.get(code))?.qty).toBe(5);
  expect(remote.data.collection[code].qty).toBe(5);
}, 10_000);
