import fs from 'node:fs';
import sharp from 'sharp';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { liveCandidate } from '../src/lib/live-scan';
import type { Catalogue, Hashes } from '../src/types';
import type { Match } from '../src/lib/scan';

const catalogue = JSON.parse(fs.readFileSync('public/data/cards.json', 'utf8')) as Catalogue;
const hashes = JSON.parse(fs.readFileSync('public/data/hashes.json', 'utf8')) as Hashes;
const postMessage = vi.fn();
const scope = { onmessage: (_event: { data: unknown }) => {}, postMessage };

beforeAll(async () => {
  vi.stubGlobal('self', scope);
  await import('../src/lib/scan.worker');
  scope.onmessage({ data: { type: 'init', hashes, cards: catalogue.cards } });
});
afterEach(() => { postMessage.mockClear(); });

it('ne reconnaît aucune carte sur une image uniforme', () => {
  scope.onmessage({ data: { frame: { width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4).fill(128) }, prior: { x: 190, y: 60, w: 257, h: 360 } } });
  const result = postMessage.mock.calls[0][0];
  expect(result.error).toBeUndefined();
  expect(liveCandidate(result.matches)).toBeNull();
});

it.each(['OP17-001', 'OP09-001', 'EB02-020'])('reconnaît %s avec les vraies empreintes du catalogue', async (id) => {
  const image = await sharp(`public/images/cards/${id}.webp`).resize(300, 419).png().toBuffer();
  const { data, info } = await sharp({ create: { width: 500, height: 600, channels: 4, background: '#777777' } }).composite([{ input: image, left: 100, top: 90 }]).raw().toBuffer({ resolveWithObject: true });
  scope.onmessage({ data: { frame: { width: info.width, height: info.height, data: new Uint8ClampedArray(data) }, prior: { x: 100, y: 90, w: 300, h: 419 } } });
  const result = postMessage.mock.calls[0][0] as { matches: Match[]; error?: string };
  expect(result.error).toBeUndefined();
  expect(liveCandidate(result.matches)).toBe(id);
}, 15_000);
