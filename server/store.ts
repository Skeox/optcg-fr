import { randomUUID } from 'node:crypto';
import type { Client } from '@libsql/client';
import { applyChange, emptyCloudData, validateCloudSnapshot, type CloudData, type PendingChange } from '../src/lib/backup-model';

const cardIdValid = (id: unknown) => typeof id === 'string' && /^[A-Z][A-Z0-9]*-\d{3}(?:_[a-z]\d+)?$/i.test(id) && id.length <= 100;

export function validateOperations(input: unknown): PendingChange[] {
  if (!Array.isArray(input) || input.length > 100) throw new Error('Lot invalide');
  const operations = input as PendingChange[];
  for (const op of operations) {
    if (!op || typeof op.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(op.id) || !op.change) throw new Error('Opération invalide');
    const c = op.change;
    if (c.kind === 'merge') validateCloudSnapshot({ revision: 0, updatedAt: null, data: c.value });
    else if (c.kind === 'keep') {
      if (!Number.isInteger(c.value) || c.value < 1 || c.value > 4) throw new Error('Préférence invalide');
    } else {
      if (!cardIdValid(c.cardId)) throw new Error('Carte invalide');
      if (c.kind === 'quantity') {
        if (!Number.isSafeInteger(c.delta) || Math.abs(c.delta) > 1_000_000 || !Number.isSafeInteger(c.at) || c.at < 0) throw new Error('Quantité invalide');
        if (c.note != null && (typeof c.note !== 'string' || c.note.length > 1000)) throw new Error('Note invalide');
      } else if (c.kind === 'price' || c.kind === 'override') {
        if (c.value !== null) {
          const d = emptyCloudData();
          if (c.kind === 'price') d.vfPrices[c.cardId] = c.value;
          else d.overrides[c.cardId] = c.value;
          validateCloudSnapshot({ revision: 0, updatedAt: null, data: d });
        }
      } else throw new Error('Type de modification inconnu');
    }
  }
  return operations;
}

/** Transaction d'écriture sérialisée par Turso, avec déduplication durable des envois. */
export async function exchange(client: Client, operations: PendingChange[]) {
  validateOperations(operations);
  const tx = await client.transaction('write');
  try {
    await tx.execute({ sql: 'INSERT OR IGNORE INTO optcg_backup (id, vault_id, data) VALUES (1, ?, ?)', args: [randomUUID(), JSON.stringify(emptyCloudData())] });
    const row = (await tx.execute('SELECT * FROM optcg_backup WHERE id = 1')).rows[0];
    const data = JSON.parse(String(row.data)) as CloudData;
    let revision = Number(row.revision), updatedAt = row.updated_at as string | null;
    let changed = false;
    const now = new Date().toISOString();
    for (const op of operations) {
      const receipt = await tx.execute({ sql: 'INSERT OR IGNORE INTO optcg_backup_operations (id, applied_at) VALUES (?, ?)', args: [op.id, now] });
      if (!receipt.rowsAffected) continue;
      applyChange(data, op.change);
      changed = true;
    }
    if (changed) {
      validateCloudSnapshot({ revision, updatedAt, data });
      const encoded = JSON.stringify(data);
      if (encoded.length > 2_000_000) throw new Error('Sauvegarde trop volumineuse');
      if (revision > 0) await tx.execute({ sql: 'INSERT OR IGNORE INTO optcg_backup_history (revision, saved_at, data) VALUES (?, ?, ?)', args: [revision, String(row.updated_at), String(row.data)] });
      revision++;
      updatedAt = now;
      await tx.execute({ sql: 'UPDATE optcg_backup SET data = ?, revision = ?, updated_at = ? WHERE id = 1', args: [encoded, revision, now] });
      await tx.execute('DELETE FROM optcg_backup_history WHERE revision NOT IN (SELECT revision FROM optcg_backup_history ORDER BY revision DESC LIMIT 30)');
    }
    await tx.commit();
    return { owner: String(row.vault_id), revision, updatedAt, data };
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    throw error;
  } finally { tx.close(); }
}
