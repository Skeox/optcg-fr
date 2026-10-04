import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useData } from '../data/catalogue';
import { CardGrid, PageHeader } from '../components/ui';
import FilterBar from '../components/FilterBar';
import { applyFilters, DEFAULT_FILTERS, type Filters, type Owning } from '../lib/filters';
import { useKeep } from '../lib/hooks';
import { addCards } from '../db';

export default function Cards() {
  const { catalogue, owned, priceFor } = useData();
  const [params] = useSearchParams();
  const keep = useKeep();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [message, setMessage] = useState('');
  const toggle = (id: string) => setSelected((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addSelection = async () => {
    if (busy.current || selected.size === 0) return;
    busy.current = true;
    setSaving(true);
    setMessage('');
    try {
      await addCards([...selected]);
      setMessage(`${selected.size} carte(s) ajoutée(s) : un exemplaire de chaque.`);
      setSelected(new Set());
      setSelecting(false);
    } catch {
      setMessage('Ajout impossible. Votre sélection est conservée, réessayez.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
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
      <button className={selecting ? 'btn-primary' : 'btn-ghost'} aria-pressed={selecting} disabled={saving} onClick={() => { setSelecting(!selecting); setSelected(new Set()); setMessage(''); }}> {selecting ? 'Annuler la sélection' : 'Sélection'}</button>
      <FilterBar f={f} onChange={setF} />
      {selecting && <div className="panel sticky top-0 z-20 space-y-2 shadow-lg" aria-label="Actions de sélection">
        <p className="font-semibold" aria-live="polite">{selected.size} carte(s) sélectionnée(s)</p>
        <p className="text-sm text-ink-2">Touchez les cartes à ajouter. Un exemplaire de chaque sera ajouté à votre collection.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost text-sm" disabled={saving || cards.length === 0} onClick={() => setSelected((prev) => new Set([...prev, ...cards.map((c) => c.id)]))}>Tout sélectionner ({cards.length} résultats)</button>
          <button className="btn-ghost text-sm" disabled={saving || selected.size === 0} onClick={() => setSelected(new Set())}>Tout désélectionner</button>
          <button className="btn-primary w-full" disabled={saving || selected.size === 0} onClick={addSelection}>{saving ? 'Ajout en cours…' : `Ajouter la sélection (${selected.size})`}</button>
        </div>
      </div>}
      {message && <p role="status" className="panel text-sm">{message}</p>}
      <CardGrid cards={cards} selection={selecting ? { selected, toggle, disabled: saving } : undefined} />
    </div>
  );
}
