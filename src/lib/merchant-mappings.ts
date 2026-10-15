import data from '../data/cardmarket-mappings.json';
import directData from '../data/cardtrader-mappings.json';
import type { Card } from '../types';

export interface MerchantMapping {
  product: number;
  expansion: number;
  blueprint: number;
  series: string;
}

/** Registre relu hors ligne : aucune déduction par suffixe ou par prix à l'exécution. */
export function merchantMappingFor(card: Card): MerchantMapping | undefined {
  const entry = (data as Record<string, MerchantMapping>)[card.id];
  return entry && card.series.includes(entry.series) ? entry : undefined;
}

export function blueprintFor(card: Card): number | undefined {
  const merchant = merchantMappingFor(card);
  if (merchant) return merchant.blueprint;
  const direct = (directData as Record<string, Omit<MerchantMapping, 'product' | 'expansion'>>)[card.id];
  return direct && card.series.includes(direct.series) ? direct.blueprint : undefined;
}
