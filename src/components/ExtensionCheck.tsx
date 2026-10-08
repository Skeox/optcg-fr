import { useState } from 'react';
import { useData } from '../data/catalogue';

type Result = { checkedAt: string; series: { id: string; name: string; url: string }[] };
export default function ExtensionCheck() {
  const { catalogue } = useData();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function check() {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch('https://optcg-fr-backup.vercel.app/extensions', { cache: 'no-store', signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const data = await response.json() as Result;
      if (!Array.isArray(data.series) || !data.series.length || !data.checkedAt) throw new Error();
      setResult(data);
    } catch { setError('Vérification impossible. Vérifiez votre connexion et réessayez.'); }
    finally { setBusy(false); }
  }
  const known = new Set(catalogue?.series.map((s) => s.id));
  const added = result?.series.filter((s) => !known.has(s.id)) ?? [];
  return <section className="panel space-y-2 text-sm">
    <h2 className="font-bold">Nouvelles extensions françaises</h2>
    <p className="text-ink-2">Compare le catalogue de l’application avec les séries publiées sur le site officiel français. Une série annoncée peut précéder sa sortie en boutique.</p>
    <button className="btn-ghost w-full" disabled={busy} onClick={() => void check()}>{busy ? 'Vérification…' : 'Rechercher de nouvelles extensions FR'}</button>
    {error && <p role="alert" className="text-bad">{error}</p>}
    {result && <div role="status" className="space-y-2">
      <p>{added.length ? `${added.length} série(s) officielle(s) à ajouter au catalogue de l’application.` : 'Aucune nouvelle série : le catalogue de l’application est à jour.'}</p>
      {added.map((s) => <a key={s.id} className="block text-accent underline" href={`https://fr.onepiece-cardgame.com/cardlist/?series=${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer">{s.name} ↗</a>)}
      <p className="text-xs text-ink-2">Vérifié le {new Date(result.checkedAt).toLocaleString('fr-FR')}. Cette vérification n’importe pas de cartes.</p>
    </div>}
  </section>;
}
