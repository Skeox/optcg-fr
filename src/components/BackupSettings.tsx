import { useRef, useState } from 'react';
import { useBackup } from '../data/backup';

export default function BackupSettings() {
  const backup = useBackup();
  const [url, setUrl] = useState(import.meta.env.VITE_BACKUP_API_URL ?? 'https://optcg-fr-backup.vercel.app');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const connect = async () => {
    setBusy(true); setMessage(null);
    try { await backup.connect(url, token); setToken(''); }
    catch (e) { setMessage((e as Error).message); }
    finally { setBusy(false); }
  };

  const readRecovery = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10_000) throw new Error('Fichier d’accès invalide');
      const data = JSON.parse(await file.text());
      if (data.app !== 'optcg-fr-access' || data.version !== 1 || typeof data.url !== 'string' || typeof data.token !== 'string') throw new Error('Ce fichier n’est pas une clé de récupération OPTCG.');
      setUrl(data.url); setToken(data.token);
      setMessage('Accès chargé. Vérifiez l’adresse puis cliquez sur « Connecter et restaurer ».');
    } catch (e) { setMessage((e as Error).message); }
  };

  return <section className="panel space-y-3">
    <h2 className="font-bold">Sauvegarde automatique · Turso</h2>
    <p className="text-sm text-ink-2">Chaque ajout ou retrait est envoyé automatiquement. Hors connexion, les modifications restent en attente sur cet appareil. Après un nettoyage du navigateur, reconnectez cette sauvegarde pour retrouver vos cartes.</p>
    {backup.connected ? <>
      <p role="status" className="text-sm">{backup.phase === 'saving' ? 'Sauvegarde en cours…' : backup.pending ? `${backup.pending} modification(s) à envoyer` : backup.lastSyncedAt ? `Dernière synchronisation : ${new Date(backup.lastSyncedAt).toLocaleString('fr-FR')}` : 'Restauration de la collection…'}</p>
      {backup.error && <p role="alert" className="text-sm text-warn">{backup.error}</p>}
      <p className="break-all text-xs text-ink-2">Service : {backup.url}</p>
      <button className="btn-primary w-full" disabled={backup.phase === 'saving'} onClick={backup.retry}>Synchroniser maintenant</button>
      <button className="btn-ghost w-full" onClick={() => backup.downloadRecovery().catch((e) => setMessage(e.message))}>Enregistrer ma clé de récupération</button>
      <p className="text-xs text-ink-2">Conservez ce fichier privé dans Fichiers / iCloud ou votre gestionnaire de mots de passe. Il donne accès à votre collection. Attendez la confirmation de sauvegarde avant de nettoyer le navigateur.</p>
      <button className="text-xs text-ink-2 underline" disabled={backup.phase === 'saving'} onClick={() => backup.disconnect().catch((e) => setMessage(e.message))}>Déconnecter cet appareil (conserver la sauvegarde)</button>
    </> : <>
      <p className="text-sm text-warn">Pas encore activée sur cet appareil.</p>
      <label className="block text-sm">Adresse du service de sauvegarde<input className="input mt-1 w-full" type="url" autoCapitalize="off" autoCorrect="off" placeholder="https://sauvegarde.exemple.fr" value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <label className="block text-sm">Clé de récupération<input className="input mt-1 w-full" type="password" autoComplete="off" placeholder="Votre clé privée" value={token} onChange={(e) => setToken(e.target.value)} /></label>
      <button className="btn-primary w-full" disabled={busy || !url || !token} onClick={connect}>{busy ? 'Connexion…' : 'Connecter et restaurer'}</button>
      <button className="btn-ghost w-full" onClick={() => fileRef.current?.click()}>Charger mon fichier de récupération</button>
      <input ref={fileRef} className="hidden" type="file" accept="application/json,.json" onChange={(e) => { void readRecovery(e.target.files?.[0]); e.target.value = ''; }} />
    </>}
    {message && <p role="status" className="text-sm text-warn">{message}</p>}
  </section>;
}
