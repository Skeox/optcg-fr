import Dexie, { type Table } from 'dexie';

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
  fr?: number | null; // prix de référence VF au moment du relevé
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

  constructor() {
    super('optcg-fr');
    this.version(1).stores({
      collection: 'cardId, qty, updatedAt',
      overrides: 'cardId',
      snapshots: 'key, productId, date',
      settings: 'key',
    });
    this.version(2).stores({ vfPrices: 'cardId, date' });
  }
}

export const db = new OptcgDb();

export async function setQty(cardId: string, qty: number) {
  const q = Math.max(0, Math.floor(qty));
  if (q === 0) await db.collection.delete(cardId);
  else await db.collection.put({ cardId, qty: q, updatedAt: Date.now() });
}

export async function addQty(cardId: string, delta: number) {
  const cur = await db.collection.get(cardId);
  await setQty(cardId, (cur?.qty ?? 0) + delta);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return (s?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
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
  await db.transaction('rw', db.collection, db.overrides, db.snapshots, db.settings, db.vfPrices, async () => {
    if (mode === 'replace') {
      await db.collection.clear();
      await db.overrides.clear();
      await db.snapshots.clear();
      await db.vfPrices.clear();
    }
    await db.collection.bulkPut(b.collection ?? []);
    await db.overrides.bulkPut(b.overrides ?? []);
    await db.snapshots.bulkPut(b.snapshots ?? []);
    await db.settings.bulkPut(b.settings ?? []);
    await db.vfPrices.bulkPut(b.vfPrices ?? []);
  });
}
