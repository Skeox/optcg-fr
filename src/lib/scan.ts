import type { Card, Hashes } from '../types';
import { dhash, hamming } from './hash';
import { normalizeName } from './names';

export const CARD_W = 600;
export const CARD_H = 838;

export interface Match {
  card: Card;
  score: number; // distance combinée (0 = identique, ~128 = sans rapport)
  dFull: number;
  dArt: number;
  codeMatch: boolean;
  nameMatch: boolean;
}

export interface Probe { full: string; art: string }

// Le cadrage n'est jamais parfait : on calcule l'empreinte sur plusieurs recadrages légèrement
// différents (marges en % de chaque côté) et on garde, pour chaque carte, la meilleure distance.
const PROBE_CROPS: [number, number, number, number][] = [
  [0, 0, 0, 0], [2, 2, 2, 2], [4, 3, 4, 3], [3, 0, 0, 3], [0, 3, 3, 0], [1, 1, 1, 1], [5, 4, 5, 4],
];
// … et sur quelques rotations (degrés) : une carte posée légèrement de travers est courante.
const PROBE_ROTATIONS = [0, -3, 3];

function rotated(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  if (deg === 0) return src;
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -c.width / 2, -c.height / 2);
  return c;
}

export function probesOfCanvas(cardCanvas: HTMLCanvasElement, art: Hashes['art'], n: number): Probe[] {
  const w = cardCanvas.width, h = cardCanvas.height;
  return PROBE_ROTATIONS.flatMap((deg) => {
    const src = rotated(cardCanvas, deg);
    return PROBE_CROPS.map(([l, t, r, b]) => {
      const sx = (w * l) / 100, sy = (h * t) / 100, sw = w * (1 - (l + r) / 100), sh = h * (1 - (t + b) / 100);
      const full = dhash(src, sx, sy, sw, sh, n);
      const artHash = dhash(src, sx + sw * art.left, sy + sh * art.top, sw * art.width, sh * art.height, n);
      return { full, art: artHash };
    });
  });
}

export interface Clues { code: string | null; name: string | null }

/**
 * Classe les cartes par ressemblance d'image, corrigée par les indices lus (OCR) : le code
 * imprimé identifie la carte à coup sûr ; le nom réduit fortement les candidats (homonymes et
 * versions alternatives restent départagés par l'image).
 */
export function rank(probes: Probe[], hashes: Hashes, cards: Card[], clues: Clues, limit = 8): Match[] {
  const out: Match[] = [];
  const wantName = clues.name ? normalizeName(clues.name) : null;
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
    const codeMatch = clues.code != null && card.code === clues.code;
    const nameMatch = wantName != null && normalizeName(card.name) === wantName;
    let score = best;
    if (clues.code != null) score += codeMatch ? -40 : 25;
    if (wantName != null) score += nameMatch ? -30 : 15;
    out.push({ card, score, dFull: bFull, dArt: bArt, codeMatch, nameMatch });
  }
  out.sort((a, b) => a.score - b.score);
  return out.slice(0, limit);
}

export function distance(m: Match): number {
  return 0.4 * m.dFull + 0.6 * m.dArt;
}

/** Confiance d'après les indices lus, la distance absolue et l'écart avec le candidat suivant. */
export function confidence(m: Match, matches: Match[]): 'haute' | 'moyenne' | 'faible' {
  const d = distance(m);
  const next = matches.find((x) => x.card.code !== m.card.code);
  const margin = next ? distance(next) - d : 0;
  if (m.codeMatch && d < 85) return 'haute';
  if (m.nameMatch) {
    // Même nom lu : l'image doit encore départager les homonymes et les versions alternatives.
    const sibling = matches.find((x) => x !== m && x.nameMatch);
    const siblingMargin = sibling ? distance(sibling) - d : 99;
    if (d < 95 && siblingMargin >= 8) return 'haute';
    return 'moyenne';
  }
  if (d < 60 && margin >= 15) return 'haute';
  if (d < 75 || (d < 90 && margin >= 20) || m.codeMatch) return 'moyenne';
  return 'faible';
}

// Mode « bas de la carte » : bande horizontale (nom, type, traits, code) photographiée de près.
export const BAND_W = 1600;
export const BAND_H = 400;

/** Extrait la zone du cadre-guide depuis une vidéo/image affichée en "object-fit: cover". */
export function cropFromCover(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  srcW: number, srcH: number,
  viewW: number, viewH: number,
  guide: { x: number; y: number; w: number; h: number },
  outW = CARD_W, outH = CARD_H,
): HTMLCanvasElement {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const dw = srcW * scale, dh = srcH * scale;
  const ox = (viewW - dw) / 2, oy = (viewH - dh) / 2;
  const sx = (guide.x - ox) / scale, sy = (guide.y - oy) / scale;
  const sw = guide.w / scale, sh = guide.h / scale;
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outW, outH);
  return c;
}

/** Pour une photo importée : on suppose le sujet cadré sur toute l'image (recadrage centré au ratio voulu). */
export function cropWhole(img: HTMLImageElement | ImageBitmap, outW = CARD_W, outH = CARD_H): HTMLCanvasElement {
  const w = img.width, h = img.height;
  const target = outW / outH;
  let sw = w, sh = h, sx = 0, sy = 0;
  if (w / h > target) { sw = h * target; sx = (w - sw) / 2; } else { sh = w / target; sy = (h - sh) / 2; }
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return c;
}
