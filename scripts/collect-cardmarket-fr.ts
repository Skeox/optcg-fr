/** Local intake for observations from the user's Chrome. Never handles credentials/cookies. */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { buildIndexes, defaultProductFor, productUrl } from '../src/lib/cardmarket';
import { emptyPrices, mergePages } from './lib/cardmarket-fr-prices.mjs';
import type { Catalogue, Prices, CmFrenchPrices } from '../src/types';

const read = async (path: string) => JSON.parse(await readFile(path, 'utf8'));
const catalogue: Catalogue = await read('public/data/cards.json');
const prices: Prices = await read('public/data/prices.json');
const idx = buildIndexes(catalogue);
const priority = ['PRB02-007', 'OP07-031_p1', 'OP09-001', 'OP09-001_p1', 'OP03-079_p4', 'OP06-065_p3', 'PRB02-003', 'ST10-005_r1'];
const targets = [...new Map(catalogue.cards.map(card => {
  const match = defaultProductFor(card, idx, prices);
  return match?.sure ? [match.product.id, { card: card.id, code: card.code, productId: match.product.id, url: productUrl(match.product) }] as const : null;
}).filter(x => x != null)).values()].sort((a, b) => {
  const rank = (id: string) => priority.includes(id) ? priority.indexOf(id) : 999;
  return rank(a.card) - rank(b.card);
});
const output = 'public/data/prices-cardmarket-fr.json';
const cacheDir = '.cache/cardmarket-fr';
await mkdir(cacheDir, { recursive: true });
const checkpoint = `${cacheDir}/${new Date().toISOString().slice(0, 7)}.json`;
let state: CmFrenchPrices = await read(checkpoint).catch(() => read(output).catch(emptyPrices));
const save = async (path: string, data: unknown) => {
  await writeFile(`${path}.tmp`, JSON.stringify(data, null, 2) + '\n');
  await rename(`${path}.tmp`, path);
};
function report() {
  const mapped = new Set(targets.map(t => t.productId));
  const quotes = Object.values(state.products).filter(q => mapped.has(q.productId));
  const cutoff = Date.now() - 45 * 86_400_000;
  return { cards: catalogue.cards.length, targets: targets.length, observed: quotes.length,
    priced: quotes.filter(q => q.status === 'quoted' && Date.parse(q.at) >= cutoff).length,
    insufficient: quotes.filter(q => q.status === 'insufficient').length, updatedAt: state.updatedAt };
}
if (process.argv.includes('--publish')) {
  // Revalidate all successful samples through the same frontend guard before publication.
  const { cardmarketFrenchQuote } = await import('../src/lib/cardmarket-fr');
  for (const q of Object.values(state.products)) {
    if (q.status === 'quoted' && !cardmarketFrenchQuote(state, q.productId, Date.parse(q.at))) throw new Error(`Relevé invalide : ${q.productId}`);
  }
  await save(output, state);
  console.log(JSON.stringify(report()));
} else if (process.argv.includes('--report')) {
  console.log(JSON.stringify(report()));
} else {
  const token = randomUUID();
  const server = createServer(async (req, res) => {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'");
    if (req.headers.host !== new URL(base).host || req.url !== `/${token}` || (req.headers.origin && req.headers.origin !== base)) {
      res.writeHead(403).end('Accès refusé'); return;
    }
    let message = '';
    if (req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 2_000_000) throw new Error('Lot trop volumineux'); }
        const pages = JSON.parse(new URLSearchParams(body).get('observations') ?? 'null');
        const next = mergePages(state, pages, targets);
        await save(checkpoint, next); state = next;
        message = `${pages.length} pages enregistrées.`;
      } catch (err) { message = `Import refusé : ${(err as Error).message}`; }
    } else if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    const month = new Date().toISOString().slice(0, 7);
    const pending = targets.filter(t => !state.products[t.productId]?.at.startsWith(month));
    const escape = (s: string) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="fr"><title>Collecte Cardmarket FR locale</title><h1>Collecte Cardmarket FR</h1><p>${escape(message)}</p><pre id="coverage">${escape(JSON.stringify(report()))}</pre><p>${pending.length} produits restant à relever ce mois-ci.</p><pre id="targets">${escape(JSON.stringify(pending.slice(0, 25)))}</pre><form method="post"><label for="observations">Observations JSON</label><textarea id="observations" name="observations" rows="6" cols="80"></textarea><button>Enregistrer les relevés</button></form></html>`);
  });
  server.listen(0, '127.0.0.1', () => console.log(`http://127.0.0.1:${(server.address() as { port: number }).port}/${token}`));
}
