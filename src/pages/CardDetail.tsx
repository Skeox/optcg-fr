import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../data/catalogue';
import { CardImage, ColorDots, PageHeader, QtyControl, Sparkline, VariantBadge } from '../components/ui';
import { candidatesFor, productUrl, refPrice, searchUrl } from '../lib/cardmarket';
import { fmtEur, RARITY_LABEL, TYPE_LABEL } from '../lib/format';
import { db, type Snapshot } from '../db';

export default function CardDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { catalogue, idx, prices, history, productFor, mappingSure, overrides } = useData();
  const card = idx?.byId.get(decodeURIComponent(id));
  const product = card ? productFor(card) : undefined;
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
    if (history?.trend[product.id]) history.dates.forEach((d, i) => { const v = history.trend[product.id][i]; if (v != null) pts.set(d, v / 100); });
    for (const s of snaps) if (s.trend != null) pts.set(s.date, s.trend);
    return [...pts.keys()].sort().map((d) => pts.get(d)!);
  }, [product, history, snaps]);

  if (!card || !catalogue) return <div className="py-10 text-center text-ink-2">Carte introuvable. <Link className="text-accent" to="/cartes">Retour</Link></div>;
  const series = card.series.map((s) => idx!.seriesById.get(s)).filter(Boolean);
  const manual = overrides.get(card.id) != null;

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
            <div className="label">Cardmarket {manual && <span className="text-accent">(choix manuel)</span>}</div>
            {product ? (
              <>
                <div className="mt-1 text-3xl font-black">{fmtEur(refPrice(product))}</div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 text-xs text-ink-2">
                  <span>Mini : <b className="text-ink">{fmtEur(product.low)}</b></span>
                  <span>Moy. 7 j : <b className="text-ink">{fmtEur(product.avg7)}</b></span>
                  <span>Moy. 1 j : <b className="text-ink">{fmtEur(product.avg1)}</b></span>
                  <span>Moy. 30 j : <b className="text-ink">{fmtEur(product.avg30)}</b></span>
                </div>
                <div className="mt-1 text-xs text-ink-2">{product.expName} · V{product.version}</div>
                {!mappingSure(card) && <div className="mt-1 text-xs text-warn">Association incertaine : vérifiez le produit dans la liste ci-dessous.</div>}
                <a className="btn-ghost mt-3 w-full text-sm" href={productUrl(product)} target="_blank" rel="noreferrer">Voir les annonces en français ↗</a>
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
          <div className="label">Évolution du prix tendance</div>
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
                  onClick={() => (on ? db.overrides.delete(card.id) : db.overrides.put({ cardId: card.id, productId: p.id }))}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm ${on ? 'border-accent bg-accent/10' : 'border-line'}`}
                >
                  <span className={p.foreign ? 'text-ink-2' : ''}>{p.expName} · V{p.version}{p.foreign ? ' · hors Europe' : ''}</span>
                  <span className="font-semibold">{fmtEur(refPrice(p))}</span>
                </button>
              );
            })}
          </div>
          {manual && <button className="mt-2 text-xs text-ink-2 underline" onClick={() => db.overrides.delete(card.id)}>Revenir au choix automatique</button>}
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
