// Répertoire de déploiement construit à partir d'une liste explicite de fichiers.
// Aucun .env, fichier de récupération, catalogue ou code du site n'est copié.
import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, '.cache', 'backup-vercel');
await fs.mkdir(path.join(output, 'api'), { recursive: true });
await fs.mkdir(path.join(output, 'public'), { recursive: true });
await build({
  entryPoints: [path.join(root, 'server/vercel-entry.ts')],
  outfile: path.join(output, 'api/sync.mjs'),
  platform: 'node', target: 'node22', format: 'esm', bundle: true,
  packages: 'external', sourcemap: false,
});
await fs.writeFile(path.join(output, 'package.json'), JSON.stringify({
  name: 'optcg-fr-backup', private: true, type: 'module',
  engines: { node: '22.x' }, dependencies: { '@libsql/client': '0.18.0' },
}, null, 2));
await fs.writeFile(path.join(output, 'vercel.json'), JSON.stringify({
  $schema: 'https://openapi.vercel.sh/vercel.json', framework: null,
  buildCommand: '', outputDirectory: 'public',
  functions: { 'api/sync.mjs': { maxDuration: 30 } },
  rewrites: [{ source: '/sync', destination: '/api/sync' }],
}, null, 2));
await fs.writeFile(path.join(output, 'public/index.html'), '<!doctype html><html lang="fr"><meta charset="utf-8"><title>Sauvegarde OPTCG FR</title><p>Service de sauvegarde OPTCG FR. Un accès privé est requis.</p></html>');
await fs.writeFile(path.join(output, '.vercelignore'), '.env*\n*.local*\nnode_modules\n');
console.log('Service Vercel préparé dans .cache/backup-vercel (sans secrets).');
