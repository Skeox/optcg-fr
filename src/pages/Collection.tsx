import { useMemo, useState } from 'react';
import { useData } from '../data/catalogue';
import { CardGrid, PageHeader } from '../components/ui';
import FilterBar from '../components/FilterBar';
import { applyFilters, DEFAULT_FILTERS, type Filters } from '../lib/filters';
import { fmtEur } from '../lib/format';
import { useKeep } from '../lib/hooks';

export default function Collection() {
  const { catalogue, owned, priceFor, idx } = useData();
  const keep = useKeep();
  const [f, setF] = useState<Filters>({ ...DEFAULT_FILTERS, owning: 'possedees', sort: 'prix-desc' });
  const [group, setGroup] = useState(true);

  const cards = useMemo(() => {
    if (!catalogue) return [];
    return applyFilters(catalogue.cards, { ...f, owning: 'possedees' }, { qty: (id) => owned.get(id)?.qty ?? 0, price: priceFor, keep });
  }, [catalogue, f, owned, priceFor, keep]);

  const total = useMemo(() => cards.reduce((s, c) => s + (priceFor(c) ?? 0) * (owned.get(c.id)?.qty ?? 0), 0), [cards, priceFor, owned]);
  const copies = useMemo(() => cards.reduce((s, c) => s + (owned.get(c.id)?.qty ?? 0), 0), [cards, owned]);
  const unpriced = cards.filter((c) => priceFor(c) == null).length;

  const groups = useMemo(() => {
    if (!group || !idx || !catalogue) return null;
    const m = new Map<string, typeof cards>();
    for (const c of cards) { const k = c.series[0]; (m.get(k) ?? m.set(k, []).get(k)!).push(c); }
    return catalogue.series.filter((s) => m.has(s.id)).map((s) => ({ s, cards: m.get(s.id)! }));
  }, [group, cards, idx, catalogue]);

  if (!catalogue) return null;
  return (
    <div className="space-y-3">
      <PageHeader
        title="Collection"
        sub={`${cards.length} cartes · ${copies} exemplaires · minimums CardTrader VF : ${fmtEur(cards.length > 0 && unpriced === cards.length ? null : total)}`}
        right={<button className={`chip ${group ? 'chip-on' : ''}`} onClick={() => setGroup((g) => !g)}>Par série</button>}
      />
      {unpriced > 0 && <p className="text-xs text-ink-2">Total partiel : {unpriced} carte(s) sans prix VF, exclue(s) des montants.</p>}
      <FilterBar f={f} onChange={setF} hideOwning />
      {groups ? (
        groups.map(({ s, cards: cs }) => (
          <section key={s.id}>
            <h2 className="mb-2 mt-4 flex items-baseline justify-between font-bold">
              <span>{s.code} <span className="font-normal text-ink-2">— {s.name}</span></span>
              <span className="text-sm text-ink-2">{cs.length}/{s.count} · {fmtEur(cs.reduce((t, c) => t + (priceFor(c) ?? 0) * (owned.get(c.id)?.qty ?? 0), 0), { compact: true })}</span>
            </h2>
            <CardGrid cards={cs} pageSize={30} />
          </section>
        ))
      ) : (
        <CardGrid cards={cards} />
      )}
    </div>
  );
}
