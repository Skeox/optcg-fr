import type { PriceFr, PricesFr } from '../types';

/** Seuls les minimums des annonces françaises CardTrader libellées en euros. */
export function cardTraderQuote(prices: PricesFr | null, productId: number | undefined): PriceFr | undefined {
  if (prices?.source !== 'cardtrader' || prices.currency !== 'EUR' || productId == null) return undefined;
  const quote = prices.products[productId];
  return quote && quote.n > 0 && typeof quote.from === 'number' && Number.isFinite(quote.from) && quote.from > 0 ? quote : undefined;
}
