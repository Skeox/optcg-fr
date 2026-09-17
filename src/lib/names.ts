// Rapprochement flou entre le texte lu par l'OCR et les noms de cartes du catalogue.
// Le nom imprimé en bas de la carte est grand et contrasté : il se lit bien mieux que le petit
// code (OP17-117) et suffit souvent à identifier la carte, l'image départageant ensuite les
// versions (base, alternative) et les cartes homonymes.
import type { Card } from '../types';

export interface NameIndex {
  /** nom normalisé -> nom d'origine (premier rencontré) */
  names: [string, string][];
}

/** Sans accents, en majuscules, ponctuation réduite à des espaces. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function buildNameIndex(cards: Card[]): NameIndex {
  const seen = new Map<string, string>();
  for (const c of cards) {
    const n = normalizeName(c.name);
    if (n.length >= 3 && !seen.has(n)) seen.set(n, c.name);
  }
  return { names: [...seen.entries()] };
}

function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev = new Uint16Array(b.length + 1), cur = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > limit) return limit + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export interface NameMatch { name: string; norm: string; score: number; line: string }

/**
 * Cherche, ligne par ligne, le nom de carte le plus proche du texte OCR.
 * score = distance d'édition / longueur (0 = identique) ; on n'accepte que score <= maxScore.
 */
export function matchName(text: string, index: NameIndex, maxScore = 0.25): NameMatch | null {
  let best: NameMatch | null = null;
  const lines = text.split('\n').map(normalizeName).filter((l) => l.length >= 4);
  for (const line of lines) {
    for (const [norm, name] of index.names) {
      let score: number;
      if (norm.length >= 5 && line.includes(norm)) score = 0.05 * Math.max(0, (line.length - norm.length) / norm.length);
      else {
        const len = Math.max(line.length, norm.length);
        const limit = Math.floor(len * maxScore);
        const d = levenshtein(line, norm, limit);
        if (d > limit) continue;
        score = d / len;
      }
      if (score <= maxScore && (!best || score < best.score || (score === best.score && norm.length > best.norm.length))) {
        best = { name, norm, score, line };
      }
    }
  }
  return best;
}
