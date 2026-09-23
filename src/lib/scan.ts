import type { Card, Hashes } from '../types';
import { bytesOf, hamming } from './hash';
import { normalizeName } from './names';
import { bestQuad, dhashOf, findCardLines, shrinkGray, warpGray, warpQuad, type Quad, type Rect } from './vision';

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

/** Empreintes d'une carte simplement recadrée (cadre-guide), quand son contour n'a pas été trouvé. */
export function probesOfCanvas(cardCanvas: HTMLCanvasElement, art: Hashes['art'], n: number): Probe[] {
  const w = cardCanvas.width, h = cardCanvas.height;
  return PROBE_ROTATIONS.flatMap((deg) => {
    const px = rotated(cardCanvas, deg).getContext('2d')!.getImageData(0, 0, w, h).data;
    return PROBE_CROPS.map(([l, t, r, b]) => {
      const sx = (w * l) / 100, sy = (h * t) / 100, sw = w * (1 - (l + r) / 100), sh = h * (1 - (t + b) / 100);
      const full = dhashOf(px, w, h, 4, roundRect(sx, sy, sw, sh), n);
      const artHash = dhashOf(px, w, h, 4, roundRect(sx + sw * art.left, sy + sh * art.top, sw * art.width, sh * art.height), n);
      return { full, art: artHash };
    });
  });
}

const roundRect = (x: number, y: number, w: number, h: number): Rect => ({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });

// Empreintes de référence à plat (octets contigus) : on cherche la carte la plus proche des
// dizaines de fois par image pendant le choix du quadrilatère.
interface RefIndex { ids: string[]; full: Uint8Array; art: Uint8Array; len: number }
const refIndexes = new WeakMap<Hashes, RefIndex>();
function refIndexOf(hashes: Hashes): RefIndex {
  let idx = refIndexes.get(hashes);
  if (!idx) {
    const ids = Object.keys(hashes.entries), len = (hashes.size * hashes.size) / 8;
    const full = new Uint8Array(ids.length * len), art = new Uint8Array(ids.length * len);
    ids.forEach((id, i) => { full.set(bytesOf(hashes.entries[id].full), i * len); art.set(bytesOf(hashes.entries[id].art), i * len); });
    idx = { ids, full, art, len };
    refIndexes.set(hashes, idx);
  }
  return idx;
}

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

function nearest(probe: Probe, idx: RefIndex): { id: string; d: number } {
  const f = bytesOf(probe.full), a = bytesOf(probe.art), len = idx.len;
  let best = Infinity, bestI = 0;
  for (let i = 0, o = 0; i < idx.ids.length; i++, o += len) {
    let dF = 0, dA = 0;
    for (let k = 0; k < len; k++) { dF += POP[f[k] ^ idx.full[o + k]]; dA += POP[a[k] ^ idx.art[o + k]]; }
    const d = 0.4 * dF + 0.6 * dA;
    if (d < best) { best = d; bestI = i; }
  }
  return { id: idx.ids[bestI], d: best };
}

export interface Located {
  quad: Quad; // coins de la carte, en pixels de l'image d'origine
  probe: Probe;
  id: string; // carte connue la plus ressemblante une fois le quadrilatère redressé
  d: number; // sa distance (même échelle que `distance()`)
}

const WORK_W = 640; // largeur de l'image de travail (la détection des bords se fait à la moitié)
const PROBE_W = 300, PROBE_H = 419;

/**
 * Trouve le contour de la carte autour du rectangle attendu `prior` (cadre-guide) et le redresse.
 * Plusieurs droites sont candidates pour chaque bord (contour, liseré, cadre du dessin, carte
 * voisine…) : on retient le quadrilatère qui, une fois redressé, ressemble le plus à une carte
 * connue. `band` : tolérance de position de chaque bord, en fraction de la taille du cadre.
 */
