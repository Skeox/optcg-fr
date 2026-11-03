/** Code imprimé explicite en fin de nom ; les espaces de saisie sont tolérés. */
import { KOALA_ST35 } from './cardmarket-product-corrections.mjs';

export function parseCardmarketName(name, productId, expansion) {
  if (productId === KOALA_ST35.id && expansion === KOALA_ST35.expansion && name === KOALA_ST35.catalogueName) {
    return { name: 'Koala', code: KOALA_ST35.code };
  }
  const match = name.match(/\(\s*([A-Z]+-?\d*-\d{3})\s*\)\s*$/);
  return match ? { name: name.slice(0, match.index).trim(), code: match[1] } : undefined;
}
