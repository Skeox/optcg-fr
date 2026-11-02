/** Code imprimé explicite en fin de nom ; les espaces de saisie sont tolérés. */
export function parseCardmarketName(name) {
  const match = name.match(/\(\s*([A-Z]+-?\d*-\d{3})\s*\)\s*$/);
  return match ? { name: name.slice(0, match.index).trim(), code: match[1] } : undefined;
}
