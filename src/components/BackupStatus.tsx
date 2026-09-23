import { Link } from 'react-router';
import { useBackup } from '../data/backup';

export default function BackupStatus() {
  const { connected, phase, pending, lastSyncedAt } = useBackup();
  let label = 'Sauvegarde externe non activée';
  if (connected) {
    if (phase === 'saving') label = 'Sauvegarde en cours…';
    else if (phase === 'error') label = 'Sauvegarde à vérifier · ajouts conservés sur cet appareil';
    else if (pending) label = `${pending} modification(s) en attente de sauvegarde`;
    else if (lastSyncedAt) label = `Sauvegarde confirmée à ${new Date(lastSyncedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    else label = 'Connexion à la sauvegarde…';
  }
  return <Link to="/reglages" role="status" className={`mb-3 block rounded-lg border border-line px-3 py-2 text-xs ${connected && !pending && phase === 'saved' ? 'text-ok' : 'text-ink-2'}`}>☁ {label}</Link>;
}
