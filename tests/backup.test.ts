import 'fake-indexeddb/auto';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createClient, type Client } from '@libsql/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addQty, db, setQty, saveOverride, saveVfPrice, clearCollection, importBackup, exportBackup } from '../src/db';
import { syncBackup, type BackupTransport } from '../src/lib/backup-sync';
import { emptyCloudData, type PendingChange } from '../src/lib/backup-model';
import { exchange } from '../server/store';
import { backupHandler } from '../server/http';

let client: Client;
let transport: BackupTransport;
const code = 'OP17-001';
const quantity = (delta: number): PendingChange => ({ id: randomUUID(), change: { kind: 'quantity', cardId: code, delta, at: Date.now() } });
const serverQty = async () => (await exchange(client, [])).data.collection[code]?.qty ?? 0;
const localQty = async () => (await db.collection.get(code))?.qty ?? 0;

beforeEach(async () => {
  vi.stubGlobal('CustomEvent', class extends Event {});
  await db.delete();
  await db.open();
  client = createClient({ url: ':memory:' });
  await client.executeMultiple(readFileSync('server/schema.sql', 'utf8'));
  const remote = await exchange(client, []);
  transport = { owner: remote.owner, exchange: (ops) => exchange(client, ops) };
});
afterEach(async () => { client.close(); await db.delete(); vi.unstubAllGlobals(); });

describe('Sauvegarde locale et restauration externe', () => {
  it('restaure une base locale vide sans écraser les cartes distantes', async () => {
    await exchange(client, [quantity(5)]);
    await syncBackup(transport);
    expect(await localQty()).toBe(5);
    expect(await serverQty()).toBe(5);
    expect(await db.pendingChanges.count()).toBe(0);
  });

  it('ne double pas une collection ancienne déjà présente dans le cloud', async () => {
    await db.collection.put({ cardId: code, qty: 5, updatedAt: Date.now() });
    await exchange(client, [quantity(5)]);
    await syncBackup(transport);
    expect(await serverQty()).toBe(5);
  });

  it('conserve un nouvel ajout fait après nettoyage avant la reconnexion', async () => {
    await exchange(client, [quantity(5)]);
    await addQty(code, 1);
    await syncBackup(transport);
    expect(await localQty()).toBe(6);
    expect(await db.pendingChanges.count()).toBe(1);
    await syncBackup(transport);
    expect(await serverQty()).toBe(6);
  });

  it('journalise les ajouts simultanés sans perdre de clic et migre les anciennes cartes', async () => {
    await db.collection.put({ cardId: code, qty: 3, updatedAt: Date.now() });
    await Promise.all(Array.from({ length: 15 }, () => addQty(code, 1)));
    expect(await localQty()).toBe(18);
    expect(await db.pendingChanges.count()).toBe(15);
    await syncBackup(transport);
    await syncBackup(transport);
    expect(await serverQty()).toBe(18);
    expect(await db.pendingChanges.count()).toBe(0);
  });

  it('ne compte pas deux fois un ajout si la réponse réseau est perdue après écriture', async () => {
    await syncBackup(transport);
    await addQty(code, 2);
    await expect(syncBackup({ ...transport, exchange: async (ops) => { await exchange(client, ops); throw new Error('Network lost'); } })).rejects.toThrow('Network lost');
    expect(await db.pendingChanges.count()).toBe(1);
    expect(await serverQty()).toBe(2);
    await syncBackup(transport);
    expect(await serverQty()).toBe(2);
    expect(await localQty()).toBe(2);
    expect(await db.pendingChanges.count()).toBe(0);
  });

  it('conserve les modifications locales faites pendant une requête', async () => {
    await syncBackup(transport);
    await addQty(code, 2);
    await syncBackup({ ...transport, exchange: async (ops) => {
      const saved = await exchange(client, ops);
      await addQty(code, 3);
      return saved;
    } });
    expect(await localQty()).toBe(5);
    expect(await serverQty()).toBe(2);
    await syncBackup(transport);
    expect(await serverQty()).toBe(5);
  });

  it('additionne les ajouts de deux appareils et synchronise un retrait à zéro', async () => {
    await syncBackup(transport);
    await addQty(code, 2);
    await exchange(client, [quantity(3)]);
    await syncBackup(transport);
    expect(await localQty()).toBe(5);
    await setQty(code, 0);
    await syncBackup(transport);
    expect(await serverQty()).toBe(0);
    expect(await localQty()).toBe(0);
  });

  it('refuse un document malformé avant de supprimer la copie locale', async () => {
    await syncBackup(transport);
    await addQty(code, 2);
    await expect(syncBackup({ ...transport, exchange: async () => ({ revision: 99, data: {} }) as never })).rejects.toThrow();
    expect(await localQty()).toBe(2);
    expect(await db.pendingChanges.count()).toBe(1);
  });

  it('refuse de transférer automatiquement une collection à une autre destination', async () => {
    await syncBackup(transport);
    const other = vi.fn();
    await expect(syncBackup({ owner: 'another-vault', exchange: other })).rejects.toThrow('autre sauvegarde');
    expect(other).not.toHaveBeenCalled();
  });

  it('sauvegarde les prix et associations, importe et vide la collection via le journal', async () => {
    await syncBackup(transport);
    await addQty(code, 2);
    await saveOverride(code, 123);
    await saveVfPrice(code, { cardId: code, price: 1.25, date: '2026-09-23' });
    const backup = await exportBackup();
    await syncBackup(transport);
    expect((await exchange(client, [])).data.vfPrices[code].price).toBe(1.25);
    await clearCollection();
    await syncBackup(transport);
    expect(await serverQty()).toBe(0);
    expect((await exchange(client, [])).data.overrides).toEqual({});
    await importBackup(backup, 'replace');
    await syncBackup(transport);
    expect(await serverQty()).toBe(2);
    expect((await exchange(client, [])).data.overrides[code].productId).toBe(123);
  });

  it('garde les identifiants d’accès hors de l’export de collection', async () => {
    await db.cloudCredentials.put({ key: 'connection', owner: transport.owner, token: 'secret-never-export', url: 'https://example.com' });
    expect(JSON.stringify(await exportBackup())).not.toContain('secret-never-export');
  });

  it('annule la modification locale si la mise en attente échoue', async () => {
    const fail = db.pendingChanges.hook('creating', () => { throw new Error('disk full'); });
    try { await expect(addQty(code, 1)).rejects.toThrow('disk full'); }
    finally { db.pendingChanges.hook('creating').unsubscribe(fail); }
    expect(await localQty()).toBe(0);
  });
});

