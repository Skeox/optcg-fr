import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { backupHandler } from './http';

const client = createClient({ url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const handler = backupHandler(client, process.env.BACKUP_ACCESS_KEY_HASH ?? '', (process.env.BACKUP_ALLOWED_ORIGINS ?? '').split(',').map((v) => v.trim()).filter(Boolean));
await client.executeMultiple(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const server = createServer(handler);
server.requestTimeout = 25_000;
server.headersTimeout = 10_000;
server.listen(Number(process.env.PORT ?? 8787), process.env.BACKUP_HOST ?? '127.0.0.1', () => console.log('Service de sauvegarde prêt.'));
