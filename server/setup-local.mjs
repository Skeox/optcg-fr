// Génère la clé privée une seule fois. Rien de secret n'est affiché dans le terminal.
import fs from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
const envPath = new URL('./.env.local', import.meta.url);
const recoveryPath = new URL('./recovery.local.json', import.meta.url);
if (fs.existsSync(envPath) || fs.existsSync(recoveryPath)) throw new Error('Configuration existante : ne pas remplacer la clé de récupération.');
const token = randomBytes(32).toString('base64url');
const hash = createHash('sha256').update(token).digest('hex');
const template = fs.readFileSync(new URL('./.env.example', import.meta.url), 'utf8').replace('BACKUP_ACCESS_KEY_HASH=', `BACKUP_ACCESS_KEY_HASH=${hash}`);
fs.writeFileSync(envPath, template, { mode: 0o600 });
fs.writeFileSync(recoveryPath, JSON.stringify({ app: 'optcg-fr-access', version: 1, url: 'http://127.0.0.1:8787', token }, null, 2), { mode: 0o600 });
console.log('Configuration privée créée dans server/.env.local ; fichier de récupération dans server/recovery.local.json. Ajoutez le jeton Turso côté serveur.');
