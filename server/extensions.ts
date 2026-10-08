import { load } from 'cheerio';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const SERIES_SOURCE = 'https://fr.onepiece-cardgame.com/cardlist/';
export function parseFrenchSeries(html: string) {
  const $ = load(html);
  const series = new Map<string, { id: string; name: string; url: string }>();
  $('select[name="series"] option').each((_, el) => {
    const id = $(el).attr('value') ?? '';
    const name = $(el).text().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^\d{6}$/.test(id) && name) series.set(id, { id, name, url: `${SERIES_SOURCE}?series=${id}` });
  });
  if (!series.size) throw new Error('Liste officielle non reconnue');
  return [...series.values()];
}

// Lecture publique uniquement, source fixe ; aucune donnée de collection ni clé.
export default async function extensions(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', 'https://skeox.github.io');
  if (req.method !== 'GET') { res.writeHead(405); res.end('{}'); return; }
  try {
    const result = await fetch(SERIES_SOURCE, { signal: AbortSignal.timeout(15000) });
    if (!result.ok) throw new Error('Source indisponible');
    const series = parseFrenchSeries(await result.text());
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.end(JSON.stringify({ checkedAt: new Date().toISOString(), source: SERIES_SOURCE, series }));
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(503); res.end(JSON.stringify({ error: 'Le catalogue officiel est temporairement indisponible. Réessayez.' }));
  }
}
