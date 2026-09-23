import type { Match } from './scan';
import { distance } from './scan';

export const FALLBACK_DELAY_MS = 20_000;

/** La répétition confirme le code ; les variantes restent à choisir dans les résultats. */
export function liveCandidate(matches: Match[]): string | null {
  const top = matches[0];
  if (!top || distance(top) > 68) return null;
  const otherCode = matches.find((m) => m.card.code !== top.card.code);
  if (otherCode && distance(otherCode) - distance(top) < 12) return null;
  return top.card.code;
}

export class StableDetection {
  private code: string | null = null;
  private count = 0;
  private readonly required: number;
  constructor(required = 3) { this.required = required; }

  observe(code: string | null): boolean {
    this.count = code && code === this.code ? this.count + 1 : code ? 1 : 0;
    this.code = code;
    return this.count >= this.required;
  }
}
