import type { Card, Hashes } from '../types';
import { dhash, hamming } from './hash';

export const CARD_W = 600;
export const CARD_H = 838;

export interface Match {
  card: Card;
  score: number; // distance combinée (0 = identique, ~128 = sans rapport)
  dFull: number;
  dArt: number;
  codeMatch: boolean;
}

export interface Probe { full: string; art: string }

// Le cadrage n'est jamais parfait : on calcule l'empreinte sur plusieurs recadrages légèrement
// différents (marges en % de chaque côté) et on garde, pour chaque carte, la meilleure distance.
const PROBE_CROPS: [number, number, number, number][] = [
  [0, 0, 0, 0], [2, 2, 2, 2], [4, 3, 4, 3], [3, 0, 0, 3], [0, 3, 3, 0], [1, 1, 1, 1], [5, 4, 5, 4],
];

export function probesOfCanvas(cardCanvas: HTMLCanvasElement, art: Hashes['art'], n: number): Probe[] {
  const w = cardCanvas.width, h = cardCanvas.height;
  return PROBE_CROPS.map(([l, t, r, b]) => {
    const sx = (w * l) / 100, sy = (h * t) / 100, sw = w * (1 - (l + r) / 100), sh = h * (1 - (t + b) / 100);
    const full = dhash(cardCanvas, sx, sy, sw, sh, n);
    const artHash = dhash(cardCanvas, sx + sw * art.left, sy + sh * art.top, sw * art.width, sh * art.height, n);
    return { full, art: artHash };
  });
}

export function rank(probes: Probe[], hashes: Hashes, cards: Card[], code: string | null, limit = 8): Match[] {
  const out: Match[] = [];
  for (const card of cards) {
    const e = hashes.entries[card.id];
    if (!e) continue;
    let best = Infinity, bFull = 0, bArt = 0;
    for (const p of probes) {
      const dFull = hamming(p.full, e.full);
      const dArt = hamming(p.art, e.art);
      // La zone d'illustration pèse davantage : elle ne dépend pas du texte.
      const d = 0.4 * dFull + 0.6 * dArt;
      if (d < best) { best = d; bFull = dFull; bArt = dArt; }
    }
    const codeMatch = code != null && card.code === code;
    let score = best;
    if (code != null) score += codeMatch ? -40 : 25;
    out.push({ card, score, dFull: bFull, dArt: bArt, codeMatch });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}

export function distance(m: Match): number {
  return 0.4 * m.dFull + 0.6 * m.dArt;
}

/** Confiance d'après la distance absolue et l'écart avec le candidat suivant (hors même code). */
export function confidence(m: Match, matches: Match[]): 'haute' | 'moyenne' | 'faible' {
  const d = distance(m);
  const next = matches.find((x) => x.card.code !== m.card.code);
  const margin = next ? distance(next) - d : 0;
  if (m.codeMatch && d < 85) return 'haute';
  if (d < 60 && margin >= 15) return 'haute';
  if (d < 75 || (d < 90 && margin >= 20) || m.codeMatch) return 'moyenne';
  return 'faible';
}

/** Extrait la zone du cadre-guide depuis une vidéo/image affichée en "object-fit: cover". */
export function cropFromCover(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  srcW: number, srcH: number,
  viewW: number, viewH: number,
  guide: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const dw = srcW * scale, dh = srcH * scale;
  const ox = (viewW - dw) / 2, oy = (viewH - dh) / 2;
  const sx = (guide.x - ox) / scale, sy = (guide.y - oy) / scale;
  const sw = guide.w / scale, sh = guide.h / scale;
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H);
  return c;
}

/** Pour une photo importée : on suppose la carte cadrée sur toute l'image (recadrage au ratio carte). */
export function cropWhole(img: HTMLImageElement | ImageBitmap): HTMLCanvasElement {
  const w = img.width, h = img.height;
  const target = CARD_W / CARD_H;
  let sw = w, sh = h, sx = 0, sy = 0;
  if (w / h > target) { sw = h * target; sx = (w - sw) / 2; } else { sh = w / target; sy = (h - sh) / 2; }
  const c = document.createElement('canvas');
  c.width = CARD_W; c.height = CARD_H;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, CARD_W, CARD_H);
  return c;
}
