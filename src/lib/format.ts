const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function fmtEur(v: number | null | undefined, opts: { compact?: boolean } = {}): string {
  if (v == null || Number.isNaN(v)) return '—';
  return opts.compact && Math.abs(v) >= 100 ? eur0.format(v) : eur.format(v);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const s = v > 0 ? '+' : '';
  return `${s}${v.toFixed(1).replace('.', ',')} %`;
}

export function variantLabel(variant: number, kind: string): string {
  if (variant === 0) return 'Standard';
  if (kind === 'r') return `Réimpression ${variant}`;
  return `Alternative ${variant}`;
}

export const RARITY_LABEL: Record<string, string> = {
  C: 'Commune', UC: 'Peu commune', R: 'Rare', SR: 'Super rare', SEC: 'Secrète', L: 'Leader',
  P: 'Promo', TR: 'Treasure rare', 'SP CARD': 'Spéciale', 'SP R': 'Spéciale R', 'SR SP': 'SR spéciale', 'SP SR': 'SR spéciale', 'SP SEC': 'SEC spéciale',
};

export const TYPE_LABEL: Record<string, string> = {
  LEADER: 'Leader', PERSONNAGE: 'Personnage', 'ÉVÉNEMENTS': 'Événement', LIEU: 'Lieu',
};

export const COLOR_CLASS: Record<string, string> = {
  Rouge: 'bg-op-rouge', Vert: 'bg-op-vert', Bleu: 'bg-op-bleu', Violet: 'bg-op-violet', Noir: 'bg-op-noir', Jaune: 'bg-op-jaune',
};

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
