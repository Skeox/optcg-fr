export interface Card {
  id: string; // identifiant de variante, ex. "OP17-001_p1"
  code: string; // ex. "OP17-001"
  set: string; // ex. "OP17", "ST15", "P", "PRB01"
  variant: number; // 0 = base, n = _pn / _rn
  variantKind: '' | 'p' | 'r' | string;
  name: string;
  rarity: string;
  type: string;
  image: string; // chemin relatif sur le site officiel
  cost: number | null;
  life: number | null;
  attribute: string;
  power: number | null;
  counter: number | null;
  color: string;
  colors: string[];
  block: string;
  traits: string[];
  effect: string;
  trigger: string;
  extension: string;
  series: string[]; // identifiants de séries (pages officielles) où la carte apparaît
}

export interface Series {
  id: string;
  code: string;
  name: string;
  kind: 'booster' | 'extra' | 'premium' | 'starter' | 'promo' | 'other';
  cm: number[]; // extensions Cardmarket correspondantes
  count: number;
}

export interface Catalogue {
  generatedAt: string;
  source: string;
  imageBase: string;
  series: Series[];
  cards: Card[];
}

export interface CmProduct {
  id: number;
  name: string;
  code: string;
  exp: number;
  expName: string;
  expSlug: string | null;
  foreign: boolean;
  added: string | null;
  avg: number | null;
  low: number | null;
  trend: number | null;
  avg1: number | null;
  avg7: number | null;
  avg30: number | null;
  version: number;
}

export interface Prices {
  updatedAt: string;
  game: number;
  count: number;
  products: Record<string, CmProduct>;
  byCode: Record<string, number[]>;
}

/** Relevé des annonces en français (scripts/update-prices-fr.mjs), par produit Cardmarket. */
export interface PriceFr {
  at: string; // date du relevé AAAA-MM-JJ
  n: number; // nombre d'annonces en français
  from: number | null; // prix le plus bas en français
  med: number | null; // médiane des annonces affichées (30 moins chères)
  nm: number | null; // moins cher en état NM/MT
}

export interface PricesFr {
  updatedAt: string | null;
  products: Record<string, PriceFr>;
}

export interface History {
  dates: string[];
  trend: Record<string, (number | null)[]>; // centimes
  low: Record<string, (number | null)[]>;
}

export interface Hashes {
  generatedAt: string;
  size: number;
  art: { left: number; top: number; width: number; height: number };
  entries: Record<string, { full: string; art: string }>;
}
