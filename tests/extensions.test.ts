import { expect, it, vi, afterEach } from 'vitest';
import { parseFrenchSeries } from '../server/extensions';
import extensions from '../server/extensions';
import type { IncomingMessage, ServerResponse } from 'node:http';

afterEach(() => vi.unstubAllGlobals());
it('extrait uniquement les séries françaises officielles et nettoie les libellés', () => {
  expect(parseFrenchSeries('<select name="series"><option value="">Tout</option><option value="622118">BOOSTER &lt;br&gt; [OP-18]</option><option value="622118">BOOSTER &lt;br&gt; [OP-18]</option></select>')).toEqual([{ id: '622118', name: 'BOOSTER [OP-18]', url: 'https://fr.onepiece-cardgame.com/cardlist/?series=622118' }]);
  expect(() => parseFrenchSeries('<h1>Maintenance</h1>')).toThrow();
});
it('signale une erreur du site officiel au lieu de prétendre que le catalogue est à jour', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  const res = { setHeader: vi.fn(), writeHead: vi.fn(), end: vi.fn() };
  await extensions({ method: 'GET' } as IncomingMessage, res as unknown as ServerResponse);
  expect(res.writeHead).toHaveBeenCalledWith(503);
  expect(res.end).toHaveBeenCalledWith(expect.stringContaining('temporairement indisponible'));
});
