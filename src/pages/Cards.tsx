import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useData } from '../data/catalogue';
import { CardGrid, PageHeader } from '../components/ui';
import FilterBar from '../components/FilterBar';
import { applyFilters, DEFAULT_FILTERS, type Filters, type Owning } from '../lib/filters';
import { useKeep } from '../lib/hooks';

export default function Cards() {
  const { catalogue, owned, priceFor } = useData();
  const [params] = useSearchParams();
  const keep = useKeep();
  const [f, setF] = useState<Filters>(() => ({
    ...DEFAULT_FILTERS,
    series: params.get('serie') ?? '',
    owning: (params.get('etat') as Owning) ?? 'toutes',
    q: params.get('q') ?? '',
  }));
  // Les liens internes (série, état, recherche) changent les paramètres sans remonter la page.
  const key = `${params.get('serie') ?? ''}|${params.get('etat') ?? ''}|${params.get('q') ?? ''}`;
  useEffect(() => {
    const [serie, etat, q] = key.split('|');
    if (serie || etat || q) setF((prev) => ({ ...prev, series: serie, owning: (etat as Owning) || 'toutes', q }));
  }, [key]);
  const cards = useMemo(() => {
    if (!catalogue) return [];
    return applyFilters(catalogue.cards, f, { qty: (id) => owned.get(id)?.qty ?? 0, price: priceFor, keep });
  }, [catalogue, f, owned, priceFor, keep]);
  if (!catalogue) return null;
  return (
    <div className="space-y-3">
      <PageHeader title="Cartes" sub={`${cards.length} / ${catalogue.cards.length} variantes · version française`} />
      <FilterBar f={f} onChange={setF} />
      <CardGrid cards={cards} />
    </div>
  );
}