describe('Service privé Turso', () => {
  it('accepte le JSON déjà lu par Vercel et applique les mêmes limites', async () => {
    const token = 'test-key-with-more-than-32-characters';
    const handler = backupHandler(client, createHash('sha256').update(token).digest('hex'), ['http://localhost:5173']);
    const service = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      Object.assign(req, { body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
      await handler(req, res);
    });
    await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(service.address() as { port: number }).port}/sync`;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const send = (body: unknown) => fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    try {
      const saved = await send({ operations: [quantity(3)] });
      expect(saved.status).toBe(200);
      expect((await saved.json()).data.collection[code].qty).toBe(3);
      expect((await send(null)).status).toBe(400);
      expect((await send({ operations: [], padding: 'x'.repeat(2_000_001) })).status).toBe(413);
      expect(await serverQty()).toBe(3);
    } finally { await new Promise<void>((resolve) => service.close(() => resolve())); }
  });

  it('déduplique les opérations et conserve les 30 versions précédentes', async () => {
    const op = quantity(2);
    await exchange(client, [op, op]);
    expect(await serverQty()).toBe(2);
    for (let i = 0; i < 35; i++) await exchange(client, [quantity(1)]);
    expect(Number((await client.execute('SELECT count(*) AS n FROM optcg_backup_history')).rows[0].n)).toBe(30);
  });

  it('refuse un lot invalide sans appliquer ses ajouts précédents', async () => {
    await expect(exchange(client, [quantity(1), { ...quantity(1), change: { kind: 'quantity', cardId: '__proto__', delta: 1, at: 1 } }])).rejects.toThrow();
    expect(await serverQty()).toBe(0);
  });

  it('protège lecture et écriture et limite les origines web', async () => {
    const token = 'test-key-with-more-than-32-characters';
    const service = createServer(backupHandler(client, createHash('sha256').update(token).digest('hex'), ['http://localhost:5173']));
    await new Promise<void>((resolve) => service.listen(0, '127.0.0.1', resolve));
    const address = service.address() as { port: number };
    const url = `http://127.0.0.1:${address.port}/sync`;
    try {
      expect((await fetch(url, { method: 'POST' })).status).toBe(401);
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: 'http://localhost:5173' };
      expect((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://other.example' }, body: '{"operations":[]}' })).status).toBe(403);
      const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ operations: [quantity(2)] }) });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect((await response.json()).data.collection[code].qty).toBe(2);
      expect((await fetch(url, { method: 'POST', headers, body: '{}' })).status).toBe(400);
    } finally { await new Promise<void>((resolve) => service.close(() => resolve())); }
  });

  it('refuse une sauvegarde contenant un identifiant qui polluerait le prototype', async () => {
    const data = emptyCloudData();
    data.collection = JSON.parse('{"__proto__":{"cardId":"__proto__","qty":2,"updatedAt":1}}');
    await expect(exchange(client, [{ id: randomUUID(), change: { kind: 'merge', value: data } }])).rejects.toThrow();
  });
});
