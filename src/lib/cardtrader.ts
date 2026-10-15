import type { Card, CardLanguage, PriceFr, PricesFr } from '../types';
import { blueprintFor } from './merchant-mappings';

/** Seuls les minimums des annonces françaises CardTrader libellées en euros. */
export function cardTraderQuote(prices: PricesFr | null, productId: number | undefined, language: CardLanguage = 'fr'): PriceFr | undefined {
  if (prices?.source !== 'cardtrader' || prices.currency !== 'EUR' || productId == null) return undefined;
  const quote = language === 'fr' ? prices.products[productId] : prices.languages?.[language]?.[productId];
  if (quote?.mapping && (quote.mapping.kind !== 'explicit-cardtrader-id' || quote.mapping.productId !== productId)) return undefined;
  return quote && quote.n > 0 && typeof quote.from === 'number' && Number.isFinite(quote.from) && quote.from > 0 ? quote : undefined;
}

/** La fiche vérifiée prime sur une agrégation par identifiant Cardmarket. */
export function quoteForPrinting(prices: PricesFr | null, card: Card, productId?: number, language: CardLanguage = 'fr'): PriceFr | undefined {
  const blueprint = blueprintFor(card);
  if (blueprint != null && prices?.blueprints) {
    if (prices.source !== 'cardtrader' || prices.currency !== 'EUR') return undefined;
    const quote = prices.blueprints[language]?.[blueprint];
    return quote?.mapping?.kind === 'cardtrader-blueprint' && quote.mapping.blueprintId === blueprint
      && quote.n > 0 && typeof quote.from === 'number' && Number.isFinite(quote.from) && quote.from > 0 ? quote : undefined;
  }
  return cardTraderQuote(prices, productId, language);
}
