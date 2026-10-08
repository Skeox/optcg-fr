import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Card } from '../types';
import { useData, imageUrl } from '../data/catalogue';
import { COLOR_CLASS, variantLabel } from '../lib/format';
import { addQty } from '../db';
import LanguagePrices from './LanguagePrices';

export function CardImage({ card, className = '', eager = false }: { card: Card; className?: string; eager?: boolean }) {
  const { catalogue } = useData();
  const [failedId, setFailedId] = useState<string | null>(null);
  if (!catalogue) return null;
  if (failedId === card.id) {
    return <div className={`card-aspect flex items-center justify-center rounded-lg bg-bg-3 text-xs text-ink-2 ${className}`}>{card.code}</div>;
  }
  return (
    <img
      src={imageUrl(catalogue, card)}
      alt={card.name}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedId(card.id)}
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

type CardSelection = { selected: ReadonlySet<string>; toggle: (id: string) => void; disabled?: boolean };

export function CardTile({ card, showQty = true, selection }: { card: Card; showQty?: boolean; selection?: CardSelection }) {
  const { owned } = useData();
  const qty = owned.get(card.id)?.qty ?? 0;
  const content = <>
      <div className="relative">
        <CardImage card={card} className={qty === 0 && showQty ? 'opacity-60 grayscale-[35%]' : ''} />
        {showQty && qty > 0 && (
          <span className="absolute right-1 top-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-bg shadow">×{qty}</span>
        )}
        {card.variant > 0 && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{card.variantKind === 'r' ? 'R' : 'ALT'} {card.variant}</span>
        )}
        {selection && <span aria-hidden="true" className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow ${selection.selected.has(card.id) ? 'border-accent bg-accent text-bg' : 'border-white bg-bg/90 text-white'}`}>{selection.selected.has(card.id) ? '✓' : '+'}</span>}
      </div>
      <div className="space-y-2 px-2 py-3">
        <div className="min-h-10 break-words text-sm font-semibold leading-5">{card.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
          <span className="font-medium text-ink">{card.code}</span>
          <span className="flex items-center gap-1"><ColorDots colors={card.colors} />{card.rarity}</span>
        </div>
        <div className="border-t border-line pt-2 text-sm font-bold text-ink">
          <LanguagePrices card={card} />
        </div>
      </div>
    </>;
  const className = 'block h-full w-full min-w-0 overflow-hidden rounded-xl border bg-bg-2 text-left focus-visible:outline-2 focus-visible:outline-accent ';
  return selection ? (
    <button type="button" className={className + (selection.selected.has(card.id) ? 'border-accent ring-2 ring-accent' : 'border-line')} aria-pressed={selection.selected.has(card.id)} aria-label={`Sélectionner ${card.name} (${card.id})`} disabled={selection.disabled} onClick={() => selection.toggle(card.id)}>{content}</button>
  ) : <Link to={`/carte/${encodeURIComponent(card.id)}`} className={className + 'border-line'}>{content}</Link>;
}

export function CardGrid({ cards, pageSize = 60, selection }: { cards: Card[]; pageSize?: number; selection?: CardSelection }) {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => setLimit(pageSize), [cards, pageSize]);
  const shown = cards.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((c) => <CardTile key={c.id} card={c} selection={selection} />)}
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
