// Vision « pure » (tableaux typés, sans DOM) : le même code sert au scanner dans le navigateur
// et aux scripts Node (empreintes de référence, bancs d'essai). Aucun import, syntaxe effaçable.

export interface Pt { x: number; y: number }
/** Coins dans l'ordre : haut-gauche, haut-droit, bas-droit, bas-gauche. */
export type Quad = [Pt, Pt, Pt, Pt];
export interface Rect { x: number; y: number; w: number; h: number }
export interface Gray { data: Float32Array; w: number; h: number }

type Pixels = Uint8ClampedArray | Uint8Array | Float32Array;

/**
 * Réduit une région d'une image RGBA/RGB en niveaux de gris tw x th par moyenne de blocs :
 * pas d'aliasing, et résultat identique dans le navigateur et sous Node.
 */
export function shrinkGray(px: Pixels, w: number, h: number, channels: number, region: Rect, tw: number, th: number): Gray {
  const out = new Float32Array(tw * th);
  const x0 = Math.max(0, region.x), y0 = Math.max(0, region.y);
  const x1 = Math.min(w, region.x + region.w), y1 = Math.min(h, region.y + region.h);
  const cw = (x1 - x0) / tw, ch = (y1 - y0) / th;
  for (let ty = 0; ty < th; ty++) {
    const ya = Math.min(h - 1, Math.floor(y0 + ty * ch)), yb = Math.max(ya + 1, Math.min(h, Math.floor(y0 + (ty + 1) * ch)));
    for (let tx = 0; tx < tw; tx++) {
      const xa = Math.min(w - 1, Math.floor(x0 + tx * cw)), xb = Math.max(xa + 1, Math.min(w, Math.floor(x0 + (tx + 1) * cw)));
      let s = 0;
      for (let y = ya; y < yb; y++) {
        let i = (y * w + xa) * channels;
        for (let x = xa; x < xb; x++, i += channels) s += channels === 1 ? px[i] : 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      }
      out[ty * tw + tx] = s / ((yb - ya) * (xb - xa));
    }
  }
  return { data: out, w: tw, h: th };
}

// ---------------------------------------------------------------------------------------------
// Empreintes
// ---------------------------------------------------------------------------------------------

function bitsToHex(bits: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) hex += ((bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3]).toString(16);
  return hex;
}

/** dHash n x n bits : bit = pixel[x] > pixel[x+1] sur une réduction (n+1) x n. */
export function dhashOf(px: Pixels, w: number, h: number, channels: number, region: Rect, n = 16): string {
  const g = shrinkGray(px, w, h, channels, region, n + 1, n).data;
  const bits = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) bits[y * n + x] = g[y * (n + 1) + x] > g[y * (n + 1) + x + 1] ? 1 : 0;
  return bitsToHex(bits);
}

let dctCache: { size: number; n: number; table: Float32Array } | null = null;

/**
 * pHash n x n bits : DCT d'une réduction size x size, on garde les n x n basses fréquences
 * (hors composante continue) et bit = coefficient > médiane. Bien plus tolérant que le dHash
 * au flou, aux petits décalages et aux écarts d'exposition.
 */
export function phashOf(px: Pixels, w: number, h: number, channels: number, region: Rect, n = 16, size = 64): string {
  const g = shrinkGray(px, w, h, channels, region, size, size).data;
  const m = n + 1; // on calcule (n+1) x (n+1) coefficients et on écarte la ligne/colonne 0 → n x n
  if (!dctCache || dctCache.size !== size || dctCache.n !== m) {
    const table = new Float32Array(m * size);
    for (let k = 0; k < m; k++) for (let i = 0; i < size; i++) table[k * size + i] = Math.cos(((2 * i + 1) * k * Math.PI) / (2 * size));
    dctCache = { size, n: m, table };
  }
  const T = dctCache.table;
  const rows = new Float32Array(size * m); // DCT sur les lignes
  for (let y = 0; y < size; y++) for (let k = 0; k < m; k++) {
    let s = 0;
    for (let x = 0; x < size; x++) s += g[y * size + x] * T[k * size + x];
    rows[y * m + k] = s;
  }
  const coef = new Float32Array(n * n);
  for (let ky = 1; ky < m; ky++) for (let kx = 1; kx < m; kx++) {
    let s = 0;
    for (let y = 0; y < size; y++) s += rows[y * m + kx] * T[ky * size + y];
    coef[(ky - 1) * n + (kx - 1)] = s;
  }
  const sorted = Float32Array.from(coef).sort();
  const median = (sorted[(n * n) / 2 - 1] + sorted[(n * n) / 2]) / 2;
  const bits = new Uint8Array(n * n);
  for (let i = 0; i < bits.length; i++) bits[i] = coef[i] > median ? 1 : 0;
  return bitsToHex(bits);
}

