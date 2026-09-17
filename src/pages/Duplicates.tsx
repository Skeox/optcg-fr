import { useMemo } from 'react';
import { Link } from 'react-router';
import { useData } from '../data/catalogue';
import { CardImage, PageHeader, QtyControl, useToast, Toast } from '../components/ui';
import { productUrl, refPrice } from '../lib/cardmarket';
import { fmtEur, variantLabel } from '../lib/format';
import { setSetting } from '../db';
import { useKeep } from '../lib/hooks';

export default function Duplicates() {
  const { idx, owned, productFor } = useData();
  const keep = useKeep();
  const [toast, show] = useToast();

  const rows = useMemo(() => {
    if (!idx) return [];
    const out = [];
    for (const [id, e] of owned) {
      const card = idx.byId.get(id);
      if (!card || e.qty <= keep) continue;
      const p = productFor(card);
      const unit = refPrice(p);
      out.push({ card, qty: e.qty, surplus: e.qty - keep, unit, total: (unit ?? 0) * (e.qty - keep), product: p });
    }
    return out.sort((a, b) => b.total - a.total);
  }, [idx, owned, keep, productFor]);

  const total = rows.reduce((t, r) => t + r.total, 0);
  const count = rows.reduce((t, r) => t + r.surplus, 0);

  const copyList = async () => {
    const lines = rows.map((r) => `${r.surplus}x ${r.card.name} (${r.card.code}${r.card.variant ? ` ${variantLabel(r.card.variant, r.card.variantKind)}` : ''}) FR — tendance ${fmtEur(r.unit)}${r.product?.low != null ? `, mini ${fmtEur(r.product.low)}` : ''}`);
    const text = `Doublons One Piece Card Game (VF) — ${count} cartes, ≈ ${fmtEur(total)}\n\n${lines.join('\n')}`;
    try { await navigator.clipboard.writeText(text); show('Liste copiée'); } catch { show('Copie impossible'); }
  };

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = ['code;variante;nom;rarete;possedes;surplus;prix_tendance;prix_mini;url_cardmarket']
      .concat(rows.map((r) => [r.card.code, r.card.id, esc(r.card.name), r.card.rarity, r.qty, r.surplus, r.unit ?? '', r.product?.low ?? '', r.product ? productUrl(r.product) : ''].join(';')))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `doublons-optcg-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-3">
      <PageHeader title="Doublons" sub={`${count} cartes en surplus · ≈ ${fmtEur(total)}`} />
      <div className="panel flex items-center justify-between gap-3 text-sm">
        <span>Exemplaires à garder par carte</span>
        <select className="chip" value={keep} onChange={(e) => setSetting('keep', Number(e.target.value))}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost flex-1" onClick={copyList} disabled={!rows.length}>Copier la liste</button>
        <button className="btn-ghost flex-1" onClick={exportCsv} disabled={!rows.length}>Exporter CSV</button>
      </div>
      <div className="space-y-2">
        {rows.length === 0 && <p className="py-10 text-center text-ink-2">Aucun doublon : aucune carte n'est possédée à plus de {keep} exemplaire{keep > 1 ? 's' : ''}.</p>}
        {rows.map((r) => (
          <div key={r.card.id} className="panel flex gap-3 p-3">
            <Link to={`/carte/${encodeURIComponent(r.card.id)}`} className="w-16 shrink-0"><CardImage card={r.card} /></Link>
            <div className="min-w-0 flex-1">
              <Link to={`/carte/${encodeURIComponent(r.card.id)}`} className="block truncate font-semibold">{r.card.name}</Link>
              <div className="text-xs text-ink-2">{r.card.code} · {r.card.rarity} · {variantLabel(r.card.variant, r.card.variantKind)}</div>
              <div className="mt-1 text-sm"><b className="text-accent">{r.surplus} en surplus</b> · {fmtEur(r.unit)} l'unité → <b>{fmtEur(r.total)}</b></div>
              <div className="mt-2 flex items-center justify-between">
                <QtyControl cardId={r.card.id} />
                {r.product && <a className="text-xs text-accent" href={productUrl(r.product)} target="_blank" rel="noreferrer">Cardmarket ↗</a>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Toast msg={toast} />
    </div>
  );
}
