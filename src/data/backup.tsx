import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { normalizeBackupUrl, requestBackup, syncBackup, transportFor } from '../lib/backup-sync';

interface BackupContext {
  connected: boolean;
  phase: 'local' | 'saving' | 'saved' | 'waiting' | 'error';
  pending: number;
  error: string | null;
  lastSyncedAt?: string;
  url?: string;
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  retry: () => void;
  downloadRecovery: () => Promise<void>;
}

const Context = createContext<BackupContext | null>(null);

export function BackupProvider({ children }: { children: ReactNode }) {
  const credentials = useLiveQuery(() => db.cloudCredentials.get('connection'));
  const meta = useLiveQuery(() => db.syncMeta.get('cloud'));
  const queue = useLiveQuery(async () => ({ count: await db.pendingChanges.count(), last: (await db.pendingChanges.orderBy('seq').last())?.seq ?? 0 }), [], { count: 0, last: 0 });
  const [phase, setPhase] = useState<BackupContext['phase']>('local');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    window.addEventListener('online', retry);
    const visible = () => { if (!document.hidden) retry(); };
    document.addEventListener('visibilitychange', visible);
    const interval = window.setInterval(() => { if (!document.hidden) retry(); }, 15_000);
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', visible); window.clearInterval(interval); };
  }, [retry]);

  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      if (busy.current) return;
      if (!navigator.onLine) { setPhase('waiting'); return; }
      busy.current = true;
      setPhase('saving');
      setError(null);
      try {
        const saved = await syncBackup(transportFor(credentials));
        if (!cancelled) setPhase(saved ? 'saved' : 'waiting');
      } catch (e) {
        if (!cancelled) { setPhase('error'); setError(e instanceof Error ? e.message : 'Connexion impossible. Les ajouts restent sur cet appareil.'); }
      } finally {
        busy.current = false;
        // Le compteur peut avoir changé pendant la requête : relancer rapidement la suite.
        if (cancelled) retry();
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [credentials, queue.count, queue.last, attempt, retry]);

  const connect = async (url: string, token: string) => {
    if (busy.current) throw new Error('Attendez la fin de la sauvegarde en cours.');
    const normalized = normalizeBackupUrl(url);
    const key = token.trim();
    if (key.length < 32) throw new Error('La clé de récupération doit comporter au moins 32 caractères.');
    const remote = await requestBackup(normalized, key, []);
    const existing = await db.syncMeta.get('cloud');
    if (existing && existing.owner !== remote.owner) throw new Error('Cette collection est déjà liée à une autre sauvegarde. Utilisez sa clé d’origine.');
    await db.cloudCredentials.put({ key: 'connection', url: normalized, token: key, owner: remote.owner });
    navigator.storage?.persist?.().catch(() => undefined);
    retry();
  };

  const disconnect = async () => {
    if (busy.current) throw new Error('Attendez la fin de la sauvegarde en cours.');
    await db.cloudCredentials.delete('connection');
    setError(null);
    setPhase('local');
  };

  const downloadRecovery = async () => {
    const saved = await db.cloudCredentials.get('connection');
    if (!saved) throw new Error('Connectez d’abord votre sauvegarde.');
    const blob = new Blob([JSON.stringify({ app: 'optcg-fr-access', version: 1, url: saved.url, token: saved.token }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'OPTCG-ACCES-PRIVE-a-conserver.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return <Context.Provider value={{ connected: !!credentials, phase: !credentials ? 'local' : phase, pending: queue.count, error, lastSyncedAt: meta?.lastSyncedAt, url: credentials?.url, connect, disconnect, retry, downloadRecovery }}>{children}</Context.Provider>;
}

export function useBackup() {
  const value = useContext(Context);
  if (!value) throw new Error('BackupProvider manquant');
  return value;
}
