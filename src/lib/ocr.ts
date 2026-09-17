import { createWorker, type Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

export function getOcrWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const w = await createWorker('eng', 1);
      await w.setParameters({
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-/ ',
        preserve_interword_spaces: '1',
      });
      return w;
    })();
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

export function warmUpOcr() {
  getOcrWorker().catch(() => undefined);
}

const fixDigits = (s: string) => s.replace(/[OoQD]/g, '0').replace(/[IlL|]/g, '1').replace(/[Ss]/g, '5').replace(/[Bb]/g, '8');

/** Extrait un code de carte (OP17-001, ST15-001, EB02-001, PRB01-001, P-001) d'un texte OCR bruité. */
export function extractCode(text: string): string | null {
  const t = text.toUpperCase().replace(/[–—_]/g, '-');
  const m = t.match(/(0P|OP|ST|EB|PRB|5T|E8)\s?([0-9OIlSB]{2})\s?-?\s?([0-9OIlSB]{3})(?![0-9])/);
  if (m) {
    const fam = m[1] === '0P' ? 'OP' : m[1] === '5T' ? 'ST' : m[1] === 'E8' ? 'EB' : m[1];
    return `${fam}${fixDigits(m[2])}-${fixDigits(m[3])}`;
  }
  const p = t.match(/(?:^|[^A-Z])P\s?-\s?([0-9OIlSB]{3})(?![0-9])/);
  if (p) return `P-${fixDigits(p[1])}`;
  return null;
}

/**
 * Lit le code imprimé dans la bande inférieure d'une carte cadrée (à droite : "OP09-001 L").
 * Retourne le code normalisé ou null.
 */
export async function readCardCode(cardCanvas: HTMLCanvasElement): Promise<{ code: string | null; raw: string }> {
  const w = cardCanvas.width, h = cardCanvas.height;
  // Bande inférieure complète (le code est à droite, mais un cadrage décalé peut le déplacer).
  const sx = 0, sy = Math.round(h * 0.88), sw = w, sh = h - sy;
  const scale = 2400 / w;
  const c = document.createElement('canvas');
  c.width = sw * scale; c.height = sh * scale;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cardCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // Niveaux de gris + renforcement du contraste. Le texte est clair sur fond sombre : on inverse.
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
  return { code: extractCode(data.text ?? ''), raw: data.text ?? '' };
}