// ---------------------------------------------------------------------------------------------
// Homographie
// ---------------------------------------------------------------------------------------------

/** Matrice 3x3 (ligne par ligne) qui envoie les 4 points `from` sur les 4 points `to`. */
export function homography(from: Quad, to: Quad): Float64Array | null {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i], { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) { // pivot de Gauss
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-10) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  const hm = new Float64Array(9);
  for (let i = 0; i < 8; i++) hm[i] = A[i][8] / A[i][i];
  hm[8] = 1;
  return hm;
}

export function applyH(hm: Float64Array, x: number, y: number): Pt {
  const d = hm[6] * x + hm[7] * y + hm[8];
  return { x: (hm[0] * x + hm[1] * y + hm[2]) / d, y: (hm[3] * x + hm[4] * y + hm[5]) / d };
}

/** Redresse le quadrilatère `quad` d'une image RGBA vers un rectangle outW x outH (RGBA, bilinéaire). */
export function warpQuad(px: Pixels, w: number, h: number, quad: Quad, outW: number, outH: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(outW * outH * 4);
  const hm = homography([{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], quad);
  if (!hm) return out;
  for (let oy = 0; oy < outH; oy++) for (let ox = 0; ox < outW; ox++) {
    const X = ox + 0.5, Y = oy + 0.5;
    const d = hm[6] * X + hm[7] * Y + hm[8];
    const sx = Math.min(w - 1.001, Math.max(0, (hm[0] * X + hm[1] * Y + hm[2]) / d - 0.5));
    const sy = Math.min(h - 1.001, Math.max(0, (hm[3] * X + hm[4] * Y + hm[5]) / d - 0.5));
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
    const i00 = (y0 * w + x0) * 4, i10 = i00 + 4, i01 = i00 + w * 4, i11 = i01 + 4, o = (oy * outW + ox) * 4;
    for (let c = 0; c < 3; c++) {
      out[o + c] = (px[i00 + c] * (1 - fx) + px[i10 + c] * fx) * (1 - fy) + (px[i01 + c] * (1 - fx) + px[i11 + c] * fx) * fy;
    }
    out[o + 3] = 255;
  }
  return out;
}

/** Comme warpQuad, pour une image en niveaux de gris (sert à juger vite un quadrilatère candidat). */
export function warpGray(g: Gray, quad: Quad, outW: number, outH: number): Float32Array {
  const out = new Float32Array(outW * outH);
  const hm = homography([{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], quad);
  if (!hm) return out;
  const { data, w, h } = g;
  for (let oy = 0; oy < outH; oy++) for (let ox = 0; ox < outW; ox++) {
    const X = ox + 0.5, Y = oy + 0.5;
    const d = hm[6] * X + hm[7] * Y + hm[8];
    const sx = Math.min(w - 1.001, Math.max(0, (hm[0] * X + hm[1] * Y + hm[2]) / d - 0.5));
    const sy = Math.min(h - 1.001, Math.max(0, (hm[3] * X + hm[4] * Y + hm[5]) / d - 0.5));
    const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0, i = y0 * w + x0;
    out[oy * outW + ox] = (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Détection du quadrilatère de la carte
// ---------------------------------------------------------------------------------------------

const CARD_RATIO = 600 / 838;
const TIE = 3; // écart de coût en dessous duquel deux quadrilatères se valent

/** Côté vertical : x = pos + slope*(y-cy) ; côté horizontal : y = pos + slope*(x-cx). */
export interface Line { pos: number; slope: number; score: number; lined: boolean }
export interface CardLines { left: Line[]; right: Line[]; top: Line[]; bottom: Line[]; cx: number; cy: number }
export interface QuadResult { quad: Quad; cost: number }

/**
 * Cherche les bords possibles de la carte autour d'un rectangle attendu (`prior`, en pixels de
 * l'image en gris `g`) : pour chaque côté, on balaie des droites presque parallèles au côté
 * attendu (± `maxSlope`) dans une bande de ± `band` x dimension, et on note la somme signée du
 * gradient perpendiculaire le long de la droite (un vrai bord garde sa polarité, une texture
 * s'annule). On garde jusqu'à 8 droites par côté : le contour de la carte, mais aussi son
 * liseré, les cadres du dessin ou le bord d'une carte voisine — `bestQuad` tranchera.
 */
export function findCardLines(g: Gray, prior: Rect, band = 0.14, maxSlope = 0.16): CardLines | null {
  const { data, w, h } = g;
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h); // gradients de Sobel
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const a = data[i - w - 1], b = data[i - w], c = data[i - w + 1], d = data[i - 1], f = data[i + 1], k = data[i + w - 1], l = data[i + w], m = data[i + w + 1];
    gx[i] = c + 2 * f + m - a - 2 * d - k;
    gy[i] = k + 2 * l + m - a - 2 * b - c;
  }
  const cx = prior.x + prior.w / 2, cy = prior.y + prior.h / 2;
  const slopes: number[] = [];
  for (let s = -maxSlope; s <= maxSlope + 1e-9; s += 0.02) slopes.push(s);
  const SEG = 4;

  const scan = (vertical: boolean, expected: number, inward: 1 | -1): Line[] => {
    const len = vertical ? prior.h : prior.w, across = vertical ? prior.w : prior.h;
    const half = len * 0.42, mid = vertical ? cy : cx;
    const lo = Math.floor(expected - across * band), hi = Math.ceil(expected + across * band);
    const grad = vertical ? gx : gy;
    const found: Line[] = [];
    for (let pos = lo; pos <= hi; pos++) {
      let best = 0, bestSlope = 0;
      for (const slope of slopes) {
        let total = 0, strongest = 0;
        for (let sIdx = 0; sIdx < SEG; sIdx++) {
          const t0 = -half + (2 * half * sIdx) / SEG, t1 = -half + (2 * half * (sIdx + 1)) / SEG;
          let s = 0, n = 0;
          for (let t = t0; t < t1; t++) {
            const p = Math.round(pos + slope * t), q = Math.round(mid + t);
            const x = vertical ? p : q, y = vertical ? q : p;
            if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
            s += grad[y * w + x]; n++;
          }
          const v = n ? Math.abs(s) / n : 0;
          total += v; if (v > strongest) strongest = v;
        }
        // Moyenne des 3 tronçons les plus faibles : le bord d'une carte court sur toute sa longueur
        // (un tronçon peut être noyé dans un reflet), un trait du dessin non.
        total = (total - strongest) / (SEG - 1);
        if (total > best) { best = total; bestSlope = slope; }
      }
      found.push({ pos, slope: bestSlope, score: best, lined: false });
    }
    const peaks = found.filter((l, i) => (i === 0 || l.score >= found[i - 1].score) && (i === found.length - 1 || l.score > found[i + 1].score));
    peaks.sort((a, b) => b.score - a.score);
    const kept: Line[] = [];
    for (const p of peaks) {
      if (p.score < peaks[0].score * 0.15) break;
      if (kept.every((k) => Math.abs(k.pos - p.pos) > 2)) kept.push(p);
      if (kept.length === 8) break;
    }
    // Le contour d'une carte est doublé, 2,5 à 6 % plus à l'intérieur, par son liseré.
    for (const k of kept) k.lined = kept.some((o) => { const gap = ((o.pos - k.pos) * inward) / across; return gap > 0.025 && gap < 0.06 && Math.abs(o.slope - k.slope) < 0.05; });
    return kept;
  };

  const left = scan(true, prior.x, 1), right = scan(true, prior.x + prior.w, -1);
  const top = scan(false, prior.y, 1), bottom = scan(false, prior.y + prior.h, -1);
  if (!left.length || !right.length || !top.length || !bottom.length) return null;
  // Un bord réel doit ressortir nettement du bruit de fond.
  if (Math.min(left[0].score, right[0].score, top[0].score, bottom[0].score) < 6) return null;
  return { left, right, top, bottom, cx, cy };
}

function quadOf(cl: CardLines, L: Line, R: Line, T: Line, B: Line): Quad {
  // intersection d'un côté vertical (x = pv + sv*(y-cy)) et d'un côté horizontal (y = ph + sh*(x-cx))
  const cross = (v: Line, hz: Line): Pt => {
    const y = (hz.pos + hz.slope * (v.pos - v.slope * cl.cy - cl.cx)) / (1 - hz.slope * v.slope);
    return { x: v.pos + v.slope * (y - cl.cy), y };
  };
  return [cross(L, T), cross(R, T), cross(R, B), cross(L, B)];
}

/** Vrai si le quadrilatère a les proportions d'une carte vue à peu près de face. */
function plausible(q: Quad): boolean {
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  const wTop = dist(q[0], q[1]), wBot = dist(q[3], q[2]), hL = dist(q[0], q[3]), hR = dist(q[1], q[2]);
  const ratio = (wTop + wBot) / (hL + hR) / CARD_RATIO;
  return ratio > 0.88 && ratio < 1.12 && Math.abs(wTop / wBot - 1) < 0.2 && Math.abs(hL / hR - 1) < 0.2;
}

/**
 * Choisit le quadrilatère de la carte parmi les droites trouvées. `cost(quad)` juge un candidat
 * (plus petit = mieux) : le scanner y met la distance à la carte connue la plus ressemblante,
 * une fois le candidat redressé. C'est ce qui départage à coup sûr le contour de la carte de son
 * liseré intérieur ou du bord d'une carte voisine — aucune règle géométrique n'y suffit.
 * On part des combinaisons les plus marquées, puis on essaie les autres droites côté par côté.
 */
export function bestQuad(cl: CardLines, cost: (q: Quad) => number): QuadResult | null {
  const sides = [cl.left, cl.right, cl.top, cl.bottom];
  const norm = sides.map((s) => s[0].score || 1);
  const combos: { idx: number[]; h: number }[] = [];
  for (let a = 0; a < sides[0].length; a++) for (let b = 0; b < sides[1].length; b++) for (let c = 0; c < sides[2].length; c++) for (let d = 0; d < sides[3].length; d++) {
    const idx = [a, b, c, d];
    if (!plausible(quadOf(cl, sides[0][a], sides[1][b], sides[2][c], sides[3][d]))) continue;
    let hScore = 0;
    idx.forEach((i, s) => { hScore += sides[s][i].score / norm[s] + (sides[s][i].lined ? 0.5 : 0); });
    combos.push({ idx, h: hScore });
  }
  if (!combos.length) return null;
  combos.sort((x, y) => y.h - x.h);

  const quadAt = (idx: number[]) => quadOf(cl, sides[0][idx[0]], sides[1][idx[1]], sides[2][idx[2]], sides[3][idx[3]]);
  const area = (q: Quad) => Math.abs((q[2].x - q[0].x) * (q[3].y - q[1].y) - (q[3].x - q[1].x) * (q[2].y - q[0].y)) / 2;
  const seen = new Set<string>();
  let best = combos[0].idx, bestCost = Infinity, bestArea = 0;
  const attempt = (idx: number[]): boolean => {
    const key = idx.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    const q = quadAt(idx);
    if (!plausible(q)) return false;
    const v = cost(q), a = area(q);
    // À coût quasi égal, le plus grand quadrilatère : rogner un bord change peu l'empreinte,
    // mais c'est le contour entier qu'on veut (lecture du code en bas de carte).
    if (v === Infinity || !(v < bestCost - TIE || (v <= bestCost + TIE && a > bestArea))) return false;
    best = idx; bestCost = v; bestArea = a;
    return true;
  };
  for (const c of combos.slice(0, 16)) attempt(c.idx);
  if (bestCost === Infinity) return null;
  for (let round = 0; round < 3; round++) {
    let improved = false;
    for (let s = 0; s < 4; s++) for (let i = 0; i < sides[s].length; i++) {
      if (i === best[s]) continue;
      const idx = best.slice(); idx[s] = i;
      if (attempt(idx)) improved = true;
    }
    if (!improved) break;
  }
  return { quad: quadAt(best), cost: bestCost };
}
