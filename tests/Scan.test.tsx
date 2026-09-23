// @vitest-environment jsdom
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Scan from '../src/pages/Scan';
import { buildIndexes } from '../src/lib/cardmarket';
import type { Card, Catalogue, Hashes } from '../src/types';
import { readBandText, readCardText } from '../src/lib/ocr';

vi.mock('../src/lib/ocr', () => ({ warmUpOcr: vi.fn(), readCardText: vi.fn(), readBandText: vi.fn() }));
vi.mock('../src/db', () => ({ addQty: vi.fn() }));
vi.mock('../src/data/catalogue', () => ({ useData: () => data, imageUrl: () => '/test.webp' }));
vi.mock('../src/lib/scan', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/lib/scan')>(),
  locateCard: () => null,
  cropFrame: () => document.createElement('canvas'),
  cropFromCover: () => document.createElement('canvas'),
  probesOfCanvas: () => [{ full: '0'.repeat(64), art: '0'.repeat(64) }],
}));

const card = { id: 'OP17-001', code: 'OP17-001', name: 'Luffy', variant: 0, rarity: 'L', colors: [], series: [] } as Card;
const catalogue = { cards: [card], series: [] } as unknown as Catalogue;
const hashes = { size: 16, entries: { [card.id]: { full: '0'.repeat(64), art: '0'.repeat(64) } } } as Hashes;
const data = { catalogue, idx: buildIndexes(catalogue), owned: new Map(), priceFor: () => null, hashes: () => Promise.resolve(hashes) };
const stop = vi.fn();
const getUserMedia = vi.fn();
const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage?: (event: unknown) => void;
  onerror?: () => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  detect() { this.onmessage?.({ data: { matches: [{ card, dFull: 20, dArt: 20, score: 20 }], quad: null } }); }
}

async function openCamera() {
  const result = render(<MemoryRouter><Scan /></MemoryRouter>);
  await act(async () => {});
  fireEvent.playing(result.container.querySelector('video')!);
  return result;
}

async function detectCard() {
  const worker = FakeWorker.instances.at(-1)!;
  for (let i = 0; i < 3; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(250); worker.detect(); });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  FakeWorker.instances = [];
  vi.stubGlobal('Worker', FakeWorker);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  getUserMedia.mockResolvedValue(stream);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  for (const [key, value] of Object.entries({ videoWidth: 640, videoHeight: 480, readyState: 4 })) Object.defineProperty(HTMLVideoElement.prototype, key, { configurable: true, get: () => value });
  for (const [key, value] of Object.entries({ clientWidth: 300, clientHeight: 400 })) vi.spyOn(HTMLElement.prototype, key, 'get').mockReturnValue(value);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {}, getImageData: () => ({ width: 640, height: 480, data: new Uint8ClampedArray(640 * 480 * 4) }) } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,test');
  vi.mocked(readCardText).mockResolvedValue({ code: card.code, name: null, raw: card.code });
  vi.mocked(readBandText).mockResolvedValue({ code: card.code, name: null, raw: card.code });
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('Scanner sans déclenchement', () => {
  it('démarre en carte entière même après un ancien choix mémorisé et affiche les résultats automatiquement', async () => {
    localStorage.setItem('optcg.scanMode', 'bande');
    await openCamera();
    expect(screen.getByText(/Recherche de la carte/)).toBeTruthy();
    await detectCard();
    expect(screen.getByText('Match 100%')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Ajouter 1/ })).toBeTruthy();
    expect(stop).toHaveBeenCalled();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalled();
  });

  it('propose le bas après 20 secondes de caméra prête et y lit automatiquement le code', async () => {
    const rendered = render(<MemoryRouter><Scan /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(25_000); });
    expect(screen.queryByRole('button', { name: 'Scanner le bas de la carte' })).toBeNull();
    fireEvent.playing(rendered.container.querySelector('video')!);
    await act(async () => { await vi.advanceTimersByTimeAsync(19_999); });
    expect(screen.queryByRole('button', { name: 'Scanner le bas de la carte' })).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    fireEvent.click(screen.getByRole('button', { name: 'Scanner le bas de la carte' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(readBandText).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /Ajouter 1/ })).toBeTruthy();
  });

  it('ignore une réponse OCR arrivée après Refaire', async () => {
    let finish!: (value: { code: string; name: null; raw: string }) => void;
    vi.mocked(readCardText).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    await openCamera();
    await detectCard();
    fireEvent.click(screen.getByRole('button', { name: 'Refaire' }));
    await act(async () => { finish({ code: card.code, name: null, raw: card.code }); });
    expect(screen.queryByRole('button', { name: /Ajouter 1/ })).toBeNull();
    expect(screen.queryByText('Match 100%')).toBeNull();
  });

  it('ne démarre pas de boucle si la permission caméra est refusée', async () => {
    getUserMedia.mockRejectedValue(new Error('NotAllowedError'));
    render(<MemoryRouter><Scan /></MemoryRouter>);
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.getByText(/Caméra indisponible/)).toBeTruthy();
    expect(FakeWorker.instances).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Scanner le bas de la carte' })).toBeNull();
  });

  it('suspend la caméra et les traitements quand la page passe en arrière-plan', async () => {
    await openCamera();
    const worker = FakeWorker.instances[0];
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    fireEvent(document, new Event('visibilitychange'));
    expect(stop).toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(screen.queryByRole('button', { name: 'Scanner le bas de la carte' })).toBeNull();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => {});
    expect(getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('arrête un flux obtenu après démontage, y compris avec StrictMode', async () => {
    const resolves: ((s: MediaStream) => void)[] = [];
    getUserMedia.mockImplementation(() => new Promise((resolve) => resolves.push(resolve)));
    const rendered = render(<StrictMode><MemoryRouter><Scan /></MemoryRouter></StrictMode>);
    rendered.unmount();
    await act(async () => { resolves.forEach((resolve) => resolve(stream)); });
    expect(resolves).toHaveLength(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
