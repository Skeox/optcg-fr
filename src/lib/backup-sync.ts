import { db } from '../db';
import { applyChange, emptyCloudData, validateCloudSnapshot, type CloudCredentials, type CloudData, type CloudSnapshot, type PendingChange } from './backup-model';

export interface BackupTransport {
  owner: string;
  exchange: (operations: PendingChange[]) => Promise<CloudSnapshot>;
}

const tables = () => [db.collection, db.overrides, db.vfPrices, db.settings, db.pendingChanges, db.syncMeta];

async function localData(): Promise<CloudData> {
  return {
    collection: Object.fromEntries((await db.collection.toArray()).map((r) => [r.cardId, r])),
    overrides: Object.fromEntries((await db.overrides.toArray()).map((r) => [r.cardId, r])),
    vfPrices: Object.fromEntries((await db.vfPrices.toArray()).map((r) => [r.cardId, r])),
    keep: Number((await db.settings.get('keep'))?.value ?? 1),
  };
}

/** Une passe bornée, rejouable après coupure même si le serveur avait déjà reçu l'envoi. */
export async function syncBackup(transport: BackupTransport): Promise<boolean> {
  const holder = crypto.randomUUID();
  const acquired = await db.transaction('rw', db.syncLocks, async () => {
    const lock = await db.syncLocks.get('sync');
    if (lock && lock.until > Date.now()) return false;
    await db.syncLocks.put({ key: 'sync', holder, until: Date.now() + 60_000 });
    return true;
  });
  if (!acquired) return false;
  try { await syncPass(transport); return true; }
  finally {
    await db.transaction('rw', db.syncLocks, async () => {
      if ((await db.syncLocks.get('sync'))?.holder === holder) await db.syncLocks.delete('sync');
    });
  }
}

async function syncPass(transport: BackupTransport): Promise<void> {
  const batch = await db.transaction('rw', tables(), async () => {
    let meta = await db.syncMeta.get('cloud');
    if (meta && meta.owner !== transport.owner) throw new Error('Cet appareil est lié à une autre sauvegarde. Reconnectez la sauvegarde d’origine.');
    if (!meta) meta = { key: 'cloud', owner: transport.owner, initialized: false, revision: -1 };
    if (!meta.initialized) {
      if (!meta.bootstrap) {
        const baseline = await localData();
        // Distinguer les cartes déjà présentes avant cette fonctionnalité des ajouts
        // journalisés depuis : après un nettoyage, un nouvel ajout doit s'additionner
        // au cloud, même si celui-ci contient déjà ce code.
        const pending = await db.pendingChanges.orderBy('seq').toArray();
        for (const op of pending.slice().reverse()) {
          if (op.change.kind === 'quantity') applyChange(baseline, { ...op.change, delta: -op.change.delta });
        }
        meta.bootstrap = {
          through: 0, // aucune modification journalisée n'est acquittée par la fusion initiale
          operation: { id: crypto.randomUUID(), change: { kind: 'merge', value: baseline } },
        };
      }
      await db.syncMeta.put(meta);
      return { operations: [meta.bootstrap.operation], through: meta.bootstrap.through };
    }
    return { operations: await db.pendingChanges.orderBy('seq').limit(100).toArray(), through: null };
  });

  const remote = validateCloudSnapshot(await transport.exchange(batch.operations));
  await db.transaction('rw', tables(), async () => {
    const meta = await db.syncMeta.get('cloud');
    if (!meta || meta.owner !== transport.owner) throw new Error('La connexion de sauvegarde a changé.');
    if (remote.revision < meta.revision) return; // une réponse tardive ne remplace jamais une version plus récente
    if (batch.through != null) await db.pendingChanges.where('seq').belowOrEqual(batch.through).delete();
    else await db.pendingChanges.bulkDelete(batch.operations.map((o) => o.seq!));

    // Les modifications faites PENDANT la requête restent locales et seront envoyées ensuite.
    const data = structuredClone(remote.data);
    for (const operation of await db.pendingChanges.orderBy('seq').toArray()) applyChange(data, operation.change);
    await db.collection.clear();
    await db.collection.bulkPut(Object.values(data.collection));
    await db.overrides.clear();
    await db.overrides.bulkPut(Object.values(data.overrides));
    await db.vfPrices.clear();
    await db.vfPrices.bulkPut(Object.values(data.vfPrices));
    await db.settings.put({ key: 'keep', value: data.keep });
    await db.syncMeta.put({ key: 'cloud', owner: meta.owner, initialized: true, revision: remote.revision, lastSyncedAt: new Date().toISOString() });
  });
}

export function normalizeBackupUrl(input: string): string {
  const url = new URL(input.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash) throw new Error('Utilisez une adresse HTTPS valide pour le service de sauvegarde.');
  return url.href.replace(/\/$/, '');
}

export async function requestBackup(url: string, token: string, operations: PendingChange[]): Promise<CloudSnapshot & { owner: string }> {
  const response = await fetch(`${normalizeBackupUrl(url)}/sync`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ operations: operations.map(({ id, change }) => ({ id, change })) }),
    signal: AbortSignal.timeout(20_000), cache: 'no-store', redirect: 'error',
  });
  if (response.status === 401) throw new Error('Clé de récupération incorrecte.');
  if (!response.ok) throw new Error(`Sauvegarde indisponible (${response.status}). Les modifications restent sur cet appareil.`);
  const body = await response.json();
  validateCloudSnapshot(body);
  if (typeof body.owner !== 'string' || !body.owner) throw new Error('Identité de sauvegarde invalide');
  return body;
}

export function transportFor(credentials: CloudCredentials): BackupTransport {
  return { owner: credentials.owner, exchange: async (operations) => {
    const result = await requestBackup(credentials.url, credentials.token, operations);
    if (result.owner !== credentials.owner) throw new Error('La destination de sauvegarde a changé. Envoi interrompu.');
    return result;
  } };
}

export { emptyCloudData };
