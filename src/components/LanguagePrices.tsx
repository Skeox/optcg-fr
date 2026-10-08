import { useData } from '../data/catalogue';
import { fmtDate, fmtEur } from '../lib/format';
import type { Card, CardLanguage } from '../types';

const languages: { code: CardLanguage; flag: string; label: string }[] = [
  { code: 'fr', flag: '🇫🇷', label: 'Version française' },
  { code: 'en', flag: '🇬🇧', label: 'Version anglaise' },
  { code: 'ja', flag: '🇯🇵', label: 'Version japonaise' },
];

export default function LanguagePrices({ card }: { card: Card }) {
  const { quoteFor, manualFr } = useData();
  const manual = manualFr.get(card.id);
  return <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm" aria-label="Prix par langue de la carte, en euros">
    {manual && <span className="font-semibold text-accent" aria-label={`Prix manuel : ${fmtEur(manual.price)}`} title={`Prix manuel du ${fmtDate(manual.date)}`}>{fmtEur(manual.price, { compact: true })} <span className="text-xs">manuel</span></span>}
    {languages.map(({ code, flag, label }) => {
      const quote = quoteFor(card, code);
      if (!quote) return null;
      return <span key={code} className={`inline-flex items-center gap-1 whitespace-nowrap ${quote ? 'font-semibold text-ink' : 'text-ink-2'}`} title={`${label} · ${quote ? `minimum CardTrader du ${fmtDate(quote.at)}, hors port` : 'prix indisponible pour cette variante'}`} aria-label={`${label} : ${quote ? fmtEur(quote.from) : 'prix indisponible'}`}>
        <span aria-hidden="true">{flag}</span><span>{quote ? fmtEur(quote.from, { compact: true }) : '?'}</span>
      </span>;
    })}
  </div>;
}
