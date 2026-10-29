import type { CmFrenchPrices, CmFrenchQuote } from '../types';

export const CM_FR_METHOD = 'five-lowest-distinct-sellers-nm-v1';
export const CM_FR_MAX_AGE_DAYS = 45;

/** No fallback to a mixed-language guide, another printing, or CardTrader. */
export function cardmarketFrenchQuote(data: CmFrenchPrices | null, productId?: number, now = Date.now()): CmFrenchQuote | undefined {
  if (!data || data.source !== 'cardmarket' || data.currency !== 'EUR' || data.language !== 'fr'
    || data.method !== CM_FR_METHOD || !productId) return;
  const q = data.products?.[productId];
  if (!q || q.productId !== productId || q.status !== 'quoted' || q.sellers !== 5
    || q.sample?.length !== 5 || q.sample.some(p => !Number.isSafeInteger(p) || p <= 0)) return;
  const at = Date.parse(q.at);
  if (!Number.isFinite(at) || at > now + 300_000 || now - at > CM_FR_MAX_AGE_DAYS * 86_400_000) return;
  const mean = Math.round(q.sample.reduce((a, b) => a + b, 0) / 5) / 100;
  return Number.isFinite(q.average) && q.average === mean ? q : undefined;
}
