import type { CollectionEntry, CmOverride, VfPrice } from '../db';

/** Données personnelles uniquement ; catalogue et prix publics se téléchargent à nouveau. */
export interface CloudData {
  collection: Record<string, CollectionEntry>;
  overrides: Record<string, CmOverride>;
  vfPrices: Record<string, VfPrice>;
  keep: number;
}

export type Change =
  | { kind: 'quantity'; cardId: string; delta: number; at: number; note?: string | null }
  | { kind: 'override'; cardId: string; value: CmOverride | null }
  | { kind: 'price'; cardId: string; value: VfPrice | null }
  | { kind: 'keep'; value: number }
  | { kind: 'merge'; value: CloudData };

export interface PendingChange { seq?: number; id: string; change: Change }
export interface CloudSnapshot { revision: number; updatedAt: string | null; data: CloudData }
export interface SyncMeta {
  key: 'cloud';
  owner: string;
  initialized: boolean;
  revision: number;
  lastSyncedAt?: string;
  bootstrap?: { operation: PendingChange; through: number };
}
export interface CloudCredentials { key: 'connection'; url: string; token: string; owner: string }

export function emptyCloudData(): CloudData {
  return { collection: {}, overrides: {}, vfPrices: {}, keep: 1 };
}

/** Les ajouts sont des deltas, afin de conserver les ajouts faits sur un autre appareil. */
export function applyChange(data: CloudData, change: Change): void {
  if (change.kind === 'quantity') {
    const old = data.collection[change.cardId];
    const qty = Math.max(0, (old?.qty ?? 0) + change.delta);
    if (qty) data.collection[change.cardId] = { ...old, cardId: change.cardId, qty, updatedAt: change.at, ...(change.note !== undefined ? { note: change.note ?? undefined } : {}) };
    else delete data.collection[change.cardId];
  } else if (change.kind === 'override' || change.kind === 'price') {
    const map = change.kind === 'override' ? data.overrides : data.vfPrices;
    if (change.value) map[change.cardId] = change.value;
    else delete map[change.cardId];
  } else if (change.kind === 'keep') data.keep = change.value;
  else {
    const wasEmpty = !Object.keys(data.collection).length && !Object.keys(data.overrides).length && !Object.keys(data.vfPrices).length;
    // Première connexion : ne jamais écraser le cloud par un appareil vide, ni
    // doubler les exemplaires déjà présents dans les deux copies de la collection.
    for (const [id, local] of Object.entries(change.value.collection)) {
      if (local.qty > (data.collection[id]?.qty ?? 0)) data.collection[id] = local;
    }
    data.overrides = { ...change.value.overrides, ...data.overrides };
    data.vfPrices = { ...change.value.vfPrices, ...data.vfPrices };
    if (wasEmpty) data.keep = change.value.keep;
  }
}

/** Un document malformé ne doit jamais vider la base locale lors d'une restauration. */
export function validateCloudSnapshot(value: unknown): CloudSnapshot {
  const s = value as CloudSnapshot;
  if (!s || !Number.isSafeInteger(s.revision) || s.revision < 0 || !s.data || !Number.isInteger(s.data.keep) || s.data.keep < 1 || s.data.keep > 4) throw new Error('Sauvegarde distante invalide');
  for (const name of ['collection', 'overrides', 'vfPrices'] as const) {
    const map = s.data[name];
    if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('Sauvegarde distante invalide');
    for (const [id, row] of Object.entries(map)) {
      if (!/^[A-Z][A-Z0-9]*-\d{3}(?:_[a-z]\d+)?$/i.test(id) || id.length > 100 || !row || row.cardId !== id) throw new Error('Carte distante invalide');
      if (name === 'collection') {
        const r = row as CollectionEntry;
        if (!Number.isSafeInteger(r.qty) || r.qty < 1 || r.qty > 1_000_000 || !Number.isFinite(r.updatedAt)) throw new Error('Quantité distante invalide');
      } else if (name === 'overrides' && (!Number.isSafeInteger((row as CmOverride).productId) || (row as CmOverride).productId < 1)) throw new Error('Produit distant invalide');
      else if (name === 'vfPrices') {
        const r = row as VfPrice;
        if (!Number.isFinite(r.price) || r.price <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) throw new Error('Prix distant invalide');
      }
    }
  }
  return s;
}
