import { useData } from '../data/catalogue';
import { fmtDate, fmtEur } from '../lib/format';
import type { Card } from '../types';

export default function LanguagePrices({ card }: { card: Card }) {
  const { quoteFor, manualFr } = useData();
  const manual = manualFr.get(card.id);
  const quote = quoteFor(card, 'fr');
  return <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm" aria-label="Prix français en euros">
    {manual && <span className="font-semibold text-accent" aria-label={`Prix manuel : ${fmtEur(manual.price)}`} title={`Prix manuel du ${fmtDate(manual.date)}`}>{fmtEur(manual.price, { compact: true })} <span className="text-xs">manuel</span></span>}
    {quote ? <span className="inline-flex items-center gap-1 font-semibold text-ink" title={`Moyenne des 5 offres FR les moins chères relevées auprès de vendeurs distincts, NM/MT · Cardmarket · ${fmtDate(quote.at)} · hors port`} aria-label={`Version française : ${fmtEur(quote.average)}`}>
      <span aria-hidden="true">🇫🇷</span><span>{fmtEur(quote.average, { compact: true })}</span>
    </span> : !manual && <span className="text-xs text-ink-2" aria-label="Version française : prix indisponible">Prix FR indisponible</span>}
  </div>;
}
