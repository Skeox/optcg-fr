import { useState } from 'react';
import type { Card } from '../types';
import { useData } from '../data/catalogue';
import { saveVfPrice } from '../db';

export default function ManualPriceEditor({ card }: { card: Card }) {
  const { manualFr } = useData();
  const manual = manualFr.get(card.id);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(remove = false) {
    const price = Number(value.trim().replace(',', '.'));
    if (!remove && (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim()) || price <= 0 || !Number.isFinite(price))) {
      setError('Saisissez un montant positif avec au maximum deux décimales.'); return;
    }
    setBusy(true); setError('');
    try {
      await saveVfPrice(card.id, remove ? null : { cardId: card.id, price, date: new Date().toISOString().slice(0, 10) });
      setOpen(false);
    } catch { setError('Enregistrement impossible. Réessayez.'); }
    finally { setBusy(false); }
  }
  return <div className={open ? 'order-last w-full' : 'min-w-0 flex-1'}>
    {!open ? <button className="inline-flex min-h-11 items-center gap-1.5 text-xs text-accent" onClick={() => { setValue(manual?.price.toString() ?? ''); setError(''); setOpen(true); }}>
      <svg className="shrink-0" aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg>
      <span className="text-left">Modifier le prix manuellement</span>
    </button> : <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="block text-sm">Prix manuel en €<input autoFocus className="input mt-1" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex. 12,50" /></label>
      <p className="text-xs text-ink-2">Prioritaire sur le prix français dans votre collection.</p>
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm" disabled={busy}>Enregistrer</button>
        <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => setOpen(false)}>Annuler</button>
        {manual && <button type="button" className="text-xs underline" disabled={busy} onClick={() => void save(true)}>Revenir au prix automatique</button>}
      </div>
    </form>}
  </div>;
}
