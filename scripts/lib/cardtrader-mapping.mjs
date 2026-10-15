import corrections from '../../src/data/cardtrader-corrections.json' with { type: 'json' };

/** N'utiliser que les liens explicites CardTrader, sans rapprochement par code/rang. */
export function mappedProductIds(blueprint, products) {
  const ids = [...new Set((blueprint.card_market_ids ?? []).map(Number))];
  if (!ids.length || ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) return [];
  const known = ids.map((id) => products[id]).filter(Boolean);
  if (!known.length || known.length !== ids.length || known.some((p) => p.id == null || !ids.includes(p.id))) return [];
  // Plusieurs codes ou plusieurs finitions dans une même édition : ne pas diffuser
  // le minimum de cette fiche à tous les produits qui y sont attachés.
  const codes = new Set(known.map((p) => p.code));
  if (codes.size !== 1 || new Set(known.map((p) => p.exp)).size !== known.length) return [];
  const printedCodes = [...new Set(`${blueprint.name ?? ''} ${blueprint.version ?? ''}`.match(/\b(?:[A-Z]{1,3}\d{2}-\d{3}|P-\d{3})\b/g) ?? [])];
  const correction = corrections[blueprint.id];
  const correctedCode = correction && ids.every((id) => correction.products.includes(id)) ? correction.code : undefined;
  const collectorCode = correctedCode ?? String(blueprint.fixed_properties?.collector_number ?? '').match(/^(?:[A-Z]{1,3}\d{2}-\d{3}|P-\d{3})/i)?.[0]?.toUpperCase();
  if (collectorCode) printedCodes.push(collectorCode);
  if (printedCodes.some((code) => !codes.has(code))) return [];
  return known.map((p) => p.id);
}
