import type { Card, Catalogue } from '../types';
import printings from '../data/card-printings.json';
import reviews from '../data/printing-reviews.json';
import { variantLabel } from './format';

interface Printing {
  series: string;
  label: string;
  base: boolean;
  cardmarket?: { id: number; expansion: number; version: number };
  sources: string[];
}

const reviewedPrintings = new Map<string, Printing>();
for (const review of reviews.reviews) {
  for (const group of review.groups) {
    for (const id of group.ids) {
      reviewedPrintings.set(id, { series: review.series, label: group.label, base: group.base, sources: [review.source] });
    }
  }
}

/** Références explicites : un suffixe Bandai n'est ni une finition ni une V.n Cardmarket. */
export function printingFor(card: Card): Printing | undefined {
  const printing = (printings as Record<string, Printing>)[card.id] ?? reviewedPrintings.get(card.id);
  return printing && card.series.includes(printing.series) && card.id.split('_')[0] === card.code ? printing : undefined;
}

export function cardVariantLabel(card: Card): string {
  return printingFor(card)?.label ?? variantLabel(card.variant, card.variantKind);
}

export function isBasePrinting(card: Card): boolean {
  return printingFor(card)?.base ?? card.variant === 0;
}

/** Une bonne ressemblance ne prouve pas la finition d'une réimpression premium. */
export function requiresPrintingChoice(card: Card, catalogue: Catalogue): boolean {
  const siblings = catalogue.cards.filter((c) => c.code === card.code);
  // Une image peut aussi classer l'édition d'origine devant sa réimpression PRB.
  return siblings.length > 1 && siblings.some((c) => c.series.some((id) =>
    catalogue.series.some((s) => s.id === id && s.kind === 'premium')));
}

/** Ne jamais promouvoir la plus petite variante en base : elle peut être manga/SP. */
export function basePrintingsInSeries(cards: Card[]): Card[] {
  return cards.filter(isBasePrinting);
}

export const PREMIUM_PRINTING_NOTE = 'Les Premium Boosters peuvent reprendre une illustration d’origine avec plusieurs finitions. Vérifiez les motifs et les reflets sur la carte. Une réimpression visuellement identique ne permet pas de déterminer son édition d’origine par le seul scan.';
