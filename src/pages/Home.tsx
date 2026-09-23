import { useMemo } from 'react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../data/catalogue';
import { CardTile, PageHeader, Sparkline } from '../components/ui';
import { fmtDate, fmtEur, fmtPct } from '../lib/format';
import { db, type Snapshot } from '../db';
import { useKeep } from '../lib/hooks';

export default function Home() {
  const { catalogue, owned, priceFor, idx, productFor } = useData();
  const keep = useKeep();
  const snapshots = useLiveQuery(() => db.snapshots.toArray(), [], [] as Snapshot[]);

  const stats = useMemo(() => {
    if (!catalogue || !idx) return null;
    let unique = 0, copies = 0, value = 0, dupValue = 0, dupCount = 0, unpriced = 0;
    const valued: { id: string; v: number }[] = [];
    for (const [id, e] of owned) {
      const card = idx.byId.get(id);
      if (!card) continue;
      unique++; copies += e.qty;
      const p = priceFor(card);
      if (p == null) unpriced++;
      else { value += p * e.qty; valued.push({ id, v: p }); }
      if (e.qty > keep) { dupCount += e.qty - keep; dupValue += (e.qty - keep) * (p ?? 0); }
    }
    valued.sort((a, b) => b.v - a.v);
    const top = valued.slice(0, 6).map((x) => idx.byId.get(x.id)!);
    const total = catalogue.cards.length;
    return { unique, copies, value, dupValue, dupCount, top, total, unpriced, missing: total - unique };
  }, [catalogue, idx, owned, priceFor, keep]);

  // Évolution de la valeur de la collection d'après les instantanés locaux (par date).
  const curve = useMemo(() => {
    if (!idx || !snapshots.length) return { dates: [] as string[], values: [] as number[] };
    const qtyByProduct = new Map<number, number>();
    for (const [id, e] of owned) {
      const card = idx.byId.get(id);
      const p = card && productFor(card);
      if (p) qtyByProduct.set(p.id, (qtyByProduct.get(p.id) ?? 0) + e.qty);
    }
    const byDate = new Map<string, number>();
    for (const s of snapshots) {
      const q = qtyByProduct.get(s.productId);
      const v = s.fr;
      if (!q || v == null) continue;
      byDate.set(s.date, (byDate.get(s.date) ?? 0) + q * v);
    }
    const dates = [...byDate.keys()].sort();
    return { dates, values: dates.map((d) => byDate.get(d)!) };
  }, [idx, owned, productFor, snapshots]);

  if (!stats || !catalogue) return null;
  const first = curve.values[0], last = curve.values[curve.values.length - 1];
  const delta = curve.dates.length >= 2 && first && last ? ((last - first) / first) * 100 : null;

  return (
    <div className="space-y-4">
      <PageHeader title="Ma collection" sub="Prix minimums Cardmarket · cartes françaises uniquement" />

      <div className="panel">
        <div className="label">{stats.unpriced ? 'Valeur partielle' : 'Valeur estimée'} · minimums VF relevés</div>
        <div className="mt-1 text-4xl font-black tracking-tight">{fmtEur(stats.unique > 0 && stats.unpriced === stats.unique ? null : stats.value)}</div>
        {stats.unpriced > 0 && <p className="mt-1 text-xs text-ink-2">{stats.unpriced} carte(s) sans prix VF, exclue(s) du total.</p>}
        <div className="mt-1 text-sm text-ink-2">
          {stats.copies} exemplaires · {stats.unique} cartes différentes
          {delta != null && <span className={`ml-2 font-semibold ${delta >= 0 ? 'text-ok' : 'text-bad'}`}>{fmtPct(delta)} depuis le {fmtDate(curve.dates[0])}</span>}
        </div>
        <Sparkline values={curve.values} className="mt-3 h-20 w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/manquantes" className="panel">
          <div className="label">Manquantes</div>
          <div className="text-2xl font-extrabold">{stats.missing}</div>
          <div className="text-xs text-ink-2">sur {stats.total} variantes FR</div>
        </Link>
        <Link to="/doublons" className="panel">
          <div className="label">Doublons à vendre</div>
          <div className="text-2xl font-extrabold">{stats.dupCount}</div>
          <div className="text-xs text-ink-2">Minimums VF connus : {fmtEur(stats.dupValue)}</div>
        </Link>
      </div>

      <Link to="/scanner" className="btn-primary w-full py-4 text-lg">◎ Scanner une carte</Link>

      {stats.top.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-bold">Mes cartes les plus chères</h2>
          <div className="grid grid-cols-3 gap-3">
            {stats.top.map((c) => <CardTile key={c.id} card={c} />)}
          </div>
        </section>
      )}

      {stats.unique === 0 && (
        <div className="panel text-sm text-ink-2">
          Votre collection est vide. Scannez vos cartes ou parcourez l'onglet <Link className="text-accent" to="/cartes">Cartes</Link> pour indiquer celles que vous possédez.
        </div>
      )}
    </div>
  );
}
