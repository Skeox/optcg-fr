// Empreintes perceptuelles (dHash) calculées côté navigateur, avec le même algorithme que
// scripts/build-hashes.mjs : niveaux de gris, redimensionnement en (N+1) x N, bit = p[x] > p[x+1].

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const cache = new Map<string, Uint8Array>();
export function bytesOf(hex: string): Uint8Array {
  let b = cache.get(hex);
  if (!b) { b = hexToBytes(hex); cache.set(hex, b); }
  return b;
}

export function hamming(a: string, b: string): number {
  const x = bytesOf(a), y = bytesOf(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d += POP[x[i] ^ y[i]];
  return d;
}

/** Réduit progressivement (par moitiés) pour limiter l'aliasing avant l'échantillonnage final. */
function downscale(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, tw: number, th: number): HTMLCanvasElement {
  let cw = Math.round(sw), ch = Math.round(sh);
  let cur = document.createElement('canvas');
  cur.width = cw; cur.height = ch;
  cur.getContext('2d')!.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);
  while (cw / 2 >= tw * 2 && ch / 2 >= th * 2) {
    cw = Math.round(cw / 2); ch = Math.round(ch / 2);
    const next = document.createElement('canvas');
    next.width = cw; next.height = ch;
    const ctx = next.getContext('2d')!;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, cw, ch);
    cur = next;
  }
  return cur;
}

export function dhash(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, n = 16): string {
  const small = downscale(src, sx, sy, sw, sh, n + 1, n);
  const c = document.createElement('canvas');
  c.width = n + 1; c.height = n;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(small, 0, 0, n + 1, n);
  const d = ctx.getImageData(0, 0, n + 1, n).data;
  const g = new Float32Array((n + 1) * n);
  for (let i = 0; i < g.length; i++) g[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
  let hex = '';
  let nib = 0, k = 0;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    nib = (nib << 1) | (g[y * (n + 1) + x] > g[y * (n + 1) + x + 1] ? 1 : 0);
    if (++k === 4) { hex += nib.toString(16); nib = 0; k = 0; }
  }
  return hex;
}
