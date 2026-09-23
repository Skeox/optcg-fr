import { createClient } from '@libsql/client/web';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { backupHandler } from './http';

let handler: ReturnType<typeof backupHandler> | undefined;

/** Fonction Vercel : mêmes transactions et authentification que le serveur local. */
export default async function sync(req: IncomingMessage, res: ServerResponse) {
  try {
    handler ??= backupHandler(
      createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN }),
      process.env.BACKUP_ACCESS_KEY_HASH ?? '',
      (process.env.BACKUP_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean),
    );
    req.url = '/sync';
    await handler(req, res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"Backup temporarily unavailable"}');
  }
}
