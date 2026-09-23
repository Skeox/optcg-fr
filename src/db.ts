import Dexie, { type Table } from 'dexie';
import type { Change, CloudCredentials, PendingChange, SyncMeta } from './lib/backup-model';

export interface CollectionEntry {
  cardId: string;
  qty: number;
  updatedAt: number;
  note?: string;
}

export interface CmOverride {
  cardId: string;
  productId: number;
}

export interface Snapshot {
  key: string; // `${productId}|${date}`
  productId: number;
  date: string; // AAAA-MM-JJ
  trend: number | null;
  low: number | null;
  fr?: number | null; // prix VF saisi à la main, s'il existait au moment du relevé
}

export interface Setting {
  key: string;
  value: unknown;
}

/** Prix VF constaté à la main sur Cardmarket (annonces filtrées en français). */
export interface VfPrice {
  cardId: string;
  price: number;
  date: string; // AAAA-MM-JJ
}

class OptcgDb extends Dexie {
  collection!: Table<CollectionEntry, string>;
  overrides!: Table<CmOverride, string>;
  snapshots!: Table<Snapshot, string>;
  settings!: Table<Setting, string>;
  vfPrices!: Table<VfPrice, string>;
  pendingChanges!: Table<PendingChange, number>;
  syncMeta!: Table<SyncMeta, string>;
  cloudCredentials!: Table<CloudCredentials, string>;
  syncLocks!: Table<{ key: string; holder: string; until: number }, string>;

  constructor() {
    super('optcg-fr');
    this.version(1).stores({
      collection: 'cardId, qty, updatedAt',
      overrides: 'cardId',
      snapshots: 'key, productId, date',
      settings: 'key',
    });
    this.version(2).stores({ vfPrices: 'cardId, date' });
    // Les anciens instantanés portaient dans `fr` le relevé CardTrader, abandonné comme référence.
    this.version(3).stores({}).upgrade((tx) => tx.table('snapshots').toCollection().modify((s: Snapshot) => { delete s.fr; }));
    this.version(4).stores({ pendingChanges: '++seq, &id', syncMeta: 'key' });
    this.version(5).stores({ cloudCredentials: 'key' });
    this.version(6).stores({ syncLocks: 'key' });
  }
}

export const db = new OptcgDb();

function queueChange(change: Change) {
  return db.pendingChanges.add({ id: crypto.randomUUID(), change });
}

function validCardId(cardId: string) {
  if (!/^[A-Z][A-Z0-9]*-\d{3}(?:_[a-z]\d+)?$/i.test(cardId) || cardId.length > 100) throw new Error('Identifiant de carte invalide');
}

async function writeQty(cardId: string, qty: number, previous: number, note?: string | null) {
  validCardId(cardId);
  if (!Number.isSafeInteger(qty) || qty < 0 || qty > 1_000_000) throw new Error('Quantité invalide');
  if (note != null && (typeof note !== 'string' || note.length > 1000)) throw new Error('Note invalide');
  const old = await db.collection.get(cardId);
  if (qty === previous && (note === undefined || (note ?? undefined) === old?.note)) return;
  const at = Date.now();
  if (qty === 0) await db.collection.delete(cardId);
  else await db.collection.put({ ...old, cardId, qty, updatedAt: at, ...(note !== undefined ? { note: note ?? undefined } : {}) });
  await queueChange({ kind: 'quantity', cardId, delta: qty - previous, at, ...(note !== undefined ? { note } : {}) });
}

export async function setQty(cardId: string, qty: number, note?: string | null) {
  await db.transaction('rw', db.collection, db.pendingChanges, async () => {
    const cur = await db.collection.get(cardId);
    await writeQty(cardId, Math.max(0, Math.floor(qty)), cur?.qty ?? 0, note);
  });
}

export async function addQty(cardId: string, delta: number) {
  if (!Number.isSafeInteger(delta)) throw new Error('Quantité invalide');
  await db.transaction('rw', db.collection, db.pendingChanges, async () => {
    const cur = await db.collection.get(cardId);
    await writeQty(cardId, Math.max(0, (cur?.qty ?? 0) + delta), cur?.qty ?? 0);
  });
}

export async function saveOverride(cardId: string, productId: number | null) {
  validCardId(cardId);
  if (productId != null && (!Number.isSafeInteger(productId) || productId < 1)) throw new Error('Produit invalide');
  await db.transaction('rw', db.overrides, db.pendingChanges, async () => {
    const value = productId == null ? null : { cardId, productId };
    if (value) await db.overrides.put(value); else await db.overrides.delete(cardId);
    await queueChange({ kind: 'override', cardId, value });
  });
}

export async function saveVfPrice(cardId: string, value: VfPrice | null) {
  validCardId(cardId);
  if (value && (value.cardId !== cardId || !Number.isFinite(value.price) || value.price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(value.date))) throw new Error('Prix invalide');
  await db.transaction('rw', db.vfPrices, db.pendingChanges, async () => {
    if (value) await db.vfPrices.put(value); else await db.vfPrices.delete(cardId);
    await queueChange({ kind: 'price', cardId, value });
  });
}

export async function clearCollection() {
  await db.transaction('rw', [db.collection, db.overrides, db.vfPrices, db.pendingChanges], async () => {
    for (const row of await db.collection.toArray()) await setQty(row.cardId, 0);
    for (const row of await db.overrides.toArray()) await saveOverride(row.cardId, null);
    for (const row of await db.vfPrices.toArray()) await saveVfPrice(row.cardId, null);
  });
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  if (key === 'keep' && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 4)) throw new Error('Préférence invalide');
  await db.transaction('rw', db.settings, db.pendingChanges, async () => {
    await db.settings.put({ key, value });
    if (key === 'keep') await queueChange({ kind: 'keep', value: Number(value) });
  });
}

export interface Backup {
  app: 'optcg-fr';
  version: 1;
  exportedAt: string;
  collection: CollectionEntry[];
  overrides: CmOverride[];
  snapshots: Snapshot[];
  settings: Setting[];
  vfPrices?: VfPrice[];
}

export async function exportBackup(): Promise<Backup> {
  return {
    app: 'optcg-fr',
    version: 1,
    exportedAt: new Date().toISOString(),
    collection: await db.collection.toArray(),
    overrides: await db.overrides.toArray(),
    snapshots: await db.snapshots.toArray(),
    settings: await db.settings.toArray(),
    vfPrices: await db.vfPrices.toArray(),
  };
}

export async function importBackup(b: Backup, mode: 'replace' | 'merge') {
  if (b.app !== 'optcg-fr') throw new Error('Fichier de sauvegarde invalide');
  if (b.version !== 1 || !Array.isArray(b.collection)) throw new Error('Fichier de sauvegarde invalide');
  await db.transaction('rw', [db.collection, db.overrides, db.snapshots, db.settings, db.vfPrices, db.pendingChanges], async () => {
    if (mode === 'replace') {
      await clearCollection();
      await db.snapshots.clear();
    }
    for (const row of b.collection) await setQty(row.cardId, row.qty, row.note ?? null);
    for (const row of b.overrides ?? []) await saveOverride(row.cardId, row.productId);
    await db.snapshots.bulkPut(b.snapshots ?? []);
    for (const row of b.settings ?? []) await setSetting(row.key, row.value);
    for (const row of b.vfPrices ?? []) await saveVfPrice(row.cardId, row);
  });
}
