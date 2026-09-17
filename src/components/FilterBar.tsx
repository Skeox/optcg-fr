import { useState } from 'react';
import { useData } from '../data/catalogue';
import { COLORS, RARITIES, TYPES, type Filters, type Owning, type SortKey } from '../lib/filters';
import { COLOR_CLASS, RARITY_LABEL, TYPE_LABEL } from '../lib/format';

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export default function FilterBar({ f, onChange, hideOwning = false }: { f: Filters; onChange: (f: Filters) => void; hideOwning?: boolean }) {
  const { catalogue } = useData();
  const [open, setOpen] = useState(false);
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const active = f.colors.length + f.types.length + f.rarities.length + (f.series ? 1 : 0) + (f.baseOnly ? 1 : 0);
  if (!catalogue) return null;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="input"
          type="search"
          placeholder="Nom, code (OP09-001), type, effet…"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <button className={`btn-ghost shrink-0 ${active ? 'border-accent text-accent' : ''}`} onClick={() => setOpen((o) => !o)}>
          Filtres{active ? ` (${active})` : ''}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {!hideOwning && (
          <select className="chip" value={f.owning} onChange={(e) => set({ owning: e.target.value as Owning })}>
            <option value="toutes">Toutes</option>
            <option value="possedees">Possédées</option>
            <option value="manquantes">Manquantes</option>
            <option value="doublons">En double</option>
          </select>
        )}
        <select className="chip" value={f.series} onChange={(e) => set({ series: e.target.value })}>
          <option value="">Toutes les séries</option>
          {catalogue.series.map((s) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
        </select>
        <select className="chip" value={f.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          <option value="code">Tri : numéro</option>
          <option value="prix-desc">Tri : prix ↓</option>
          <option value="prix-asc">Tri : prix ↑</option>
          <option value="nom">Tri : nom</option>
        </select>
      </div>
      {open && (
        <div className="panel space-y-3">
          <div>
            <div className="label mb-1">Couleur</div>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button key={c} className={`chip ${f.colors.includes(c) ? 'chip-on' : ''}`} onClick={() => set({ colors: toggle(f.colors, c) })}>
                  <span className={`h-2.5 w-2.5 rounded-full ${COLOR_CLASS[c]}`} />{c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1">Type</div>
            <div className="flex flex-wrap gap-2">
              {TYPES.map((t) => (
                <button key={t} className={`chip ${f.types.includes(t) ? 'chip-on' : ''}`} onClick={() => set({ types: toggle(f.types, t) })}>{TYPE_LABEL[t] ?? t}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="label mb-1">Rareté</div>
            <div className="flex flex-wrap gap-2">
              {RARITIES.map((r) => (
                <button key={r} className={`chip ${f.rarities.includes(r) ? 'chip-on' : ''}`} onClick={() => set({ rarities: toggle(f.rarities, r) })}>{r} · {RARITY_LABEL[r] ?? r}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.baseOnly} onChange={(e) => set({ baseOnly: e.target.checked })} />
            Masquer les versions alternatives (parallèles)
          </label>
          <button className="btn-ghost w-full" onClick={() => onChange({ ...f, colors: [], types: [], rarities: [], series: '', baseOnly: false })}>Réinitialiser les filtres</button>
        </div>
      )}
    </div>
  );
}
