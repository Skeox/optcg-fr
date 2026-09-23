import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../data/catalogue';
import { CardImage, ColorDots, PageHeader, QtyControl, Sparkline, VariantBadge } from '../components/ui';
import { candidatesFor, productUrl, searchUrl } from '../lib/cardmarket';
import { fmtDate, fmtEur, RARITY_LABEL, TYPE_LABEL } from '../lib/format';
import { db, saveOverride, type Snapshot } from '../db';

export default function CardDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { catalogue, idx, prices, productFor, mappingSure, overrides, priceFor, frFor } = useData();
  const card = idx?.byId.get(decodeURIComponent(id));
  const product = card ? productFor(card) : undefined;
  const quote = card ? frFor(card) : undefined;
  const candidates = useMemo(() => (card && prices ? candidatesFor(card.code, prices) : []), [card, prices]);
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
      <PageHeader title={card.name} sub={<span className="flex items-center gap-2"><ColorDots colors={card.colors} />{card.code} · {card.rarity} · {TYPE_LABEL[card.type] ?? card.type} <VariantBadge card={card} /></span>} />

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        <CardImage card={card} eager />
        <div className="space-y-3">
          <div className="panel">
            <div className="label">Dans ma collection</div>
            <div className="mt-2"><QtyControl cardId={card.id} big /></div>
          </div>
          <div className="panel">
            <div className="label">Minimum CardTrader · français</div>
            {product ? (
              <>
                {quote && priceFor(card) != null ? (
                  <>
                    <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-black">{fmtEur(priceFor(card))}</span><span className="rounded bg-ok/20 px-1.5 py-0.5 text-xs font-bold text-ok">VF</span></div>
                    <div className="mt-1 text-[11px] text-ink-2">Relevé CardTrader du {fmtDate(quote.at)} · tous états · hors frais de port</div>
                  </>
                ) : (
                  <>
                    <div className="mt-1 text-lg font-bold">Prix VF indisponible</div>
                    <p className="mt-1 text-xs text-ink-2">Aucune annonce française CardTrader en euros disponible dans le dernier relevé pour cette version.</p>
                  </>
                )}
                <div className="mt-1 text-xs text-ink-2">{product.expName} · V{product.version}</div>
                {!mappingSure(card) && <div className="mt-1 text-xs text-warn">Association incertaine : vérifiez le produit dans la liste ci-dessous.</div>}
                <a className="btn-ghost mt-3 w-full text-sm" href={productUrl(product)} target="_blank" rel="noreferrer">Prix français sur Cardmarket ↗</a>
              </>
            ) : (
              <>
                <div className="mt-1 text-sm text-ink-2">Aucun produit Cardmarket connu pour ce code.</div>
                <a className="btn-ghost mt-3 w-full text-sm" href={searchUrl(card.code)} target="_blank" rel="noreferrer">Chercher sur Cardmarket ↗</a>
              </>
            )}
          </div>
        </div>
      </div>

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
              <Link key={s.id} to={`/carte/${encodeURIComponent(s.id)}`} className="text-center text-xs">
                <CardImage card={s} />
                <div className="mt-1"><VariantBadge card={s} /></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {candidates.length > 1 && (
        <section className="panel">
          <div className="label mb-2">Produits Cardmarket pour {card.code} — choisir celui qui correspond</div>
          <div className="space-y-1">
            {candidates.map((p) => {
              const on = product?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => saveOverride(card.id, on ? null : p.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${on ? 'border-accent bg-accent/10' : 'border-line'}`}
                >
                  <span className={p.foreign ? 'text-ink-2' : ''}>{p.expName} · V{p.version}{p.foreign ? ' · hors Europe' : ''}</span>
                  <span className="text-xs text-ink-2">{on ? 'Sélectionné' : 'Choisir'}</span>
                </button>
              );
            })}
          </div>
          {manualProduct && <button className="mt-2 text-xs text-ink-2 underline" onClick={() => saveOverride(card.id, null)}>Revenir au choix automatique</button>}
        </section>
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
