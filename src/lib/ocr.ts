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

/** Extrait un code de carte (OP17-001, ST15-001, EB02-001, PRB01-001, P-001) d'un texte OCR bruité. */
export function extractCode(text: string): string | null {
  const t = text.toUpperCase().replace(/[–—_]/g, '-');
  const m = t.match(new RegExp(`(0P|OP|ST|EB|PRB|5T|E8)\\s?(${DIGIT}{2})\\s?-?\\s?(${DIGIT}{3})(?![0-9])`));
  if (m) {
    const fam = m[1] === '0P' ? 'OP' : m[1] === '5T' ? 'ST' : m[1] === 'E8' ? 'EB' : m[1];
    return `${fam}${fixDigits(m[2])}-${fixDigits(m[3])}`;
  }
  const p = t.match(new RegExp(`(?:^|[^A-Z])P\\s?-\\s?(${DIGIT}{3})(?![0-9])`));
  if (p) return `P-${fixDigits(p[1])}`;
  return null;
}

export interface OcrResult { code: string | null; name: NameMatch | null; raw: string }

/**
 * Lit le bas d'une carte cadrée : le nom (grand, blanc sur fond sombre) et le code imprimé
 * en bas à droite ("OP09-001 L"). Une seule passe OCR sur la bande 76 %–100 % de la hauteur :
 * le cadrage n'est jamais parfait et le nom peut se trouver plus haut ou plus bas que prévu.
 */
export async function readCardText(cardCanvas: HTMLCanvasElement, names: NameIndex | null): Promise<OcrResult> {
  const w = cardCanvas.width, h = cardCanvas.height;
  const sx = 0, sy = Math.round(h * 0.76), sw = w, sh = h - sy;
  const scale = 2000 / w;
  const c = document.createElement('canvas');
  c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cardCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // Niveaux de gris + renforcement du contraste. Le nom est clair sur fond sombre : on inverse.
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    d[i] = g; if (g < min) min = g; if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    const v = 255 - Math.round(((d[i] - min) / range) * 255);
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const worker = await getOcrWorker();
  const { data } = await worker.recognize(c);
  const raw = data.text ?? '';
  return { code: extractCode(raw), name: names ? matchName(raw, names) : null, raw };
}
