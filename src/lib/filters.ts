import type { Card } from '../types';
import { normalize } from './format';

export type Owning = 'toutes' | 'possedees' | 'manquantes' | 'doublons';
export type SortKey = 'code' | 'prix-desc' | 'prix-asc' | 'nom' | 'recent';

export interface Filters {
  q: string;
  series: string; // id de série ou ''
  colors: string[];
  types: string[];
  rarities: string[];
  owning: Owning;
  baseOnly: boolean; // masquer les variantes alternatives
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = {
  q: '', series: '', colors: [], types: [], rarities: [], owning: 'toutes', baseOnly: false, sort: 'code',
};

export const RARITIES = ['L', 'C', 'UC', 'R', 'SR', 'SEC', 'TR', 'SP CARD', 'P'];
export const COLORS = ['Rouge', 'Vert', 'Bleu', 'Violet', 'Noir', 'Jaune'];
export const TYPES = ['LEADER', 'PERSONNAGE', 'ÉVÉNEMENTS', 'LIEU'];

export function rarityGroup(r: string): string {
  if (r.startsWith('SP') || r.endsWith('SP')) return 'SP CARD';
  return r;
}

export function applyFilters(
  cards: Card[],
  f: Filters,
  ctx: { qty: (id: string) => number; price: (c: Card) => number | null; keep: number },
): Card[] {
  const q = normalize(f.q.trim());
  let out = cards.filter((c) => {
    if (f.series && !c.series.includes(f.series)) return false;
    if (f.colors.length && !c.colors.some((x) => f.colors.includes(x))) return false;
    if (f.types.length && !f.types.includes(c.type)) return false;
    if (f.rarities.length && !f.rarities.includes(rarityGroup(c.rarity))) return false;
    if (f.baseOnly && c.variant > 0) return false;
    const qty = ctx.qty(c.id);
    if (f.owning === 'possedees' && qty === 0) return false;
    if (f.owning === 'manquantes' && qty > 0) return false;
    if (f.owning === 'doublons' && qty <= ctx.keep) return false;
    if (q) {
      const hay = normalize(`${c.name} ${c.code} ${c.id} ${c.traits.join(' ')} ${c.effect}`);
      if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  });
  const price = (c: Card) => ctx.price(c) ?? -1;
  switch (f.sort) {
    case 'prix-desc': out = out.slice().sort((a, b) => price(b) - price(a)); break;
    case 'prix-asc': out = out.slice().sort((a, b) => price(a) - price(b)); break;
    case 'nom': out = out.slice().sort((a, b) => a.name.localeCompare(b.name, 'fr') || a.code.localeCompare(b.code)); break;
    default: break; // ordre du catalogue (par extension puis code)
  }
  return out;
}