export function locateCard(frame: ImageData, prior: Rect, hashes: Hashes, band = 0.14): Located | null {
  const pad = band + 0.06;
  const x0 = Math.max(0, Math.round(prior.x - prior.w * pad)), y0 = Math.max(0, Math.round(prior.y - prior.h * pad));
  const region: Rect = { x: x0, y: y0, w: Math.min(frame.width, Math.round(prior.x + prior.w * (1 + pad))) - x0, h: Math.min(frame.height, Math.round(prior.y + prior.h * (1 + pad))) - y0 };
  if (region.w < 64 || region.h < 64) return null;
  const workW = Math.min(WORK_W, region.w) & ~1, k = workW / region.w, workH = Math.round(region.h * k) & ~1;
  const work = shrinkGray(frame.data, frame.width, frame.height, 4, region, workW, workH);
  const half = shrinkGray(work.data, workW, workH, 1, { x: 0, y: 0, w: workW, h: workH }, workW / 2, workH / 2);
  const lines = findCardLines(half, { x: ((prior.x - x0) * k) / 2, y: ((prior.y - y0) * k) / 2, w: (prior.w * k) / 2, h: (prior.h * k) / 2 }, band);
  if (!lines) return null;

  const idx = refIndexOf(hashes), n = hashes.size, art = hashes.art;
  const fullRect = { x: 0, y: 0, w: PROBE_W, h: PROBE_H }, artRect = roundRect(PROBE_W * art.left, PROBE_H * art.top, PROBE_W * art.width, PROBE_H * art.height);
  const evaluate = (q: Quad) => {
    const warped = warpGray(work, q.map((p) => ({ x: p.x * 2, y: p.y * 2 })) as Quad, PROBE_W, PROBE_H);
    const probe = { full: dhashOf(warped, PROBE_W, PROBE_H, 1, fullRect, n), art: dhashOf(warped, PROBE_W, PROBE_H, 1, artRect, n) };
    const near = nearest(probe, idx);
    return { probe, id: near.id, d: near.d };
  };
  const res = bestQuad(lines, (q) => evaluate(q).d);
  if (!res) return null;
  // Empreinte et image redressée doivent provenir du même contour (y compris les ex æquo).
  const found = evaluate(res.quad);
  return { ...found, quad: res.quad.map((p) => ({ x: x0 + (p.x * 2) / k, y: y0 + (p.y * 2) / k })) as Quad };
}

/** Zone rectangulaire d'une image, mise à l'échelle dans un canvas. */
export function cropFrame(frame: ImageData, zone: Rect, outW = CARD_W, outH = CARD_H): HTMLCanvasElement {
  const src = document.createElement('canvas');
  src.width = frame.width; src.height = frame.height;
  src.getContext('2d')!.putImageData(frame, 0, 0);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, zone.x, zone.y, zone.w, zone.h, 0, 0, outW, outH);
  return c;
}

/** Plus grand rectangle centré aux proportions voulues, réduit du facteur `scale`. */
export function centeredRect(w: number, h: number, ratio: number, scale = 1): Rect {
  const rw = (w / h > ratio ? h * ratio : w) * scale, rh = rw / ratio;
  return { x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh };
}

/** Carte redressée (quadrilatère → rectangle) dans un canvas, pour l'affichage et l'OCR. */
export function rectify(frame: ImageData, quad: Quad, outW: number, outH: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const px = warpQuad(frame.data, frame.width, frame.height, quad, outW, outH);
  c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, outW, outH), 0, 0);
  return c;
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

/** Similarité visuelle des empreintes, pas une probabilité d'identification. */
export function matchPercent(m: Match, size = 16): number {
  const d = distance(m);
  if (!Number.isFinite(d) || size <= 0) return 0;
  if (d === 0) return 100;
  return Math.max(0, Math.min(99, Math.round(100 * (1 - d / (size * size)))));
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

/** Rectangle source correspondant à une zone de l'écran, pour une vidéo/image affichée en "object-fit: cover". */
export function coverToSource(srcW: number, srcH: number, viewW: number, viewH: number, zone: Rect): Rect {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const ox = (viewW - srcW * scale) / 2, oy = (viewH - srcH * scale) / 2;
  return { x: (zone.x - ox) / scale, y: (zone.y - oy) / scale, w: zone.w / scale, h: zone.h / scale };
}

/** Extrait la zone du cadre-guide depuis une vidéo/image affichée en "object-fit: cover". */
export function cropFromCover(
  src: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  srcW: number, srcH: number,
  viewW: number, viewH: number,
  guide: Rect,
  outW = CARD_W, outH = CARD_H,
): HTMLCanvasElement {
  const { x: sx, y: sy, w: sw, h: sh } = coverToSource(srcW, srcH, viewW, viewH, guide);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outW, outH);
  return c;
}

/** Pour une photo importée : on suppose le sujet cadré sur toute l'image (recadrage centré au ratio voulu). */
export function cropWhole(img: HTMLImageElement | ImageBitmap, outW = CARD_W, outH = CARD_H): HTMLCanvasElement {
  const { x: sx, y: sy, w: sw, h: sh } = centeredRect(img.width, img.height, outW / outH);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  return c;
}
