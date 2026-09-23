import { createWorker, type Worker } from 'tesseract.js';
import { matchName, type NameIndex, type NameMatch } from './names';

let workerPromise: Promise<Worker> | null = null;

export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Modèle français : lit les noms de cartes (accents) aussi bien que les codes.
      const w = await createWorker('fra', 1);
      await w.setParameters({ preserve_interword_spaces: '1' });
      return w;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

export function warmUpOcr() {
  getOcrWorker().catch(() => undefined);
}

// Corrections des confusions classiques de l'OCR dans les groupes de chiffres d'un code.
const fixDigits = (s: string) => s.replace(/[OoQD]/g, '0').replace(/[IlL|]/g, '1').replace(/[Zz]/g, '2').replace(/[Ss]/g, '5').replace(/[Gb]/g, '6').replace(/[Tt]/g, '7').replace(/[B]/g, '8');
const DIGIT = '[0-9OoQDIlL|ZzSsGbTtB]';

/**
 * Extrait un code de carte (OP17-001, ST15-001, EB02-001, PRB01-001, P-001) d'un texte OCR bruité.
 * Le symbole de rareté qui suit le code est souvent lu comme un chiffre ("OP17-1170") : on ne
 * garde que les trois premiers chiffres du numéro.
 */
export function extractCode(text: string): string | null {
  const t = text.toUpperCase().replace(/[–—_]/g, '-');
  const m = t.match(new RegExp(`(0P|OP|QP|ST|EB|PRB|5T|E8)\\s?(${DIGIT}{2})\\s?-?\\s?(${DIGIT}{3})`));
  if (m) {
    const fam = m[1] === '0P' || m[1] === 'QP' ? 'OP' : m[1] === '5T' ? 'ST' : m[1] === 'E8' ? 'EB' : m[1];
    return `${fam}${fixDigits(m[2])}-${fixDigits(m[3])}`;
  }
  const p = t.match(new RegExp(`(?:^|[^A-Z])P\\s?-\\s?(${DIGIT}{3})`));
  if (p) return `P-${fixDigits(p[1])}`;
  return null;
}

export interface OcrResult { code: string | null; name: NameMatch | null; raw: string }

/**
 * Prépare une région d'un canvas pour l'OCR : agrandissement à `targetW` pixels de large,
 * niveaux de gris, étirement du contraste et, si demandé, inversion (le nom et le code sont
 * clairs sur fond sombre ; Tesseract préfère du texte sombre sur fond clair).
 */
function prepare(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, targetW: number, invert: boolean): HTMLCanvasElement {
  const scale = targetW / sw;
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = g; if (g < min) min = g; if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.round(((d[i] - min) / range) * 255);
    d[i] = d[i + 1] = d[i + 2] = invert ? 255 - v : v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let ocrQueue: Promise<unknown> = Promise.resolve();

// Un seul worker Tesseract : une analyse doit finir tous ses passages avant la suivante.
function recognize(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, targetW: number, names: NameIndex | null): Promise<OcrResult> {
  const next = ocrQueue.then(() => recognizeNow(src, sx, sy, sw, sh, targetW, names));
  ocrQueue = next.catch(() => undefined);
  return next;
}

async function recognizeNow(src: HTMLCanvasElement, sx: number, sy: number, sw: number, sh: number, targetW: number, names: NameIndex | null): Promise<OcrResult> {
  const worker = await getOcrWorker();
  let best: OcrResult = { code: null, name: null, raw: '' };
  for (const invert of [true, false]) {
    const { data } = await worker.recognize(prepare(src, sx, sy, sw, sh, targetW, invert));
    const raw = data.text ?? '';
    const r: OcrResult = { code: extractCode(raw), name: names ? matchName(raw, names) : null, raw: best.raw ? `${best.raw}\n---\n${raw}` : raw };
    // On garde le meilleur des deux passages ; la seconde (sans inversion) ne sert que si la
    // première n'a pas trouvé de code.
    best = { code: best.code ?? r.code, name: best.name && (!r.name || best.name.score <= r.name.score) ? best.name : r.name, raw: r.raw };
    if (best.code) break;
  }
  if (!best.code) {
    // Le code est petit et toujours en bas à droite : on relit ce coin seul, fortement agrandi.
    const { data } = await worker.recognize(prepare(src, sx + sw * 0.5, sy + sh * 0.55, sw * 0.5, sh * 0.45, 1600, true));
    const raw = data.text ?? '';
    best = { ...best, code: extractCode(raw), raw: `${best.raw}\n--- coin ---\n${raw}` };
  }
  return best;
}

/**
 * Lit le bas d'une carte cadrée en entier : le nom (grand, blanc sur fond sombre) et le code
 * imprimé en bas à droite ("OP09-001 L"). Bande 76 %–100 % de la hauteur : le cadrage n'est
 * jamais parfait et le nom peut se trouver plus haut ou plus bas que prévu.
 */
export function readCardText(cardCanvas: HTMLCanvasElement, names: NameIndex | null): Promise<OcrResult> {
  const w = cardCanvas.width, h = cardCanvas.height;
  const sy = Math.round(h * 0.76);
  return recognize(cardCanvas, 0, sy, w, h - sy, 2000, names);
}

/** Lit une photo rapprochée du bas de la carte (mode « bas de la carte ») : tout le canvas est la bande. */
export function readBandText(bandCanvas: HTMLCanvasElement, names: NameIndex | null): Promise<OcrResult> {
  return recognize(bandCanvas, 0, 0, bandCanvas.width, bandCanvas.height, 2400, names);
}
