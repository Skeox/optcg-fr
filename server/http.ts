import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Client } from '@libsql/client';
import { exchange, validateOperations } from './store';

export function backupHandler(client: Client, accessKeyHash: string, origins: string[]) {
  if (!/^[a-f0-9]{64}$/i.test(accessKeyHash) || !origins.length || origins.includes('*')) throw new Error('Configurez BACKUP_ACCESS_KEY_HASH et BACKUP_ALLOWED_ORIGINS.');
  const expected = Buffer.from(accessKeyHash, 'hex');
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) { res.writeHead(403); res.end('{"error":"Origin refused"}'); return; }
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.writeHead(204); res.end(); return;
    }
    if (req.url !== '/sync' || req.method !== 'POST') { res.writeHead(404); res.end('{}'); return; }
    const token = req.headers.authorization?.replace(/^Bearer /, '') ?? '';
    const actual = createHash('sha256').update(token).digest();
    if (!token || !timingSafeEqual(actual, expected)) { res.writeHead(401); res.end('{"error":"Unauthorized"}'); return; }
    if (!req.headers['content-type']?.startsWith('application/json')) { res.writeHead(415); res.end('{}'); return; }
    try {
      // Vercel peut avoir consommé le flux et placé le JSON dans req.body.
      // Le serveur Node local reçoit toujours le flux brut.
      const parsedBody = (req as IncomingMessage & { body?: unknown }).body;
      let body: unknown;
      if (parsedBody !== undefined) {
        const encoded = typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody);
        if (Buffer.byteLength(encoded) > 2_000_000) { res.writeHead(413); res.end('{}'); return; }
        try { body = JSON.parse(encoded); }
        catch { res.writeHead(400); res.end('{"error":"Invalid operations"}'); return; }
      } else {
        const chunks: Buffer[] = [];
        let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 2_000_000) { res.writeHead(413); res.end('{}'); return; }
          chunks.push(Buffer.from(chunk));
        }
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch { res.writeHead(400); res.end('{"error":"Invalid operations"}'); return; }
      }
      let operations;
      try { operations = validateOperations((body as { operations?: unknown })?.operations); }
      catch { res.writeHead(400); res.end('{"error":"Invalid operations"}'); return; }
      const result = await exchange(client, operations);
      res.writeHead(200); res.end(JSON.stringify(result));
    } catch {
      // Ni requête, ni jeton, ni contenu de la collection dans les logs/réponses d'erreur.
      res.writeHead(503); res.end('{"error":"Backup temporarily unavailable"}');
    }
  };
}
