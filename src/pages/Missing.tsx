import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useData } from '../data/catalogue';
import { CardGrid, PageHeader } from '../components/ui';
import { fmtEur } from '../lib/format';
import type { Card } from '../types';

export default function Missing() {
  const { catalogue, owned, priceFor, productFor, frFor } = useData();
  const [baseOnly, setBaseOnly] = useState(true);
  const [openSeries, setOpenSeries] = useState<string | null>(null);

  const data = useMemo(() => {
    if (!catalogue) return [];
    return catalogue.series.map((s) => {
      let cards = catalogue.cards.filter((c) => c.series.includes(s.id));
      if (baseOnly) {
        // "de base" = la variante la plus basse de chaque code au sein de la série
        const min = new Map<string, number>();
        for (const c of cards) min.set(c.code, Math.min(min.get(c.code) ?? Infinity, c.variant));
        cards = cards.filter((c) => c.variant === min.get(c.code));
      }
      const missing = cards.filter((c) => !(owned.get(c.id)?.qty ?? 0));
      const costLow = missing.reduce((t, c) => t + (frFor(c)?.from ?? productFor(c)?.low ?? priceFor(c) ?? 0), 0);
      const costTrend = missing.reduce((t, c) => t + (priceFor(c) ?? 0), 0);
      const sorted = missing.slice().sort((a, b) => (priceFor(b) ?? 0) - (priceFor(a) ?? 0));
      return { s, total: cards.length, missing: sorted, costLow, costTrend };
    });
  }, [catalogue, owned, priceFor, productFor, frFor, baseOnly]);

  const totals = data.reduce((t, d) => ({ n: t.n + d.missing.length, low: t.low + d.costLow, trend: t.trend + d.costTrend }), { n: 0, low: 0, trend: 0 });
  if (!catalogue) return null;

  return (
    <div className="space-y-3">
      <PageHeader title="Cartes manquantes" sub={`${totals.n} cartes · ≈ ${fmtEur(totals.low)} au prix mini, ${fmtEur(totals.trend)} en tendance`} />
      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" checked={baseOnly} onChange={(e) => setBaseOnly(e.target.checked)} />
        Ne compter que les versions de base (ignorer les parallèles)
      </label>
      <div className="space-y-2">
        {data.map(({ s, total, missing, costLow, costTrend }) => {
          const have = total - missing.length;
          const pct = total ? Math.round((have / total) * 100) : 0;
          const open = openSeries === s.id;
          return (
            <div key={s.id} className="panel">
              <button className="w-full text-left" onClick={() => setOpenSeries(open ? null : s.id)}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-bold">{s.code} <span className="font-normal text-ink-2">— {s.name}</span></span>
                  <span className="shrink-0 text-sm font-semibold">{have}/{total}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-3">
                  <div className={`h-full ${pct === 100 ? 'bg-ok' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-xs text-ink-2">
                  <span>{pct} % complet</span>
                  {missing.length > 0 && <span>manque {missing.length} · mini {fmtEur(costLow, { compact: true })} · tendance {fmtEur(costTrend, { compact: true })}</span>}
                </div>
              </button>
              {open && missing.length > 0 && (
                <div className="mt-3">
                  <MissingList cards={missing} />
                  <Link to={`/cartes?serie=${s.id}&etat=manquantes`} className="mt-3 block text-center text-sm text-accent">Ouvrir avec les filtres ›</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MissingList({ cards }: { cards: Card[] }) {
  return <CardGrid cards={cards} pageSize={30} />;
}
