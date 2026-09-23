import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Card } from '../types';
import { useData, imageUrl } from '../data/catalogue';
import { COLOR_CLASS, fmtEur, variantLabel } from '../lib/format';
import { addQty } from '../db';
import { productUrl, searchUrl } from '../lib/cardmarket';

export function CardImage({ card, className = '', eager = false }: { card: Card; className?: string; eager?: boolean }) {
  const { catalogue } = useData();
  const [failed, setFailed] = useState(false);
  if (!catalogue) return null;
  if (failed) {
    return <div className={`card-aspect flex items-center justify-center rounded-lg bg-bg-3 text-xs text-ink-2 ${className}`}>{card.code}</div>;
  }
  return (
    <img
      src={imageUrl(catalogue, card)}
      alt={card.name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`card-aspect w-full rounded-lg bg-bg-3 object-cover ${className}`}
    />
  );
}

export function ColorDots({ colors, size = 'h-2.5 w-2.5' }: { colors: string[]; size?: string }) {
  return (
    <span className="inline-flex gap-0.5">
      {colors.map((c) => <span key={c} className={`${size} rounded-full ${COLOR_CLASS[c] ?? 'bg-ink-2'}`} title={c} />)}
    </span>
  );
}

export function CardTile({ card, showQty = true }: { card: Card; showQty?: boolean }) {
  const { owned, priceFor, priceKind, productFor } = useData();
  const qty = owned.get(card.id)?.qty ?? 0;
  const price = priceFor(card);
  const vf = priceKind(card) === 'vf';
  const product = productFor(card);
  return (
    <div>
    <Link to={`/carte/${encodeURIComponent(card.id)}`} className="group block">
      <div className="relative">
        <CardImage card={card} className={qty === 0 && showQty ? 'opacity-60 grayscale-[35%]' : ''} />
        {showQty && qty > 0 && (
          <span className="absolute right-1 top-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-bg shadow">×{qty}</span>
        )}
        {card.variant > 0 && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{card.variantKind === 'r' ? 'R' : 'ALT'} {card.variant}</span>
        )}
      </div>
      <div className="mt-1.5 space-y-0.5 px-0.5">
        <div className="truncate text-sm font-semibold leading-tight">{card.name}</div>
        <div className="flex items-center justify-between text-xs text-ink-2">
          <span className="flex items-center gap-1"><ColorDots colors={card.colors} />{card.code} · {card.rarity}</span>
          <span className="font-semibold text-ink">{vf && <span className="mr-1 rounded bg-ok/20 px-1 text-[10px] font-bold text-ok">VF</span>}{fmtEur(price, { compact: true })}</span>
        </div>
      </div>
    </Link>
    <a className="mt-1 block text-right text-[10px] text-accent" href={product ? productUrl(product) : searchUrl(card.code)} target="_blank" rel="noreferrer">Cardmarket · français ↗</a>
    </div>
  );
}

export function CardGrid({ cards, pageSize = 60 }: { cards: Card[]; pageSize?: number }) {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => setLimit(pageSize), [cards, pageSize]);
  const shown = cards.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {shown.map((c) => <CardTile key={c.id} card={c} />)}
      </div>
      {cards.length === 0 && <p className="py-10 text-center text-ink-2">Aucune carte.</p>}
      {limit < cards.length && (
        <div className="py-4 text-center">
          <button className="btn-ghost" onClick={() => setLimit((l) => l + pageSize)}>
            Afficher plus ({cards.length - limit} restantes)
          </button>
        </div>
      )}
    </>
  );
}

export function QtyControl({ cardId, big = false }: { cardId: string; big?: boolean }) {
  const { owned } = useData();
  const qty = owned.get(cardId)?.qty ?? 0;
  const btn = big ? 'h-12 w-12 text-2xl' : 'h-9 w-9 text-lg';
  return (
    <div className="inline-flex items-center gap-2">
      <button className={`${btn} rounded-full border border-line bg-bg-3 font-bold`} onClick={() => addQty(cardId, -1)} disabled={qty === 0} aria-label="Retirer un exemplaire">−</button>
      <span className={`${big ? 'min-w-10 text-2xl' : 'min-w-6 text-base'} text-center font-bold`}>{qty}</span>
      <button className={`${btn} rounded-full bg-accent font-bold text-bg`} onClick={() => addQty(cardId, 1)} aria-label="Ajouter un exemplaire">+</button>
    </div>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4">
      <div className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-bg shadow-lg">{msg}</div>
    </div>
  );
}

export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 1800);
    return () => clearTimeout(t);
  }, [msg]);
  return [msg, setMsg];
}

export function PageHeader({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        {sub && <div className="text-sm text-ink-2">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

export function Sparkline({ values, className = 'h-16 w-full' }: { values: (number | null)[]; className?: string }) {
  const pts = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null);
  if (pts.length < 2) return <div className={`${className} flex items-center justify-center text-xs text-ink-2`}>Pas encore assez d'historique</div>;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const W = 300, H = 80, pad = 4;
  const x = (i: number) => pad + ((i - minX) / Math.max(1, maxX - minX)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - minY) / Math.max(0.01, maxY - minY)) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const up = ys[ys.length - 1] >= ys[0];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} preserveAspectRatio="none">
      <path d={d} fill="none" stroke={up ? 'var(--color-ok)' : 'var(--color-bad)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function VariantBadge({ card }: { card: Card }) {
  return <span className="rounded bg-bg-3 px-1.5 py-0.5 text-xs text-ink-2">{variantLabel(card.variant, card.variantKind)}</span>;
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex h-40 items-center justify-center text-ink-2">{label}</div>;
}
