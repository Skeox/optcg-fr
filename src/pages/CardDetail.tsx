import { useLayoutEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../data/catalogue';
import { CardImage, ColorDots, PageHeader, QtyControl, Sparkline, VariantBadge } from '../components/ui';
import { productUrl, searchUrl } from '../lib/cardmarket';
import { fmtDate, RARITY_LABEL, TYPE_LABEL } from '../lib/format';
import { db, saveOverride, type Snapshot } from '../db';
import LanguagePrices from '../components/LanguagePrices';
import ManualPriceEditor from '../components/ManualPriceEditor';

export default function CardDetail() {
  const { id = '' } = useParams();
  return <CardVersionDetail key={id} id={id} />;
}

function CardVersionDetail({ id }: { id: string }) {
  const nav = useNavigate();
  const { catalogue, idx, productFor, mappingSure, overrides, frFor } = useData();
  useLayoutEffect(() => {
    const reset = () => window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    reset();
    const frame = requestAnimationFrame(reset);
    return () => cancelAnimationFrame(frame);
  }, [id, catalogue]);
  const card = idx?.byId.get(decodeURIComponent(id));
  const product = card ? productFor(card) : undefined;
  const quote = card ? frFor(card) : undefined;
  const siblings = card ? (idx?.byCode.get(card.code) ?? []).filter((c) => c.id !== card.id) : [];
  const snaps = useLiveQuery(
    async (): Promise<Snapshot[]> => (product ? db.snapshots.where('productId').equals(product.id).sortBy('date') : []),
    [product?.id],
    [] as Snapshot[],
  );

  const curve = useMemo(() => {
    if (!product) return [] as (number | null)[];
    const pts = new Map<string, number>();
    for (const s of snaps) { if (s.ctFr != null) pts.set(s.date, s.ctFr); }
    return [...pts.keys()].sort().map((d) => pts.get(d)!);
  }, [product, snaps]);

  if (!card || !catalogue) return <div className="py-10 text-center text-ink-2">Carte introuvable. <Link className="text-accent" to="/cartes">Retour</Link></div>;
  const series = card.series.map((s) => idx!.seriesById.get(s)).filter(Boolean);
  const manualProduct = overrides.get(card.id) != null;

  return (
    <div className="space-y-4">
      <button className="text-sm text-ink-2" onClick={() => nav(-1)}>‹ Retour</button>
      <PageHeader title={card.name} sub={<span className="flex flex-wrap items-center gap-2"><ColorDots colors={card.colors} />{card.code} · {card.rarity} · {TYPE_LABEL[card.type] ?? card.type} <VariantBadge card={card} /></span>} />

      <div className="grid grid-cols-2 items-stretch gap-3">
        <CardImage card={card} eager />
        <div className="relative min-w-0">
          <div className="absolute inset-0 flex flex-col gap-3">
            <div className="panel shrink-0 !p-3">
              <div className="label">Dans ma collection</div>
              <div className="mt-2"><QtyControl cardId={card.id} /></div>
            </div>
            <div className="panel min-h-0 flex-1 overflow-auto !p-3">
              <div className="label">Version de la carte</div>
              <div className="mt-2 text-sm font-semibold"><VariantBadge card={card} /></div>
              <div className="mt-2 text-xs text-ink-2">{series.map((s) => <div key={s!.id}>{s!.code} — {s!.name}</div>)}</div>
              <div className="mt-2 break-all text-xs text-ink-2">{card.id}</div>
            </div>
          </div>
        </div>
      </div>

      <section className="panel space-y-3">
        <div className="label">Prix par version · en €</div>
        <LanguagePrices card={card} />
        <p className="text-[11px] text-ink-2">Prix automatiques : CardTrader{quote ? ` · ${fmtDate(quote.at)}` : ''} · hors port</p>
        {!mappingSure(card) && <p className="text-xs text-warn">Version à vérifier sur Cardmarket.</p>}
        <div className="flex flex-wrap items-start justify-between gap-2 border-t border-line pt-2">
          <ManualPriceEditor card={card} />
          <a className="btn-ghost text-xs" href={product ? productUrl(product) : searchUrl(card.code)} target="_blank" rel="noreferrer">Prix sur Cardmarket ↗</a>
        </div>
      </section>

      {product && (
        <div className="panel">
          <div className="label">Évolution du minimum CardTrader VF</div>
          <Sparkline values={curve} className="mt-2 h-24 w-full" />
        </div>
      )}

      <div className="panel space-y-2 text-sm">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={card.type === 'LEADER' ? 'Vie' : 'Coût'} value={card.type === 'LEADER' ? card.life : card.cost} />
          <Stat label="Puissance" value={card.power} />
          <Stat label="Contre" value={card.counter} />
        </div>
        <div className="text-ink-2">Attribut : <b className="text-ink">{card.attribute || '—'}</b> · Bloc : <b className="text-ink">{card.block || '—'}</b> · Rareté : <b className="text-ink">{RARITY_LABEL[card.rarity] ?? card.rarity}</b></div>
        {card.traits.length > 0 && <div className="flex flex-wrap gap-1">{card.traits.map((t) => <Link key={t} to={`/cartes?q=${encodeURIComponent(t)}`} className="chip">{t}</Link>)}</div>}
        {card.effect && <p className="leading-relaxed">{card.effect}</p>}
        {card.trigger && <p className="leading-relaxed text-accent">{card.trigger}</p>}
        <div className="text-xs text-ink-2">{series.map((s) => <Link key={s!.id} to={`/cartes?serie=${s!.id}`} className="mr-2 underline">{s!.code} — {s!.name}</Link>)}</div>
      </div>

      {siblings.length > 0 && (
        <section>
          <h2 className="mb-2 font-bold">Autres versions de {card.code}</h2>
          <div className="grid grid-cols-3 gap-3">
            {siblings.map((s) => (
              <Link key={s.id} to={`/carte/${encodeURIComponent(s.id)}`} aria-label={`Ouvrir ${s.name} — ${s.id}`} className="text-center text-xs">
                <CardImage card={s} />
                <div className="mt-1"><VariantBadge card={s} /></div>
                <div className="mt-1 text-ink-2">{s.series.map((sid) => idx?.seriesById.get(sid)?.code).filter(Boolean).join(' · ')}</div>
                <div className="mt-2"><LanguagePrices card={s} /></div>
                <div className="mt-1 text-accent">Voir cette version →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {manualProduct && (
        <div className="panel text-xs text-ink-2">
          <p>Une association de prix choisie manuellement est enregistrée pour cette carte.</p>
          <button className="mt-2 underline" onClick={() => saveOverride(card.id, null)}>Rétablir l’association automatique de cette version</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-lg bg-bg-3 py-2">
      <div className="label">{label}</div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}
