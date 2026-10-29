import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { Card } from '../types';
import { useData, imageUrl } from '../data/catalogue';
import { COLOR_CLASS } from '../lib/format';
import { cardVariantLabel, printingFor } from '../lib/printings';
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
        {card.variant > 0 && !printingFor(card) && (
          <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">{card.variantKind === 'r' ? 'R' : 'ALT'} {card.variant}</span>
        )}
        {selection && <span aria-hidden="true" className={`absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow ${selection.selected.has(card.id) ? 'border-accent bg-accent text-bg' : 'border-white bg-bg/90 text-white'}`}>{selection.selected.has(card.id) ? '✓' : '+'}</span>}
      </div>
      <div className="space-y-1 px-2 py-2">
        <div className="truncate text-sm font-semibold leading-5" title={card.name}>{card.name}</div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
          <span className="font-medium text-ink">{card.code}</span>
          <span className="flex items-center gap-1"><ColorDots colors={card.colors} />{card.rarity}</span>
        </div>
        {printingFor(card) && <div className="text-xs text-ink-2">{cardVariantLabel(card)}</div>}
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

export function CardGrid({ cards, pageSize = 60, selection, quantityControls = false }: { cards: Card[]; pageSize?: number; selection?: CardSelection; quantityControls?: boolean }) {
  const [limit, setLimit] = useState(pageSize);
  const resultIds = cards.map((card) => card.id).join('|');
  useEffect(() => setLimit(pageSize), [resultIds, pageSize]);
  const shown = cards.slice(0, limit);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {shown.map((c) => quantityControls ? (
          <div key={c.id} className="flex min-w-0 flex-col gap-1">
            <CardTile card={c} selection={selection} />
            <div className="flex justify-center">
              <QtyControl cardId={c.id} subtle label={`${c.name} (${c.id})`} disabled={selection?.disabled} />
            </div>
          </div>
        ) : <CardTile key={c.id} card={c} selection={selection} />)}
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

export function QtyControl({ cardId, big = false, subtle = false, label, disabled = false }: { cardId: string; big?: boolean; subtle?: boolean; label?: string; disabled?: boolean }) {
  const { owned } = useData();
  const qty = owned.get(cardId)?.qty ?? 0;
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const change = async (delta: number) => {
    if (busy.current || disabled) return;
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await addQty(cardId, delta);
    } catch {
      setError('Modification impossible. Réessayez.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  const btn = `${subtle ? 'h-11 w-11 text-lg text-ink-2 hover:bg-bg-3 hover:text-ink' : big ? 'h-12 w-12 text-2xl' : 'h-9 w-9 text-lg'} rounded-full font-bold disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-accent`;
  const suffix = label ? ` de ${label}` : '';
  return (
    <div>
      <div className={`inline-flex items-center ${subtle ? 'gap-0 text-ink-2' : 'gap-2'}`} role="group" aria-label={`Quantité dans la collection${suffix}`} aria-busy={saving}>
        <button type="button" className={`${btn} ${subtle ? '' : 'border border-line bg-bg-3'}`} onClick={() => change(-1)} disabled={disabled || saving || qty === 0} aria-label={`Retirer un exemplaire${suffix}`}>−</button>
        <span className={`${big ? 'min-w-10 text-2xl' : subtle ? 'min-w-6 text-sm' : 'min-w-6 text-base'} text-center tabular-nums ${subtle ? '' : 'font-bold'}`} aria-live="polite">{qty}</span>
        <button type="button" className={`${btn} ${subtle ? '' : 'bg-accent text-bg'}`} onClick={() => change(1)} disabled={disabled || saving} aria-label={`Ajouter un exemplaire${suffix}`}>+</button>
      </div>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
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
  return <span className="rounded bg-bg-3 px-1.5 py-0.5 text-xs text-ink-2">{cardVariantLabel(card)}</span>;
}

export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex h-40 items-center justify-center text-ink-2">{label}</div>;
}
